-- Extras vendidos separadamente do plano:
--   COLORIMETRIA: compra unica (Pix), libera o modulo para sempre (user_modules, origem COMPRA_AVULSA).
--   CUIDESE (Skincare + Cronograma Capilar): add-on mensal. Incluido nos planos Fashion e Super Star e no teste
--   gratuito; no Arrumada vira add-on pago por Pix (30 dias por pagamento) ou cartao recorrente (com desconto
--   nos primeiros meses). Segue o mesmo desenho da cobranca das lojas parceiras: tabelas e funcoes proprias,
--   sem mexer no faturamento dos planos.

CREATE TABLE extra_prices (
  product text PRIMARY KEY CHECK (product IN ('COLORIMETRIA','CUIDESE')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  promo_price_cents integer CHECK (promo_price_cents IS NULL OR promo_price_cents >= 0),
  promo_months integer NOT NULL DEFAULT 0 CHECK (promo_months BETWEEN 0 AND 24),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO extra_prices(product, price_cents, promo_price_cents, promo_months) VALUES
  ('COLORIMETRIA', 5990, NULL, 0),
  ('CUIDESE', 990, 490, 3);
ALTER TABLE extra_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_prices FORCE ROW LEVEL SECURITY;

CREATE TABLE extra_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  product text NOT NULL CHECK (product IN ('COLORIMETRIA','CUIDESE')),
  kind text NOT NULL CHECK (kind IN ('PIX','CARD_PREAPPROVAL')),
  amount_cents integer NOT NULL,
  promo_months integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  provider_payment_id text,
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_expires_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX extra_charges_provider_idx ON extra_charges (provider_payment_id);
CREATE INDEX extra_charges_user_idx ON extra_charges (user_id, product, created_at DESC);
ALTER TABLE extra_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_charges FORCE ROW LEVEL SECURITY;

CREATE TABLE cuidese_access (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  active_until timestamptz NOT NULL,
  payment_method text,
  preapproval_id text,
  promo_left integer NOT NULL DEFAULT 0,
  overdue_since timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cuidese_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuidese_access FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------- precos
CREATE FUNCTION extra_price_info(p_product text)
RETURNS TABLE(price_cents integer, promo_price_cents integer, promo_months integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT e.price_cents, e.promo_price_cents, e.promo_months FROM extra_prices e WHERE e.product = p_product;
$$;
REVOKE ALL ON FUNCTION extra_price_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extra_price_info(text) TO closet_app;

CREATE FUNCTION admin_list_extra_prices(p_actor uuid)
RETURNS TABLE(product text, price_cents integer, promo_price_cents integer, promo_months integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT e.product, e.price_cents, e.promo_price_cents, e.promo_months FROM extra_prices e ORDER BY e.product;
END $$;
REVOKE ALL ON FUNCTION admin_list_extra_prices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_extra_prices(uuid) TO closet_app;

CREATE FUNCTION admin_set_extra_price(p_actor uuid, p_product text, p_price_cents integer, p_promo_cents integer, p_months integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_product NOT IN ('COLORIMETRIA','CUIDESE') THEN RAISE EXCEPTION 'Produto inválido.'; END IF;
  IF p_price_cents < 0 OR (p_promo_cents IS NOT NULL AND p_promo_cents < 0) THEN RAISE EXCEPTION 'Preço não pode ser negativo.'; END IF;
  IF p_months < 0 OR p_months > 24 THEN RAISE EXCEPTION 'Quantidade de meses inválida.'; END IF;
  UPDATE extra_prices SET price_cents = p_price_cents, promo_price_cents = p_promo_cents, promo_months = p_months, updated_at = now() WHERE product = p_product;
  INSERT INTO audit_log(actor_user_id, action, details)
    VALUES (p_actor, 'SET_EXTRA_PRICE', jsonb_build_object('product', p_product, 'price_cents', p_price_cents, 'promo_price_cents', p_promo_cents, 'promo_months', p_months));
END $$;
REVOKE ALL ON FUNCTION admin_set_extra_price(uuid,text,integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_extra_price(uuid,text,integer,integer,integer) TO closet_app;

-- ---------------------------------------------------------------- cobrancas
CREATE FUNCTION extra_create_charge(p_user uuid, p_product text, p_kind text, p_amount_cents integer, p_promo_months integer,
  p_provider_payment_id text, p_pix_qr text, p_pix_qr_b64 text, p_pix_expires timestamptz)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO extra_charges(user_id, product, kind, amount_cents, promo_months, provider_payment_id, pix_qr_code, pix_qr_code_base64, pix_expires_at)
  VALUES (p_user, p_product, p_kind, p_amount_cents, COALESCE(p_promo_months, 0), p_provider_payment_id, p_pix_qr, p_pix_qr_b64, p_pix_expires) RETURNING id;
$$;
REVOKE ALL ON FUNCTION extra_create_charge(uuid,text,text,integer,integer,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extra_create_charge(uuid,text,text,integer,integer,text,text,text,timestamptz) TO closet_app;

CREATE FUNCTION extra_my_pending_charge(p_user uuid, p_product text)
RETURNS TABLE(id uuid, kind text, status text, amount_cents integer, pix_qr_code text, pix_qr_code_base64 text, pix_expires_at timestamptz, created_at timestamptz, provider_payment_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT c.id, c.kind, c.status, c.amount_cents, c.pix_qr_code, c.pix_qr_code_base64, c.pix_expires_at, c.created_at, c.provider_payment_id
  FROM extra_charges c WHERE c.user_id = p_user AND c.product = p_product ORDER BY c.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION extra_my_pending_charge(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extra_my_pending_charge(uuid,text) TO closet_app;

-- O desconto de cartao vale so na primeira assinatura de cartao do produto na conta.
CREATE FUNCTION extra_card_promo_used(p_user uuid, p_product text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM extra_charges c WHERE c.user_id = p_user AND c.product = p_product AND c.kind = 'CARD_PREAPPROVAL' AND c.status = 'approved');
$$;
REVOKE ALL ON FUNCTION extra_card_promo_used(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extra_card_promo_used(uuid,text) TO closet_app;

CREATE FUNCTION my_cuidese(p_user uuid)
RETURNS TABLE(active_until timestamptz, payment_method text, preapproval_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT a.active_until, a.payment_method, a.preapproval_id FROM cuidese_access a WHERE a.user_id = p_user;
$$;
REVOKE ALL ON FUNCTION my_cuidese(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_cuidese(uuid) TO closet_app;

-- Libera o que foi pago. Colorimetria: para sempre. Cuide-se: +30 dias a partir do fim do periodo atual.
CREATE FUNCTION extra_activate(p_user uuid, p_product text, p_method text, p_preapproval text, p_promo_left integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_product = 'COLORIMETRIA' THEN
    INSERT INTO user_modules(user_id, module, status, origin) VALUES (p_user, 'COLORIMETRIA', 'LIBERADA', 'COMPRA_AVULSA')
      ON CONFLICT (user_id, module) DO UPDATE SET status = CASE WHEN user_modules.status = 'NAO_ADQUIRIDA' THEN 'LIBERADA' ELSE user_modules.status END;
  ELSIF p_product = 'CUIDESE' THEN
    INSERT INTO cuidese_access(user_id, active_until, payment_method, preapproval_id, promo_left)
      VALUES (p_user, now() + interval '30 days', p_method, p_preapproval, CASE WHEN p_method = 'CARD' THEN COALESCE(p_promo_left, 0) ELSE 0 END)
      ON CONFLICT (user_id) DO UPDATE SET
        active_until = greatest(now(), cuidese_access.active_until) + interval '30 days',
        payment_method = excluded.payment_method,
        preapproval_id = COALESCE(excluded.preapproval_id, cuidese_access.preapproval_id),
        promo_left = CASE WHEN excluded.payment_method = 'CARD' THEN excluded.promo_left ELSE 0 END,
        overdue_since = NULL, updated_at = now();
  END IF;
END $$;
REVOKE ALL ON FUNCTION extra_activate(uuid,text,text,text,integer) FROM PUBLIC;

CREATE FUNCTION apply_extra_pix_result(p_provider_payment_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v extra_charges%ROWTYPE;
BEGIN
  SELECT * INTO v FROM extra_charges ec WHERE ec.provider_payment_id = p_provider_payment_id AND ec.kind = 'PIX' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE extra_charges ec SET status = p_status, raw = p_raw, updated_at = now() WHERE ec.id = v.id;
  IF p_status = 'approved' AND v.status IS DISTINCT FROM 'approved' THEN
    PERFORM extra_activate(v.user_id, v.product, 'PIX', NULL, 0);
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v.user_id, 'EXTRA_PIX_APPROVED', v.user_id, jsonb_build_object('product', v.product, 'amount_cents', v.amount_cents));
    PERFORM notify_admin('PAYMENT', v.user_id, 'Extra pago (Pix)',
      who_is(v.user_id) || ' pagou R$ ' || replace(to_char(v.amount_cents / 100.0, 'FM999990.00'), '.', ',') || ' por ' || (CASE v.product WHEN 'COLORIMETRIA' THEN 'Colorimetria' ELSE 'Cuide-se' END) || ' e foi liberada automaticamente.');
  END IF;
  RETURN QUERY SELECT v.user_id;
END $$;
REVOKE ALL ON FUNCTION apply_extra_pix_result(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_extra_pix_result(text,text,jsonb) TO closet_app;

-- Cartao (so Cuide-se): external_reference = 'extra:<user>'.
CREATE FUNCTION apply_extra_preapproval_result(p_preapproval_id text, p_status text, p_external_reference text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid; v extra_charges%ROWTYPE; v_pre text;
BEGIN
  v_user := nullif(replace(COALESCE(p_external_reference, ''), 'extra:', ''), '')::uuid;
  IF v_user IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_users u WHERE u.id = v_user) THEN RETURN; END IF;
  SELECT * INTO v FROM extra_charges ec WHERE ec.provider_payment_id = p_preapproval_id AND ec.kind = 'CARD_PREAPPROVAL' FOR UPDATE;
  SELECT a.preapproval_id INTO v_pre FROM cuidese_access a WHERE a.user_id = v_user;
  IF p_status = 'authorized' THEN
    IF v.id IS NOT NULL AND v.status IS DISTINCT FROM 'approved' THEN
      UPDATE extra_charges ec SET status = 'approved', raw = p_raw, updated_at = now() WHERE ec.id = v.id;
      PERFORM extra_activate(v_user, v.product, 'CARD', p_preapproval_id, v.promo_months);
      INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
        VALUES (v_user, 'EXTRA_CARD_AUTHORIZED', v_user, jsonb_build_object('product', v.product, 'amount_cents', v.amount_cents));
      PERFORM notify_admin('PAYMENT', v_user, 'Cuide-se assinado no cartão',
        who_is(v_user) || ' assinou o Cuide-se no cartão (R$ ' || replace(to_char(v.amount_cents / 100.0, 'FM999990.00'), '.', ',') || '/mês).');
    END IF;
  ELSIF p_status IN ('cancelled','paused') THEN
    IF v.id IS NOT NULL AND v.status = 'pending' THEN
      UPDATE extra_charges ec SET status = p_status, raw = p_raw, updated_at = now() WHERE ec.id = v.id;
    ELSIF v_pre = p_preapproval_id THEN
      UPDATE cuidese_access a SET overdue_since = COALESCE(a.overdue_since, now()), updated_at = now() WHERE a.user_id = v_user;
      PERFORM notify_admin('OVERDUE', v_user, 'Cuide-se no cartão ' || (CASE WHEN p_status = 'cancelled' THEN 'cancelado' ELSE 'pausado' END),
        who_is(v_user) || ': o acesso ao Cuide-se termina quando o período pago acabar.');
    END IF;
  END IF;
  RETURN QUERY SELECT v_user;
END $$;
REVOKE ALL ON FUNCTION apply_extra_preapproval_result(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_extra_preapproval_result(text,text,text,jsonb) TO closet_app;

CREATE FUNCTION apply_extra_authorized_payment_result(p_preapproval_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid, promo_ended boolean, base_price_cents integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v cuidese_access%ROWTYPE; v_ended boolean := false; v_base integer;
BEGIN
  SELECT * INTO v FROM cuidese_access a WHERE a.preapproval_id = p_preapproval_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_status = 'approved' THEN
    UPDATE cuidese_access a SET active_until = greatest(now(), a.active_until) + interval '30 days', overdue_since = NULL,
      promo_left = greatest(a.promo_left - 1, 0), updated_at = now() WHERE a.user_id = v.user_id;
    IF v.promo_left = 1 THEN
      v_ended := true;
      SELECT e.price_cents INTO v_base FROM extra_prices e WHERE e.product = 'CUIDESE';
    END IF;
  ELSIF p_status = 'rejected' THEN
    UPDATE cuidese_access a SET overdue_since = COALESCE(a.overdue_since, now()), updated_at = now() WHERE a.user_id = v.user_id;
    PERFORM notify_admin('OVERDUE', v.user_id, 'Cobrança do Cuide-se recusada',
      who_is(v.user_id) || ': cartão recusado; o acesso ao Cuide-se termina quando o período pago acabar.');
  END IF;
  RETURN QUERY SELECT v.user_id, v_ended, v_base;
END $$;
REVOKE ALL ON FUNCTION apply_extra_authorized_payment_result(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_extra_authorized_payment_result(text,text,jsonb) TO closet_app;
