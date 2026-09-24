-- Permite editar um achadinho ja publicado (titulo, descricao, preco, link e foto),
-- em vez de só criar e ocultar/reativar.
CREATE FUNCTION admin_update_find(p_actor uuid, p_id uuid, p_title text, p_description text, p_price_cents integer, p_external_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
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
  UPDATE marketplace_finds
    SET title = trim(p_title), description = trim(p_description), price_cents = p_price_cents, external_url = trim(p_external_url)
    WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION admin_update_find(uuid,uuid,text,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_find(uuid,uuid,text,text,integer,text) TO closet_app;

CREATE FUNCTION admin_set_find_photo(p_actor uuid, p_id uuid, p_object_key text, p_content_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  UPDATE marketplace_finds SET object_key = nullif(p_object_key,''), content_type = nullif(p_content_type,'') WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION admin_set_find_photo(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_find_photo(uuid,uuid,text,text) TO closet_app;
