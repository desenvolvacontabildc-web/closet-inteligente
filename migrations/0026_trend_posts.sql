-- Radar de Tendencias, versao simples: a administradora posta a dica (texto + foto opcional),
-- todas as clientes veem. Nao e por tenant (e conteudo transmitido pela loja pra todo mundo),
-- por isso fica fora do padrao de RLS self-scoped -- acesso so via funcoes SECURITY DEFINER.
CREATE TABLE trend_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  object_key text,
  content_type text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE trend_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_posts FORCE ROW LEVEL SECURITY;

CREATE FUNCTION admin_create_trend(p_actor uuid, p_title text, p_body text, p_object_key text, p_content_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF trim(p_title) = '' THEN
    RAISE EXCEPTION 'Informe um título.';
  END IF;
  INSERT INTO trend_posts(title, body, object_key, content_type, created_by)
    VALUES (trim(p_title), trim(p_body), nullif(p_object_key,''), nullif(p_content_type,''), p_actor)
    RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION admin_create_trend(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_create_trend(uuid,text,text,text,text) TO closet_app;

CREATE FUNCTION admin_list_trends(p_actor uuid)
RETURNS TABLE(id uuid, title text, body text, object_key text, active boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY SELECT t.id, t.title, t.body, t.object_key, t.active, t.created_at
    FROM trend_posts t ORDER BY t.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION admin_list_trends(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_trends(uuid) TO closet_app;

CREATE FUNCTION admin_set_trend_active(p_actor uuid, p_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  UPDATE trend_posts SET active = p_active WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION admin_set_trend_active(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_trend_active(uuid,uuid,boolean) TO closet_app;

CREATE FUNCTION list_active_trends(p_limit integer)
RETURNS TABLE(id uuid, title text, body text, object_key text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT t.id, t.title, t.body, t.object_key, t.created_at
  FROM trend_posts t WHERE t.active ORDER BY t.created_at DESC LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION list_active_trends(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_active_trends(integer) TO closet_app;

CREATE FUNCTION trend_photo(p_id uuid)
RETURNS TABLE(object_key text, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT t.object_key, t.content_type FROM trend_posts t WHERE t.id = p_id AND t.active;
$$;
REVOKE ALL ON FUNCTION trend_photo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trend_photo(uuid) TO closet_app;
