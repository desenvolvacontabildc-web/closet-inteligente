-- Pacotes de creditos de imagem vendidos a parte (Pix). Cada credito vale uma geracao adicional: look em imagem ou foto de
-- catalogo. Usa os creditos bonus que ja existem (profiles.bonus_image_credits): nao expiram e so sao gastos depois que a
-- cota mensal do plano acaba. Pacotes editaveis pela administradora (preco e quantidade de creditos).
--
--   Pacote   Preco      Creditos   Por credito
--   Mini     R$ 5,00    10         R$ 0,50
--   Basico   R$ 10,00   22         R$ 0,45
--   Plus     R$ 20,00   48         R$ 0,42
--   Max      R$ 50,00   130        R$ 0,38
-- Custo de IA por credito: cerca de R$ 0,14 a R$ 0,17, entao a margem fica entre ~55% e ~70% antes das taxas do Mercado Pago.

CREATE TABLE credit_packs (
  id text PRIMARY KEY CHECK (id ~ '^[A-Z0-9_]{2,24}$'),
  label text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  credits integer NOT NULL CHECK (credits > 0),
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO credit_packs(id, label, price_cents, credits, sort) VALUES
  ('MINI', 'Mini', 500, 10, 1), ('BASICO', 'Básico', 1000, 22, 2), ('PLUS', 'Plus', 2000, 48, 3), ('MAX', 'Max', 5000, 130, 4);
ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_packs FORCE ROW LEVEL SECURITY;

ALTER TABLE extra_charges DROP CONSTRAINT extra_charges_product_check;
ALTER TABLE extra_charges ADD CONSTRAINT extra_charges_product_check CHECK (product IN ('COLORIMETRIA','CUIDESE','CREDITOS'));
ALTER TABLE extra_charges ADD COLUMN credits integer NOT NULL DEFAULT 0;
ALTER TABLE extra_charges ADD COLUMN pack_id text;

CREATE FUNCTION list_credit_packs()
RETURNS TABLE(id text, label text, price_cents integer, credits integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.id, p.label, p.price_cents, p.credits FROM credit_packs p WHERE p.active ORDER BY p.sort, p.price_cents;
$$;
REVOKE ALL ON FUNCTION list_credit_packs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_credit_packs() TO closet_app;

CREATE FUNCTION admin_list_credit_packs(p_actor uuid)
RETURNS TABLE(id text, label text, price_cents integer, credits integer, sort integer, active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT p.id, p.label, p.price_cents, p.credits, p.sort, p.active FROM credit_packs p ORDER BY p.sort, p.price_cents;
END $$;
REVOKE ALL ON FUNCTION admin_list_credit_packs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_credit_packs(uuid) TO closet_app;

-- Cria ou atualiza um pacote (a administradora escolhe nome, preco e quantidade de creditos).
CREATE FUNCTION admin_upsert_credit_pack(p_actor uuid, p_id text, p_label text, p_price_cents integer, p_credits integer, p_sort integer, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_price_cents <= 0 OR p_credits <= 0 THEN RAISE EXCEPTION 'Preço e créditos precisam ser maiores que zero.'; END IF;
  INSERT INTO credit_packs(id, label, price_cents, credits, sort, active) VALUES (p_id, p_label, p_price_cents, p_credits, p_sort, p_active)
    ON CONFLICT (id) DO UPDATE SET label = excluded.label, price_cents = excluded.price_cents, credits = excluded.credits,
      sort = excluded.sort, active = excluded.active, updated_at = now();
  INSERT INTO audit_log(actor_user_id, action, details)
    VALUES (p_actor, 'SET_CREDIT_PACK', jsonb_build_object('id', p_id, 'price_cents', p_price_cents, 'credits', p_credits, 'active', p_active));
END $$;
REVOKE ALL ON FUNCTION admin_upsert_credit_pack(uuid,text,text,integer,integer,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_upsert_credit_pack(uuid,text,text,integer,integer,integer,boolean) TO closet_app;

-- Cobranca Pix de um pacote. O preco vem do banco; p_expected_cents evita cobrar um valor diferente do que a usuaria viu.
CREATE FUNCTION extra_create_credit_charge(p_user uuid, p_pack_id text, p_expected_cents integer, p_provider_payment_id text,
  p_pix_qr text, p_pix_qr_b64 text, p_pix_expires timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v credit_packs%ROWTYPE; rid uuid;
BEGIN
  SELECT * INTO v FROM credit_packs cp WHERE cp.id = p_pack_id AND cp.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pacote indisponível.'; END IF;
  IF v.price_cents <> p_expected_cents THEN RAISE EXCEPTION 'O preço do pacote mudou. Tente de novo.'; END IF;
  INSERT INTO extra_charges(user_id, product, kind, amount_cents, credits, pack_id, provider_payment_id, pix_qr_code, pix_qr_code_base64, pix_expires_at)
    VALUES (p_user, 'CREDITOS', 'PIX', v.price_cents, v.credits, v.id, p_provider_payment_id, p_pix_qr, p_pix_qr_b64, p_pix_expires)
    RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION extra_create_credit_charge(uuid,text,integer,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extra_create_credit_charge(uuid,text,integer,text,text,text,timestamptz) TO closet_app;

-- Pix aprovado: Colorimetria e Cuide-se seguem como antes; pacote de creditos soma os creditos (uma unica vez por cobranca).
CREATE OR REPLACE FUNCTION apply_extra_pix_result(p_provider_payment_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v extra_charges%ROWTYPE; v_tenant uuid;
BEGIN
  SELECT * INTO v FROM extra_charges ec WHERE ec.provider_payment_id = p_provider_payment_id AND ec.kind = 'PIX' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE extra_charges ec SET status = p_status, raw = p_raw, updated_at = now() WHERE ec.id = v.id;
  IF p_status = 'approved' AND v.status IS DISTINCT FROM 'approved' THEN
    IF v.product = 'CREDITOS' THEN
      SELECT p.tenant_id INTO v_tenant FROM profiles p WHERE p.user_id = v.user_id;
      PERFORM grant_bonus_credits(v.user_id, v_tenant, 'PACK_' || v.id::text, v.credits);
    ELSE
      PERFORM extra_activate(v.user_id, v.product, 'PIX', NULL, 0);
    END IF;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v.user_id, 'EXTRA_PIX_APPROVED', v.user_id, jsonb_build_object('product', v.product, 'amount_cents', v.amount_cents, 'credits', v.credits));
    PERFORM notify_admin('PAYMENT', v.user_id, 'Extra pago (Pix)',
      who_is(v.user_id) || ' pagou R$ ' || replace(to_char(v.amount_cents / 100.0, 'FM999990.00'), '.', ',') || ' por ' ||
      (CASE v.product WHEN 'COLORIMETRIA' THEN 'Colorimetria' WHEN 'CREDITOS' THEN v.credits || ' créditos de imagem' ELSE 'Cuide-se' END) || ' e foi liberado automaticamente.');
  END IF;
  RETURN QUERY SELECT v.user_id;
END $$;
