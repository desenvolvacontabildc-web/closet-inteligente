CREATE TABLE ai_usage (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_self ON ai_usage FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE ON ai_usage TO closet_app;
