CREATE TABLE looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  occasion text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'SUGGESTED' CHECK (status IN ('SUGGESTED','PHOTOGRAPHED','APPROVED','WORN','REJECTED','OUTDATED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE looks ENABLE ROW LEVEL SECURITY;
ALTER TABLE looks FORCE ROW LEVEL SECURITY;
CREATE POLICY looks_self ON looks FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON looks TO closet_app;

CREATE TABLE look_items (
  look_id uuid NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES closet_items(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  PRIMARY KEY (look_id, item_id)
);
ALTER TABLE look_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE look_items FORCE ROW LEVEL SECURITY;
CREATE POLICY look_items_self ON look_items FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, DELETE ON look_items TO closet_app;
