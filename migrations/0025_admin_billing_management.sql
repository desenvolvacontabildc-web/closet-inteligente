-- Gestao de cobranca e monitoramento para a administradora: registro de pagamentos e
-- historico de acoes (reaproveitando audit_log, que ja guarda mudanca de plano/status e
-- reset de senha), alem de last_login_at pra saber quem esta inativa.
ALTER TABLE app_users ADD COLUMN last_login_at timestamptz;

-- closet_app so tem GRANT SELECT em app_users (ver 0001_foundation.sql); o UPDATE precisa
-- passar por uma funcao SECURITY DEFINER, como todo o resto do acesso privilegiado.
CREATE FUNCTION record_login(p_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE app_users SET last_login_at = now() WHERE id = p_user;
$$;
REVOKE ALL ON FUNCTION record_login(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_login(uuid) TO closet_app;

CREATE FUNCTION admin_record_payment(p_actor uuid, p_target uuid, p_amount_cents integer, p_paid_at date, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'O valor do pagamento deve ser maior que zero.';
  END IF;
  INSERT INTO audit_log(actor_user_id,action,target_user_id,details)
    VALUES (p_actor,'PAYMENT_RECEIVED',p_target,
      jsonb_build_object('amount_cents',p_amount_cents,'paid_at',p_paid_at,'notes',p_notes));
END $$;
REVOKE ALL ON FUNCTION admin_record_payment(uuid,uuid,integer,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_record_payment(uuid,uuid,integer,date,text) TO closet_app;

CREATE FUNCTION admin_list_audit(p_actor uuid, p_target uuid)
RETURNS TABLE(action text, details jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY
    SELECT al.action, al.details, al.created_at FROM audit_log al
    WHERE al.target_user_id = p_target ORDER BY al.created_at DESC LIMIT 50;
END $$;
REVOKE ALL ON FUNCTION admin_list_audit(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_audit(uuid,uuid) TO closet_app;

DROP FUNCTION admin_list_accounts(uuid);
CREATE FUNCTION admin_list_accounts(p_actor uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamptz,
              sub_status text, plan text, trial_ends_at timestamptz, monthly_fee_cents integer, discount_cents integer, notes text, is_admin boolean, last_login_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, p.display_name, u.created_at,
           COALESCE(s.status,'ACTIVE'), COALESCE(s.plan,'ARRUMADA'), s.trial_ends_at,
           COALESCE(s.monthly_fee_cents,0), COALESCE(s.discount_cents,0), COALESCE(s.notes,''),
           u.is_admin, u.last_login_at
    FROM app_users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at;
END $$;
