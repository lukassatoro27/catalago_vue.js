-- REVISÃO OBRIGATÓRIA antes de aplicar em produção.
-- Snapshot do create_order do ZIP shopping_finallllll.zip, NÃO da função atualmente implantada.
-- Compare com pg_get_functiondef e incorpore estas validações na versão ATUAL.
-- ATENÇÃO: create_order é compartilhada por TODOS os canais. Altera o comportamento de descontos
-- sem cupom; revise descontos administrativos, fidelidade e promoções antes de executar.
-- A função original aceita desconto do navegador sem validação; esta correção é necessária.
-- Não atualiza consumo final do cupom: exige webhook de aprovação idempotente.

CREATE OR REPLACE FUNCTION public.create_order(
  p_user_id uuid,
  p_total_amount numeric,
  p_items jsonb,
  p_delivery_address jsonb,
  p_payment_method text,
  p_delivery_type text,
  p_delivery_period text,
  p_delivery_date date,
  p_buyer_phone text,
  p_recipient_phone text,
  p_metadata jsonb,
  p_seller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_current_user_id uuid;
  v_sp_now timestamp;
  v_sp_date date;
  v_sp_hour int;
  v_item_subtotal numeric := 0;
  v_addons_cards_total numeric := 0;
  v_freight numeric := 0;
  v_discount numeric := 0;
  v_coupon_code text;
  v_coupon record;
  v_coupon_limit numeric;
  v_coupon_expected numeric;
  v_expected_total numeric := 0;
  v_item jsonb;
  v_verified_price numeric;
  v_variant_id uuid;
  v_product_id uuid;
  v_v_price numeric;
  v_v_promo numeric;
  v_p_price numeric;
  v_p_promo numeric;
  v_p_ativo boolean;
  v_v_active boolean;
  v_parent_ativo boolean;
  v_new_items jsonb := '[]'::jsonb;
  v_i int;
BEGIN
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NOT NULL THEN
    IF p_user_id IS DISTINCT FROM v_current_user_id THEN
       RAISE EXCEPTION 'User ID mismatch: Authenticated users must use their own ID.';
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
      RAISE EXCEPTION 'Order must contain at least one item.';
  END IF;

  -- Same-day delivery cutoff (America/Sao_Paulo).
  v_sp_now  := NOW() AT TIME ZONE 'America/Sao_Paulo';
  v_sp_date := v_sp_now::date;
  v_sp_hour := EXTRACT(HOUR FROM v_sp_now)::int;

  -- NOVO: rejeita datas estritamente anteriores ao dia corrente. Hoje não é
  -- rejeitado (permanece sujeito ao corte 18h abaixo). O cliente deve
  -- escolher uma nova data — o backend nunca substitui silenciosamente.
  IF p_delivery_date IS NOT NULL AND p_delivery_date < v_sp_date THEN
      RAISE EXCEPTION 'PAST_DATE: Essa data ja passou. Escolha uma nova data para a entrega.';
  END IF;

  IF p_delivery_date IS NOT NULL AND p_delivery_date = v_sp_date AND v_sp_hour >= 18 THEN
      RAISE EXCEPTION 'CUTOFF_EXCEEDED: O horario para entrega no mesmo dia encerrou as 18h (horario de Brasilia). Selecione uma data a partir de amanha.';
  END IF;

  -- ============================================================
  -- PRICE VERIFICATION + SNAPSHOT (defense-in-depth)
  -- ============================================================
  FOR v_i IN 0 .. jsonb_array_length(p_items) - 1 LOOP
    v_item := p_items->v_i;
    v_verified_price := NULL;
    v_variant_id := NULL;

    BEGIN
      v_variant_id := (v_item->>'variant_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v_variant_id := NULL; END;

    IF v_variant_id IS NOT NULL THEN
      SELECT pv.price, pv.promotional_price, pv.is_active, p.ativo
        INTO v_v_price, v_v_promo, v_v_active, v_parent_ativo
        FROM product_variants pv
        JOIN produtos_novo p ON p.id = pv.product_id
        WHERE pv.id = v_variant_id;
      IF FOUND THEN
        IF v_v_active = false OR v_parent_ativo = false THEN
          RAISE EXCEPTION 'PRODUCT_INACTIVE: Um dos produtos do pedido nao esta mais disponivel para compra.';
        END IF;
        IF v_v_promo IS NOT NULL AND v_v_promo > 0 AND v_v_promo < v_v_price THEN
          v_verified_price := v_v_promo;
        ELSE
          v_verified_price := v_v_price;
        END IF;
      END IF;
    ELSE
      BEGIN
        v_product_id := (v_item->>'product_id')::uuid;
      EXCEPTION WHEN OTHERS THEN v_product_id := NULL; END;
      IF v_product_id IS NOT NULL THEN
        SELECT preco, promo_preco, ativo
          INTO v_p_price, v_p_promo, v_p_ativo
          FROM produtos_novo WHERE id = v_product_id;
        IF FOUND THEN
          IF v_p_ativo = false THEN
            RAISE EXCEPTION 'PRODUCT_INACTIVE: Um dos produtos do pedido nao esta mais disponivel para compra.';
          END IF;
          IF v_p_promo IS NOT NULL AND v_p_promo > 0 AND v_p_promo < v_p_price THEN
            v_verified_price := v_p_promo;
          ELSE
            v_verified_price := v_p_price;
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_verified_price IS NOT NULL THEN
      v_item := jsonb_set(v_item, '{price}', to_jsonb(v_verified_price));
      v_item := jsonb_set(v_item, '{unit_price}', to_jsonb(v_verified_price));
    ELSE
      v_verified_price := COALESCE((v_item->>'price')::numeric, 0);
    END IF;

    v_item_subtotal := v_item_subtotal + v_verified_price * COALESCE((v_item->>'quantity')::numeric, 1);

    v_addons_cards_total := v_addons_cards_total +
      ( COALESCE((SELECT SUM(COALESCE((a->>'price')::numeric, 0) * COALESCE((a->>'quantity')::numeric, 1)) FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) a), 0)
        + COALESCE((v_item->'card'->'model'->>'price')::numeric, 0)
      ) * COALESCE((v_item->>'quantity')::numeric, 1);

    v_new_items := v_new_items || jsonb_build_array(v_item);
  END LOOP;

  p_items := v_new_items;

  v_freight := COALESCE((p_metadata->>'shipping_cost')::numeric, 0);
  -- Cupom: validação SERVER-SIDE, não confiar no discount_amount enviado.
  v_discount := COALESCE((p_metadata->>'discount_amount')::numeric, 0);
  v_coupon_code := NULLIF(UPPER(BTRIM(COALESCE(p_metadata->>'coupon_code',''))), '');
  IF v_coupon_code IS NULL THEN
    IF v_discount <> 0 THEN
      RAISE EXCEPTION 'INVALID_COUPON: Desconto sem cupom não é permitido.';
    END IF;
  ELSE
    SELECT code, discount_type, discount_value, active, expiry_date, min_value,
           copy_count, use_count
      INTO v_coupon
      FROM public.coupons
     WHERE UPPER(code) = v_coupon_code
     FOR UPDATE;
    IF NOT FOUND OR v_coupon.active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'INVALID_COUPON: Cupom inexistente ou inativo.';
    END IF;
    IF v_coupon.expiry_date IS NOT NULL AND v_coupon.expiry_date < NOW() THEN
      RAISE EXCEPTION 'EXPIRED_COUPON: Cupom expirado.';
    END IF;
    IF v_item_subtotal + v_addons_cards_total + v_freight < COALESCE(v_coupon.min_value,0) THEN
      RAISE EXCEPTION 'MINIMUM_COUPON: Pedido abaixo do mínimo exigido.';
    END IF;
    IF COALESCE(v_coupon.copy_count,0)>0 AND COALESCE(v_coupon.use_count,0)>=v_coupon.copy_count THEN
      RAISE EXCEPTION 'COUPON_LIMIT: Cupom esgotado.';
    END IF;
    IF v_coupon.discount_value IS NULL OR v_coupon.discount_value < 0 THEN
      RAISE EXCEPTION 'INVALID_COUPON: Valor de desconto inválido.';
    END IF;
    v_coupon_limit := v_item_subtotal + v_addons_cards_total + v_freight;
    IF v_coupon.discount_type = 'percentage' THEN
      IF v_coupon.discount_value > 100 THEN
        RAISE EXCEPTION 'INVALID_COUPON: Percentual inválido.';
      END IF;
      v_coupon_expected := ROUND(LEAST(v_coupon_limit,v_coupon_limit * v_coupon.discount_value / 100),2);
    ELSE
      v_coupon_expected := ROUND(LEAST(v_coupon_limit,v_coupon.discount_value),2);
    END IF;
    IF ABS(v_discount - v_coupon_expected)>0.009 THEN
      RAISE EXCEPTION 'COUPON_MISMATCH: Desconto não corresponde à regra do cupom.';
    END IF;
    -- Este snapshot não incrementa use_count: consumo definitivo deve ocorrer
    -- atomicamente quando o pagamento for APROVADO, com idempotência no webhook.
    p_metadata := jsonb_set(p_metadata,'{coupon_code}',to_jsonb(v_coupon_code));
  END IF;
  IF v_discount < 0 THEN RAISE EXCEPTION 'INVALID_COUPON: Desconto negativo.'; END IF;
  v_expected_total := v_item_subtotal + v_addons_cards_total + v_freight - v_discount;
  IF v_expected_total <= 0 THEN
    RAISE EXCEPTION 'ZERO_TOTAL: Cupons que zeram a compra exigem fluxo próprio sem cobrança.';
  END IF;

  IF ABS(v_expected_total - p_total_amount) > 0.02 THEN
      RAISE EXCEPTION 'TOTAL_MISMATCH: Valor total inconsistente. Esperado %, recebido %.', v_expected_total, p_total_amount;
  END IF;

  INSERT INTO orders (
    user_id, status, total_amount, items, delivery_address, payment_method,
    delivery_type, delivery_period, delivery_date, buyer_phone, recipient_phone,
    metadata, seller_id, created_at
  ) VALUES (
    p_user_id, 'pending', p_total_amount, p_items, p_delivery_address, p_payment_method,
    p_delivery_type, p_delivery_period, p_delivery_date, p_buyer_phone, p_recipient_phone,
    p_metadata, p_seller_id, NOW()
  )
  RETURNING to_jsonb(orders.*) INTO v_result;

  RETURN v_result;
END;
$function$;
