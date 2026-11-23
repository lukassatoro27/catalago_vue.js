import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// IDEMPOTENCY STRATEGY (anti-duplicate-charge):
// 1. SEARCH-BEFORE-CREATE: before creating a new PIX, query Mercado Pago for
//    existing payments tied to this order (external_reference=orderId).
//    - If an APPROVED payment exists, return it as paid (no new charge).
//    - If a PENDING, non-expired PIX exists, return it (the customer can
//      still pay the same QR code) — no new charge.
//    - Only if no active PIX exists do we create a new one, using
//      X-Idempotency-Key = orderId so a retry returns the same PIX.
// 2. A PIX that has expired (date_of_expiration in the past) is treated as
//    inactive, so a fresh PIX can be generated — still one active charge at
//    a time per order.
// 3. No automatic refunds — legitimate payments are preserved.
//
// RESUME TOKEN (authorized recovery):
// On the first PIX generation the order is assigned a random `resume_token`
// (stored on the orders row) which is returned to the caller. The frontend
// persists {orderId, resumeToken} in localStorage so it can later call
// `recover-checkout` to restore the same QR code after a reload/app-switch.
// If the order already has a resume_token, the caller MUST supply a matching
// one to (re)generate a PIX — this prevents someone who only knows the order
// UUID from forcing a new charge on someone else's order. The very first
// generation (no token stored yet) is allowed without a token because the
// order UUID is itself a secret known only to the customer who created it.

const ACTIVE_STATUSES = new Set(['approved', 'in_process', 'in_mediation', 'pending', 'authorized']);

