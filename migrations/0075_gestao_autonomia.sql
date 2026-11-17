-- Gestao com mais autonomia para a administradora:
--  1) conta da usuaria em modo suporte (somente leitura): pecas, looks, imagens, mala, uso; cada acesso fica registrado;
--  2) uso e custos (por usuaria e por mes);
--  3) comunicados que aparecem no app;
--  4) chave para pausar a geracao de imagens;
--  5) estender o teste gratis de uma usuaria.
-- Tudo passa por funcoes SECURITY DEFINER que exigem is_admin; fotos de perfil/corpo e respostas de colorimetria nao sao expostas.

-- ---------------------------------------------------------------- 1) conta da usuaria (suporte)
CREATE FUNCTION admin_log_view(p_actor uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_log l WHERE l.actor_user_id = p_actor AND l.target_user_id = p_target AND l.action = 'ADMIN_VIEW_ACCOUNT' AND l.created_at > now() - interval '10 minutes') THEN
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'ADMIN_VIEW_ACCOUNT', p_target, '{}'::jsonb);
  END IF;
END $$;
REVOKE ALL ON FUNCTION admin_log_view(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_log_view(uuid,uuid) TO closet_app;

CREATE FUNCTION admin_account_summary(p_actor uuid, p_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  SELECT jsonb_build_object(
    'items_by_status', COALESCE((SELECT jsonb_object_agg(t.status, t.n) FROM (SELECT ci.status, count(*)::int n FROM closet_items ci WHERE ci.user_id = p_target GROUP BY ci.status) t), '{}'::jsonb),
    'items_with_catalog_photo', (SELECT count(*)::int FROM closet_items ci WHERE ci.user_id = p_target AND ci.standard_object_key IS NOT NULL),
    'looks_by_status', COALESCE((SELECT jsonb_object_agg(t.status, t.n) FROM (SELECT l.status, count(*)::int n FROM looks l WHERE l.user_id = p_target GROUP BY l.status) t), '{}'::jsonb),
    'looks_with_image', (SELECT count(*)::int FROM looks l WHERE l.user_id = p_target AND l.illustration_object_key IS NOT NULL),
    'images_month_look', (SELECT count(*)::int FROM image_generation_log g WHERE g.user_id = p_target AND g.kind = 'LOOK' AND g.created_at >= date_trunc('month', now())),
    'images_month_catalog', (SELECT count(*)::int FROM image_generation_log g WHERE g.user_id = p_target AND g.kind = 'CATALOG' AND g.created_at >= date_trunc('month', now())),
    'images_total', (SELECT count(*)::int FROM image_generation_log g WHERE g.user_id = p_target),
    'ai_ops_month', COALESCE((SELECT sum(u.count)::int FROM ai_usage u WHERE u.user_id = p_target AND u.day >= date_trunc('month', current_date)::date), 0),
    'ai_ops_total', COALESCE((SELECT sum(u.count)::int FROM ai_usage u WHERE u.user_id = p_target), 0),
    'trips', (SELECT count(*)::int FROM trip_plans t WHERE t.user_id = p_target),
    'bazar_posts', (SELECT count(*)::int FROM bazar_posts b WHERE b.user_id = p_target),
    'onboarding_completed', COALESCE((SELECT p.onboarding_completed FROM profiles p WHERE p.user_id = p_target), false),
    'has_style_profile', EXISTS (SELECT 1 FROM style_profiles s WHERE s.user_id = p_target AND s.dossier IS NOT NULL AND s.dossier <> '{}'::jsonb),
    'skin_routines', (SELECT count(*)::int FROM skin_routines r WHERE r.user_id = p_target),
    'hair_cycles', (SELECT count(*)::int FROM hair_cycles h WHERE h.user_id = p_target)
  ) INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION admin_account_summary(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_account_summary(uuid,uuid) TO closet_app;

CREATE FUNCTION admin_account_items(p_actor uuid, p_target uuid, p_limit integer, p_offset integer)
RETURNS TABLE(id uuid, name text, category text, color text, status text, created_at timestamptz, photo_id uuid, has_catalog boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
    SELECT ci.id, ci.name, ci.category, ci.color, ci.status, ci.created_at,
           (SELECT p.id FROM closet_item_photos p WHERE p.item_id = ci.id ORDER BY p.created_at DESC LIMIT 1),
           ci.standard_object_key IS NOT NULL
    FROM closet_items ci WHERE ci.user_id = p_target
    ORDER BY ci.created_at DESC LIMIT greatest(1, least(p_limit, 200)) OFFSET greatest(0, p_offset);
END $$;
REVOKE ALL ON FUNCTION admin_account_items(uuid,uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_account_items(uuid,uuid,integer,integer) TO closet_app;

CREATE FUNCTION admin_account_looks(p_actor uuid, p_target uuid, p_limit integer)
RETURNS TABLE(id uuid, name text, occasion text, status text, created_at timestamptz, has_image boolean, pieces text[], worn_at timestamptz, visual_style text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
    SELECT l.id, l.name, l.occasion, l.status, l.created_at, l.illustration_object_key IS NOT NULL,
           COALESCE((SELECT array_agg(ci.name ORDER BY ci.name) FROM look_items li JOIN closet_items ci ON ci.id = li.item_id WHERE li.look_id = l.id), ARRAY[]::text[]),
           l.worn_at, l.visual_style
    FROM looks l WHERE l.user_id = p_target
    ORDER BY l.created_at DESC LIMIT greatest(1, least(p_limit, 200));
END $$;
REVOKE ALL ON FUNCTION admin_account_looks(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_account_looks(uuid,uuid,integer) TO closet_app;

CREATE FUNCTION admin_account_image_log(p_actor uuid, p_target uuid)
RETURNS TABLE(created_at timestamptz, kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT g.created_at, g.kind FROM image_generation_log g WHERE g.user_id = p_target ORDER BY g.created_at DESC LIMIT 60;
END $$;
REVOKE ALL ON FUNCTION admin_account_image_log(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_account_image_log(uuid,uuid) TO closet_app;

CREATE FUNCTION admin_account_trips(p_actor uuid, p_target uuid)
RETURNS TABLE(id uuid, destino text, dias integer, status text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT t.id, t.destino, t.dias, t.status, t.created_at FROM trip_plans t WHERE t.user_id = p_target ORDER BY t.created_at DESC LIMIT 20;
END $$;
REVOKE ALL ON FUNCTION admin_account_trips(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_account_trips(uuid,uuid) TO closet_app;

-- Arquivos: so fotos de pecas e imagens de looks (nunca avatar, foto de corpo ou foto de colorimetria).
CREATE FUNCTION admin_photo_object(p_actor uuid, p_photo_id uuid)
RETURNS TABLE(object_key text, content_type text, standard_object_key text, standard_content_type text, is_latest boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
    SELECT p.object_key, p.content_type, ci.standard_object_key, ci.standard_content_type,
           p.id = (SELECT p2.id FROM closet_item_photos p2 WHERE p2.item_id = p.item_id ORDER BY p2.created_at DESC LIMIT 1)
    FROM closet_item_photos p JOIN closet_items ci ON ci.id = p.item_id WHERE p.id = p_photo_id;
END $$;
REVOKE ALL ON FUNCTION admin_photo_object(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_photo_object(uuid,uuid) TO closet_app;

CREATE FUNCTION admin_look_object(p_actor uuid, p_look_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  SELECT l.illustration_object_key INTO v FROM looks l WHERE l.id = p_look_id;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION admin_look_object(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_look_object(uuid,uuid) TO closet_app;

-- ---------------------------------------------------------------- 2) uso e custos
CREATE FUNCTION admin_usage_overview(p_actor uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, sub_status text, plan text, last_login_at timestamptz, images_month integer, look_images_month integer,
              catalog_month integer, ai_ops_month integer, bonus_credits integer, items_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, COALESCE(p.display_name, '')::text, effective_status(u.id), COALESCE(s.plan, 'ARRUMADA')::text, u.last_login_at,
           (SELECT count(*)::int FROM image_generation_log g WHERE g.user_id = u.id AND g.created_at >= date_trunc('month', now())),
           (SELECT count(*)::int FROM image_generation_log g WHERE g.user_id = u.id AND g.kind = 'LOOK' AND g.created_at >= date_trunc('month', now())),
           (SELECT count(*)::int FROM image_generation_log g WHERE g.user_id = u.id AND g.kind = 'CATALOG' AND g.created_at >= date_trunc('month', now())),
           COALESCE((SELECT sum(a.count)::int FROM ai_usage a WHERE a.user_id = u.id AND a.day >= date_trunc('month', current_date)::date), 0),
           COALESCE(p.bonus_image_credits, 0),
           (SELECT count(*)::int FROM closet_items ci WHERE ci.user_id = u.id)
    FROM app_users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN subscriptions s ON s.user_id = u.id
    WHERE u.archived_at IS NULL
    ORDER BY 7 DESC, u.created_at;
END $$;
REVOKE ALL ON FUNCTION admin_usage_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_usage_overview(uuid) TO closet_app;

CREATE FUNCTION admin_usage_months(p_actor uuid)
RETURNS TABLE(month date, images integer, look_images integer, catalog_images integer, ai_ops integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
    SELECT m::date,
      (SELECT count(*)::int FROM image_generation_log g WHERE date_trunc('month', g.created_at) = m),
      (SELECT count(*)::int FROM image_generation_log g WHERE g.kind = 'LOOK' AND date_trunc('month', g.created_at) = m),
      (SELECT count(*)::int FROM image_generation_log g WHERE g.kind = 'CATALOG' AND date_trunc('month', g.created_at) = m),
      COALESCE((SELECT sum(a.count)::int FROM ai_usage a WHERE date_trunc('month', a.day::timestamp) = m), 0)
    FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
    ORDER BY m DESC;
END $$;
REVOKE ALL ON FUNCTION admin_usage_months(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_usage_months(uuid) TO closet_app;

-- ---------------------------------------------------------------- 3) comunicados
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 600),
  audience text NOT NULL DEFAULT 'ALL' CHECK (audience IN ('ALL','TRIAL','PAID')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE announcement_dismissals (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON announcements, announcement_dismissals FROM PUBLIC;

CREATE FUNCTION admin_list_announcements(p_actor uuid)
RETURNS TABLE(id uuid, title text, body text, audience text, starts_at timestamptz, ends_at timestamptz, active boolean, created_at timestamptz, dismissed bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT n.id, n.title, n.body, n.audience, n.starts_at, n.ends_at, n.active, n.created_at,
    (SELECT count(*) FROM announcement_dismissals d WHERE d.announcement_id = n.id)
    FROM announcements n ORDER BY n.created_at DESC LIMIT 50;
END $$;
REVOKE ALL ON FUNCTION admin_list_announcements(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_announcements(uuid) TO closet_app;

CREATE FUNCTION admin_save_announcement(p_actor uuid, p_id uuid, p_title text, p_body text, p_audience text, p_starts timestamptz, p_ends timestamptz, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO announcements(title, body, audience, starts_at, ends_at, active) VALUES (p_title, COALESCE(p_body, ''), p_audience, COALESCE(p_starts, now()), p_ends, p_active);
  ELSE
    UPDATE announcements SET title = p_title, body = COALESCE(p_body, ''), audience = p_audience, starts_at = COALESCE(p_starts, starts_at), ends_at = p_ends, active = p_active WHERE id = p_id;
  END IF;
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'ADMIN_SAVE_ANNOUNCEMENT', NULL, jsonb_build_object('title', p_title, 'audience', p_audience, 'active', p_active));
END $$;
REVOKE ALL ON FUNCTION admin_save_announcement(uuid,uuid,text,text,text,timestamptz,timestamptz,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_save_announcement(uuid,uuid,text,text,text,timestamptz,timestamptz,boolean) TO closet_app;

CREATE FUNCTION admin_delete_announcement(p_actor uuid, p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  DELETE FROM announcements WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION admin_delete_announcement(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_announcement(uuid,uuid) TO closet_app;

CREATE FUNCTION my_announcements(p_user uuid)
RETURNS TABLE(id uuid, title text, body text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT n.id, n.title, n.body FROM announcements n
  WHERE n.active AND n.starts_at <= now() AND (n.ends_at IS NULL OR n.ends_at > now())
    AND NOT EXISTS (SELECT 1 FROM announcement_dismissals d WHERE d.announcement_id = n.id AND d.user_id = p_user)
    AND (n.audience = 'ALL'
         OR (n.audience = 'TRIAL' AND effective_status(p_user) = 'TRIAL')
         OR (n.audience = 'PAID' AND effective_status(p_user) IN ('ACTIVE','PAST_DUE')))
  ORDER BY n.created_at DESC LIMIT 3;
$$;
REVOKE ALL ON FUNCTION my_announcements(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_announcements(uuid) TO closet_app;

CREATE FUNCTION dismiss_announcement(p_user uuid, p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO announcement_dismissals(user_id, announcement_id) SELECT p_user, n.id FROM announcements n WHERE n.id = p_id ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION dismiss_announcement(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dismiss_announcement(uuid,uuid) TO closet_app;

-- ---------------------------------------------------------------- 4) chaves do sistema
CREATE FUNCTION app_flag(p_key text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE((SELECT value FROM app_settings WHERE key = p_key), '0');
$$;
REVOKE ALL ON FUNCTION app_flag(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_flag(text) TO closet_app;

CREATE FUNCTION admin_set_flag(p_actor uuid, p_key text, p_value text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_key NOT IN ('images_paused') OR p_value NOT IN ('0','1') THEN RAISE EXCEPTION 'Chave inválida.'; END IF;
  INSERT INTO app_settings(key, value, updated_at) VALUES (p_key, p_value, now())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'ADMIN_SET_FLAG', NULL, jsonb_build_object('key', p_key, 'value', p_value));
END $$;
REVOKE ALL ON FUNCTION admin_set_flag(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_flag(uuid,text,text) TO closet_app;

-- ---------------------------------------------------------------- 5) estender o teste gratis
CREATE FUNCTION admin_extend_trial(p_actor uuid, p_target uuid, p_days integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_days < 1 OR p_days > 60 THEN RAISE EXCEPTION 'Informe de 1 a 60 dias.'; END IF;
  UPDATE subscriptions s SET trial_ends_at = greatest(now(), COALESCE(s.trial_ends_at, now())) + make_interval(days => p_days), updated_at = now()
    WHERE s.user_id = p_target AND s.status = 'TRIAL';
  IF NOT FOUND THEN RAISE EXCEPTION 'Só vale para contas em teste gratuito (ou com o teste encerrado).'; END IF;
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (p_actor, 'ADMIN_EXTEND_TRIAL', p_target, jsonb_build_object('days', p_days));
END $$;
REVOKE ALL ON FUNCTION admin_extend_trial(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_extend_trial(uuid,uuid,integer) TO closet_app;
