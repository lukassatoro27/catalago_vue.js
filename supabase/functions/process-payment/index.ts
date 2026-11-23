import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Transparent credit-card payment via Mercado Pago.
// Receives a card TOKEN (created client-side with the public key) and creates
// a payment through the /v1/payments API using the access token.
//
// IDEMPOTENCY STRATEGY (anti-duplicate-charge):
// 1. SEARCH-BEFORE-CREATE: before creating any new charge, query Mercado Pago
//    for existing payments tied to this order via external_reference=orderId.
//    - If an APPROVED / in_process / pending payment already exists, return
//      it WITHOUT creating a new charge. This covers the timeout/retry case:
//      a request that timed out client-side may have succeeded server-side,
//      so we never blindly fire a second charge.
//    - Only if no active payment exists (none, or all rejected/cancelled) do
//      we create a new charge, using the client-provided idempotency key
//      (one per explicit "Pay" click). A new card after a rejection is a
//      legitimate new attempt and gets a fresh key.
// 2. The order is tracked via external_reference = orderId.
// 3. No automatic refunds are ever issued — legitimate payments are preserved.
const mapStatus = (mpStatus: string): string => {
  const s = String(mpStatus || '').toLowerCase();
  if (s === 'approved') return 'pago';
  if (s === 'rejected') return 'recusado';
  if (s === 'in_process' || s === 'in_mediation') return 'em_analise';
  if (s === 'pending') return 'pendente';
  if (s === 'authorized') return 'aprovado';
  if (s === 'cancelled' || s === 'canceled') return 'cancelado';
  return s;
};

// Statuses that represent an "active" payment — finding one means we must NOT
// create another charge for the same order.
const ACTIVE_STATUSES = new Set(['approved', 'in_process', 'in_mediation', 'pending', 'authorized']);

interface MPPayment {
  id?: number | string;
  status?: string;
  status_detail?: string;
  date_approved?: string;
  transaction_amount?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { orderId, token, amount, installments, paymentMethodId, issuerId, payer, idempotencyKey } = payload;

    console.log(`[process-payment] Card payment for order: ${orderId}, amount: ${amount}`);

    if (!orderId || !token || amount === undefined || !paymentMethodId) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios ausentes (orderId, token, amount, paymentMethodId).' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    if (!mpAccessToken) throw new Error('MERCADO_PAGO_ACCESS_TOKEN is not set');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Valor SEMPRE autorizado pelo banco; o navegador não determina a cobrança.
    const { data: payableOrder, error: payableError } = await supabaseAdmin
      .from('orders').select('total_amount,status,payment_status').eq('id',orderId).maybeSingle();
    const officialAmount = Number(payableOrder?.total_amount);
    if (payableError || !payableOrder || !Number.isFinite(officialAmount) || officialAmount<=0 ||
        !Number.isFinite(Number(amount)) || Math.abs(Number(amount)-officialAmount)>0.009) {
      return new Response(JSON.stringify({ error:'AMOUNT_MISMATCH', message:'Valor do pagamento divergente do pedido.' }),{
        status:400,headers:{...corsHeaders,'Content-Type':'application/json'}
      });
    }
    if (['paid','approved','cancelled','canceled','delivered'].includes(String(payableOrder.payment_status||'').toLowerCase()) ||
        ['cancelled','canceled','delivered'].includes(String(payableOrder.status||'').toLowerCase())) {
      return new Response(JSON.stringify({ error:'ORDER_NOT_PAYABLE',message:'Pedido não disponível para nova cobrança.' }),{
        status:409,headers:{...corsHeaders,'Content-Type':'application/json'}
      });
    }

