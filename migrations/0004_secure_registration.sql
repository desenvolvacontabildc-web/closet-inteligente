CREATE OR REPLACE FUNCTION register_account(p_email text, p_password_hash text, p_display_name text)
RETURNS TABLE(user_id uuid, tenant_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO app_users(email,password_hash) VALUES (lower(trim(p_email)),p_password_hash) RETURNING id INTO user_id;
  INSERT INTO tenants DEFAULT VALUES RETURNING id INTO tenant_id;
  INSERT INTO tenant_memberships(tenant_id,user_id) VALUES (tenant_id,user_id);
  INSERT INTO profiles(user_id,tenant_id,display_name) VALUES (user_id,tenant_id,p_display_name);
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION register_account(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_account(text,text,text) TO closet_app;
