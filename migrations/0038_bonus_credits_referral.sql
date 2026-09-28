-- Creditos bonus de geracao de imagem: nao expiram por mes (diferente do limite mensal do
-- plano), so sao gastos quando o limite mensal do plano ja foi usado. credit_grants registra
-- o motivo de cada concessao e garante (via UNIQUE) que a mesma concessao nunca dobra.
ALTER TABLE profiles ADD COLUMN bonus_image_credits integer NOT NULL DEFAULT 0;

CREATE TABLE credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  credits integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, reason)
);
ALTER TABLE credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY credit_grants_self ON credit_grants FOR SELECT TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON credit_grants TO closet_app;

-- Concede credito de forma idempotente (a mesma reason nunca credita duas vezes). Precisa ser
-- SECURITY DEFINER porque, no caso de indicacao, credita a QUEM INDICOU, nao a propria sessao.
CREATE FUNCTION grant_bonus_credits(p_user uuid, p_tenant uuid, p_reason text, p_credits integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO credit_grants(tenant_id,user_id,reason,credits) VALUES (p_tenant,p_user,p_reason,p_credits)
    ON CONFLICT (user_id,reason) DO NOTHING;
  IF FOUND THEN
    UPDATE profiles SET bonus_image_credits = bonus_image_credits + p_credits WHERE user_id = p_user;
    RETURN true;
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION grant_bonus_credits(uuid,uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_bonus_credits(uuid,uuid,text,integer) TO closet_app;

-- Marcos de tempo de uso: credita automaticamente ao completar 1/3/6/12 meses de conta,
-- uma unica vez cada. Chamada ao abrir a Home; so retorna linha quando algo foi concedido
-- agora mesmo (pra mostrar o aviso de "parabens" só na hora certa).
CREATE FUNCTION check_and_grant_milestones(p_user uuid)
RETURNS TABLE(reason text, credits integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant uuid; v_days integer;
BEGIN
  SELECT tenant_id INTO v_tenant FROM profiles WHERE user_id = p_user;
  SELECT EXTRACT(DAY FROM now() - created_at)::int INTO v_days FROM app_users WHERE id = p_user;
  IF v_tenant IS NULL OR v_days IS NULL THEN RETURN; END IF;
  IF v_days >= 30 AND grant_bonus_credits(p_user, v_tenant, 'MILESTONE_1M', 5) THEN
    RETURN QUERY SELECT 'MILESTONE_1M'::text, 5; END IF;
  IF v_days >= 90 AND grant_bonus_credits(p_user, v_tenant, 'MILESTONE_3M', 10) THEN
    RETURN QUERY SELECT 'MILESTONE_3M'::text, 10; END IF;
  IF v_days >= 180 AND grant_bonus_credits(p_user, v_tenant, 'MILESTONE_6M', 15) THEN
    RETURN QUERY SELECT 'MILESTONE_6M'::text, 15; END IF;
  IF v_days >= 365 AND grant_bonus_credits(p_user, v_tenant, 'MILESTONE_1Y', 30) THEN
    RETURN QUERY SELECT 'MILESTONE_1Y'::text, 30; END IF;
END $$;
REVOKE ALL ON FUNCTION check_and_grant_milestones(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_and_grant_milestones(uuid) TO closet_app;

-- Indicacao: cada conta tem um codigo curto proprio; quem se cadastra pode informar o codigo
-- de quem indicou. O credito só é liberado quando a pessoa indicada virar assinante pagante
-- de fato (primeira vez que o status vira ACTIVE) -- ver admin_set_subscription abaixo.
ALTER TABLE app_users ADD COLUMN referral_code text;
ALTER TABLE app_users ADD COLUMN referred_by uuid REFERENCES app_users(id);
UPDATE app_users SET referral_code = substr(replace(id::text,'-',''),1,8);
ALTER TABLE app_users ALTER COLUMN referral_code SET NOT NULL;
ALTER TABLE app_users ADD CONSTRAINT app_users_referral_code_key UNIQUE (referral_code);

DROP FUNCTION IF EXISTS register_account(text,text,text,boolean);
CREATE FUNCTION register_account(p_email text, p_password_hash text, p_display_name text, p_terms_accepted boolean, p_referral_code text DEFAULT NULL)
RETURNS TABLE(user_id uuid, tenant_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_referrer uuid; v_code text;
BEGIN
  IF NOT p_terms_accepted THEN
    RAISE EXCEPTION 'É necessário aceitar os Termos de Uso e a Política de Privacidade.';
  END IF;
  IF p_referral_code IS NOT NULL AND btrim(p_referral_code) <> '' THEN
    SELECT id INTO v_referrer FROM app_users WHERE referral_code = lower(btrim(p_referral_code));
  END IF;
  v_code := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  INSERT INTO app_users(email,password_hash,terms_accepted_at,referral_code,referred_by)
    VALUES (lower(trim(p_email)),p_password_hash,now(),v_code,v_referrer) RETURNING id INTO user_id;
  INSERT INTO tenants DEFAULT VALUES RETURNING id INTO tenant_id;
  INSERT INTO tenant_memberships(tenant_id,user_id) VALUES (tenant_id,user_id);
  INSERT INTO profiles(user_id,tenant_id,display_name) VALUES (user_id,tenant_id,p_display_name);
  INSERT INTO subscriptions(user_id,status,trial_ends_at) VALUES (user_id,'TRIAL',now() + interval '7 days');
  PERFORM grant_bonus_credits(user_id, tenant_id, 'TRIAL_SIGNUP', 5);
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION register_account(text,text,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_account(text,text,text,boolean,text) TO closet_app;

-- Credita quem indicou (10 creditos) na primeira vez que a pessoa indicada vira assinante
-- pagante de fato -- nao no simples cadastro, pra nao premiar conta de teste que nunca converte.
CREATE OR REPLACE FUNCTION admin_set_subscription(p_actor uuid, p_target uuid, p_status text, p_fee_cents integer, p_discount_cents integer, p_notes text, p_plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_was_active boolean; v_referrer uuid; v_referrer_tenant uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF p_status NOT IN ('TRIAL','ACTIVE','PAST_DUE','BLOCKED','CANCELED') THEN
    RAISE EXCEPTION 'Status inválido.';
  END IF;
  IF p_plan NOT IN ('ARRUMADA','FASHION','SUPER_STAR') THEN
    RAISE EXCEPTION 'Plano inválido.';
  END IF;
  IF p_target = p_actor AND p_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Não é possível bloquear ou cancelar a própria conta de administradora.';
  END IF;
  IF p_fee_cents < 0 OR p_discount_cents < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos.';
  END IF;
  SELECT (status = 'ACTIVE') INTO v_was_active FROM subscriptions WHERE user_id = p_target;
  INSERT INTO subscriptions(user_id,status,monthly_fee_cents,discount_cents,notes,plan,updated_at)
    VALUES (p_target,p_status,p_fee_cents,p_discount_cents,p_notes,p_plan,now())
    ON CONFLICT (user_id) DO UPDATE SET status=excluded.status, monthly_fee_cents=excluded.monthly_fee_cents,
      discount_cents=excluded.discount_cents, notes=excluded.notes, plan=excluded.plan, updated_at=now();
  IF p_status IN ('BLOCKED','CANCELED') THEN
    DELETE FROM auth_sessions WHERE user_id = p_target;
  END IF;
  IF p_plan = 'SUPER_STAR' THEN
    INSERT INTO user_modules(user_id,module,status,origin) VALUES (p_target,'COLORIMETRIA','LIBERADA','SUPER_STAR')
      ON CONFLICT (user_id,module) DO NOTHING;
  END IF;
  IF p_status = 'ACTIVE' AND NOT COALESCE(v_was_active, false) THEN
    SELECT referred_by INTO v_referrer FROM app_users WHERE id = p_target;
    IF v_referrer IS NOT NULL THEN
      SELECT tenant_id INTO v_referrer_tenant FROM profiles WHERE user_id = v_referrer;
      IF v_referrer_tenant IS NOT NULL THEN
        PERFORM grant_bonus_credits(v_referrer, v_referrer_tenant, 'REFERRAL_' || p_target::text, 10);
      END IF;
    END IF;
  END IF;
  INSERT INTO audit_log(actor_user_id,action,target_user_id,details)
    VALUES (p_actor,'SET_SUBSCRIPTION',p_target,
      jsonb_build_object('status',p_status,'plan',p_plan,'fee_cents',p_fee_cents,'discount_cents',p_discount_cents,'notes',p_notes));
END $$;
REVOKE ALL ON FUNCTION admin_set_subscription(uuid,uuid,text,integer,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_subscription(uuid,uuid,text,integer,integer,text,text) TO closet_app;
