-- Server-only authentication entry points. No table policies are opened.
CREATE FUNCTION resolve_session(p_hash text)
RETURNS TABLE(user_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT s.user_id, m.tenant_id FROM public.auth_sessions s
  JOIN public.tenant_memberships m ON m.user_id = s.user_id
  WHERE s.token_hash = p_hash AND s.expires_at > now()
  ORDER BY m.tenant_id LIMIT 1;
$$;
CREATE FUNCTION lookup_login(p_email text)
RETURNS TABLE(id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT u.id, u.password_hash FROM public.app_users u
  WHERE lower(u.email) = lower(trim(p_email));
$$;
REVOKE ALL ON FUNCTION resolve_session(text), lookup_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_session(text), lookup_login(text) TO closet_app;
GRANT DELETE ON auth_sessions TO closet_app;
CREATE POLICY sessions_logout ON auth_sessions FOR DELETE TO closet_app
  USING (token_hash = current_setting('app.session_hash', true));
