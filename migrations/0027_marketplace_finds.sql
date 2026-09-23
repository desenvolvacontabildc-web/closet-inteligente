-- "Achadinhos": links de produtos (Shopee, Shein, etc.) que a administradora cura e posta.
-- Mesmo padrao de trend_posts -- conteudo transmitido pela loja pra todo mundo, sem RLS
-- self-scoped, acesso so via funcoes SECURITY DEFINER.
CREATE TABLE marketplace_finds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer,
  external_url text NOT NULL,
  object_key text,
  content_type text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE marketplace_finds ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_finds FORCE ROW LEVEL SECURITY;

CREATE FUNCTION admin_create_find(p_actor uuid, p_title text, p_description text, p_price_cents integer, p_external_url text, p_object_key text, p_content_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF trim(p_title) = '' THEN
    RAISE EXCEPTION 'Informe um título.';
  END IF;
  IF p_external_url NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Informe um link válido (começando com http:// ou https://).';
  END IF;
  INSERT INTO marketplace_finds(title, description, price_cents, external_url, object_key, content_type, created_by)
    VALUES (trim(p_title), trim(p_description), p_price_cents, trim(p_external_url), nullif(p_object_key,''), nullif(p_content_type,''), p_actor)
    RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION admin_create_find(uuid,text,text,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_create_find(uuid,text,text,integer,text,text,text) TO closet_app;

CREATE FUNCTION admin_list_finds(p_actor uuid)
RETURNS TABLE(id uuid, title text, description text, price_cents integer, external_url text, object_key text, active boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY SELECT f.id, f.title, f.description, f.price_cents, f.external_url, f.object_key, f.active, f.created_at
    FROM marketplace_finds f ORDER BY f.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION admin_list_finds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_finds(uuid) TO closet_app;

CREATE FUNCTION admin_set_find_active(p_actor uuid, p_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  UPDATE marketplace_finds SET active = p_active WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION admin_set_find_active(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_find_active(uuid,uuid,boolean) TO closet_app;

CREATE FUNCTION list_active_finds()
RETURNS TABLE(id uuid, title text, description text, price_cents integer, external_url text, object_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT f.id, f.title, f.description, f.price_cents, f.external_url, f.object_key
  FROM marketplace_finds f WHERE f.active ORDER BY f.created_at DESC;
$$;
REVOKE ALL ON FUNCTION list_active_finds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_active_finds() TO closet_app;

CREATE FUNCTION find_photo(p_id uuid)
RETURNS TABLE(object_key text, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT f.object_key, f.content_type FROM marketplace_finds f WHERE f.id = p_id AND f.active;
$$;
REVOKE ALL ON FUNCTION find_photo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_photo(uuid) TO closet_app;
