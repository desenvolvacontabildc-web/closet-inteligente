-- Cobranca self-service via Mercado Pago (Pix avulso renovado por ciclo + cartao recorrente
-- via Preapproval). Antes disso, status/plano/valor de cada conta eram 100% definidos
-- manualmente pela administradora (admin_set_subscription/admin_record_payment, que
-- permanecem disponiveis para cortesia/caso especial). Agora o webhook do Mercado Pago
-- pode atualizar o mesmo registro automaticamente quando a cliente paga.

ALTER TABLE subscriptions
  ADD COLUMN provider text,
  ADD COLUMN preapproval_id text,
  ADD COLUMN current_period_end timestamptz,
  ADD COLUMN payment_method text CHECK (payment_method IN ('PIX','CARD') OR payment_method IS NULL);

CREATE TABLE payment_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'MERCADOPAGO',
  provider_payment_id text,
  kind text NOT NULL CHECK (kind IN ('PIX','CARD_PREAPPROVAL')),
  status text NOT NULL DEFAULT 'pending',
  plan text NOT NULL CHECK (plan IN ('ARRUMADA','FASHION','SUPER_STAR')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_expires_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_charges_provider_payment_id_idx ON payment_charges(provider_payment_id);
CREATE INDEX payment_charges_user_id_idx ON payment_charges(user_id);
ALTER TABLE payment_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_charges FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_charges_self_select ON payment_charges FOR SELECT TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON payment_charges TO closet_app;
-- Sem GRANT de INSERT/UPDATE direto: so as funcoes SECURITY DEFINER abaixo escrevem aqui
-- (uma chamada pela Server Action ao criar a cobranca, outra so pelo endpoint de webhook,
-- que valida a assinatura do Mercado Pago antes de chamar).

-- Chamada pela Server Action que cria a cobranca (Pix ou preapproval de cartao), logo
-- depois de criar o recurso correspondente na API do Mercado Pago.
CREATE FUNCTION create_payment_charge(
  p_user uuid, p_kind text, p_plan text, p_amount_cents integer, p_provider_payment_id text,
  p_pix_qr text, p_pix_qr_b64 text, p_pix_expires timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO payment_charges(user_id,tenant_id,kind,plan,amount_cents,provider_payment_id,pix_qr_code,pix_qr_code_base64,pix_expires_at)
    VALUES (p_user, (SELECT tenant_id FROM tenant_memberships WHERE user_id=p_user LIMIT 1), p_kind, p_plan, p_amount_cents, p_provider_payment_id, p_pix_qr, p_pix_qr_b64, p_pix_expires)
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION create_payment_charge(uuid,text,text,integer,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_payment_charge(uuid,text,text,integer,text,text,text,timestamptz) TO closet_app;

-- Le uma cobranca pendente pra cliente acompanhar status (tela de Pix aguardando pagamento).
CREATE FUNCTION my_pending_charge(p_user uuid)
RETURNS TABLE(id uuid, kind text, status text, plan text, amount_cents integer, pix_qr_code text, pix_qr_code_base64 text, pix_expires_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT id, kind, status, plan, amount_cents, pix_qr_code, pix_qr_code_base64, pix_expires_at, created_at
  FROM payment_charges WHERE user_id = p_user ORDER BY created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION my_pending_charge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_pending_charge(uuid) TO closet_app;

-- Chamada SO pelo endpoint de webhook (sem sessao de usuaria -- o Mercado Pago chama
-- direto). Por isso nao checa app.user_id/is_admin: a autorizacao real e a validacao da
-- assinatura HMAC do Mercado Pago, feita em TypeScript antes de chamar esta funcao.
-- Idempotente: reaplicar o mesmo status/pagamento nao duplica nada.
CREATE FUNCTION apply_pix_result(p_provider_payment_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_charge payment_charges%ROWTYPE;
BEGIN
  SELECT * INTO v_charge FROM payment_charges WHERE provider_payment_id = p_provider_payment_id AND kind = 'PIX' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE payment_charges SET status = p_status, raw = p_raw, updated_at = now() WHERE id = v_charge.id;
  IF p_status = 'approved' THEN
    UPDATE subscriptions SET status = 'ACTIVE', plan = v_charge.plan, monthly_fee_cents = v_charge.amount_cents,
      provider = 'MERCADOPAGO', payment_method = 'PIX', current_period_end = now() + interval '30 days', updated_at = now()
      WHERE user_id = v_charge.user_id;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v_charge.user_id, 'PIX_PAYMENT_APPROVED', v_charge.user_id, jsonb_build_object('amount_cents', v_charge.amount_cents, 'plan', v_charge.plan));
  END IF;
  RETURN QUERY SELECT v_charge.user_id;
END $$;
REVOKE ALL ON FUNCTION apply_pix_result(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_pix_result(text,text,jsonb) TO closet_app;

-- Idem, para eventos de assinatura recorrente de cartao (preapproval). status esperado:
-- 'authorized' (assinatura ativa, cartao autorizado) ou 'cancelled'/'paused'.
CREATE FUNCTION apply_preapproval_result(p_preapproval_id text, p_status text, p_external_reference text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid;
BEGIN
  v_user := nullif(p_external_reference,'')::uuid;
  IF v_user IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = v_user) THEN RETURN; END IF;
  IF p_status = 'authorized' THEN
    UPDATE subscriptions SET status = 'ACTIVE', provider = 'MERCADOPAGO', payment_method = 'CARD',
      preapproval_id = p_preapproval_id, current_period_end = now() + interval '30 days', updated_at = now()
      WHERE user_id = v_user;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v_user, 'CARD_SUBSCRIPTION_CHARGED', v_user, p_raw);
  ELSIF p_status IN ('cancelled','paused') THEN
    UPDATE subscriptions SET status = 'PAST_DUE', updated_at = now() WHERE user_id = v_user AND preapproval_id = p_preapproval_id;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v_user, 'CARD_SUBSCRIPTION_' || upper(p_status), v_user, p_raw);
  END IF;
  RETURN QUERY SELECT v_user;
END $$;
REVOKE ALL ON FUNCTION apply_preapproval_result(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_preapproval_result(text,text,text,jsonb) TO closet_app;

-- Idem, para cada cobranca recorrente individual de uma assinatura de cartao ja autorizada
-- (um preapproval autorizado gera uma dessas por ciclo). 'approved' estende o periodo;
-- 'rejected' marca PAST_DUE sem desativar a assinatura (Mercado Pago tenta novamente
-- automaticamente por alguns dias antes de cancelar o preapproval de fato).
CREATE FUNCTION apply_authorized_payment_result(p_preapproval_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT s.user_id INTO v_user FROM subscriptions s WHERE s.preapproval_id = p_preapproval_id;
  IF v_user IS NULL THEN RETURN; END IF;
  IF p_status = 'approved' THEN
    UPDATE subscriptions SET status = 'ACTIVE', current_period_end = now() + interval '30 days', updated_at = now() WHERE user_id = v_user;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (v_user, 'CARD_CYCLE_CHARGED', v_user, p_raw);
  ELSIF p_status = 'rejected' THEN
    UPDATE subscriptions SET status = 'PAST_DUE', updated_at = now() WHERE user_id = v_user;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (v_user, 'CARD_CYCLE_REJECTED', v_user, p_raw);
  END IF;
  RETURN QUERY SELECT v_user;
END $$;
REVOKE ALL ON FUNCTION apply_authorized_payment_result(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_authorized_payment_result(text,text,jsonb) TO closet_app;

-- Grava o preapproval_id assim que a Server Action cria a assinatura (antes mesmo do
-- primeiro webhook chegar), pra conseguirmos casar o webhook de 'authorized' a seguir.
CREATE FUNCTION set_pending_preapproval(p_user uuid, p_preapproval_id text, p_plan text, p_amount_cents integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO subscriptions(user_id, status, plan, monthly_fee_cents, provider, payment_method, preapproval_id, updated_at)
    VALUES (p_user, 'PAST_DUE', p_plan, p_amount_cents, 'MERCADOPAGO', 'CARD', p_preapproval_id, now())
    ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, monthly_fee_cents = excluded.monthly_fee_cents,
      provider = excluded.provider, payment_method = excluded.payment_method, preapproval_id = excluded.preapproval_id, updated_at = now();
$$;
REVOKE ALL ON FUNCTION set_pending_preapproval(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_pending_preapproval(uuid,text,text,integer) TO closet_app;