    // ------------------------------------------------------------------
    // SUNDAY SALES BLOCK (America/Sao_Paulo).
    // New card-charge creation is paused on Sundays when the admin config
    // `bloquear_vendas_domingo` is 'true'. Protects direct API/edge calls.
    // Existing orders' payment CONFIRMATIONS and webhooks are NOT affected
    // (webhook handlers and verify-mp-payment are separate, unblocked).
    // Reversible: set the config to 'false'.
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
          console.warn(`[process-payment] Blocked: Sunday sales pause active for order ${orderId}.`);
          return new Response(JSON.stringify({ error: 'SUNDAY_SALES_BLOCKED', message: 'Vendas pausadas aos domingos.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      }
    } catch (blockErr) {
      console.warn('[process-payment] Sunday-block check failed (proceeding):', blockErr);
    }

    // ------------------------------------------------------------------
    // DAILY SALES BLOCK (America/Sao_Paulo).
    // If an admin has manually closed sales for today, block NEW card-charge
    // creation for orders with delivery scheduled for today. Future-date
    // orders and payment confirmations/webhooks of existing orders are NOT
    // affected. Auto-expires at midnight (America/Sao_Paulo).
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
          console.warn(`[process-payment] Blocked: daily sales block active for order ${orderId} (delivery ${deliveryDate}).`);
          return new Response(JSON.stringify({ error: 'DAILY_SALES_BLOCKED', message: 'Vendas para hoje encerradas manualmente.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }
      }
    } catch (dailyErr) {
      console.warn('[process-payment] Daily-block check failed (proceeding):', dailyErr);
    }

    // ------------------------------------------------------------------
    // STEP 1: Search for an existing payment for this order.
    // If an active (approved / in_process / pending) payment already exists,
    // return it instead of creating a duplicate charge. This is the key
    // protection against duplicate charges caused by page refresh, retry
    // after timeout, or repeated webhook/callback-driven submissions.
    // ------------------------------------------------------------------
    let existingActive: MPPayment | null = null;
    try {
      const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(String(orderId))}`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const results: MPPayment[] = Array.isArray(searchData?.results) ? searchData.results : [];
        // Pick the most recent active payment, if any.
        for (const pmt of results) {
          const st = String(pmt.status || '').toLowerCase();
          if (ACTIVE_STATUSES.has(st)) {
            existingActive = pmt;
            break;
          }
        }
      } else {
        console.warn('[process-payment] MP search returned non-OK:', searchRes.status);
      }
    } catch (searchErr) {
      // A search failure must NOT block a legitimate first charge — log and
      // proceed to creation. The idempotency key still protects us.
      console.warn('[process-payment] Existing-payment search failed (proceeding to create):', searchErr);
    }

    if (existingActive) {
      const mapped = mapStatus(existingActive.status);
      const paymentId = existingActive.id;
      console.log(`[process-payment] Active payment ${paymentId} (status=${existingActive.status}) already exists for order ${orderId}. Returning it — NO new charge created.`);

      // Keep the order row in sync (idempotent update).
      if (orderId && paymentId) {
        await supabaseAdmin
          .from('orders')
          .update({ payment_id: String(paymentId), payment_status: mapped })
          .eq('id', orderId);
      }

      // On an approved/reused payment, process the paid-order notification.
      // The notification row is created transactionally by the DB trigger on
      // the order -> paid transition; this call acquires and sends it. Safe to
      // call repeatedly (idempotent acquisition).
      if (mapped === 'pago') {
        try {
          const { data: nd, error: ne } = await supabaseAdmin.functions.invoke('send-paid-order-notification', {
            body: { order_id: orderId },
          });
          if (ne) {
            console.error(`[process-payment] send-paid-order-notification invoke error (reused) for ${orderId}:`, ne.message);
          } else if (nd) {
            console.log(`[process-payment] send-paid-order-notification (reused) for ${orderId}: status=${nd.status ?? 'unknown'}${nd.skipped ? ` reason=${nd.reason}` : ''}${nd.last_error ? ` last_error=${String(nd.last_error).slice(0, 200)}` : ''}`);
          }
        } catch (notifErr) {
          console.error(`[process-payment] send-paid-order-notification failed (reused) for ${orderId}:`, notifErr);
        }
      }

      return new Response(
        JSON.stringify({
          id: paymentId,
          payment_id: paymentId,
          status: existingActive.status,
          mapped_status: mapped,
          status_detail: existingActive.status_detail,
          reused: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ------------------------------------------------------------------
    // STEP 2: No active payment exists — safe to create a new charge.
    // Use the client-provided idempotency key (one per explicit "Pay" click).
    // ------------------------------------------------------------------
    const idempotency = idempotencyKey || String(orderId);

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotency,
      },
      body: JSON.stringify({
        transaction_amount: officialAmount,
        token,
        description: `Pedido ${orderId}`,
        installments: Number(installments) || 1,
        payment_method_id: paymentMethodId,
        ...(issuerId ? { issuer_id: Number(issuerId) } : {}),
        payer,
        external_reference: String(orderId),
      }),
    });

    const paymentData = await mpResponse.json();

    // MP returns 201 (created) for both approved and rejected cards, with the
    // outcome in `status`. A non-2xx means the request itself was invalid
    // (bad token, missing fields, etc.) — surface it as a structured error.
    if (!mpResponse.ok) {
      console.error('[process-payment] MP API Error:', paymentData);
      const detail =
        paymentData?.status_detail ||
        paymentData?.cause?.[0]?.code ||
        paymentData?.cause?.[0]?.description ||
        '';
      return new Response(
        JSON.stringify({
          error: paymentData?.message || 'Falha ao processar pagamento no Mercado Pago.',
          status: paymentData?.status || 'rejected',
          status_detail: detail ? String(detail) : '',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paymentId = paymentData.id;
    const mappedStatus = mapStatus(paymentData.status);
    console.log(`[process-payment] Payment ${paymentId} status=${paymentData.status} -> ${mappedStatus}`);

    if (orderId) {
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          payment_id: String(paymentId),
          payment_status: mappedStatus,
        })
        .eq('id', orderId);

      if (updateError) {
        console.error(`[process-payment] Failed to save payment_id:`, updateError);
      }
    }

    // On an approved payment, process the paid-order notification. The DB
    // trigger registers the pending notification on the order -> paid
    // transition; this call acquires and sends it (idempotent).
    if (mappedStatus === 'pago') {
      try {
        const { data: nd, error: ne } = await supabaseAdmin.functions.invoke('send-paid-order-notification', {
          body: { order_id: orderId },
        });
        if (ne) {
          console.error(`[process-payment] send-paid-order-notification invoke error for ${orderId}:`, ne.message);
        } else if (nd) {
          console.log(`[process-payment] send-paid-order-notification for ${orderId}: status=${nd.status ?? 'unknown'}${nd.skipped ? ` reason=${nd.reason}` : ''}${nd.last_error ? ` last_error=${String(nd.last_error).slice(0, 200)}` : ''}`);
        }
      } catch (notifErr) {
        console.error(`[process-payment] send-paid-order-notification failed for ${orderId}:`, notifErr);
      }
    }

    return new Response(
      JSON.stringify({
        id: paymentId,
        payment_id: paymentId,
        status: paymentData.status,
        mapped_status: mappedStatus,
        status_detail: paymentData.status_detail,
        reused: false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[process-payment] Function Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno ao processar pagamento.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
