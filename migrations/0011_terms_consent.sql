ALTER TABLE app_users ADD COLUMN terms_accepted_at timestamptz;

DROP FUNCTION register_account(text,text,text);

CREATE FUNCTION register_account(p_email text, p_password_hash text, p_display_name text, p_terms_accepted boolean)
RETURNS TABLE(user_id uuid, tenant_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT p_terms_accepted THEN
    RAISE EXCEPTION 'É necessário aceitar os Termos de Uso e a Política de Privacidade.';
  END IF;
  INSERT INTO app_users(email,password_hash,terms_accepted_at) VALUES (lower(trim(p_email)),p_password_hash,now()) RETURNING id INTO user_id;
  INSERT INTO tenants DEFAULT VALUES RETURNING id INTO tenant_id;
  INSERT INTO tenant_memberships(tenant_id,user_id) VALUES (tenant_id,user_id);
  INSERT INTO profiles(user_id,tenant_id,display_name) VALUES (user_id,tenant_id,p_display_name);
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION register_account(text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_account(text,text,text,boolean) TO closet_app;

-- Contas criadas antes deste consentimento existir (a fundadora/administradora) são
-- registradas retroativamente, para não ficarem em um limbo de "nunca aceitou".
UPDATE app_users SET terms_accepted_at = now() WHERE terms_accepted_at IS NULL;
