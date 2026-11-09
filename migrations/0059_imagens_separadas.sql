-- Corrige a contagem: foto de catalogo e look em imagem tinham UMA conta so (todas as geracoes iam para
-- image_generation_log), entao as fotos de catalogo gastavam o limite de looks em imagem. Agora cada geracao tem um
-- tipo (LOOK ou CATALOG) e cada limite conta o seu.
ALTER TABLE image_generation_log ADD COLUMN kind text NOT NULL DEFAULT 'LOOK' CHECK (kind IN ('LOOK','CATALOG'));

DROP FUNCTION log_image_generation(uuid, uuid);
CREATE FUNCTION log_image_generation(p_user uuid, p_tenant uuid, p_kind text DEFAULT 'LOOK')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO image_generation_log(user_id, tenant_id, kind) VALUES (p_user, p_tenant, CASE WHEN p_kind = 'CATALOG' THEN 'CATALOG' ELSE 'LOOK' END);
$$;
REVOKE ALL ON FUNCTION log_image_generation(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_image_generation(uuid, uuid, text) TO closet_app;

-- Looks em imagem do mes (so o tipo LOOK).
CREATE OR REPLACE FUNCTION count_my_images_this_month(p_user uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*) FROM image_generation_log
  WHERE user_id = p_user AND kind = 'LOOK' AND created_at >= date_trunc('month', now());
$$;

-- Fotos de catalogo do mes (refazer a foto de uma mesma peca tambem conta, pois tambem custa uma geracao).
CREATE FUNCTION count_my_catalog_this_month(p_user uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*) FROM image_generation_log
  WHERE user_id = p_user AND kind = 'CATALOG' AND created_at >= date_trunc('month', now());
$$;
REVOKE ALL ON FUNCTION count_my_catalog_this_month(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_my_catalog_this_month(uuid) TO closet_app;

-- Limites v3.1: com a reducao das fotos de referencia (custo de entrada de imagem cai quase pela metade) e as contas
-- separadas, mais imagens por plano no mesmo custo. Custo de IA no pior caso (usar todo o limite todo mes), com imagem a
-- R$ 0,14 e pedido de IA a R$ 0,015: Arrumada R$ 6,45 (32%), Fashion R$ 11,78 (30%), Super Star R$ 24,96 (31%).
--   Plano        Pedidos de IA  Looks em imagem  Fotos de catalogo
--   Arrumada     150            20               10
--   Fashion      300            40               12
--   Super Star   600            90               24
UPDATE plan_config SET ai_ops_monthly_limit = 150, image_gen_monthly_limit = 20, standard_photo_monthly_limit = 10, updated_at = now() WHERE plan = 'ARRUMADA';
UPDATE plan_config SET ai_ops_monthly_limit = 300, image_gen_monthly_limit = 40, standard_photo_monthly_limit = 12, updated_at = now() WHERE plan = 'FASHION';
UPDATE plan_config SET ai_ops_monthly_limit = 600, image_gen_monthly_limit = 90, standard_photo_monthly_limit = 24, updated_at = now() WHERE plan = 'SUPER_STAR';