function uuid(): string {
  return crypto.randomUUID();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { orderId, amount, description, userEmail, resumeToken } = payload;

    console.log(`[generate-pix] Starting PIX generation for Order: ${orderId}, Amount: ${amount}`);

    const mpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    if (!mpAccessToken) throw new Error('MERCADO_PAGO_ACCESS_TOKEN is not set');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ------------------------------------------------------------------
    // AUTHORIZATION: validate the resume token when the order already has
    // one. The first generation (no token stored yet) is allowed without it.
    // ------------------------------------------------------------------
    let storedResumeToken: string | null = null;
    // Official total + buyer email come from the server, NEVER from the
    // frontend payload. The frontend amount is ignored as a source of truth.
    let officialAmount: number | null = null;
    let officialEmail: string | null = null;
    try {
      const { data: authRow } = await supabaseAdmin
        .from('orders')
        .select('resume_token, status, payment_status, total_amount, metadata')
        .eq('id', orderId)
        .maybeSingle();
      storedResumeToken = authRow?.resume_token ?? null;
      officialAmount = authRow?.total_amount != null ? Number(authRow.total_amount) : null;
      const meta = authRow?.metadata;
      if (meta && typeof meta === 'object') {
        officialEmail = (meta as any)?.email ?? (meta as any)?.buyer_email ?? null;
      }

      // Block generation for an already-paid or cancelled order.
      const oStatus = String(authRow?.status || '').toLowerCase();
      const pStatus = String(authRow?.payment_status || '').toLowerCase();
      if (oStatus === 'cancelled' || oStatus === 'delivered' || pStatus === 'paid' || pStatus === 'approved') {
        return new Response(JSON.stringify({ error: 'ORDER_NOT_PAYABLE', message: 'Este pedido não pode receber um novo pagamento.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
        });
      }

      if (storedResumeToken) {
        if (!resumeToken || resumeToken !== storedResumeToken) {
          console.warn(`[generate-pix] Unauthorized: resume_token mismatch for order ${orderId}.`);
          return new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Não autorizado a gerar pagamento para este pedido.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403,
          });
        }
      }
    } catch (authErr) {
      console.warn('[generate-pix] Authorization check failed (proceeding):', authErr);
    }

    // Nunca utilizar amount vindo do navegador como fallback.
    if (officialAmount == null || !Number.isFinite(officialAmount) || officialAmount <= 0 ||
        !Number.isFinite(Number(amount)) || Math.abs(Number(amount)-officialAmount)>0.009) {
      return new Response(JSON.stringify({error:'AMOUNT_MISMATCH',message:'Valor do pedido não confirmado pelo servidor.'}),{
        status:400,headers:{...corsHeaders,'Content-Type':'application/json'}
      });
    }
    const chargeAmount = officialAmount;
    const payerEmail = officialEmail || userEmail || 'cliente@email.com';

    // ------------------------------------------------------------------
    // SUNDAY SALES BLOCK (America/Sao_Paulo).
    // ------------------------------------------------------------------
    try {
      const { data: cfgRow } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'bloquear_vendas_domingo')
        .maybeSingle();
      const cfgEnabled = String(cfgRow?.value || '').trim().toLowerCase() === 'true';
      if (cfgEnabled) {
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
        if (fmt.format(new Date()) === 'Sun') {
          console.warn(`[generate-pix] Blocked: Sunday sales pause active for order ${orderId}.`);
          return new Response(JSON.stringify({ error: 'SUNDAY_SALES_BLOCKED', message: 'Vendas pausadas aos domingos.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      }
    } catch (blockErr) {
      console.warn('[generate-pix] Sunday-block check failed (proceeding):', blockErr);
    }

    // ------------------------------------------------------------------
    // DAILY SALES BLOCK (America/Sao_Paulo).
    // ------------------------------------------------------------------
    try {
      const { data: orderRow } = await supabaseAdmin
        .from('orders')
        .select('delivery_date')
        .eq('id', orderId)
        .maybeSingle();
      const deliveryDate = orderRow?.delivery_date;
      if (deliveryDate) {
        const { data: dailyBlocked } = await supabaseAdmin.rpc('is_daily_sales_blocked', { p_delivery_date: deliveryDate });
        if (dailyBlocked === true) {
          console.warn(`[generate-pix] Blocked: daily sales block active for order ${orderId} (delivery ${deliveryDate}).`);
          return new Response(JSON.stringify({ error: 'DAILY_SALES_BLOCKED', message: 'Vendas para hoje encerradas manualmente.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      }
    } catch (dailyErr) {
      console.warn('[generate-pix] Daily-block check failed (proceeding):', dailyErr);
    }

    // ------------------------------------------------------------------
    // STEP 1: Search for an existing payment for this order.
    // ------------------------------------------------------------------
    try {
      const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(String(orderId))}`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const results = Array.isArray(searchData?.results) ? searchData.results : [];
        for (const pmt of results) {
          const st = String(pmt.status || '').toLowerCase();
          if (!ACTIVE_STATUSES.has(st)) continue;

          // Approved -> return as paid.
          if (st === 'approved') {
            console.log(`[generate-pix] Found approved payment ${pmt.id} for order ${orderId}. Returning as paid — NO new charge.`);
            if (orderId) {
              await supabaseAdmin
                .from('orders')
                .update({ payment_id: String(pmt.id), payment_status: 'paid' })
                .eq('id', orderId);
            }
            const rt1 = await ensureResumeToken(supabaseAdmin, orderId, storedResumeToken);
            return new Response(JSON.stringify({
              id: pmt.id,
              payment_id: pmt.id,
              status: pmt.status,
              reused: true,
              already_paid: true,
              resume_token: rt1,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
          }

          // Pending PIX -> return it only if not expired.
          const expiration = pmt.date_of_expiration ? new Date(pmt.date_of_expiration).getTime() : 0;
          const nowMs = Date.now();
          const isExpired = expiration > 0 && nowMs > expiration;
          if (isExpired) {
            console.log(`[generate-pix] Existing PIX ${pmt.id} expired — will generate a new one.`);
            continue;
          }

          // Reuse the still-valid pending PIX.
          console.log(`[generate-pix] Reusing existing pending PIX ${pmt.id} for order ${orderId}. NO new charge.`);
          const rt2 = await ensureResumeToken(supabaseAdmin, orderId, storedResumeToken);
          const result = {
            id: pmt.id,
            payment_id: pmt.id,
            qr_code: pmt.point_of_interaction?.transaction_data?.qr_code_base64,
            pix_code: pmt.point_of_interaction?.transaction_data?.qr_code,
            expiration_date: pmt.date_of_expiration,
            status: pmt.status,
            reused: true,
            resume_token: rt2,
          };
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
          });
        }
      } else {
        console.warn('[generate-pix] MP search returned non-OK:', searchRes.status);
      }
    } catch (searchErr) {
      console.warn('[generate-pix] Existing-payment search failed (proceeding to create):', searchErr);
    }

    // ------------------------------------------------------------------
    // STEP 2: No active PIX exists — create a new one.
    // X-Idempotency-Key = orderId guarantees a retry returns the same PIX.
    // ------------------------------------------------------------------
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': orderId // Prevent duplicate charges
      },
      body: JSON.stringify({
        transaction_amount: chargeAmount,
        description: description || `Pedido ${orderId}`,
        payment_method_id: 'pix',
        payer: {
          email: payerEmail
        },
        external_reference: orderId
      })
    });

    const paymentData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('[generate-pix] MP API Error:', paymentData);
      throw new Error(`MP Error: ${paymentData.message || 'Failed to generate PIX'}`);
    }

    const paymentId = paymentData.id;
    console.log(`[generate-pix] Successfully generated PIX. Payment ID: ${paymentId}`);

    // Save payment_id to database immediately
    if (orderId) {
      console.log(`[generate-pix] Updating order ${orderId} with payment_id: ${paymentId}`);
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          payment_id: String(paymentId),
          payment_status: 'pending'
        })
        .eq('id', orderId);

      if (updateError) {
        console.error(`[generate-pix] CRITICAL: Failed to save payment_id to DB:`, updateError);
      } else {
        console.log(`[generate-pix] DB updated successfully for order ${orderId}`);
      }
    }

    const rt3 = await ensureResumeToken(supabaseAdmin, orderId, storedResumeToken);

    // Return formatted response
    const result = {
      id: paymentId,
      payment_id: paymentId,
      qr_code: paymentData.point_of_interaction?.transaction_data?.qr_code_base64,
      pix_code: paymentData.point_of_interaction?.transaction_data?.qr_code,
      expiration_date: paymentData.date_of_expiration,
      status: paymentData.status,
      reused: false,
      resume_token: rt3,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[generate-pix] Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// Ensures the order has a resume_token. Creates one (random UUID) if none
// exists, stores it, and returns it. If one already exists, returns it
// unchanged. Idempotent and safe to call repeatedly. Re-reads the stored
// value after the conditional update so a concurrent first-generation
// race always returns the token that actually won in the DB.
async function ensureResumeToken(supabaseAdmin: any, orderId: string, known: string | null): Promise<string | null> {
  if (!orderId) return known ?? null;
  if (known) return known;
  const token = uuid();
  try {
    // Only set when NULL so a concurrent generation does not overwrite.
    await supabaseAdmin
      .from('orders')
      .update({ resume_token: token })
      .eq('id', orderId)
      .is('resume_token', null);
    // Re-read the winner (ours or a concurrent caller's).
    const { data } = await supabaseAdmin
      .from('orders')
      .select('resume_token')
      .eq('id', orderId)
      .maybeSingle();
    return data?.resume_token ?? token;
  } catch (err) {
    console.warn('[generate-pix] ensureResumeToken failed:', err);
    return token;
  }
}
