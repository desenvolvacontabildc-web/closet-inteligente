-- Applied by the administrative migration connection, never the web role.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'closet_app') THEN
    CREATE ROLE closet_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_users_email_unique ON app_users (lower(email));

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX tenant_memberships_user_idx ON tenant_memberships(user_id);

CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES app_users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users FORCE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY users_self ON app_users FOR SELECT TO closet_app
  USING (id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY memberships_self ON tenant_memberships FOR SELECT TO closet_app
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenants_member ON tenants FOR SELECT TO closet_app
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM tenant_memberships m WHERE m.tenant_id = tenants.id));
CREATE POLICY sessions_token ON auth_sessions FOR SELECT TO closet_app
  USING (token_hash = current_setting('app.session_hash', true) AND expires_at > now());

GRANT USAGE ON SCHEMA public TO closet_app;
-- No write grants yet: registration and business operations are not implemented.
GRANT SELECT ON app_users, tenants, tenant_memberships, auth_sessions TO closet_app;
