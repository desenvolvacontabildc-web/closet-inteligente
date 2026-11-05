-- Foto de catalogo automatica: cada peca com foto ganha a versao padronizada ao ser cadastrada.
-- Para nao estourar o custo, cada plano tem um limite mensal de padronizacoes (NULL = sem limite),
-- separado do limite de ilustracoes de look. Editavel pela administradora em Gestao > Precos.
ALTER TABLE plan_config ADD COLUMN standard_photo_monthly_limit integer CHECK (standard_photo_monthly_limit IS NULL OR standard_photo_monthly_limit >= 0);
UPDATE plan_config SET standard_photo_monthly_limit = CASE plan WHEN 'ARRUMADA' THEN 30 WHEN 'FASHION' THEN 60 ELSE 150 END;

CREATE FUNCTION get_standard_limit(p_plan text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT pc.standard_photo_monthly_limit FROM plan_config pc WHERE pc.plan = p_plan;
$$;
REVOKE ALL ON FUNCTION get_standard_limit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_standard_limit(text) TO closet_app;

CREATE FUNCTION admin_list_standard_limits(p_actor uuid)
RETURNS TABLE(plan text, standard_photo_monthly_limit integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT pc.plan, pc.standard_photo_monthly_limit FROM plan_config pc ORDER BY pc.base_price_cents;
END $$;
REVOKE ALL ON FUNCTION admin_list_standard_limits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_standard_limits(uuid) TO closet_app;

CREATE FUNCTION admin_set_standard_limit(p_actor uuid, p_plan text, p_limit integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_plan NOT IN ('ARRUMADA','FASHION','SUPER_STAR') THEN RAISE EXCEPTION 'Plano inválido.'; END IF;
  IF p_limit IS NOT NULL AND p_limit < 0 THEN RAISE EXCEPTION 'Limite não pode ser negativo.'; END IF;
  UPDATE plan_config SET standard_photo_monthly_limit = p_limit, updated_at = now() WHERE plan = p_plan;
  INSERT INTO audit_log(actor_user_id, action, details) VALUES (p_actor, 'SET_STANDARD_LIMIT', jsonb_build_object('plan', p_plan, 'limit', p_limit));
END $$;
REVOKE ALL ON FUNCTION admin_set_standard_limit(uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_standard_limit(uuid,text,integer) TO closet_app;
