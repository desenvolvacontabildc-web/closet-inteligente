ALTER TABLE subscriptions ADD COLUMN plan text NOT NULL DEFAULT 'ESSENCIAL' CHECK (plan IN ('ESSENCIAL','ICON'));

DROP FUNCTION admin_set_subscription(uuid,uuid,text,integer,integer,text);
CREATE FUNCTION admin_set_subscription(p_actor uuid, p_target uuid, p_status text, p_fee_cents integer, p_discount_cents integer, p_notes text, p_plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF p_status NOT IN ('TRIAL','ACTIVE','PAST_DUE','BLOCKED','CANCELED') THEN
    RAISE EXCEPTION 'Status inválido.';
  END IF;
  IF p_plan NOT IN ('ESSENCIAL','ICON') THEN
    RAISE EXCEPTION 'Plano inválido.';
  END IF;
  IF p_target = p_actor AND p_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Não é possível bloquear ou cancelar a própria conta de administradora.';
  END IF;
  IF p_fee_cents < 0 OR p_discount_cents < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos.';
  END IF;
  INSERT INTO subscriptions(user_id,status,monthly_fee_cents,discount_cents,notes,plan,updated_at)
    VALUES (p_target,p_status,p_fee_cents,p_discount_cents,p_notes,p_plan,now())
    ON CONFLICT (user_id) DO UPDATE SET status=excluded.status, monthly_fee_cents=excluded.monthly_fee_cents,
      discount_cents=excluded.discount_cents, notes=excluded.notes, plan=excluded.plan, updated_at=now();
  IF p_status IN ('BLOCKED','CANCELED') THEN
    DELETE FROM auth_sessions WHERE user_id = p_target;
  END IF;
  INSERT INTO audit_log(actor_user_id,action,target_user_id,details)
    VALUES (p_actor,'SET_SUBSCRIPTION',p_target,
      jsonb_build_object('status',p_status,'plan',p_plan,'fee_cents',p_fee_cents,'discount_cents',p_discount_cents));
END $$;

REVOKE ALL ON FUNCTION admin_set_subscription(uuid,uuid,text,integer,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_subscription(uuid,uuid,text,integer,integer,text,text) TO closet_app;

DROP FUNCTION admin_list_accounts(uuid);
CREATE FUNCTION admin_list_accounts(p_actor uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamptz,
              sub_status text, plan text, trial_ends_at timestamptz, monthly_fee_cents integer, discount_cents integer, notes text, is_admin boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, p.display_name, u.created_at,
           COALESCE(s.status,'ACTIVE'), COALESCE(s.plan,'ESSENCIAL'), s.trial_ends_at,
           COALESCE(s.monthly_fee_cents,0), COALESCE(s.discount_cents,0), COALESCE(s.notes,''),
           u.is_admin
    FROM app_users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at;
END $$;
REVOKE ALL ON FUNCTION admin_list_accounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_accounts(uuid) TO closet_app;

DROP FUNCTION my_subscription(uuid);
CREATE FUNCTION my_subscription(p_user uuid)
RETURNS TABLE(status text, plan text, trial_ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT status, plan, trial_ends_at FROM subscriptions WHERE user_id = p_user;
$$;
REVOKE ALL ON FUNCTION my_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_subscription(uuid) TO closet_app;
