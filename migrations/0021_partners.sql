-- Lojistas parceiras: cadastro proprio, separado das clientes (app_users), mesmo padrao de
-- seguranca (funcoes SECURITY DEFINER, sem acesso direto do papel closet_app as tabelas).
CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL,
  email text NOT NULL,
  password_hash text,
  instagram text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  package text NOT NULL DEFAULT 'BASICA' CHECK (package IN ('BASICA','PLUS','PREMIUM')),
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX partners_email_unique ON partners (lower(email));
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners FORCE ROW LEVEL SECURITY;

CREATE TABLE partner_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE partner_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_sessions FORCE ROW LEVEL SECURITY;

CREATE TABLE partner_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  discount_percent integer NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  object_key text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE partner_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_items FORCE ROW LEVEL SECURITY;

CREATE FUNCTION partner_register(p_store_name text, p_email text, p_password_hash text, p_instagram text, p_whatsapp text, p_package text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF p_package NOT IN ('BASICA','PLUS','PREMIUM') THEN RAISE EXCEPTION 'Pacote inválido.'; END IF;
  INSERT INTO partners(store_name,email,password_hash,instagram,whatsapp,package)
    VALUES (trim(p_store_name),lower(trim(p_email)),p_password_hash,trim(p_instagram),trim(p_whatsapp),p_package)
    RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION partner_register(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_register(text,text,text,text,text,text) TO closet_app;

CREATE FUNCTION partner_lookup_login(p_email text)
RETURNS TABLE(id uuid, password_hash text, approved boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT id, password_hash, approved FROM partners WHERE lower(email) = lower(trim(p_email));
$$;
REVOKE ALL ON FUNCTION partner_lookup_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_lookup_login(text) TO closet_app;

CREATE FUNCTION partner_create_session(p_token_hash text, p_partner_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO partner_sessions(token_hash, partner_id, expires_at) VALUES (p_token_hash, p_partner_id, now() + interval '30 days');
$$;
REVOKE ALL ON FUNCTION partner_create_session(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_create_session(text,uuid) TO closet_app;

CREATE FUNCTION partner_resolve_session(p_hash text)
RETURNS TABLE(partner_id uuid, store_name text, package text, approved boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.id, p.store_name, p.package, p.approved FROM partner_sessions s
  JOIN partners p ON p.id = s.partner_id
  WHERE s.token_hash = p_hash AND s.expires_at > now();
$$;
REVOKE ALL ON FUNCTION partner_resolve_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_resolve_session(text) TO closet_app;

CREATE FUNCTION partner_logout(p_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM partner_sessions WHERE token_hash = p_hash;
$$;
REVOKE ALL ON FUNCTION partner_logout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_logout(text) TO closet_app;

CREATE FUNCTION partner_add_item(p_partner_id uuid, p_name text, p_description text, p_price_cents integer, p_discount_percent integer, p_object_key text, p_content_type text, p_limit integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt integer; new_id uuid;
BEGIN
  SELECT count(*) INTO cnt FROM partner_items WHERE partner_id = p_partner_id AND active;
  IF p_limit IS NOT NULL AND cnt >= p_limit THEN
    RAISE EXCEPTION 'Limite de peças publicadas do seu pacote atingido.';
  END IF;
  INSERT INTO partner_items(partner_id,name,description,price_cents,discount_percent,object_key,content_type)
    VALUES (p_partner_id,p_name,p_description,p_price_cents,p_discount_percent,p_object_key,p_content_type) RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION partner_add_item(uuid,text,text,integer,integer,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_add_item(uuid,text,text,integer,integer,text,text,integer) TO closet_app;

CREATE FUNCTION partner_remove_item(p_partner_id uuid, p_item_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM partner_items WHERE id = p_item_id AND partner_id = p_partner_id;
$$;
REVOKE ALL ON FUNCTION partner_remove_item(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_remove_item(uuid,uuid) TO closet_app;

CREATE FUNCTION partner_list_own_items(p_partner_id uuid)
RETURNS TABLE(id uuid, name text, description text, price_cents integer, discount_percent integer, object_key text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT id,name,description,price_cents,discount_percent,object_key,created_at FROM partner_items WHERE partner_id=p_partner_id AND active ORDER BY created_at DESC;
$$;
REVOKE ALL ON FUNCTION partner_list_own_items(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_list_own_items(uuid) TO closet_app;

CREATE FUNCTION partner_own_package(p_partner_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT package FROM partners WHERE id = p_partner_id;
$$;
REVOKE ALL ON FUNCTION partner_own_package(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_own_package(uuid) TO closet_app;

CREATE FUNCTION storefront_list()
RETURNS TABLE(partner_id uuid, store_name text, instagram text, whatsapp text, item_id uuid, item_name text, description text, price_cents integer, discount_percent integer, object_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.id, p.store_name, p.instagram, p.whatsapp, i.id, i.name, i.description, i.price_cents, i.discount_percent, i.object_key
  FROM partners p JOIN partner_items i ON i.partner_id = p.id
  WHERE p.approved AND i.active
  ORDER BY p.store_name, i.created_at DESC;
$$;
REVOKE ALL ON FUNCTION storefront_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_list() TO closet_app;

CREATE FUNCTION storefront_item_photo(p_item_id uuid)
RETURNS TABLE(object_key text, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT i.object_key, i.content_type FROM partner_items i JOIN partners p ON p.id = i.partner_id WHERE i.id = p_item_id AND p.approved AND i.active;
$$;
REVOKE ALL ON FUNCTION storefront_item_photo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_item_photo(uuid) TO closet_app;

CREATE FUNCTION admin_list_partners(p_actor uuid)
RETURNS TABLE(id uuid, store_name text, email text, package text, approved boolean, created_at timestamptz, item_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT p.id,p.store_name,p.email,p.package,p.approved,p.created_at,
    (SELECT count(*)::int FROM partner_items WHERE partner_id=p.id AND active) FROM partners p ORDER BY p.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION admin_list_partners(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_partners(uuid) TO closet_app;

CREATE FUNCTION admin_set_partner(p_actor uuid, p_partner_id uuid, p_package text, p_approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_package NOT IN ('BASICA','PLUS','PREMIUM') THEN RAISE EXCEPTION 'Pacote inválido.'; END IF;
  UPDATE partners SET package=p_package, approved=p_approved WHERE id=p_partner_id;
END $$;
REVOKE ALL ON FUNCTION admin_set_partner(uuid,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_partner(uuid,uuid,text,boolean) TO closet_app;
