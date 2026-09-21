CREATE TABLE capsules (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reasoning text NOT NULL DEFAULT '',
  combinations_estimate integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE capsules ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsules FORCE ROW LEVEL SECURITY;
CREATE POLICY capsules_self ON capsules FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON capsules TO closet_app;

CREATE TABLE capsule_items (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES closet_items(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, item_id)
);
ALTER TABLE capsule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE capsule_items FORCE ROW LEVEL SECURITY;
CREATE POLICY capsule_items_self ON capsule_items FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, DELETE ON capsule_items TO closet_app;

CREATE TABLE style_profiles (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subtom text NOT NULL DEFAULT '',
  favorable_colors text NOT NULL DEFAULT '',
  avoid_colors text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY style_profiles_self ON style_profiles FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE ON style_profiles TO closet_app;
