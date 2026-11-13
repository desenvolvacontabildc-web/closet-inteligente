-- Cartao recorrente: a autorizacao da assinatura NAO soma 30 dias (quem soma e a cobranca de cada ciclo, que chega logo em
-- seguida). Antes, o 1o mes era contado duas vezes (autorizacao + 1a cobranca), e a tela mostrava a "proxima cobranca" dois
-- meses a frente, parecendo que a cliente pagava uma unica vez. Agora, no cartao, o periodo comeca no momento da autorizacao
-- e cada cobranca aprovada soma 30 dias: o promocional (ex.: R$ 9,90) vale em cada uma das N primeiras cobrancas mensais.
-- Pix continua igual (cada pagamento soma 30 dias).
CREATE OR REPLACE FUNCTION activate_paid_subscription(p_user uuid, p_plan text, p_fee_cents integer, p_method text,
  p_preapproval text, p_promo_cycles integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_was_active boolean; v_referrer uuid; v_referrer_tenant uuid;
BEGIN
  SELECT (s.status = 'ACTIVE') INTO v_was_active FROM subscriptions s WHERE s.user_id = p_user;
  INSERT INTO subscriptions(user_id, status, plan, monthly_fee_cents, provider, payment_method, preapproval_id,
                            current_period_end, overdue_since, promo_cycles_left, updated_at)
    VALUES (p_user, 'ACTIVE', p_plan, p_fee_cents, 'MERCADOPAGO', p_method, p_preapproval,
            CASE WHEN p_method = 'CARD' THEN now() ELSE now() + interval '30 days' END, NULL, COALESCE(p_promo_cycles, 0), now())
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'ACTIVE', plan = excluded.plan, monthly_fee_cents = excluded.monthly_fee_cents,
      provider = 'MERCADOPAGO', payment_method = excluded.payment_method,
      preapproval_id = COALESCE(excluded.preapproval_id, subscriptions.preapproval_id),
      current_period_end = CASE WHEN p_method = 'CARD' THEN now()
                                ELSE greatest(now(), COALESCE(subscriptions.current_period_end, now())) + interval '30 days' END,
      overdue_since = NULL,
      cancel_at_period_end = false,
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

-- Corrige a assinatura de cartao ja afetada: a unica cobranca ate agora (1a, em 13/11/2026 14:37 UTC) vale ate 30 dias depois.
UPDATE subscriptions s SET current_period_end = timestamptz '2026-11-13 14:37:47+00' + interval '30 days'
 WHERE s.user_id = (SELECT id FROM app_users WHERE email = 'nyanaamorim@gmail.com')
   AND s.payment_method = 'CARD' AND s.cycles_paid = 1;
