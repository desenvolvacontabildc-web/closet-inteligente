-- Autonomia da administradora: acoes em grupo (estender prazo, liberar Colorimetria, creditos), prazo do Pix, dados de contato,
-- painel "Hoje" e a campanha "Colorimetria de brinde para quem assina no cartao recorrente".

-- ---------------------------------------------------------------- 1) chaves do sistema
CREATE OR REPLACE FUNCTION admin_set_flag(p_actor uuid, p_key text, p_value text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_key NOT IN ('images_paused', 'card_gift_colorimetria') OR p_value NOT IN ('0','1') THEN RAISE EXCEPTION 'Chave inválida.'; END IF;
  INSERT INTO app_settings(key, value, updated_at) VALUES (p_key, p_value, now())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'ADMIN_SET_FLAG', NULL, jsonb_build_object('key', p_key, 'value', p_value));
END $$;

-- ---------------------------------------------------------------- 2) Colorimetria de brinde no cartao recorrente
-- Quando a assinatura passa a ATIVA no cartao e a campanha esta ligada, libera a Colorimetria (sem reabrir uma que ja exista).
CREATE FUNCTION card_gift_colorimetria() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.payment_method = 'CARD' AND NEW.status = 'ACTIVE' AND app_flag('card_gift_colorimetria') = '1' THEN
    INSERT INTO user_modules(user_id, module, status, origin) VALUES (NEW.user_id, 'COLORIMETRIA', 'LIBERADA', 'CAMPANHA')
      ON CONFLICT (user_id, module) DO NOTHING;
    IF FOUND THEN
      INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
        VALUES (NEW.user_id, 'GRANT_MODULE', NEW.user_id, jsonb_build_object('module', 'COLORIMETRIA', 'origin', 'CAMPANHA', 'motivo', 'cartao recorrente'));
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION card_gift_colorimetria() FROM PUBLIC;
CREATE TRIGGER subscriptions_card_gift AFTER INSERT OR UPDATE OF status, payment_method ON subscriptions
  FOR EACH ROW WHEN (NEW.payment_method = 'CARD' AND NEW.status = 'ACTIVE') EXECUTE FUNCTION card_gift_colorimetria();

-- campanha ligada por padrao; vale tambem para quem ja assina no cartao
INSERT INTO app_settings(key, value, updated_at) VALUES ('card_gift_colorimetria', '1', now()) ON CONFLICT (key) DO NOTHING;
INSERT INTO user_modules(user_id, module, status, origin)
  SELECT s.user_id, 'COLORIMETRIA', 'LIBERADA', 'CAMPANHA' FROM subscriptions s
  WHERE s.payment_method = 'CARD' AND s.status = 'ACTIVE' AND app_flag('card_gift_colorimetria') = '1'
ON CONFLICT (user_id, module) DO NOTHING;

