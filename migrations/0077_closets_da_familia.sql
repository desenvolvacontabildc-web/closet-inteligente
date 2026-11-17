-- Varios closets na mesma conta (ex.: o da mae e o do filho). Cada closet extra e uma "conta filha" (app_users com parent_user_id,
-- sem senha e sem login proprio) com tenant, perfil e assinatura PROPRIOS, entao pecas, looks, limites e plano ficam separados e todo
-- o app continua funcionando sem mudar. A usuaria "troca de closet" (a sessao passa a ser a da conta filha) e paga tudo junto no Pix.

ALTER TABLE app_users ADD COLUMN parent_user_id uuid REFERENCES app_users(id) ON DELETE CASCADE;
CREATE INDEX app_users_parent_idx ON app_users(parent_user_id) WHERE parent_user_id IS NOT NULL;
ALTER TABLE payment_charges ADD COLUMN covers jsonb;

CREATE FUNCTION closet_family_root(p_user uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE(u.parent_user_id, u.id) FROM app_users u WHERE u.id = p_user;
$$;
REVOKE ALL ON FUNCTION closet_family_root(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION closet_family_root(uuid) TO closet_app;

-- Closets da conta (o principal primeiro), com situacao, plano e preco de cada um.
CREATE FUNCTION my_family(p_user uuid)
RETURNS TABLE(user_id uuid, name text, closet_type text, closet_age integer, is_main boolean, status text, plan text, trial_ends_at timestamptz,
              current_period_end timestamptz, price_cents integer, payment_method text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT u.id, COALESCE(p.display_name, '')::text, p.closet_type::text, p.closet_age, u.parent_user_id IS NULL, effective_status(u.id), COALESCE(s.plan, 'ARRUMADA')::text,
         s.trial_ends_at, s.current_period_end, (SELECT pc.base_price_cents FROM plan_config pc WHERE pc.plan = COALESCE(s.plan, 'ARRUMADA')), s.payment_method::text
  FROM app_users u JOIN profiles p ON p.user_id = u.id LEFT JOIN subscriptions s ON s.user_id = u.id
  WHERE u.id = closet_family_root(p_user) OR u.parent_user_id = closet_family_root(p_user)
  ORDER BY (u.parent_user_id IS NOT NULL), u.created_at;
$$;
REVOKE ALL ON FUNCTION my_family(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_family(uuid) TO closet_app;

CREATE FUNCTION family_can_switch(p_from uuid, p_to uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT closet_family_root(p_from) IS NOT NULL AND closet_family_root(p_from) = closet_family_root(p_to);
$$;
REVOKE ALL ON FUNCTION family_can_switch(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION family_can_switch(uuid,uuid) TO closet_app;

-- Cria um closet extra. Se a conta principal esta no teste gratis, o novo closet usa o mesmo teste; se ja e assinante, o novo closet
-- comeca aguardando pagamento (e liberado quando a usuaria paga, no Pix conjunto ou no cartao).
CREATE FUNCTION add_child_closet(p_parent uuid, p_name text, p_type text, p_age integer, p_plan text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_root uuid; v_new uuid; v_tenant uuid; v_n integer; v_code text; v_trial timestamptz; v_sub subscriptions%ROWTYPE; v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  v_root := closet_family_root(p_parent);
  IF v_root IS NULL THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF char_length(v_name) < 1 OR char_length(v_name) > 40 THEN RAISE EXCEPTION 'Dê um nome ao closet (até 40 letras).'; END IF;
  IF p_type NOT IN ('FEMININO','MASCULINO','INFANTIL') THEN RAISE EXCEPTION 'Tipo de closet inválido.'; END IF;
  IF p_plan NOT IN ('ARRUMADA','FASHION','SUPER_STAR') THEN RAISE EXCEPTION 'Plano inválido.'; END IF;
  IF p_age IS NOT NULL AND (p_age < 0 OR p_age > 17) THEN RAISE EXCEPTION 'Idade inválida.'; END IF;
  SELECT count(*) INTO v_n FROM app_users u WHERE u.id = v_root OR u.parent_user_id = v_root;
  IF v_n >= 5 THEN RAISE EXCEPTION 'Cada conta pode ter até 5 closets.'; END IF;
  SELECT * INTO v_sub FROM subscriptions s WHERE s.user_id = v_root;
  IF FOUND AND v_sub.status = 'TRIAL' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > now() THEN v_trial := v_sub.trial_ends_at;
  ELSE v_trial := now() - interval '1 second'; END IF;
  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  INSERT INTO app_users(email, password_hash, terms_accepted_at, referral_code, parent_user_id)
    VALUES ('closet-' || v_code || '@closets.invalid', NULL, (SELECT u.terms_accepted_at FROM app_users u WHERE u.id = v_root), v_code, v_root) RETURNING id INTO v_new;
  INSERT INTO tenants DEFAULT VALUES RETURNING id INTO v_tenant;
  INSERT INTO tenant_memberships(tenant_id, user_id) VALUES (v_tenant, v_new);
  INSERT INTO profiles(user_id, tenant_id, display_name, onboarding_completed, experience_tokens, city, answers, closet_type, closet_age)
    SELECT v_new, v_tenant, v_name, true, p.experience_tokens, p.city, p.answers, p_type, CASE WHEN p_type = 'INFANTIL' THEN p_age END FROM profiles p WHERE p.user_id = v_root;
  INSERT INTO subscriptions(user_id, status, plan, trial_ends_at) VALUES (v_new, 'TRIAL', p_plan, v_trial);
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_parent, 'ADD_CLOSET', v_new, jsonb_build_object('type', p_type, 'plan', p_plan, 'name', v_name));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION add_child_closet(uuid,text,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_child_closet(uuid,text,text,integer,text) TO closet_app;

-- Pagamento conjunto: monta o que a cobranca cobre (plano e preco de cada closet) SEMPRE a partir do banco, nunca do navegador.
CREATE FUNCTION family_cover(p_payer uuid, p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_root uuid := closet_family_root(p_payer); v jsonb; v_total integer; v_cnt integer;
BEGIN
  IF v_root IS NULL THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RAISE EXCEPTION 'Escolha ao menos um closet.'; END IF;
  SELECT count(*) INTO v_cnt FROM app_users u WHERE u.id = ANY(p_ids) AND (u.id = v_root OR u.parent_user_id = v_root);
  IF v_cnt <> (SELECT count(DISTINCT x) FROM unnest(p_ids) x) THEN RAISE EXCEPTION 'Closet inválido.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('user_id', u.id, 'plan', COALESCE(s.plan, 'ARRUMADA'), 'amount_cents', (SELECT pc.base_price_cents FROM plan_config pc WHERE pc.plan = COALESCE(s.plan, 'ARRUMADA')))),
         sum((SELECT pc.base_price_cents FROM plan_config pc WHERE pc.plan = COALESCE(s.plan, 'ARRUMADA')))::integer
    INTO v, v_total
    FROM app_users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE u.id = ANY(p_ids);
  RETURN jsonb_build_object('covers', v, 'total_cents', v_total);
END $$;
REVOKE ALL ON FUNCTION family_cover(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION family_cover(uuid,uuid[]) TO closet_app;

CREATE FUNCTION tag_charge_covers(p_user uuid, p_provider_payment_id text, p_covers jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE payment_charges SET covers = p_covers WHERE user_id = p_user AND provider_payment_id = p_provider_payment_id AND kind = 'PIX';
$$;
REVOKE ALL ON FUNCTION tag_charge_covers(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tag_charge_covers(uuid,text,jsonb) TO closet_app;

-- Pix aprovado: igual ao de antes (incluindo a oferta de teste) e, se a cobranca cobre varios closets, ativa cada um com o seu plano.
CREATE OR REPLACE FUNCTION apply_pix_result(p_provider_payment_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_charge payment_charges%ROWTYPE; v_c record;
BEGIN
  SELECT * INTO v_charge FROM payment_charges pc WHERE pc.provider_payment_id = p_provider_payment_id AND pc.kind = 'PIX' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE payment_charges pc SET status = p_status, raw = p_raw, updated_at = now() WHERE pc.id = v_charge.id;
  IF p_status = 'approved' AND v_charge.status IS DISTINCT FROM 'approved' THEN
    IF v_charge.covers IS NOT NULL THEN
      FOR v_c IN SELECT (e->>'user_id')::uuid AS uid, e->>'plan' AS plan, (e->>'amount_cents')::integer AS amt FROM jsonb_array_elements(v_charge.covers) e LOOP
        PERFORM activate_paid_subscription(v_c.uid, v_c.plan, v_c.amt, 'PIX', NULL, 0);
      END LOOP;
    ELSE
      PERFORM activate_paid_subscription(v_charge.user_id, v_charge.plan, v_charge.amount_cents, 'PIX', NULL, 0);
      IF v_charge.offer_code IS NOT NULL THEN
        UPDATE subscriptions s SET
          current_period_end = now() + make_interval(days => COALESCE(v_charge.grant_days, 7)),
          monthly_fee_cents = COALESCE((SELECT pcf.base_price_cents FROM plan_config pcf WHERE pcf.plan = v_charge.plan), s.monthly_fee_cents),
          updated_at = now()
        WHERE s.user_id = v_charge.user_id;
        UPDATE offer_redemptions r SET paid_at = now() WHERE r.user_id = v_charge.user_id AND r.code = v_charge.offer_code;
      END IF;
    END IF;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v_charge.user_id, 'PIX_PAYMENT_APPROVED', v_charge.user_id,
              jsonb_build_object('amount_cents', v_charge.amount_cents, 'plan', v_charge.plan, 'offer', v_charge.offer_code, 'closets', CASE WHEN v_charge.covers IS NULL THEN 1 ELSE jsonb_array_length(v_charge.covers) END));
    PERFORM notify_admin('PAYMENT', v_charge.user_id, 'Pagamento Pix recebido',
      who_is(v_charge.user_id) || ' pagou R$ ' || replace(to_char(v_charge.amount_cents / 100.0, 'FM999990.00'), '.', ',') ||
      CASE WHEN v_charge.covers IS NOT NULL THEN ' (' || jsonb_array_length(v_charge.covers) || ' closets juntos)' WHEN v_charge.offer_code IS NOT NULL THEN ' (oferta de teste ' || v_charge.offer_code || ', ' || COALESCE(v_charge.grant_days, 7) || ' dias)' ELSE '' END ||
      ' e teve o acesso liberado automaticamente.');
  END IF;
  RETURN QUERY SELECT v_charge.user_id;
END $$;

-- Gestao: closets extras aparecem na lista de usuarias com o e-mail e o nome da conta principal.
CREATE OR REPLACE FUNCTION admin_list_accounts(p_actor uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamptz,
              sub_status text, plan text, trial_ends_at timestamptz, monthly_fee_cents integer, discount_cents integer, notes text,
              is_admin boolean, last_login_at timestamptz, provider text, payment_method text, current_period_end timestamptz,
              overdue_since timestamptz, closet_count integer, looks_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
    SELECT u.id, COALESCE(par.email, u.email), CASE WHEN u.parent_user_id IS NOT NULL THEN COALESCE(p.display_name, '') || ' (closet de ' || COALESCE(NULLIF(pp.display_name, ''), par.email) || ')' ELSE p.display_name END, u.created_at,
           effective_status(u.id), COALESCE(s.plan,'ARRUMADA'), s.trial_ends_at,
           COALESCE(s.monthly_fee_cents,0), COALESCE(s.discount_cents,0), COALESCE(s.notes,''),
           u.is_admin, COALESCE(u.last_login_at, par.last_login_at), s.provider, s.payment_method, s.current_period_end, s.overdue_since,
           (SELECT count(*)::int FROM closet_items ci WHERE ci.user_id = u.id),
           (SELECT count(*)::int FROM looks l WHERE l.user_id = u.id)
    FROM app_users u
    LEFT JOIN app_users par ON par.id = u.parent_user_id
    LEFT JOIN profiles pp ON pp.user_id = u.parent_user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at;
END $$;
