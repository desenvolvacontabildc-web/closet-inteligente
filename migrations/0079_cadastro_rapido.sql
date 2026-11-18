-- Cadastro rapido por foto vestida: a foto fica guardada ate a usuaria confirmar as pecas que a IA encontrou.
CREATE TABLE outfit_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  content_type text NOT NULL DEFAULT 'image/jpeg',
  pieces jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outfit_scans_user_idx ON outfit_scans(user_id, created_at DESC);
ALTER TABLE outfit_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfit_scans FORCE ROW LEVEL SECURITY;
CREATE POLICY outfit_scans_self ON outfit_scans FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON outfit_scans TO closet_app;
