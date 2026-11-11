-- Arquivar contas canceladas: a conta sai das listas do painel (nao atrapalha mais a visualizacao), mas o historico de
-- pagamentos e dados continua guardado e pode ser restaurado. So contas CANCELADAS e que nao sejam de administradora.
ALTER TABLE app_users ADD COLUMN archived_at timestamptz;

CREATE FUNCTION admin_list_archived(p_actor uuid) RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT u.id FROM app_users u WHERE u.archived_at IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION admin_list_archived(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_archived(uuid) TO closet_app;

CREATE FUNCTION admin_archive_account(p_actor uuid, p_target uuid, p_archive boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_admin boolean; v_status text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  SELECT is_admin INTO v_admin FROM app_users WHERE id = p_target;
  IF NOT FOUND THEN RETURN 'Usuária não encontrada.'; END IF;
  IF v_admin THEN RETURN 'Contas de administradora não podem ser arquivadas.'; END IF;
  IF p_archive THEN
    SELECT s.status INTO v_status FROM subscriptions s WHERE s.user_id = p_target;
    IF v_status IS DISTINCT FROM 'CANCELED' THEN RETURN 'Só é possível arquivar contas canceladas.'; END IF;
    UPDATE app_users SET archived_at = now() WHERE id = p_target;
  ELSE
    UPDATE app_users SET archived_at = NULL WHERE id = p_target;
  END IF;
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
    VALUES (p_actor, CASE WHEN p_archive THEN 'ADMIN_ARCHIVE_ACCOUNT' ELSE 'ADMIN_RESTORE_ACCOUNT' END, p_target, '{}'::jsonb);
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION admin_archive_account(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_archive_account(uuid, uuid, boolean) TO closet_app;
