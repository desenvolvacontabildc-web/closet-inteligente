-- Bazar: editar anuncio (dados e fotos) e mostrar os proprios anuncios no card da Home.

-- Dona edita os dados do anuncio. Devolve '' se ok, ou a mensagem de erro.
CREATE FUNCTION bazar_update(p_user uuid, p_post uuid, p_kind text, p_title text, p_description text, p_category text, p_size text,
                             p_price_cents integer, p_price_unit text, p_city text, p_whatsapp text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_digits text; v_unit text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bazar_posts b WHERE b.id = p_post AND b.user_id = p_user) THEN RETURN 'Anúncio não encontrado.'; END IF;
  IF p_kind NOT IN ('ALUGUEL','BAZAR') THEN RETURN 'Escolha se é aluguel ou bazar.'; END IF;
  IF length(trim(coalesce(p_title,''))) < 3 THEN RETURN 'Dê um nome para a peça (ex.: Vestido longo verde).'; END IF;
  IF p_price_cents IS NULL OR p_price_cents <= 0 THEN RETURN 'Informe o valor.'; END IF;
  IF p_price_cents > 5000000 THEN RETURN 'Valor alto demais. Confira o preço.'; END IF;
  v_digits := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
  IF length(v_digits) IN (10,11) THEN v_digits := '55' || v_digits; END IF;
  IF length(v_digits) NOT IN (12,13) OR left(v_digits,2) <> '55' THEN RETURN 'Informe o seu WhatsApp com DDD (ex.: 81 98888-7777).'; END IF;
  v_unit := CASE WHEN p_kind = 'BAZAR' THEN 'PECA' WHEN p_price_unit IN ('DIA','EVENTO') THEN p_price_unit ELSE 'EVENTO' END;
  UPDATE bazar_posts SET kind = p_kind, title = left(trim(p_title),80), description = left(trim(coalesce(p_description,'')),600),
         category = left(trim(coalesce(p_category,'')),40), size = left(trim(coalesce(p_size,'')),20), price_cents = p_price_cents,
         price_unit = v_unit, city = left(trim(coalesce(p_city,'')),60), whatsapp = v_digits, updated_at = now()
   WHERE id = p_post AND user_id = p_user;
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION bazar_update(uuid,uuid,text,text,text,text,text,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_update(uuid,uuid,text,text,text,text,text,integer,text,text,text) TO closet_app;

-- Dona remove uma foto do proprio anuncio; devolve a chave do arquivo para o servidor apagar do armazenamento.
CREATE FUNCTION bazar_remove_photo(p_user uuid, p_photo uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_key text;
BEGIN
  DELETE FROM bazar_photos ph USING bazar_posts b
   WHERE ph.id = p_photo AND b.id = ph.post_id AND b.user_id = p_user
   RETURNING ph.object_key INTO v_key;
  RETURN v_key;
END $$;
REVOKE ALL ON FUNCTION bazar_remove_photo(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_remove_photo(uuid,uuid) TO closet_app;

-- Home: alem das novidades de outras usuarias, resume os anuncios da propria usuaria.
CREATE OR REPLACE FUNCTION bazar_home(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH vis AS (
    SELECT b.id, b.kind, b.title, b.price_cents, b.price_unit, b.created_at,
           (SELECT ph.id FROM bazar_photos ph WHERE ph.post_id = b.id ORDER BY ph.created_at LIMIT 1) AS photo_id
    FROM bazar_posts b
    WHERE b.status = 'ACTIVE' AND NOT b.hidden AND b.user_id <> p_user AND bazar_owner_ok(b.user_id)
  ), mine AS (
    SELECT b.id, b.kind, b.title, b.price_cents, b.price_unit, b.created_at,
           (SELECT ph.id FROM bazar_photos ph WHERE ph.post_id = b.id ORDER BY ph.created_at LIMIT 1) AS photo_id,
           (SELECT count(*) FROM bazar_clicks k WHERE k.post_id = b.id) AS contacts
    FROM bazar_posts b WHERE b.user_id = p_user AND b.status = 'ACTIVE' AND NOT b.hidden
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM vis),
    'alugueis', (SELECT count(*) FROM vis WHERE kind = 'ALUGUEL'),
    'bazar', (SELECT count(*) FROM vis WHERE kind = 'BAZAR'),
    'novas', (SELECT count(*) FROM vis WHERE created_at > now() - interval '7 days'),
    'latest', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, kind, title, price_cents, price_unit, photo_id FROM vis WHERE photo_id IS NOT NULL ORDER BY created_at DESC LIMIT 4) x), '[]'::jsonb),
    'meus', (SELECT count(*) FROM mine),
    'meus_contatos', (SELECT coalesce(sum(contacts),0) FROM mine),
    'meus_latest', coalesce((SELECT jsonb_agg(to_jsonb(y)) FROM (SELECT id, kind, title, price_cents, price_unit, photo_id FROM mine WHERE photo_id IS NOT NULL ORDER BY created_at DESC LIMIT 4) y), '[]'::jsonb)
  );
$$;

-- WhatsApp gravado num anuncio da propria usuaria (para preencher o formulario de edicao).
CREATE FUNCTION bazar_post_whatsapp(p_user uuid, p_post uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT b.whatsapp FROM bazar_posts b WHERE b.id = p_post AND b.user_id = p_user;
$$;
REVOKE ALL ON FUNCTION bazar_post_whatsapp(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_post_whatsapp(uuid,uuid) TO closet_app;
