ALTER TABLE app_users ADD COLUMN password_hash text;
ALTER TABLE app_users ADD CONSTRAINT app_users_password_hash_format CHECK (password_hash IS NULL OR password_hash ~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$');
GRANT INSERT ON app_users, tenants, tenant_memberships, auth_sessions TO closet_app;
