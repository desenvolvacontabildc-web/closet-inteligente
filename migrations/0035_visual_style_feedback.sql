-- Preferencia de como a cliente quer visualizar as geracoes de look, e infraestrutura
-- de feedback/looks aprovados (nao apaga nada existente, so acrescenta).
ALTER TABLE profiles ADD COLUMN default_visual_style text NOT NULL DEFAULT 'ILUSTRACAO'
  CHECK (default_visual_style IN ('REALISTA','AVATAR','ILUSTRACAO'));

ALTER TABLE looks ADD COLUMN visual_style text;
ALTER TABLE looks ADD COLUMN approved_at timestamptz;
ALTER TABLE looks ADD COLUMN worn_at timestamptz;

-- Feedback simples (gostei/nao e pra mim) e feedback pos-uso, sem afetar o status
-- do look automaticamente nem as pecas individuais.
CREATE TABLE look_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  look_id uuid NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('LIKE','DISLIKE','POST_USE')),
  sentiment text NOT NULL DEFAULT '',
  context text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE look_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE look_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY look_feedback_self ON look_feedback FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON look_feedback TO closet_app;
