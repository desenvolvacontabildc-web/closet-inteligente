ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','BLOCKED','CANCELED'));
ALTER TABLE subscriptions ADD COLUMN trial_ends_at timestamptz;
ALTER TABLE subscriptions ALTER COLUMN status SET DEFAULT 'TRIAL';

CREATE OR REPLACE FUNCTION register_account(p_email text, p_password_hash text, p_display_name text, p_terms_accepted boolean)
RETURNS TABLE(user_id uuid, tenant_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT p_terms_accepted THEN
    RAISE EXCEPTION 'É necessário aceitar os Termos de Uso e a Política de Privacidade.';
  END IF;
  INSERT INTO app_users(email,password_hash,terms_accepted_at) VALUES (lower(trim(p_email)),p_password_hash,now()) RETURNING id INTO user_id;
  INSERT INTO tenants DEFAULT VALUES RETURNING id INTO tenant_id;
  INSERT INTO tenant_memberships(tenant_id,user_id) VALUES (tenant_id,user_id);
  INSERT INTO profiles(user_id,tenant_id,display_name) VALUES (user_id,tenant_id,p_display_name);
  INSERT INTO subscriptions(user_id,status,trial_ends_at) VALUES (user_id,'TRIAL',now() + interval '7 days');
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION check_account_access(p_user uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r subscriptions;
BEGIN
  SELECT * INTO r FROM subscriptions WHERE user_id = p_user;
  IF NOT FOUND THEN RETURN 'ACTIVE'; END IF;
  IF r.status = 'TRIAL' AND r.trial_ends_at IS NOT NULL AND r.trial_ends_at < now() THEN RETURN 'TRIAL_EXPIRED'; END IF;
  RETURN r.status;
END $$;

CREATE OR REPLACE FUNCTION admin_set_subscription(p_actor uuid, p_target uuid, p_status text, p_fee_cents integer, p_discount_cents integer, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF p_status NOT IN ('TRIAL','ACTIVE','PAST_DUE','BLOCKED','CANCELED') THEN
    RAISE EXCEPTION 'Status inválido.';
  END IF;
  IF p_target = p_actor AND p_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Não é possível bloquear ou cancelar a própria conta de administradora.';
  END IF;
  IF p_fee_cents < 0 OR p_discount_cents < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos.';
  END IF;
  INSERT INTO subscriptions(user_id,status,monthly_fee_cents,discount_cents,notes,updated_at)
    VALUES (p_target,p_status,p_fee_cents,p_discount_cents,p_notes,now())
    ON CONFLICT (user_id) DO UPDATE SET status=excluded.status, monthly_fee_cents=excluded.monthly_fee_cents,
      discount_cents=excluded.discount_cents, notes=excluded.notes, updated_at=now();
  IF p_status IN ('BLOCKED','CANCELED') THEN
    DELETE FROM auth_sessions WHERE user_id = p_target;
  END IF;
  INSERT INTO audit_log(actor_user_id,action,target_user_id,details)
    VALUES (p_actor,'SET_SUBSCRIPTION',p_target,
      jsonb_build_object('status',p_status,'fee_cents',p_fee_cents,'discount_cents',p_discount_cents));
END $$;

DROP FUNCTION admin_list_accounts(uuid);
CREATE FUNCTION admin_list_accounts(p_actor uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamptz,
              sub_status text, trial_ends_at timestamptz, monthly_fee_cents integer, discount_cents integer, notes text, is_admin boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, p.display_name, u.created_at,
           COALESCE(s.status,'ACTIVE'), s.trial_ends_at, COALESCE(s.monthly_fee_cents,0), COALESCE(s.discount_cents,0), COALESCE(s.notes,''),
           u.is_admin
    FROM app_users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at;
END $$;
REVOKE ALL ON FUNCTION admin_list_accounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_accounts(uuid) TO closet_app;

CREATE FUNCTION my_subscription(p_user uuid)
RETURNS TABLE(status text, trial_ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT status, trial_ends_at FROM subscriptions WHERE user_id = p_user;
$$;
REVOKE ALL ON FUNCTION my_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_subscription(uuid) TO closet_app;
