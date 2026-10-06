-- Programa de lojas parceiras: mensalidade por pacote (Mercado Pago, como as clientes), vitrine
-- so para lojas aprovadas E em dia, metricas de visualizacao/clique por peca, edicao e pausa de
-- pecas, nota de revisao da aprovacao e avisos ao admin.

-- ---------------------------------------------------------------- estrutura
-- A loja passa a ser um "perfil" de uma conta de usuaria (mesmo login: ela usa o app normalmente
-- E gerencia a loja). Colunas de login proprio da loja (senha/sessao) deixam de ser usadas.
ALTER TABLE partners
  ADD COLUMN user_id uuid UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN review_note text NOT NULL DEFAULT '',
  ADD COLUMN provider text,
  ADD COLUMN payment_method text CHECK (payment_method IN ('PIX','CARD') OR payment_method IS NULL),
  ADD COLUMN preapproval_id text,
  ADD COLUMN current_period_end timestamptz,
  ADD COLUMN overdue_since timestamptz;
UPDATE partners SET approved_at = created_at WHERE approved AND approved_at IS NULL;

-- Preco mensal de cada pacote (editavel pelo admin). Valores iniciais sao sugestao.
CREATE TABLE partner_package_config (
  package text PRIMARY KEY CHECK (package IN ('BASICA','PLUS','PREMIUM')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO partner_package_config(package, price_cents) VALUES ('BASICA', 4990), ('PLUS', 9990), ('PREMIUM', 19990);
ALTER TABLE partner_package_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_package_config FORCE ROW LEVEL SECURITY;

CREATE TABLE partner_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'MERCADOPAGO',
  provider_payment_id text,
  kind text NOT NULL CHECK (kind IN ('PIX','CARD_PREAPPROVAL')),
  status text NOT NULL DEFAULT 'pending',
  package text NOT NULL CHECK (package IN ('BASICA','PLUS','PREMIUM')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_expires_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_charges_provider_payment_id_idx ON partner_charges(provider_payment_id);
CREATE INDEX partner_charges_partner_idx ON partner_charges(partner_id);
ALTER TABLE partner_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_charges FORCE ROW LEVEL SECURITY;

-- Eventos da vitrine: 1 por cliente, por peca, por tipo e por dia (conta "clientes unicas").
CREATE TABLE partner_item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  item_id uuid REFERENCES partner_items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('VIEW','CLICK_WHATSAPP','CLICK_INSTAGRAM')),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX partner_item_events_dedupe ON partner_item_events (partner_id, COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id, day, kind);
CREATE INDEX partner_item_events_partner_day_idx ON partner_item_events (partner_id, day);
ALTER TABLE partner_item_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_item_events FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------- precos
CREATE FUNCTION partner_package_price(p_package text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT c.price_cents FROM partner_package_config c WHERE c.package = p_package;
$$;
REVOKE ALL ON FUNCTION partner_package_price(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_package_price(text) TO closet_app;

CREATE FUNCTION admin_list_partner_prices(p_actor uuid)
RETURNS TABLE(package text, price_cents integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT c.package, c.price_cents FROM partner_package_config c ORDER BY c.price_cents;
END $$;
REVOKE ALL ON FUNCTION admin_list_partner_prices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_partner_prices(uuid) TO closet_app;

CREATE FUNCTION admin_set_partner_price(p_actor uuid, p_package text, p_price_cents integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_package NOT IN ('BASICA','PLUS','PREMIUM') THEN RAISE EXCEPTION 'Pacote inválido.'; END IF;
  IF p_price_cents < 0 THEN RAISE EXCEPTION 'Preço não pode ser negativo.'; END IF;
  UPDATE partner_package_config SET price_cents = p_price_cents, updated_at = now() WHERE package = p_package;
  INSERT INTO audit_log(actor_user_id, action, details) VALUES (p_actor, 'SET_PARTNER_PRICE', jsonb_build_object('package', p_package, 'price_cents', p_price_cents));
END $$;
REVOKE ALL ON FUNCTION admin_set_partner_price(uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_partner_price(uuid,text,integer) TO closet_app;

-- ---------------------------------------------------------------- cadastro e dados da propria loja
-- A usuaria logada abre a propria loja (uma por conta). O e-mail da loja e o da conta.
CREATE FUNCTION open_partner_store(p_user uuid, p_store_name text, p_instagram text, p_whatsapp text, p_package text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE new_id uuid; v_email text;
BEGIN
  IF p_package NOT IN ('BASICA','PLUS','PREMIUM') THEN RAISE EXCEPTION 'Pacote inválido.'; END IF;
  IF trim(COALESCE(p_store_name, '')) = '' THEN RAISE EXCEPTION 'Informe o nome da loja.'; END IF;
  IF EXISTS (SELECT 1 FROM partners p WHERE p.user_id = p_user) THEN RAISE EXCEPTION 'Esta conta já tem uma loja.'; END IF;
  SELECT u.email INTO v_email FROM app_users u WHERE u.id = p_user;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  INSERT INTO partners(store_name, email, instagram, whatsapp, package, user_id)
    VALUES (trim(p_store_name), lower(v_email), trim(p_instagram), trim(p_whatsapp), p_package, p_user)
    RETURNING id INTO new_id;
  PERFORM notify_admin('PARTNER', p_user, 'Nova loja parceira', trim(p_store_name) || ' (' || lower(v_email) || ') pediu para entrar na vitrine e aguarda sua aprovação.');
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION open_partner_store(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION open_partner_store(uuid,text,text,text,text) TO closet_app;

CREATE FUNCTION my_partner_id(p_user uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.id FROM partners p WHERE p.user_id = p_user;
$$;
REVOKE ALL ON FUNCTION my_partner_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_partner_id(uuid) TO closet_app;

CREATE FUNCTION partner_me(p_partner uuid)
RETURNS TABLE(store_name text, email text, instagram text, whatsapp text, approved boolean, approved_at timestamptz, review_note text,
              package text, price_cents integer, current_period_end timestamptz, provider text, payment_method text,
              overdue_since timestamptz, live boolean, has_logo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.store_name, p.email, p.instagram, p.whatsapp, p.approved, p.approved_at, p.review_note, p.package, c.price_cents,
         p.current_period_end, p.provider, p.payment_method, p.overdue_since,
         (p.approved AND p.current_period_end IS NOT NULL AND now() <= p.current_period_end + interval '5 days'),
         (p.logo_object_key IS NOT NULL)
  FROM partners p LEFT JOIN partner_package_config c ON c.package = p.package WHERE p.id = p_partner;
$$;
REVOKE ALL ON FUNCTION partner_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_me(uuid) TO closet_app;

CREATE FUNCTION partner_update_contact(p_partner uuid, p_store_name text, p_instagram text, p_whatsapp text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF trim(COALESCE(p_store_name, '')) = '' THEN RAISE EXCEPTION 'Informe o nome da loja.'; END IF;
  UPDATE partners p SET store_name = trim(p_store_name), instagram = trim(COALESCE(p_instagram, '')), whatsapp = trim(COALESCE(p_whatsapp, ''))
    WHERE p.id = p_partner;
END $$;
REVOKE ALL ON FUNCTION partner_update_contact(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_update_contact(uuid,text,text,text) TO closet_app;

-- ---------------------------------------------------------------- provador (looks com pecas da loja)
-- Imagens geradas pela loja com as pecas dela: "MINHA_FOTO" (foto de corpo da dona da loja),
-- "MODELO" (modelo aleatoria) ou "MANEQUIM" (manequim de vitrine). Contam no limite mensal do pacote.
CREATE TABLE partner_provador_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  item_ids uuid[] NOT NULL DEFAULT '{}',
  item_names text NOT NULL DEFAULT '',
  model_kind text NOT NULL CHECK (model_kind IN ('MINHA_FOTO','MODELO','MANEQUIM')),
  object_key text NOT NULL,
  content_type text NOT NULL DEFAULT 'image/png',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_provador_looks_partner_idx ON partner_provador_looks(partner_id, created_at DESC);
ALTER TABLE partner_provador_looks ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_provador_looks FORCE ROW LEVEL SECURITY;

CREATE FUNCTION partner_add_provador_look(p_partner uuid, p_item_ids uuid[], p_item_names text, p_model_kind text, p_object_key text, p_content_type text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO partner_provador_looks(partner_id, item_ids, item_names, model_kind, object_key, content_type)
  VALUES (p_partner, p_item_ids, p_item_names, p_model_kind, p_object_key, p_content_type) RETURNING id;
$$;
REVOKE ALL ON FUNCTION partner_add_provador_look(uuid,uuid[],text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_add_provador_look(uuid,uuid[],text,text,text,text) TO closet_app;

CREATE FUNCTION partner_list_provador_looks(p_partner uuid)
RETURNS TABLE(id uuid, item_names text, model_kind text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT l.id, l.item_names, l.model_kind, l.created_at FROM partner_provador_looks l WHERE l.partner_id = p_partner ORDER BY l.created_at DESC LIMIT 30;
$$;
REVOKE ALL ON FUNCTION partner_list_provador_looks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_list_provador_looks(uuid) TO closet_app;

CREATE FUNCTION partner_provador_look_file(p_partner uuid, p_id uuid)
RETURNS TABLE(object_key text, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT l.object_key, l.content_type FROM partner_provador_looks l WHERE l.id = p_id AND l.partner_id = p_partner;
$$;
REVOKE ALL ON FUNCTION partner_provador_look_file(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_provador_look_file(uuid,uuid) TO closet_app;

CREATE FUNCTION partner_delete_provador_look(p_partner uuid, p_id uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM partner_provador_looks l WHERE l.id = p_id AND l.partner_id = p_partner RETURNING l.object_key;
$$;
REVOKE ALL ON FUNCTION partner_delete_provador_look(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_delete_provador_look(uuid,uuid) TO closet_app;

-- Quantas imagens do provador a loja gerou no mes (para o limite do pacote).
CREATE FUNCTION partner_provador_count_month(p_partner uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*)::int FROM partner_provador_looks l WHERE l.partner_id = p_partner AND l.created_at >= date_trunc('month', now());
$$;
REVOKE ALL ON FUNCTION partner_provador_count_month(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_provador_count_month(uuid) TO closet_app;

-- Dados das pecas escolhidas (so da propria loja) para o provador.
CREATE FUNCTION partner_items_for_provador(p_partner uuid, p_item_ids uuid[])
RETURNS TABLE(id uuid, name text, description text, object_key text, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT i.id, i.name, i.description, i.object_key, i.content_type FROM partner_items i
  WHERE i.partner_id = p_partner AND i.id = ANY(p_item_ids) AND i.object_key <> '';
$$;
REVOKE ALL ON FUNCTION partner_items_for_provador(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_items_for_provador(uuid,uuid[]) TO closet_app;

-- ---------------------------------------------------------------- pecas (editar / pausar)
DROP FUNCTION partner_list_own_items(uuid);
CREATE FUNCTION partner_list_own_items(p_partner_id uuid)
RETURNS TABLE(id uuid, name text, description text, price_cents integer, discount_percent integer, object_key text, created_at timestamptz, active boolean, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT i.id, i.name, i.description, i.price_cents, i.discount_percent, i.object_key, i.created_at, i.active, i.content_type
  FROM partner_items i WHERE i.partner_id = p_partner_id ORDER BY i.active DESC, i.created_at DESC;
$$;
REVOKE ALL ON FUNCTION partner_list_own_items(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_list_own_items(uuid) TO closet_app;

CREATE FUNCTION partner_update_item(p_partner uuid, p_item uuid, p_name text, p_description text, p_price_cents integer,
  p_discount integer, p_active boolean, p_object_key text, p_content_type text, p_limit integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_was_active boolean; v_cnt integer;
BEGIN
  SELECT i.active INTO v_was_active FROM partner_items i WHERE i.id = p_item AND i.partner_id = p_partner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Peça não encontrada.'; END IF;
  IF p_active AND NOT v_was_active AND p_limit IS NOT NULL THEN
    SELECT count(*)::int INTO v_cnt FROM partner_items i WHERE i.partner_id = p_partner AND i.active;
    IF v_cnt >= p_limit THEN RAISE EXCEPTION 'Limite de peças publicadas do seu pacote atingido.'; END IF;
  END IF;
  UPDATE partner_items i SET name = p_name, description = p_description, price_cents = p_price_cents, discount_percent = p_discount,
    active = p_active,
    object_key = CASE WHEN COALESCE(p_object_key,'') <> '' THEN p_object_key ELSE i.object_key END,
    content_type = CASE WHEN COALESCE(p_object_key,'') <> '' THEN p_content_type ELSE i.content_type END
    WHERE i.id = p_item AND i.partner_id = p_partner;
END $$;
REVOKE ALL ON FUNCTION partner_update_item(uuid,uuid,text,text,integer,integer,boolean,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_update_item(uuid,uuid,text,text,integer,integer,boolean,text,text,integer) TO closet_app;

-- ---------------------------------------------------------------- vitrine (so lojas aprovadas e em dia)
CREATE OR REPLACE FUNCTION storefront_list()
RETURNS TABLE(partner_id uuid, store_name text, instagram text, whatsapp text, logo_object_key text, item_id uuid, item_name text, description text, price_cents integer, discount_percent integer, object_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.id, p.store_name, p.instagram, p.whatsapp, p.logo_object_key, i.id, i.name, i.description, i.price_cents, i.discount_percent, i.object_key
  FROM partners p JOIN partner_items i ON i.partner_id = p.id
  WHERE p.approved AND p.current_period_end IS NOT NULL AND now() <= p.current_period_end + interval '5 days' AND i.active
  ORDER BY p.store_name, i.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION storefront_item_photo(p_item_id uuid)
RETURNS TABLE(object_key text, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT i.object_key, i.content_type FROM partner_items i JOIN partners p ON p.id = i.partner_id
  WHERE i.id = p_item_id AND p.approved AND p.current_period_end IS NOT NULL AND now() <= p.current_period_end + interval '5 days' AND i.active;
$$;

CREATE FUNCTION record_storefront_views(p_user uuid, p_item_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO partner_item_events(partner_id, item_id, kind, user_id)
  SELECT i.partner_id, i.id, 'VIEW', p_user
  FROM partner_items i JOIN partners p ON p.id = i.partner_id
  WHERE i.id = ANY(p_item_ids) AND i.active AND p.approved AND p.current_period_end IS NOT NULL AND now() <= p.current_period_end + interval '5 days'
  ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION record_storefront_views(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_storefront_views(uuid,uuid[]) TO closet_app;

-- Registra o clique (1 por cliente/peca/tipo/dia) e devolve o contato da loja pra montar o link.
CREATE FUNCTION record_storefront_click(p_user uuid, p_item uuid, p_kind text)
RETURNS TABLE(store_name text, whatsapp text, instagram text, item_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_partner uuid;
BEGIN
  IF p_kind NOT IN ('CLICK_WHATSAPP','CLICK_INSTAGRAM') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;
  SELECT i.partner_id INTO v_partner FROM partner_items i JOIN partners p ON p.id = i.partner_id
    WHERE i.id = p_item AND i.active AND p.approved AND p.current_period_end IS NOT NULL AND now() <= p.current_period_end + interval '5 days';
  IF v_partner IS NULL THEN RETURN; END IF;
  INSERT INTO partner_item_events(partner_id, item_id, kind, user_id) VALUES (v_partner, p_item, p_kind, p_user) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT p.store_name, p.whatsapp, p.instagram, i.name FROM partners p JOIN partner_items i ON i.partner_id = p.id WHERE p.id = v_partner AND i.id = p_item;
END $$;
REVOKE ALL ON FUNCTION record_storefront_click(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_storefront_click(uuid,uuid,text) TO closet_app;

-- Clique no perfil/WhatsApp da loja como um todo (sem peca especifica).
CREATE FUNCTION record_storefront_store_click(p_user uuid, p_partner uuid, p_kind text)
RETURNS TABLE(store_name text, whatsapp text, instagram text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_kind NOT IN ('CLICK_WHATSAPP','CLICK_INSTAGRAM') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM partners p WHERE p.id = p_partner AND p.approved AND p.current_period_end IS NOT NULL AND now() <= p.current_period_end + interval '5 days') THEN RETURN; END IF;
  INSERT INTO partner_item_events(partner_id, item_id, kind, user_id) VALUES (p_partner, NULL, p_kind, p_user) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT p.store_name, p.whatsapp, p.instagram FROM partners p WHERE p.id = p_partner;
END $$;
REVOKE ALL ON FUNCTION record_storefront_store_click(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_storefront_store_click(uuid,uuid,text) TO closet_app;

-- Desempenho para o painel da loja.
CREATE FUNCTION partner_item_stats(p_partner uuid)
RETURNS TABLE(item_id uuid, views30 integer, clicks30 integer, views_total integer, clicks_total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT i.id,
    (SELECT count(*)::int FROM partner_item_events e WHERE e.item_id = i.id AND e.kind = 'VIEW' AND e.day >= current_date - 29),
    (SELECT count(*)::int FROM partner_item_events e WHERE e.item_id = i.id AND e.kind <> 'VIEW' AND e.day >= current_date - 29),
    (SELECT count(*)::int FROM partner_item_events e WHERE e.item_id = i.id AND e.kind = 'VIEW'),
    (SELECT count(*)::int FROM partner_item_events e WHERE e.item_id = i.id AND e.kind <> 'VIEW')
  FROM partner_items i WHERE i.partner_id = p_partner;
$$;
REVOKE ALL ON FUNCTION partner_item_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_item_stats(uuid) TO closet_app;

CREATE FUNCTION partner_store_stats(p_partner uuid)
RETURNS TABLE(views30 integer, whatsapp30 integer, instagram30 integer, visitors30 integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT
    (SELECT count(*)::int FROM partner_item_events e WHERE e.partner_id = p_partner AND e.kind = 'VIEW' AND e.day >= current_date - 29),
    (SELECT count(*)::int FROM partner_item_events e WHERE e.partner_id = p_partner AND e.kind = 'CLICK_WHATSAPP' AND e.day >= current_date - 29),
    (SELECT count(*)::int FROM partner_item_events e WHERE e.partner_id = p_partner AND e.kind = 'CLICK_INSTAGRAM' AND e.day >= current_date - 29),
    (SELECT count(DISTINCT e.user_id)::int FROM partner_item_events e WHERE e.partner_id = p_partner AND e.day >= current_date - 29);
$$;
REVOKE ALL ON FUNCTION partner_store_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_store_stats(uuid) TO closet_app;

-- ---------------------------------------------------------------- cobranca da loja
CREATE FUNCTION partner_activate(p_partner uuid, p_package text, p_method text, p_preapproval text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE partners p SET package = p_package, provider = 'MERCADOPAGO', payment_method = p_method,
    preapproval_id = COALESCE(p_preapproval, p.preapproval_id),
    current_period_end = greatest(now(), COALESCE(p.current_period_end, now())) + interval '30 days',
    overdue_since = NULL
  WHERE p.id = p_partner;
$$;
REVOKE ALL ON FUNCTION partner_activate(uuid,text,text,text) FROM PUBLIC;

CREATE FUNCTION partner_create_charge(p_partner uuid, p_kind text, p_package text, p_amount_cents integer, p_provider_payment_id text,
  p_pix_qr text, p_pix_qr_b64 text, p_pix_expires timestamptz)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO partner_charges(partner_id, kind, package, amount_cents, provider_payment_id, pix_qr_code, pix_qr_code_base64, pix_expires_at)
  VALUES (p_partner, p_kind, p_package, p_amount_cents, p_provider_payment_id, p_pix_qr, p_pix_qr_b64, p_pix_expires) RETURNING id;
$$;
REVOKE ALL ON FUNCTION partner_create_charge(uuid,text,text,integer,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_create_charge(uuid,text,text,integer,text,text,text,timestamptz) TO closet_app;

CREATE FUNCTION partner_my_pending_charge(p_partner uuid)
RETURNS TABLE(id uuid, kind text, status text, package text, amount_cents integer, pix_qr_code text, pix_qr_code_base64 text, pix_expires_at timestamptz, created_at timestamptz, provider_payment_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT c.id, c.kind, c.status, c.package, c.amount_cents, c.pix_qr_code, c.pix_qr_code_base64, c.pix_expires_at, c.created_at, c.provider_payment_id
  FROM partner_charges c WHERE c.partner_id = p_partner ORDER BY c.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION partner_my_pending_charge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_my_pending_charge(uuid) TO closet_app;

CREATE FUNCTION apply_partner_pix_result(p_provider_payment_id text, p_status text, p_raw jsonb)
RETURNS TABLE(partner_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v partner_charges%ROWTYPE;
BEGIN
  SELECT * INTO v FROM partner_charges pc WHERE pc.provider_payment_id = p_provider_payment_id AND pc.kind = 'PIX' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE partner_charges pc SET status = p_status, raw = p_raw, updated_at = now() WHERE pc.id = v.id;
  IF p_status = 'approved' AND v.status IS DISTINCT FROM 'approved' THEN
    PERFORM partner_activate(v.partner_id, v.package, 'PIX', NULL);
    PERFORM notify_admin('PAYMENT', NULL, 'Mensalidade de loja recebida (Pix)',
      (SELECT p.store_name FROM partners p WHERE p.id = v.partner_id) || ' pagou R$ ' || replace(to_char(v.amount_cents / 100.0, 'FM999990.00'), '.', ',') || ' (pacote ' || v.package || ').');
  END IF;
  RETURN QUERY SELECT v.partner_id;
END $$;
REVOKE ALL ON FUNCTION apply_partner_pix_result(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_partner_pix_result(text,text,jsonb) TO closet_app;

CREATE FUNCTION apply_partner_preapproval_result(p_preapproval_id text, p_status text, p_external_reference text, p_raw jsonb)
RETURNS TABLE(partner_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_partner uuid; v partner_charges%ROWTYPE; v_pre text;
BEGIN
  v_partner := nullif(replace(COALESCE(p_external_reference, ''), 'partner:', ''), '')::uuid;
  IF v_partner IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM partners p WHERE p.id = v_partner) THEN RETURN; END IF;
  SELECT * INTO v FROM partner_charges pc WHERE pc.provider_payment_id = p_preapproval_id AND pc.kind = 'CARD_PREAPPROVAL' FOR UPDATE;
  SELECT p.preapproval_id INTO v_pre FROM partners p WHERE p.id = v_partner;
  IF p_status = 'authorized' THEN
    IF v.id IS NOT NULL AND v.status IS DISTINCT FROM 'approved' THEN
      UPDATE partner_charges pc SET status = 'approved', raw = p_raw, updated_at = now() WHERE pc.id = v.id;
      PERFORM partner_activate(v_partner, v.package, 'CARD', p_preapproval_id);
      PERFORM notify_admin('PAYMENT', NULL, 'Loja assinou no cartão',
        (SELECT p.store_name FROM partners p WHERE p.id = v_partner) || ' assinou o pacote ' || v.package || ' no cartão (R$ ' || replace(to_char(v.amount_cents / 100.0, 'FM999990.00'), '.', ',') || '/mês).');
    END IF;
  ELSIF p_status IN ('cancelled','paused') THEN
    IF v.id IS NOT NULL AND v.status = 'pending' THEN
      UPDATE partner_charges pc SET status = p_status, raw = p_raw, updated_at = now() WHERE pc.id = v.id;
    ELSIF v_pre = p_preapproval_id THEN
      UPDATE partners p SET overdue_since = COALESCE(p.overdue_since, now()) WHERE p.id = v_partner;
      PERFORM notify_admin('OVERDUE', NULL, 'Assinatura de loja ' || (CASE WHEN p_status = 'cancelled' THEN 'cancelada' ELSE 'pausada' END),
        (SELECT p.store_name FROM partners p WHERE p.id = v_partner) || ': a loja sai da vitrine quando o período pago acabar (+5 dias).');
    END IF;
  END IF;
  RETURN QUERY SELECT v_partner;
END $$;
REVOKE ALL ON FUNCTION apply_partner_preapproval_result(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_partner_preapproval_result(text,text,text,jsonb) TO closet_app;

CREATE FUNCTION apply_partner_authorized_payment_result(p_preapproval_id text, p_status text, p_raw jsonb)
RETURNS TABLE(partner_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_partner uuid;
BEGIN
  SELECT p.id INTO v_partner FROM partners p WHERE p.preapproval_id = p_preapproval_id;
  IF v_partner IS NULL THEN RETURN; END IF;
  IF p_status = 'approved' THEN
    UPDATE partners p SET current_period_end = greatest(now(), COALESCE(p.current_period_end, now())) + interval '30 days', overdue_since = NULL WHERE p.id = v_partner;
  ELSIF p_status = 'rejected' THEN
    UPDATE partners p SET overdue_since = COALESCE(p.overdue_since, now()) WHERE p.id = v_partner;
    PERFORM notify_admin('OVERDUE', NULL, 'Cobrança de loja recusada',
      (SELECT p.store_name FROM partners p WHERE p.id = v_partner) || ': cartão recusado; a loja sai da vitrine quando o período pago acabar (+5 dias).');
  END IF;
  RETURN QUERY SELECT v_partner;
END $$;
REVOKE ALL ON FUNCTION apply_partner_authorized_payment_result(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_partner_authorized_payment_result(text,text,jsonb) TO closet_app;

-- ---------------------------------------------------------------- admin
DROP FUNCTION admin_list_partners(uuid);
CREATE FUNCTION admin_list_partners(p_actor uuid)
RETURNS TABLE(id uuid, store_name text, email text, instagram text, whatsapp text, package text, approved boolean, approved_at timestamptz,
              review_note text, created_at timestamptz, item_count integer, current_period_end timestamptz, provider text,
              payment_method text, overdue_since timestamptz, live boolean, views30 integer, clicks30 integer, user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users au WHERE au.id = p_actor AND au.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT p.id, p.store_name, p.email, p.instagram, p.whatsapp, p.package, p.approved, p.approved_at, p.review_note, p.created_at,
    (SELECT count(*)::int FROM partner_items i WHERE i.partner_id = p.id AND i.active),
    p.current_period_end, p.provider, p.payment_method, p.overdue_since,
    (p.approved AND p.current_period_end IS NOT NULL AND now() <= p.current_period_end + interval '5 days'),
    (SELECT count(*)::int FROM partner_item_events e WHERE e.partner_id = p.id AND e.kind = 'VIEW' AND e.day >= current_date - 29),
    (SELECT count(*)::int FROM partner_item_events e WHERE e.partner_id = p.id AND e.kind <> 'VIEW' AND e.day >= current_date - 29),
    p.user_id
    FROM partners p ORDER BY p.approved, p.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION admin_list_partners(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_partners(uuid) TO closet_app;

DROP FUNCTION admin_set_partner(uuid,uuid,text,boolean);
CREATE FUNCTION admin_set_partner(p_actor uuid, p_partner_id uuid, p_package text, p_approved boolean, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users au WHERE au.id = p_actor AND au.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_package NOT IN ('BASICA','PLUS','PREMIUM') THEN RAISE EXCEPTION 'Pacote inválido.'; END IF;
  UPDATE partners p SET package = p_package, approved = p_approved, review_note = COALESCE(p_note, ''),
    approved_at = CASE WHEN p_approved AND p.approved_at IS NULL THEN now() WHEN NOT p_approved THEN NULL ELSE p.approved_at END
    WHERE p.id = p_partner_id;
  INSERT INTO audit_log(actor_user_id, action, details)
    VALUES (p_actor, 'SET_PARTNER', jsonb_build_object('partner_id', p_partner_id, 'package', p_package, 'approved', p_approved, 'note', p_note));
END $$;
REVOKE ALL ON FUNCTION admin_set_partner(uuid,uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_partner(uuid,uuid,text,boolean,text) TO closet_app;

-- Cortesia: libera N dias de vitrine sem cobrar (ex.: primeiras lojas, parcerias especiais).
CREATE FUNCTION admin_grant_partner_days(p_actor uuid, p_partner_id uuid, p_days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users au WHERE au.id = p_actor AND au.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_days < 1 OR p_days > 3650 THEN RAISE EXCEPTION 'Informe entre 1 e 3650 dias.'; END IF;
  UPDATE partners p SET current_period_end = greatest(now(), COALESCE(p.current_period_end, now())) + make_interval(days => p_days), overdue_since = NULL
    WHERE p.id = p_partner_id;
  INSERT INTO audit_log(actor_user_id, action, details) VALUES (p_actor, 'GRANT_PARTNER_DAYS', jsonb_build_object('partner_id', p_partner_id, 'days', p_days));
END $$;
REVOKE ALL ON FUNCTION admin_grant_partner_days(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_partner_days(uuid,uuid,integer) TO closet_app;

CREATE FUNCTION admin_partner_charges(p_actor uuid, p_partner_id uuid)
RETURNS TABLE(kind text, package text, amount_cents integer, status text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users au WHERE au.id = p_actor AND au.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT c.kind, c.package, c.amount_cents, c.status, c.created_at FROM partner_charges c WHERE c.partner_id = p_partner_id ORDER BY c.created_at DESC LIMIT 10;
END $$;
REVOKE ALL ON FUNCTION admin_partner_charges(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_partner_charges(uuid,uuid) TO closet_app;
