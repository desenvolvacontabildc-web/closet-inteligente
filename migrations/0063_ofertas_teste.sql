-- Ofertas de teste (codigos de cadastro): a administradora cria um codigo (ex.: teste199) com plano, preco e dias.
-- Quem se cadastra com o codigo (ou recebe a oferta da administradora) ve na tela de Assinatura "Pague R$ 1,99 no Pix
-- e use o plano por 7 dias". O pagamento passa pelo fluxo normal do Pix (webhook do Mercado Pago), so que libera
-- `days` dias em vez de 30 e o preco da oferta. Serve para as testadoras validarem o pagamento de verdade, pagando pouco.

CREATE TABLE signup_offers (
  code text PRIMARY KEY CHECK (code = lower(code) AND code ~ '^[a-z0-9_-]{3,32}$'),
  label text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT 'ARRUMADA' CHECK (plan IN ('ARRUMADA','FASHION','SUPER_STAR')),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 100 AND 100000),
  days integer NOT NULL DEFAULT 7 CHECK (days BETWEEN 1 AND 90),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE offer_redemptions (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  code text NOT NULL REFERENCES signup_offers(code),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
ALTER TABLE signup_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON signup_offers, offer_redemptions FROM PUBLIC;

ALTER TABLE payment_charges ADD COLUMN offer_code text, ADD COLUMN grant_days integer;

-- Usa o codigo no cadastro (sem sessao ainda). Devolve '' se deu certo (ou se nao havia codigo) e a mensagem de erro se nao.
CREATE FUNCTION claim_offer(p_user uuid, p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE o signup_offers%ROWTYPE; v_code text := lower(btrim(coalesce(p_code, '')));
BEGIN
  IF v_code = '' THEN RETURN ''; END IF;
  SELECT * INTO o FROM signup_offers WHERE code = v_code FOR UPDATE;
  IF NOT FOUND OR NOT o.active OR (o.expires_at IS NOT NULL AND o.expires_at < now()) THEN
    RETURN 'Código de teste inválido ou expirado.';
  END IF;
  IF EXISTS (SELECT 1 FROM offer_redemptions WHERE user_id = p_user) THEN RETURN ''; END IF;
  IF o.max_uses IS NOT NULL AND o.uses >= o.max_uses THEN
    RETURN 'Este código de teste já atingiu o limite de usos.';
  END IF;
  INSERT INTO offer_redemptions(user_id, code) VALUES (p_user, v_code);
  UPDATE signup_offers SET uses = uses + 1 WHERE code = v_code;
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION claim_offer(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_offer(uuid,text) TO closet_app;

-- Oferta ainda nao paga da usuaria (a tela de Assinatura mostra o botao enquanto existir).
CREATE FUNCTION my_offer(p_user uuid)
RETURNS TABLE(code text, label text, plan text, price_cents integer, days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT o.code, o.label, o.plan, o.price_cents, o.days
  FROM offer_redemptions r JOIN signup_offers o ON o.code = r.code
  WHERE r.user_id = p_user AND r.paid_at IS NULL;
$$;
REVOKE ALL ON FUNCTION my_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_offer(uuid) TO closet_app;

-- Marca a cobranca Pix criada como sendo da oferta (o webhook usa isso para liberar so `days` dias).
CREATE FUNCTION tag_charge_offer(p_user uuid, p_provider_payment_id text, p_code text, p_days integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE payment_charges SET offer_code = p_code, grant_days = p_days
  WHERE user_id = p_user AND provider_payment_id = p_provider_payment_id AND kind = 'PIX';
$$;
REVOKE ALL ON FUNCTION tag_charge_offer(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tag_charge_offer(uuid,text,text,integer) TO closet_app;

-- Pix aprovado: igual ao de antes e, se a cobranca era de oferta, libera so os dias da oferta e fecha a oferta.
CREATE OR REPLACE FUNCTION apply_pix_result(p_provider_payment_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_charge payment_charges%ROWTYPE;
BEGIN
  SELECT * INTO v_charge FROM payment_charges pc WHERE pc.provider_payment_id = p_provider_payment_id AND pc.kind = 'PIX' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE payment_charges pc SET status = p_status, raw = p_raw, updated_at = now() WHERE pc.id = v_charge.id;
  IF p_status = 'approved' AND v_charge.status IS DISTINCT FROM 'approved' THEN
    PERFORM activate_paid_subscription(v_charge.user_id, v_charge.plan, v_charge.amount_cents, 'PIX', NULL, 0);
    IF v_charge.offer_code IS NOT NULL THEN
      UPDATE subscriptions s SET
        current_period_end = now() + make_interval(days => COALESCE(v_charge.grant_days, 7)),
        monthly_fee_cents = COALESCE((SELECT pcf.base_price_cents FROM plan_config pcf WHERE pcf.plan = v_charge.plan), s.monthly_fee_cents),
        updated_at = now()
      WHERE s.user_id = v_charge.user_id;
      UPDATE offer_redemptions r SET paid_at = now() WHERE r.user_id = v_charge.user_id AND r.code = v_charge.offer_code;
    END IF;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v_charge.user_id, 'PIX_PAYMENT_APPROVED', v_charge.user_id,
              jsonb_build_object('amount_cents', v_charge.amount_cents, 'plan', v_charge.plan, 'offer', v_charge.offer_code));
    PERFORM notify_admin('PAYMENT', v_charge.user_id, 'Pagamento Pix recebido',
      who_is(v_charge.user_id) || ' pagou R$ ' || replace(to_char(v_charge.amount_cents / 100.0, 'FM999990.00'), '.', ',') ||
      CASE WHEN v_charge.offer_code IS NOT NULL THEN ' (oferta de teste ' || v_charge.offer_code || ', ' || COALESCE(v_charge.grant_days, 7) || ' dias)' ELSE '' END ||
      ' e teve o plano ' || v_charge.plan || ' liberado automaticamente.');
  END IF;
  RETURN QUERY SELECT v_charge.user_id;
END $$;

-- ---------- administradora
CREATE FUNCTION admin_list_offers(p_actor uuid)
RETURNS TABLE(code text, label text, plan text, price_cents integer, days integer, max_uses integer, uses integer, expires_at timestamptz, active boolean, paid bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT o.code, o.label, o.plan, o.price_cents, o.days, o.max_uses, o.uses, o.expires_at, o.active,
    (SELECT count(*) FROM offer_redemptions r WHERE r.code = o.code AND r.paid_at IS NOT NULL)
    FROM signup_offers o ORDER BY o.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION admin_list_offers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_offers(uuid) TO closet_app;

CREATE FUNCTION admin_list_redemptions(p_actor uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, code text, redeemed_at timestamptz, paid_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT r.user_id, u.email::text, COALESCE((SELECT p.display_name FROM profiles p WHERE p.user_id = r.user_id), '')::text, r.code, r.redeemed_at, r.paid_at
    FROM offer_redemptions r JOIN app_users u ON u.id = r.user_id ORDER BY r.redeemed_at DESC LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION admin_list_redemptions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_redemptions(uuid) TO closet_app;

CREATE FUNCTION admin_save_offer(p_actor uuid, p_code text, p_label text, p_plan text, p_price integer, p_days integer, p_max integer, p_expires timestamptz, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  INSERT INTO signup_offers(code, label, plan, price_cents, days, max_uses, expires_at, active)
    VALUES (lower(btrim(p_code)), COALESCE(p_label, ''), p_plan, p_price, p_days, p_max, p_expires, p_active)
    ON CONFLICT (code) DO UPDATE SET label = excluded.label, plan = excluded.plan, price_cents = excluded.price_cents,
      days = excluded.days, max_uses = excluded.max_uses, expires_at = excluded.expires_at, active = excluded.active;
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
    VALUES (p_actor, 'ADMIN_SAVE_OFFER', NULL, jsonb_build_object('code', lower(btrim(p_code)), 'plan', p_plan, 'price_cents', p_price, 'days', p_days, 'active', p_active));
END $$;
REVOKE ALL ON FUNCTION admin_save_offer(uuid,text,text,text,integer,integer,integer,timestamptz,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_save_offer(uuid,text,text,text,integer,integer,integer,timestamptz,boolean) TO closet_app;

-- Aplica uma oferta a uma usuaria que ja existe (troca a oferta anterior se ela ainda nao pagou).
CREATE FUNCTION admin_assign_offer(p_actor uuid, p_user uuid, p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_code text := lower(btrim(coalesce(p_code, ''))); r offer_redemptions%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM signup_offers WHERE code = v_code AND active) THEN RETURN 'Oferta inexistente ou desativada.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_user) THEN RETURN 'Usuária não encontrada.'; END IF;
  SELECT * INTO r FROM offer_redemptions WHERE user_id = p_user;
  IF FOUND THEN
    IF r.paid_at IS NOT NULL THEN RETURN 'Esta usuária já pagou uma oferta de teste.'; END IF;
    IF r.code = v_code THEN RETURN ''; END IF;
    UPDATE signup_offers SET uses = greatest(uses - 1, 0) WHERE code = r.code;
    UPDATE offer_redemptions SET code = v_code, redeemed_at = now() WHERE user_id = p_user;
  ELSE
    INSERT INTO offer_redemptions(user_id, code) VALUES (p_user, v_code);
  END IF;
  UPDATE signup_offers SET uses = uses + 1 WHERE code = v_code;
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
    VALUES (p_actor, 'ADMIN_ASSIGN_OFFER', p_user, jsonb_build_object('code', v_code));
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION admin_assign_offer(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_assign_offer(uuid,uuid,text) TO closet_app;

-- Oferta padrao para comecar: R$ 1,99 no Arrumada por 7 dias (a administradora pode editar ou criar outras no painel).
INSERT INTO signup_offers(code, label, plan, price_cents, days, active)
  VALUES ('teste199', 'Teste de pagamento', 'ARRUMADA', 199, 7, true) ON CONFLICT DO NOTHING;
