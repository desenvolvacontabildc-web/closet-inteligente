-- Bazar: so assinantes PAGAS anunciam (conta em teste gratuito so navega e chama no WhatsApp).
-- Limite de anuncios abertos por plano: Arrumada (mais basico) ate 5; demais planos ate 20.
-- Se a anunciante deixa de ser assinante (atraso, cancelamento, fim do periodo), os anuncios dela saem
-- das listas ate ela regularizar; ela continua vendo os proprios em "Meus anuncios".

-- Dona com assinatura em dia (ou administradora)?
CREATE FUNCTION bazar_owner_ok(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE((SELECT a.is_admin FROM app_users a WHERE a.id = p_user), false) OR effective_status(p_user) = 'ACTIVE';
$$;
REVOKE ALL ON FUNCTION bazar_owner_ok(uuid) FROM PUBLIC;

-- Pode anunciar? Devolve (ok, msg, used, max_posts, plan).
CREATE FUNCTION bazar_can_post(p_user uuid)
RETURNS TABLE(ok boolean, msg text, used integer, max_posts integer, plan text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_admin boolean; v_status text; v_plan text; v_used integer; v_max integer;
BEGIN
  SELECT a.is_admin INTO v_admin FROM app_users a WHERE a.id = p_user;
  SELECT s.plan INTO v_plan FROM subscriptions s WHERE s.user_id = p_user;
  SELECT count(*)::int INTO v_used FROM bazar_posts b WHERE b.user_id = p_user AND b.status <> 'CLOSED';
  v_max := CASE WHEN COALESCE(v_admin,false) THEN 50 WHEN v_plan = 'ARRUMADA' THEN 5 ELSE 20 END;
  IF NOT COALESCE(v_admin,false) THEN
    v_status := effective_status(p_user);
    IF v_status = 'TRIAL' THEN
      RETURN QUERY SELECT false, 'Anunciar no Bazar é um benefício das assinantes. Escolha um plano em Perfil → Assinar um plano para liberar.'::text, v_used, v_max, v_plan; RETURN;
    ELSIF v_status <> 'ACTIVE' THEN
      RETURN QUERY SELECT false, 'Regularize a sua assinatura para anunciar no Bazar.'::text, v_used, v_max, v_plan; RETURN;
    END IF;
  END IF;
  IF v_used >= v_max THEN
    RETURN QUERY SELECT false, ('Você já tem ' || v_used || ' anúncio' || CASE WHEN v_used = 1 THEN '' ELSE 's' END || ' aberto' || CASE WHEN v_used = 1 THEN '' ELSE 's' END
      || ' (limite do seu plano: ' || v_max || '). Encerre ou exclua algum' || CASE WHEN v_plan = 'ARRUMADA' THEN ', ou mude para um plano maior para anunciar mais.' ELSE ' para criar outro.' END)::text, v_used, v_max, v_plan; RETURN;
  END IF;
  RETURN QUERY SELECT true, ''::text, v_used, v_max, v_plan;
END $$;
REVOKE ALL ON FUNCTION bazar_can_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_can_post(uuid) TO closet_app;

CREATE OR REPLACE FUNCTION bazar_create(p_user uuid, p_kind text, p_title text, p_description text, p_category text, p_size text,
                             p_price_cents integer, p_price_unit text, p_city text, p_whatsapp text)
RETURNS TABLE(post_id uuid, msg text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_digits text; v_id uuid; v_unit text; cp record;
BEGIN
  SELECT * INTO cp FROM bazar_can_post(p_user);
  IF NOT cp.ok THEN RETURN QUERY SELECT NULL::uuid, cp.msg; RETURN; END IF;
  IF p_kind NOT IN ('ALUGUEL','BAZAR') THEN RETURN QUERY SELECT NULL::uuid, 'Escolha se é aluguel ou bazar.'; RETURN; END IF;
  IF length(trim(coalesce(p_title,''))) < 3 THEN RETURN QUERY SELECT NULL::uuid, 'Dê um nome para a peça (ex.: Vestido longo verde).'; RETURN; END IF;
  IF p_price_cents IS NULL OR p_price_cents <= 0 THEN RETURN QUERY SELECT NULL::uuid, 'Informe o valor.'; RETURN; END IF;
  IF p_price_cents > 5000000 THEN RETURN QUERY SELECT NULL::uuid, 'Valor alto demais. Confira o preço.'; RETURN; END IF;
  v_digits := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
  IF length(v_digits) IN (10,11) THEN v_digits := '55' || v_digits; END IF;
  IF length(v_digits) NOT IN (12,13) OR left(v_digits,2) <> '55' THEN
    RETURN QUERY SELECT NULL::uuid, 'Informe o seu WhatsApp com DDD (ex.: 81 98888-7777).'; RETURN;
  END IF;
  v_unit := CASE WHEN p_kind = 'BAZAR' THEN 'PECA' WHEN p_price_unit IN ('DIA','EVENTO') THEN p_price_unit ELSE 'EVENTO' END;
  INSERT INTO bazar_posts(user_id, kind, title, description, category, size, price_cents, price_unit, city, whatsapp)
    VALUES (p_user, p_kind, left(trim(p_title),80), left(trim(coalesce(p_description,'')),600), left(trim(coalesce(p_category,'')),40),
            left(trim(coalesce(p_size,'')),20), p_price_cents, v_unit, left(trim(coalesce(p_city,'')),60), v_digits)
    RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, ''::text;
END $$;

-- Listas e contato: so anuncios de assinantes em dia.
CREATE OR REPLACE FUNCTION bazar_list(p_user uuid, p_kind text, p_q text, p_category text)
RETURNS TABLE(id uuid, kind text, title text, description text, category text, size text, price_cents integer, price_unit text,
              city text, owner_name text, mine boolean, photo_id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT b.id, b.kind, b.title, b.description, b.category, b.size, b.price_cents, b.price_unit, b.city,
         split_part(coalesce(nullif(trim(p.display_name),''), 'Usuária'), ' ', 1) AS owner_name,
         (b.user_id = p_user) AS mine,
         (SELECT ph.id FROM bazar_photos ph WHERE ph.post_id = b.id ORDER BY ph.created_at LIMIT 1) AS photo_id,
         b.created_at
  FROM bazar_posts b LEFT JOIN profiles p ON p.user_id = b.user_id
  WHERE b.status = 'ACTIVE' AND NOT b.hidden AND bazar_owner_ok(b.user_id)
    AND (coalesce(p_kind,'') = '' OR b.kind = p_kind)
    AND (coalesce(p_category,'') = '' OR b.category = p_category)
    AND (coalesce(trim(p_q),'') = '' OR b.title ILIKE '%' || trim(p_q) || '%' OR b.description ILIKE '%' || trim(p_q) || '%' OR b.city ILIKE '%' || trim(p_q) || '%')
  ORDER BY b.created_at DESC LIMIT 120;
$$;

CREATE OR REPLACE FUNCTION bazar_categories() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT DISTINCT b.category FROM bazar_posts b WHERE b.status = 'ACTIVE' AND NOT b.hidden AND b.category <> '' AND bazar_owner_ok(b.user_id) ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION bazar_get(p_user uuid, p_id uuid)
RETURNS TABLE(id uuid, kind text, title text, description text, category text, size text, price_cents integer, price_unit text,
              city text, owner_name text, mine boolean, status text, hidden boolean, photo_ids uuid[], created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT b.id, b.kind, b.title, b.description, b.category, b.size, b.price_cents, b.price_unit, b.city,
         split_part(coalesce(nullif(trim(p.display_name),''), 'Usuária'), ' ', 1),
         (b.user_id = p_user), b.status, b.hidden,
         coalesce((SELECT array_agg(ph.id ORDER BY ph.created_at) FROM bazar_photos ph WHERE ph.post_id = b.id), '{}'::uuid[]),
         b.created_at
  FROM bazar_posts b LEFT JOIN profiles p ON p.user_id = b.user_id
  WHERE b.id = p_id AND (b.user_id = p_user OR (b.status <> 'PAUSED' AND NOT b.hidden AND bazar_owner_ok(b.user_id)));
$$;

CREATE OR REPLACE FUNCTION bazar_photo(p_user uuid, p_photo uuid)
RETURNS TABLE(object_key text, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT ph.object_key, ph.content_type FROM bazar_photos ph JOIN bazar_posts b ON b.id = ph.post_id
  WHERE ph.id = p_photo AND (b.user_id = p_user OR (b.status <> 'PAUSED' AND NOT b.hidden AND bazar_owner_ok(b.user_id)));
$$;

CREATE OR REPLACE FUNCTION bazar_contact(p_user uuid, p_post uuid)
RETURNS TABLE(whatsapp text, title text, kind text, owner_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r record;
BEGIN
  SELECT b.whatsapp, b.title, b.kind, b.user_id, split_part(coalesce(nullif(trim(p.display_name),''), 'Usuária'), ' ', 1) AS oname
    INTO r FROM bazar_posts b LEFT JOIN profiles p ON p.user_id = b.user_id
    WHERE b.id = p_post AND b.status = 'ACTIVE' AND NOT b.hidden AND bazar_owner_ok(b.user_id);
  IF NOT FOUND OR r.user_id = p_user THEN RETURN; END IF;
  INSERT INTO bazar_clicks(post_id, user_id) VALUES (p_post, p_user);
  RETURN QUERY SELECT r.whatsapp, r.title, r.kind, r.oname;
END $$;
