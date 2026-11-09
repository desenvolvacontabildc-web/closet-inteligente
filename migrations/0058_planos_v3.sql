-- Planos v3: precos mais competitivos e limites calculados pelo custo real de IA (medido na OpenAI em 3 a 9/11/2026:
-- cerca de R$ 0,17 por imagem e centavos por operacao de texto). Meta: custo de IA no PIOR caso (usar todo o limite
-- todo mes) em torno de 28 a 30% do preco do plano, antes de taxas do Mercado Pago e impostos.
--
--   Plano        Preco     Promo cartao (3 meses)  Pedidos de IA  Looks em imagem  Fotos de catalogo
--   Arrumada     R$ 19,90  R$ 9,90                 150            8                12
--   Fashion      R$ 39,90  R$ 24,90                350            15               20
--   Super Star   R$ 79,90  R$ 49,90                800            35               35
--
-- O teste gratuito de 7 dias passa a usar os limites do plano mais basico (Arrumada). A Colorimetria deixa de vir
-- de graca no Super Star: e comprada a parte (compra unica). Cuide-se (add-on do Arrumada) cai para R$ 7,90.

UPDATE plan_config SET base_price_cents = 1990, ai_ops_monthly_limit = 150, image_gen_monthly_limit = 8,
  promo_price_cents = 990, promo_months = 3, standard_photo_monthly_limit = 12, updated_at = now() WHERE plan = 'ARRUMADA';
UPDATE plan_config SET base_price_cents = 3990, ai_ops_monthly_limit = 350, image_gen_monthly_limit = 15,
  promo_price_cents = 2490, promo_months = 3, standard_photo_monthly_limit = 20, updated_at = now() WHERE plan = 'FASHION';
UPDATE plan_config SET base_price_cents = 7990, ai_ops_monthly_limit = 800, image_gen_monthly_limit = 35,
  promo_price_cents = 4990, promo_months = 3, standard_photo_monthly_limit = 35, updated_at = now() WHERE plan = 'SUPER_STAR';

UPDATE extra_prices SET price_cents = 790, promo_price_cents = 390, promo_months = 3, updated_at = now() WHERE product = 'CUIDESE';

-- Ativacao por pagamento: igual a de antes, sem liberar a Colorimetria no Super Star (1o pagamento ainda credita quem indicou).
CREATE OR REPLACE FUNCTION activate_paid_subscription(p_user uuid, p_plan text, p_fee_cents integer, p_method text,
  p_preapproval text, p_promo_cycles integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_was_active boolean; v_referrer uuid; v_referrer_tenant uuid;
BEGIN
  SELECT (s.status = 'ACTIVE') INTO v_was_active FROM subscriptions s WHERE s.user_id = p_user;
  INSERT INTO subscriptions(user_id, status, plan, monthly_fee_cents, provider, payment_method, preapproval_id,
                            current_period_end, overdue_since, promo_cycles_left, updated_at)
    VALUES (p_user, 'ACTIVE', p_plan, p_fee_cents, 'MERCADOPAGO', p_method, p_preapproval,
            now() + interval '30 days', NULL, COALESCE(p_promo_cycles, 0), now())
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'ACTIVE', plan = excluded.plan, monthly_fee_cents = excluded.monthly_fee_cents,
      provider = 'MERCADOPAGO', payment_method = excluded.payment_method,
      preapproval_id = COALESCE(excluded.preapproval_id, subscriptions.preapproval_id),
      current_period_end = greatest(now(), COALESCE(subscriptions.current_period_end, now())) + interval '30 days',
      overdue_since = NULL,
      promo_cycles_left = CASE WHEN p_method = 'CARD' THEN COALESCE(p_promo_cycles, 0) ELSE 0 END,
      updated_at = now();
  IF NOT COALESCE(v_was_active, false) THEN
    SELECT u.referred_by INTO v_referrer FROM app_users u WHERE u.id = p_user;
    IF v_referrer IS NOT NULL THEN
      SELECT p.tenant_id INTO v_referrer_tenant FROM profiles p WHERE p.user_id = v_referrer;
      IF v_referrer_tenant IS NOT NULL THEN
        PERFORM grant_bonus_credits(v_referrer, v_referrer_tenant, 'REFERRAL_' || p_user::text, 10);
      END IF;
    END IF;
  END IF;
END $$;

-- Ajuste manual de assinatura pela administradora: igual ao de antes, sem liberar a Colorimetria no Super Star
-- (para liberar a alguem, use "Liberar Colorimetria" na pagina da usuaria).
CREATE OR REPLACE FUNCTION admin_set_subscription(p_actor uuid, p_target uuid, p_status text, p_fee_cents integer, p_discount_cents integer, p_notes text, p_plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_was_active boolean; v_referrer uuid; v_referrer_tenant uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_status NOT IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','BLOCKED','CANCELED') THEN RAISE EXCEPTION 'Status inválido.'; END IF;
  IF p_plan NOT IN ('ARRUMADA','FASHION','SUPER_STAR') THEN RAISE EXCEPTION 'Plano inválido.'; END IF;
  IF p_target = p_actor AND p_status <> 'ACTIVE' THEN RAISE EXCEPTION 'Não é possível bloquear ou cancelar a própria conta de administradora.'; END IF;
  IF p_fee_cents < 0 OR p_discount_cents < 0 THEN RAISE EXCEPTION 'Valores não podem ser negativos.'; END IF;
  SELECT (s.status = 'ACTIVE') INTO v_was_active FROM subscriptions s WHERE s.user_id = p_target;
  INSERT INTO subscriptions(user_id,status,monthly_fee_cents,discount_cents,notes,plan,updated_at)
    VALUES (p_target,p_status,p_fee_cents,p_discount_cents,p_notes,p_plan,now())
    ON CONFLICT (user_id) DO UPDATE SET status=excluded.status, monthly_fee_cents=excluded.monthly_fee_cents,
      discount_cents=excluded.discount_cents, notes=excluded.notes, plan=excluded.plan, updated_at=now();
  IF p_status = 'ACTIVE' THEN
    UPDATE subscriptions s SET overdue_since = NULL,
      current_period_end = CASE WHEN s.provider = 'MERCADOPAGO' AND s.current_period_end < now() THEN now() + interval '30 days' ELSE s.current_period_end END
      WHERE s.user_id = p_target;
  END IF;
  IF p_status IN ('BLOCKED','CANCELED') THEN DELETE FROM auth_sessions WHERE user_id = p_target; END IF;
  IF p_status = 'ACTIVE' AND NOT COALESCE(v_was_active, false) THEN
    SELECT u.referred_by INTO v_referrer FROM app_users u WHERE u.id = p_target;
    IF v_referrer IS NOT NULL THEN
      SELECT p.tenant_id INTO v_referrer_tenant FROM profiles p WHERE p.user_id = v_referrer;
      IF v_referrer_tenant IS NOT NULL THEN PERFORM grant_bonus_credits(v_referrer, v_referrer_tenant, 'REFERRAL_' || p_target::text, 10); END IF;
    END IF;
  END IF;
  INSERT INTO audit_log(actor_user_id,action,target_user_id,details)
    VALUES (p_actor,'SET_SUBSCRIPTION',p_target,
      jsonb_build_object('status',p_status,'plan',p_plan,'fee_cents',p_fee_cents,'discount_cents',p_discount_cents,'notes',p_notes));
END $$;