-- ---------------------------------------------------------------- 3) grupos de usuarias
-- Tipos: TRIAL (teste gratuito), PIX (assinantes no Pix, inclusive o Pix de teste), TRIAL_PIX (os dois), CARD (cartao recorrente), ALL (todas as clientes).
-- p_offer: codigo de cupom (ex.: teste199) ou vazio para qualquer.
CREATE FUNCTION admin_audience(p_actor uuid, p_kind text, p_offer text)
RETURNS TABLE(user_id uuid, display_name text, email text, sub_status text, payment_method text, trial_ends_at timestamptz, current_period_end timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_kind NOT IN ('TRIAL','PIX','TRIAL_PIX','CARD','ALL') THEN RAISE EXCEPTION 'Grupo inválido.'; END IF;
  RETURN QUERY
    SELECT u.id, COALESCE(p.display_name, '')::text, u.email::text, effective_status(u.id), s.payment_method::text, s.trial_ends_at, s.current_period_end
    FROM app_users u JOIN subscriptions s ON s.user_id = u.id LEFT JOIN profiles p ON p.user_id = u.id
    WHERE NOT u.is_admin AND u.archived_at IS NULL AND u.parent_user_id IS NULL
      AND (COALESCE(p_offer, '') = '' OR EXISTS (SELECT 1 FROM offer_redemptions o WHERE o.user_id = u.id AND o.code = lower(p_offer)))
      AND (   p_kind = 'ALL'
           OR (p_kind IN ('TRIAL','TRIAL_PIX') AND s.status = 'TRIAL')
           OR (p_kind IN ('PIX','TRIAL_PIX')   AND s.status = 'ACTIVE' AND s.payment_method = 'PIX')
           OR (p_kind = 'CARD'                 AND s.status = 'ACTIVE' AND s.payment_method = 'CARD'))
    ORDER BY u.created_at;
END $$;
REVOKE ALL ON FUNCTION admin_audience(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_audience(uuid,text,text) TO closet_app;

-- Estende o prazo: teste gratuito (fim do teste) e Pix (fim do periodo). Cartao recorrente nao e alterado (a renovacao e do Mercado Pago).
CREATE FUNCTION admin_group_extend(p_actor uuid, p_kind text, p_offer text, p_days integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_trial int := 0; v_pix int := 0; r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_days < 1 OR p_days > 60 THEN RAISE EXCEPTION 'Informe de 1 a 60 dias.'; END IF;
  FOR r IN SELECT * FROM admin_audience(p_actor, p_kind, p_offer) LOOP
    IF EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = r.user_id AND s.status = 'TRIAL') THEN
      UPDATE subscriptions s SET trial_ends_at = greatest(now(), COALESCE(s.trial_ends_at, now())) + make_interval(days => p_days), updated_at = now() WHERE s.user_id = r.user_id;
      INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'ADMIN_EXTEND_TRIAL', r.user_id, jsonb_build_object('days', p_days, 'grupo', p_kind));
      v_trial := v_trial + 1;
    ELSIF r.payment_method = 'PIX' THEN
      UPDATE subscriptions s SET current_period_end = greatest(now(), COALESCE(s.current_period_end, now())) + make_interval(days => p_days), overdue_since = NULL, updated_at = now() WHERE s.user_id = r.user_id;
      INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'ADMIN_EXTEND_PIX_PERIOD', r.user_id, jsonb_build_object('days', p_days, 'grupo', p_kind));
      v_pix := v_pix + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('trial', v_trial, 'pix', v_pix);
