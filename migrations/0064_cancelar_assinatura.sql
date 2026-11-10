-- Cancelar assinatura (cartao recorrente) pela propria usuaria: o app cancela o preapproval no Mercado Pago (nao ha novas
-- cobrancas) e a conta continua com acesso ate o fim do periodo ja pago; depois disso a conta fica bloqueada ate ela
-- escolher um plano de novo. O flag cancel_at_period_end marca isso, e o aviso de "cancelada" do Mercado Pago que chega
-- depois pelo webhook deixa de ser tratado como atraso.

ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;

-- Status efetivo: igual ao de antes e, se a usuaria cancelou, acesso ate o fim do periodo pago e depois SUSPENDED.
CREATE OR REPLACE FUNCTION effective_status(p_user uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r subscriptions; v_admin boolean; v_due timestamptz;
BEGIN
  SELECT * INTO r FROM subscriptions s WHERE s.user_id = p_user;
  IF NOT FOUND THEN RETURN 'ACTIVE'; END IF;
  IF r.status = 'TRIAL' AND r.trial_ends_at IS NOT NULL AND r.trial_ends_at < now() THEN RETURN 'TRIAL_EXPIRED'; END IF;
  SELECT a.is_admin INTO v_admin FROM app_users a WHERE a.id = p_user;
  IF COALESCE(v_admin, false) OR r.provider IS DISTINCT FROM 'MERCADOPAGO' OR r.status NOT IN ('ACTIVE','PAST_DUE') THEN
    RETURN r.status;
  END IF;
  IF r.cancel_at_period_end AND r.current_period_end IS NOT NULL THEN
    IF now() > r.current_period_end THEN RETURN 'SUSPENDED'; END IF;
    RETURN 'ACTIVE';
  END IF;
  v_due := COALESCE(r.overdue_since, CASE WHEN r.payment_method = 'PIX' THEN r.current_period_end END);
  IF v_due IS NULL THEN RETURN r.status; END IF;
  IF now() > v_due + interval '5 days' THEN RETURN 'SUSPENDED'; END IF;
  IF now() > v_due THEN RETURN 'PAST_DUE'; END IF;
  RETURN r.status;
END $$;

-- my_subscription ganha o campo cancel_at_period_end (no fim, para nao quebrar quem le por nome).
DROP FUNCTION my_subscription(uuid);
CREATE FUNCTION my_subscription(p_user uuid)
RETURNS TABLE(status text, plan text, trial_ends_at timestamptz, current_period_end timestamptz, overdue_since timestamptz,
              payment_method text, provider text, promo_cycles_left integer, cancel_at_period_end boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT effective_status(p_user), s.plan, s.trial_ends_at, s.current_period_end, s.overdue_since, s.payment_method, s.provider, s.promo_cycles_left, s.cancel_at_period_end
  FROM subscriptions s WHERE s.user_id = p_user;
$$;
REVOKE ALL ON FUNCTION my_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_subscription(uuid) TO closet_app;

-- Qualquer pagamento novo (Pix ou cartao) reativa a conta e limpa o cancelamento.
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

-- O aviso "cancelada" do Mercado Pago, quando foi a propria usuaria que cancelou, nao e atraso.
CREATE OR REPLACE FUNCTION apply_preapproval_result(p_preapproval_id text, p_status text, p_external_reference text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid; v_charge payment_charges%ROWTYPE; v_sub subscriptions%ROWTYPE;
BEGIN
  v_user := nullif(p_external_reference,'')::uuid;
  IF v_user IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_users u WHERE u.id = v_user) THEN RETURN; END IF;
  SELECT * INTO v_charge FROM payment_charges pc WHERE pc.provider_payment_id = p_preapproval_id AND pc.kind = 'CARD_PREAPPROVAL' FOR UPDATE;
  SELECT * INTO v_sub FROM subscriptions s WHERE s.user_id = v_user;
  IF p_status = 'authorized' THEN
    IF v_charge.id IS NULL THEN
      RETURN QUERY SELECT v_user;
      RETURN;
    END IF;
    IF v_charge.status IS DISTINCT FROM 'approved' THEN
      UPDATE payment_charges pc SET status = 'approved', raw = p_raw, updated_at = now() WHERE pc.id = v_charge.id;
      PERFORM activate_paid_subscription(v_user, v_charge.plan, v_charge.amount_cents, 'CARD', p_preapproval_id,
        COALESCE((v_charge.raw->>'promo_cycles')::int, 0));
      INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
        VALUES (v_user, 'CARD_SUBSCRIPTION_AUTHORIZED', v_user, jsonb_build_object('plan', v_charge.plan, 'amount_cents', v_charge.amount_cents));
      PERFORM notify_admin('PAYMENT', v_user, 'Assinatura no cartão ativada',
        who_is(v_user) || ' assinou o plano ' || v_charge.plan || ' no cartão (R$ ' || replace(to_char(v_charge.amount_cents / 100.0, 'FM999990.00'), '.', ',') || '/mês) e foi liberada automaticamente.');
    END IF;
  ELSIF p_status IN ('cancelled','paused') THEN
    IF v_charge.id IS NOT NULL AND v_charge.status = 'pending' THEN
      UPDATE payment_charges pc SET status = p_status, raw = p_raw, updated_at = now() WHERE pc.id = v_charge.id;
    ELSIF v_sub.preapproval_id = p_preapproval_id THEN
      IF COALESCE(v_sub.cancel_at_period_end, false) THEN
        INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
          VALUES (v_user, 'CARD_SUBSCRIPTION_' || upper(p_status) || '_CONFIRMED', v_user, p_raw);
      ELSE
        UPDATE subscriptions s SET status = 'PAST_DUE', overdue_since = COALESCE(s.overdue_since, now()), updated_at = now() WHERE s.user_id = v_user;
        INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
          VALUES (v_user, 'CARD_SUBSCRIPTION_' || upper(p_status), v_user, p_raw);
        PERFORM notify_admin('OVERDUE', v_user, 'Assinatura no cartão ' || (CASE WHEN p_status = 'cancelled' THEN 'cancelada' ELSE 'pausada' END),
          who_is(v_user) || ': o acesso será suspenso em 5 dias se não regularizar.');
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_user;
END $$;

-- Dados para cancelar: so devolve linha se ha cartao recorrente ativo que ainda nao foi cancelado.
CREATE FUNCTION my_card_subscription(p_user uuid)
RETURNS TABLE(preapproval_id text, current_period_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT s.preapproval_id, s.current_period_end FROM subscriptions s
  WHERE s.user_id = p_user AND s.provider = 'MERCADOPAGO' AND s.payment_method = 'CARD' AND s.preapproval_id IS NOT NULL
    AND s.status IN ('ACTIVE','PAST_DUE') AND NOT s.cancel_at_period_end;
$$;
REVOKE ALL ON FUNCTION my_card_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_card_subscription(uuid) TO closet_app;

-- Chamada depois que o Mercado Pago confirmou o cancelamento.
CREATE FUNCTION mark_subscription_canceled(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE subscriptions s SET cancel_at_period_end = true, updated_at = now()
    WHERE s.user_id = p_user AND s.payment_method = 'CARD' AND s.status IN ('ACTIVE','PAST_DUE');
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_user, 'USER_CANCELED_SUBSCRIPTION', p_user, '{}'::jsonb);
  PERFORM notify_admin('PAYMENT', p_user, 'Assinatura cancelada pela usuária',
    who_is(p_user) || ' cancelou a assinatura no cartão. O acesso segue até o fim do período já pago.');
END $$;
REVOKE ALL ON FUNCTION mark_subscription_canceled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_subscription_canceled(uuid) TO closet_app;
