-- Notificacoes no celular (Web Push) e lembretes: skincare, cronograma capilar, teste gratis acabando e Pix vencendo.
-- A usuaria ativa no Perfil; o servidor envia no horario certo (uma vez por dia por tipo de lembrete, controlado em push_log).
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 800),
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);
CREATE TABLE push_log (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  day date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, day)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_subscriptions, push_log FROM PUBLIC;

CREATE FUNCTION save_push_subscription(p_user uuid, p_endpoint text, p_p256dh text, p_auth text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth) VALUES (p_user, p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;
REVOKE ALL ON FUNCTION save_push_subscription(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_push_subscription(uuid,text,text,text) TO closet_app;

CREATE FUNCTION delete_push_subscription(p_user uuid, p_endpoint text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM push_subscriptions WHERE user_id = p_user AND endpoint = p_endpoint;
$$;
REVOKE ALL ON FUNCTION delete_push_subscription(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_push_subscription(uuid,text) TO closet_app;

-- Usado pelo servidor quando o aparelho recusa a notificacao (inscricao expirada).
CREATE FUNCTION delete_push_endpoint(p_endpoint text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
$$;
REVOKE ALL ON FUNCTION delete_push_endpoint(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_push_endpoint(text) TO closet_app;

CREATE FUNCTION push_targets() RETURNS TABLE(user_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT s.user_id, s.endpoint, s.p256dh, s.auth FROM push_subscriptions s JOIN app_users u ON u.id = s.user_id WHERE u.archived_at IS NULL;
$$;
REVOKE ALL ON FUNCTION push_targets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_targets() TO closet_app;

-- true se este lembrete ainda nao foi enviado hoje para a usuaria (e ja o marca como enviado).
CREATE FUNCTION push_mark(p_user uuid, p_kind text, p_day date) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO push_log(user_id, kind, day) VALUES (p_user, p_kind, p_day) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION push_mark(uuid,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_mark(uuid,text,date) TO closet_app;

CREATE FUNCTION my_push_count(p_user uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*)::int FROM push_subscriptions WHERE user_id = p_user;
$$;
REVOKE ALL ON FUNCTION my_push_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_push_count(uuid) TO closet_app;

CREATE FUNCTION admin_push_stats(p_actor uuid) RETURNS TABLE(devices integer, users integer, sent_7d integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT (SELECT count(*)::int FROM push_subscriptions), (SELECT count(DISTINCT s.user_id)::int FROM push_subscriptions s),
                      (SELECT count(*)::int FROM push_log l WHERE l.sent_at > now() - interval '7 days');
END $$;
REVOKE ALL ON FUNCTION admin_push_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_push_stats(uuid) TO closet_app;
