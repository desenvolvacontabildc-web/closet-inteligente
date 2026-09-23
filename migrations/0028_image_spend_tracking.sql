-- Rastreamento de geracao de imagem (a parte cara da IA): guarda quem gerou e quando,
-- pra (a) dar visibilidade de gasto estimado no admin e (b) aplicar limite mensal por plano,
-- sem depender de nenhum custo exato exposto pela OpenAI (fixamos uma estimativa por imagem).
CREATE TABLE image_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE image_generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_generation_log FORCE ROW LEVEL SECURITY;

CREATE FUNCTION log_image_generation(p_user uuid, p_tenant uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO image_generation_log(user_id, tenant_id) VALUES (p_user, p_tenant);
$$;
REVOKE ALL ON FUNCTION log_image_generation(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_image_generation(uuid,uuid) TO closet_app;

CREATE FUNCTION count_my_images_this_month(p_user uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*) FROM image_generation_log
  WHERE user_id = p_user AND created_at >= date_trunc('month', now());
$$;
REVOKE ALL ON FUNCTION count_my_images_this_month(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_my_images_this_month(uuid) TO closet_app;

CREATE FUNCTION admin_image_spend(p_actor uuid)
RETURNS TABLE(month_count bigint, estimated_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY
    SELECT count(*), count(*) * 30
    FROM image_generation_log
    WHERE created_at >= date_trunc('month', now());
END $$;
REVOKE ALL ON FUNCTION admin_image_spend(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_image_spend(uuid) TO closet_app;