END $$;
REVOKE ALL ON FUNCTION admin_group_extend(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_group_extend(uuid,text,text,integer) TO closet_app;

CREATE FUNCTION admin_group_grant_module(p_actor uuid, p_kind text, p_offer text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_n int := 0; r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  FOR r IN SELECT * FROM admin_audience(p_actor, p_kind, p_offer) LOOP
    -- nao reabre quem ja tem a Colorimetria (liberada ou concluida)
    INSERT INTO user_modules(user_id, module, status, origin) VALUES (r.user_id, 'COLORIMETRIA', 'LIBERADA', 'CAMPANHA') ON CONFLICT (user_id, module) DO NOTHING;
    IF FOUND THEN
      INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'GRANT_MODULE', r.user_id, jsonb_build_object('module', 'COLORIMETRIA', 'origin', 'CAMPANHA', 'grupo', p_kind));
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION admin_group_grant_module(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_group_grant_module(uuid,text,text) TO closet_app;

CREATE FUNCTION admin_group_grant_credits(p_actor uuid, p_kind text, p_offer text, p_credits integer, p_note text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_n int := 0; r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_credits < 1 OR p_credits > 500 THEN RAISE EXCEPTION 'Informe entre 1 e 500 créditos.'; END IF;
  FOR r IN SELECT * FROM admin_audience(p_actor, p_kind, p_offer) LOOP
    BEGIN
      PERFORM admin_grant_credits(p_actor, r.user_id, p_credits, COALESCE(p_note, ''));
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; -- quem ainda nao concluiu o cadastro e ignorada
    END;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION admin_group_grant_credits(uuid,text,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_group_grant_credits(uuid,text,text,integer,text) TO closet_app;

-- ---------------------------------------------------------------- 4) prazo do Pix de uma usuaria
CREATE FUNCTION admin_extend_period(p_actor uuid, p_target uuid, p_days integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_days < 1 OR p_days > 60 THEN RAISE EXCEPTION 'Informe de 1 a 60 dias.'; END IF;
  UPDATE subscriptions s SET current_period_end = greatest(now(), COALESCE(s.current_period_end, now())) + make_interval(days => p_days), overdue_since = NULL, updated_at = now()
    WHERE s.user_id = p_target AND s.status = 'ACTIVE' AND s.payment_method = 'PIX';
  IF NOT FOUND THEN RAISE EXCEPTION 'Só vale para assinantes que pagam no Pix.'; END IF;
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'ADMIN_EXTEND_PIX_PERIOD', p_target, jsonb_build_object('days', p_days));
END $$;
REVOKE ALL ON FUNCTION admin_extend_period(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_extend_period(uuid,uuid,integer) TO closet_app;

-- ---------------------------------------------------------------- 5) dados de contato
CREATE FUNCTION admin_contact_get(p_actor uuid, p_target uuid) RETURNS TABLE(whatsapp text, referred_by_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT COALESCE(p.whatsapp, '')::text,
    (SELECT COALESCE(rp.display_name, r.email)::text FROM app_users u2 JOIN app_users r ON r.id = u2.referred_by LEFT JOIN profiles rp ON rp.user_id = r.id WHERE u2.id = p_target)
    FROM app_users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = p_target;
END $$;
REVOKE ALL ON FUNCTION admin_contact_get(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_contact_get(uuid,uuid) TO closet_app;

CREATE FUNCTION admin_update_contact(p_actor uuid, p_target uuid, p_name text, p_email text, p_whatsapp text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_msg text; v_email text := lower(trim(COALESCE(p_email, '')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RETURN 'Informe um e-mail válido.'; END IF;
  IF EXISTS (SELECT 1 FROM app_users x WHERE lower(x.email) = v_email AND x.id <> p_target) THEN RETURN 'Já existe outra conta com este e-mail.'; END IF;
  SELECT set_my_whatsapp(p_target, p_whatsapp) INTO v_msg;
  IF COALESCE(v_msg, '') <> '' THEN RETURN v_msg; END IF;
  UPDATE app_users SET email = v_email WHERE id = p_target;
  UPDATE profiles SET display_name = left(trim(COALESCE(p_name, '')), 80) WHERE user_id = p_target;
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'ADMIN_UPDATE_CONTACT', p_target, '{}'::jsonb);
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION admin_update_contact(uuid,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_contact(uuid,uuid,text,text,text) TO closet_app;

-- ---------------------------------------------------------------- 6) painel "Hoje"
CREATE FUNCTION admin_today(p_actor uuid) RETURNS TABLE(kind text, user_id uuid, name text, at timestamptz, note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
    SELECT 'NOVA'::text, u.id, COALESCE(p.display_name, u.email)::text, u.created_at, ''::text
      FROM app_users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE NOT u.is_admin AND u.parent_user_id IS NULL AND u.archived_at IS NULL AND u.created_at > now() - interval '24 hours'
    UNION ALL
    SELECT 'TESTE_ACABA', u.id, COALESCE(p.display_name, u.email)::text, s.trial_ends_at, ''
      FROM subscriptions s JOIN app_users u ON u.id = s.user_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE s.status = 'TRIAL' AND NOT u.is_admin AND u.archived_at IS NULL AND s.trial_ends_at BETWEEN now() AND now() + interval '3 days'
    UNION ALL
    SELECT CASE WHEN s.current_period_end < now() THEN 'PIX_ATRASADO' ELSE 'PIX_VENCE' END, u.id, COALESCE(p.display_name, u.email)::text, s.current_period_end, ''
      FROM subscriptions s JOIN app_users u ON u.id = s.user_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE s.status IN ('ACTIVE','PAST_DUE') AND s.payment_method = 'PIX' AND NOT u.is_admin AND u.archived_at IS NULL
        AND s.current_period_end BETWEEN now() - interval '6 days' AND now() + interval '3 days'
    UNION ALL
    SELECT 'CARTAO_ATRASADO', u.id, COALESCE(p.display_name, u.email)::text, s.overdue_since, ''
      FROM subscriptions s JOIN app_users u ON u.id = s.user_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE s.payment_method = 'CARD' AND s.overdue_since IS NOT NULL AND NOT u.is_admin AND u.archived_at IS NULL
    ORDER BY 4;
END $$;
REVOKE ALL ON FUNCTION admin_today(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_today(uuid) TO closet_app;
