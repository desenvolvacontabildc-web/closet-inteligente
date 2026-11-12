-- Bazar & Aluguel: as usuarias anunciam pecas para ALUGAR ou vender no BAZAR, com fotos e preco.
-- Quem se interessa toca em "Chamar no WhatsApp" e a conversa abre direto com a anunciante (o numero so e
-- usado para montar o link wa.me no servidor, nunca aparece nas listas). Mesmo padrao dos achadinhos:
-- conteudo compartilhado entre usuarias, sem policies; todo acesso passa por funcoes SECURITY DEFINER.
CREATE TABLE bazar_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ALUGUEL','BAZAR')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents > 0),
  price_unit text NOT NULL DEFAULT 'PECA' CHECK (price_unit IN ('PECA','DIA','EVENTO')),
  city text NOT NULL DEFAULT '',
  whatsapp text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','CLOSED')),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bazar_posts_list_idx ON bazar_posts(created_at DESC) WHERE status = 'ACTIVE' AND NOT hidden;
CREATE INDEX bazar_posts_user_idx ON bazar_posts(user_id);
ALTER TABLE bazar_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bazar_posts FORCE ROW LEVEL SECURITY;

CREATE TABLE bazar_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES bazar_posts(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  content_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bazar_photos_post_idx ON bazar_photos(post_id, created_at);
ALTER TABLE bazar_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE bazar_photos FORCE ROW LEVEL SECURITY;

CREATE TABLE bazar_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES bazar_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bazar_clicks_post_idx ON bazar_clicks(post_id);
ALTER TABLE bazar_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bazar_clicks FORCE ROW LEVEL SECURITY;

CREATE TABLE bazar_reports (
  post_id uuid NOT NULL REFERENCES bazar_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE bazar_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bazar_reports FORCE ROW LEVEL SECURITY;

-- Cria o anuncio. Devolve (post_id, msg): msg vazio = ok.
CREATE FUNCTION bazar_create(p_user uuid, p_kind text, p_title text, p_description text, p_category text, p_size text,
                             p_price_cents integer, p_price_unit text, p_city text, p_whatsapp text)
RETURNS TABLE(post_id uuid, msg text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_digits text; v_id uuid; v_unit text;
BEGIN
  IF p_kind NOT IN ('ALUGUEL','BAZAR') THEN RETURN QUERY SELECT NULL::uuid, 'Escolha se é aluguel ou bazar.'; RETURN; END IF;
  IF length(trim(coalesce(p_title,''))) < 3 THEN RETURN QUERY SELECT NULL::uuid, 'Dê um nome para a peça (ex.: Vestido longo verde).'; RETURN; END IF;
  IF p_price_cents IS NULL OR p_price_cents <= 0 THEN RETURN QUERY SELECT NULL::uuid, 'Informe o valor.'; RETURN; END IF;
  IF p_price_cents > 5000000 THEN RETURN QUERY SELECT NULL::uuid, 'Valor alto demais. Confira o preço.'; RETURN; END IF;
  v_digits := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
  IF length(v_digits) IN (10,11) THEN v_digits := '55' || v_digits; END IF;
  IF length(v_digits) NOT IN (12,13) OR left(v_digits,2) <> '55' THEN
    RETURN QUERY SELECT NULL::uuid, 'Informe o seu WhatsApp com DDD (ex.: 81 98888-7777).'; RETURN;
  END IF;
  IF (SELECT count(*) FROM bazar_posts WHERE user_id = p_user AND status <> 'CLOSED') >= 20 THEN
    RETURN QUERY SELECT NULL::uuid, 'Você já tem 20 anúncios abertos. Encerre ou exclua algum para criar outro.'; RETURN;
  END IF;
  v_unit := CASE WHEN p_kind = 'BAZAR' THEN 'PECA' WHEN p_price_unit IN ('DIA','EVENTO') THEN p_price_unit ELSE 'EVENTO' END;
  INSERT INTO bazar_posts(user_id, kind, title, description, category, size, price_cents, price_unit, city, whatsapp)
    VALUES (p_user, p_kind, left(trim(p_title),80), left(trim(coalesce(p_description,'')),600), left(trim(coalesce(p_category,'')),40),
            left(trim(coalesce(p_size,'')),20), p_price_cents, v_unit, left(trim(coalesce(p_city,'')),60), v_digits)
    RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, ''::text;
END $$;
REVOKE ALL ON FUNCTION bazar_create(uuid,text,text,text,text,text,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_create(uuid,text,text,text,text,text,integer,text,text,text) TO closet_app;

CREATE FUNCTION bazar_add_photo(p_user uuid, p_post uuid, p_key text, p_ctype text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bazar_posts WHERE id = p_post AND user_id = p_user) THEN RETURN 'Anúncio não encontrado.'; END IF;
  IF (SELECT count(*) FROM bazar_photos WHERE post_id = p_post) >= 4 THEN RETURN 'Cada anúncio pode ter até 4 fotos.'; END IF;
  INSERT INTO bazar_photos(post_id, object_key, content_type) VALUES (p_post, p_key, p_ctype);
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION bazar_add_photo(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_add_photo(uuid,uuid,text,text) TO closet_app;

-- Lista publica (so anuncios ativos e nao ocultos). O WhatsApp NAO sai daqui.
CREATE FUNCTION bazar_list(p_user uuid, p_kind text, p_q text, p_category text)
RETURNS TABLE(id uuid, kind text, title text, description text, category text, size text, price_cents integer, price_unit text,
              city text, owner_name text, mine boolean, photo_id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT b.id, b.kind, b.title, b.description, b.category, b.size, b.price_cents, b.price_unit, b.city,
         split_part(coalesce(nullif(trim(p.display_name),''), 'Usuária'), ' ', 1) AS owner_name,
         (b.user_id = p_user) AS mine,
         (SELECT ph.id FROM bazar_photos ph WHERE ph.post_id = b.id ORDER BY ph.created_at LIMIT 1) AS photo_id,
         b.created_at
  FROM bazar_posts b LEFT JOIN profiles p ON p.user_id = b.user_id
  WHERE b.status = 'ACTIVE' AND NOT b.hidden
    AND (coalesce(p_kind,'') = '' OR b.kind = p_kind)
    AND (coalesce(p_category,'') = '' OR b.category = p_category)
    AND (coalesce(trim(p_q),'') = '' OR b.title ILIKE '%' || trim(p_q) || '%' OR b.description ILIKE '%' || trim(p_q) || '%' OR b.city ILIKE '%' || trim(p_q) || '%')
  ORDER BY b.created_at DESC LIMIT 120;
$$;
REVOKE ALL ON FUNCTION bazar_list(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_list(uuid,text,text,text) TO closet_app;

CREATE FUNCTION bazar_categories() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT DISTINCT category FROM bazar_posts WHERE status = 'ACTIVE' AND NOT hidden AND category <> '' ORDER BY 1;
$$;
REVOKE ALL ON FUNCTION bazar_categories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_categories() TO closet_app;

-- Um anuncio (detalhe) com as fotos. A dona enxerga o proprio mesmo pausado/encerrado/oculto.
CREATE FUNCTION bazar_get(p_user uuid, p_id uuid)
RETURNS TABLE(id uuid, kind text, title text, description text, category text, size text, price_cents integer, price_unit text,
              city text, owner_name text, mine boolean, status text, hidden boolean, photo_ids uuid[], created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT b.id, b.kind, b.title, b.description, b.category, b.size, b.price_cents, b.price_unit, b.city,
         split_part(coalesce(nullif(trim(p.display_name),''), 'Usuária'), ' ', 1),
         (b.user_id = p_user), b.status, b.hidden,
         coalesce((SELECT array_agg(ph.id ORDER BY ph.created_at) FROM bazar_photos ph WHERE ph.post_id = b.id), '{}'::uuid[]),
         b.created_at
  FROM bazar_posts b LEFT JOIN profiles p ON p.user_id = b.user_id
  WHERE b.id = p_id AND (b.user_id = p_user OR (b.status <> 'PAUSED' AND NOT b.hidden));
$$;
REVOKE ALL ON FUNCTION bazar_get(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_get(uuid,uuid) TO closet_app;

CREATE FUNCTION bazar_my_posts(p_user uuid)
RETURNS TABLE(id uuid, kind text, title text, size text, price_cents integer, price_unit text, status text, hidden boolean,
              photo_id uuid, contacts integer, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT b.id, b.kind, b.title, b.size, b.price_cents, b.price_unit, b.status, b.hidden,
         (SELECT ph.id FROM bazar_photos ph WHERE ph.post_id = b.id ORDER BY ph.created_at LIMIT 1),
         (SELECT count(*)::int FROM bazar_clicks k WHERE k.post_id = b.id),
         b.created_at
  FROM bazar_posts b WHERE b.user_id = p_user ORDER BY b.created_at DESC;
$$;
REVOKE ALL ON FUNCTION bazar_my_posts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_my_posts(uuid) TO closet_app;

CREATE FUNCTION bazar_photo(p_user uuid, p_photo uuid)
RETURNS TABLE(object_key text, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT ph.object_key, ph.content_type FROM bazar_photos ph JOIN bazar_posts b ON b.id = ph.post_id
  WHERE ph.id = p_photo AND (b.user_id = p_user OR (b.status <> 'PAUSED' AND NOT b.hidden));
$$;
REVOKE ALL ON FUNCTION bazar_photo(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_photo(uuid,uuid) TO closet_app;

-- Dona: pausar / reativar / encerrar (alugada ou vendida).
CREATE FUNCTION bazar_set_status(p_user uuid, p_post uuid, p_status text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_status NOT IN ('ACTIVE','PAUSED','CLOSED') THEN RETURN 'Situação inválida.'; END IF;
  UPDATE bazar_posts SET status = p_status, updated_at = now() WHERE id = p_post AND user_id = p_user;
  IF NOT FOUND THEN RETURN 'Anúncio não encontrado.'; END IF;
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION bazar_set_status(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_set_status(uuid,uuid,text) TO closet_app;

-- Dona: excluir. Devolve as chaves dos arquivos para o servidor apagar do armazenamento.
CREATE FUNCTION bazar_delete(p_user uuid, p_post uuid) RETURNS SETOF text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bazar_posts WHERE id = p_post AND user_id = p_user) THEN RETURN; END IF;
  RETURN QUERY SELECT ph.object_key FROM bazar_photos ph WHERE ph.post_id = p_post;
  DELETE FROM bazar_posts WHERE id = p_post AND user_id = p_user;
END $$;
REVOKE ALL ON FUNCTION bazar_delete(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_delete(uuid,uuid) TO closet_app;

-- Quem quer a peca: registra o clique e devolve o contato (usado so no servidor para montar o wa.me).
CREATE FUNCTION bazar_contact(p_user uuid, p_post uuid)
RETURNS TABLE(whatsapp text, title text, kind text, owner_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r record;
BEGIN
  SELECT b.whatsapp, b.title, b.kind, b.user_id, split_part(coalesce(nullif(trim(p.display_name),''), 'Usuária'), ' ', 1) AS oname
    INTO r FROM bazar_posts b LEFT JOIN profiles p ON p.user_id = b.user_id
    WHERE b.id = p_post AND b.status = 'ACTIVE' AND NOT b.hidden;
  IF NOT FOUND OR r.user_id = p_user THEN RETURN; END IF;
  INSERT INTO bazar_clicks(post_id, user_id) VALUES (p_post, p_user);
  RETURN QUERY SELECT r.whatsapp, r.title, r.kind, r.oname;
END $$;
REVOKE ALL ON FUNCTION bazar_contact(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_contact(uuid,uuid) TO closet_app;

-- Denuncia: 1 por usuaria. Com 3 denuncias diferentes o anuncio fica oculto ate a administradora revisar.
CREATE FUNCTION bazar_report(p_user uuid, p_post uuid, p_reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_title text; v_owner uuid; v_n integer;
BEGIN
  SELECT title, user_id INTO v_title, v_owner FROM bazar_posts WHERE id = p_post;
  IF NOT FOUND THEN RETURN 'Anúncio não encontrado.'; END IF;
  IF v_owner = p_user THEN RETURN 'Esse anúncio é seu.'; END IF;
  INSERT INTO bazar_reports(post_id, user_id, reason) VALUES (p_post, p_user, left(coalesce(p_reason,''),300)) ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_n FROM bazar_reports WHERE post_id = p_post;
  IF v_n >= 3 THEN UPDATE bazar_posts SET hidden = true WHERE id = p_post; END IF;
  PERFORM notify_admin('BAZAR', v_owner, 'Anúncio denunciado no Bazar', '"' || v_title || '" (' || v_n || ' denúncia' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ')' || CASE WHEN v_n >= 3 THEN ' - ocultado automaticamente.' ELSE '.' END);
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION bazar_report(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_report(uuid,uuid,text) TO closet_app;

-- Administradora
CREATE FUNCTION admin_bazar_list(p_actor uuid)
RETURNS TABLE(id uuid, kind text, title text, price_cents integer, price_unit text, status text, hidden boolean, owner_id uuid,
              owner_name text, owner_email text, reports integer, contacts integer, photo_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
  SELECT b.id, b.kind, b.title, b.price_cents, b.price_unit, b.status, b.hidden, b.user_id,
         coalesce(nullif(trim(p.display_name),''), u.email), u.email,
         (SELECT count(*)::int FROM bazar_reports r WHERE r.post_id = b.id),
         (SELECT count(*)::int FROM bazar_clicks k WHERE k.post_id = b.id),
         (SELECT ph.id FROM bazar_photos ph WHERE ph.post_id = b.id ORDER BY ph.created_at LIMIT 1),
         b.created_at
  FROM bazar_posts b JOIN app_users u ON u.id = b.user_id LEFT JOIN profiles p ON p.user_id = b.user_id
  ORDER BY (SELECT count(*) FROM bazar_reports r WHERE r.post_id = b.id) DESC, b.created_at DESC LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION admin_bazar_list(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_bazar_list(uuid) TO closet_app;

CREATE FUNCTION admin_bazar_set_hidden(p_actor uuid, p_post uuid, p_hidden boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  UPDATE bazar_posts SET hidden = p_hidden, updated_at = now() WHERE id = p_post;
  IF NOT p_hidden THEN DELETE FROM bazar_reports WHERE post_id = p_post; END IF;
END $$;
REVOKE ALL ON FUNCTION admin_bazar_set_hidden(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_bazar_set_hidden(uuid,uuid,boolean) TO closet_app;

-- Ultimo WhatsApp usado pela usuaria em um anuncio (para pre-preencher o proximo).
CREATE FUNCTION bazar_last_whatsapp(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT whatsapp FROM bazar_posts WHERE user_id = p_user ORDER BY created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION bazar_last_whatsapp(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_last_whatsapp(uuid) TO closet_app;
