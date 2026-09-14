CREATE OR REPLACE FUNCTION create_auth_session(p_token_hash text, p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO auth_sessions(token_hash, user_id, expires_at)
  VALUES (p_token_hash, p_user_id, now() + interval '30 days');
$$;
REVOKE ALL ON FUNCTION create_auth_session(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_auth_session(text, uuid) TO closet_app;
