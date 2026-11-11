-- Modo de cadastro: 'INVITE' (so quem tem um codigo de convite/oferta valido consegue criar conta) ou 'OPEN' (aberto).
-- Comeca em INVITE, para o link da bio poder divulgar o app sem abrir vaga para quem nao foi selecionada.

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_settings FROM PUBLIC;
INSERT INTO app_settings(key, value) VALUES ('signup_mode', 'INVITE');

CREATE FUNCTION get_signup_mode() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE((SELECT value FROM app_settings WHERE key = 'signup_mode'), 'INVITE');
$$;
REVOKE ALL ON FUNCTION get_signup_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_signup_mode() TO closet_app;

CREATE FUNCTION admin_set_signup_mode(p_actor uuid, p_mode text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_mode NOT IN ('OPEN', 'INVITE') THEN RAISE EXCEPTION 'Modo invalido.'; END IF;
  INSERT INTO app_settings(key, value, updated_at) VALUES ('signup_mode', p_mode, now())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
    VALUES (p_actor, 'ADMIN_SET_SIGNUP_MODE', NULL, jsonb_build_object('mode', p_mode));
END $$;
REVOKE ALL ON FUNCTION admin_set_signup_mode(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_signup_mode(uuid, text) TO closet_app;

-- Confere um codigo SEM usa-lo (para a apresentacao e a pagina inicial decidirem o que mostrar).
-- Devolve '' se o codigo vale e ainda tem vaga; senao, a mensagem.
CREATE FUNCTION check_offer(p_code text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE o signup_offers%ROWTYPE; v_code text := lower(btrim(coalesce(p_code, '')));
BEGIN
  IF v_code = '' THEN RETURN 'Informe o código.'; END IF;
  SELECT * INTO o FROM signup_offers WHERE code = v_code;
  IF NOT FOUND OR NOT o.active OR (o.expires_at IS NOT NULL AND o.expires_at < now()) THEN RETURN 'Código de teste inválido ou expirado.'; END IF;
  IF o.max_uses IS NOT NULL AND o.uses >= o.max_uses THEN RETURN 'Este código de teste já atingiu o limite de usos.'; END IF;
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION check_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_offer(text) TO closet_app;
