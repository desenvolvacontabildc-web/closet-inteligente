-- 0042: as funcoes apply_* declaram RETURNS TABLE(user_id uuid) e usam "WHERE user_id = ..."
-- dentro do UPDATE, o que e ambiguo em plpgsql ("column reference user_id is ambiguous") e
-- fazia o webhook falhar ao aprovar pagamento. Qualifica a coluna com o nome da tabela.
CREATE OR REPLACE FUNCTION apply_pix_result(p_provider_payment_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_charge payment_charges%ROWTYPE;
BEGIN
  SELECT * INTO v_charge FROM payment_charges pc WHERE pc.provider_payment_id = p_provider_payment_id AND pc.kind = 'PIX' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE payment_charges pc SET status = p_status, raw = p_raw, updated_at = now() WHERE pc.id = v_charge.id;
  IF p_status = 'approved' THEN
    UPDATE subscriptions s SET status = 'ACTIVE', plan = v_charge.plan, monthly_fee_cents = v_charge.amount_cents,
      provider = 'MERCADOPAGO', payment_method = 'PIX', current_period_end = now() + interval '30 days', updated_at = now()
      WHERE s.user_id = v_charge.user_id;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v_charge.user_id, 'PIX_PAYMENT_APPROVED', v_charge.user_id, jsonb_build_object('amount_cents', v_charge.amount_cents, 'plan', v_charge.plan));
  END IF;
  RETURN QUERY SELECT v_charge.user_id;
END $$;

CREATE OR REPLACE FUNCTION apply_preapproval_result(p_preapproval_id text, p_status text, p_external_reference text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid;
BEGIN
  v_user := nullif(p_external_reference,'')::uuid;
  IF v_user IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_users u WHERE u.id = v_user) THEN RETURN; END IF;
  IF p_status = 'authorized' THEN
    UPDATE subscriptions s SET status = 'ACTIVE', provider = 'MERCADOPAGO', payment_method = 'CARD',
      preapproval_id = p_preapproval_id, current_period_end = now() + interval '30 days', updated_at = now()
      WHERE s.user_id = v_user;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v_user, 'CARD_SUBSCRIPTION_CHARGED', v_user, p_raw);
  ELSIF p_status IN ('cancelled','paused') THEN
    UPDATE subscriptions s SET status = 'PAST_DUE', updated_at = now() WHERE s.user_id = v_user AND s.preapproval_id = p_preapproval_id;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v_user, 'CARD_SUBSCRIPTION_' || upper(p_status), v_user, p_raw);
  END IF;
  RETURN QUERY SELECT v_user;
END $$;

CREATE OR REPLACE FUNCTION apply_authorized_payment_result(p_preapproval_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT s.user_id INTO v_user FROM subscriptions s WHERE s.preapproval_id = p_preapproval_id;
  IF v_user IS NULL THEN RETURN; END IF;
  IF p_status = 'approved' THEN
    UPDATE subscriptions s SET status = 'ACTIVE', current_period_end = now() + interval '30 days', updated_at = now() WHERE s.user_id = v_user;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (v_user, 'CARD_CYCLE_CHARGED', v_user, p_raw);
  ELSIF p_status = 'rejected' THEN
    UPDATE subscriptions s SET status = 'PAST_DUE', updated_at = now() WHERE s.user_id = v_user;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (v_user, 'CARD_CYCLE_REJECTED', v_user, p_raw);
  END IF;
  RETURN QUERY SELECT v_user;
END $$;
