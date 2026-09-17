ALTER TABLE app_users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE subscriptions (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAST_DUE','BLOCKED','CANCELED')),
  monthly_fee_cents integer NOT NULL DEFAULT 0 CHECK (monthly_fee_cents >= 0),
  discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
-- No policies granted: closet_app has zero direct access. Only the SECURITY DEFINER
-- functions below (owned by the migration admin role) read or write this table.

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES app_users(id),
  action text NOT NULL,
  target_user_id uuid REFERENCES app_users(id),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE FUNCTION admin_list_accounts(p_actor uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamptz,
              sub_status text, monthly_fee_cents integer, discount_cents integer, notes text, is_admin boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, p.display_name, u.created_at,
           COALESCE(s.status,'ACTIVE'), COALESCE(s.monthly_fee_cents,0), COALESCE(s.discount_cents,0), COALESCE(s.notes,''),
           u.is_admin
    FROM app_users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at;
END $$;
REVOKE ALL ON FUNCTION admin_list_accounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_accounts(uuid) TO closet_app;

CREATE FUNCTION admin_set_subscription(p_actor uuid, p_target uuid, p_status text, p_fee_cents integer, p_discount_cents integer, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF p_status NOT IN ('ACTIVE','PAST_DUE','BLOCKED','CANCELED') THEN
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
REVOKE ALL ON FUNCTION admin_set_subscription(uuid,uuid,text,integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_subscription(uuid,uuid,text,integer,integer,text) TO closet_app;

CREATE FUNCTION admin_reset_password(p_actor uuid, p_target uuid, p_new_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  UPDATE app_users SET password_hash = p_new_hash WHERE id = p_target;
  DELETE FROM auth_sessions WHERE user_id = p_target;
  INSERT INTO audit_log(actor_user_id,action,target_user_id) VALUES (p_actor,'RESET_PASSWORD',p_target);
END $$;
REVOKE ALL ON FUNCTION admin_reset_password(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_reset_password(uuid,uuid,text) TO closet_app;

CREATE FUNCTION check_account_access(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE((SELECT status FROM subscriptions WHERE user_id = p_user), 'ACTIVE');
$$;
REVOKE ALL ON FUNCTION check_account_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_account_access(uuid) TO closet_app;
