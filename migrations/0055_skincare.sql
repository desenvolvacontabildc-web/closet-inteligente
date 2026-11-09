-- Skincare (Cuide-se): a usuaria responde um questionario, a IA (no papel de especialista em cuidados com a
-- pele) devolve diagnostico e uma rotina de MANHA e de NOITE (com etapas em dias alternados, como esfoliacao e
-- retinoide), com ingredientes a preferir/evitar. A usuaria marca no app o que fez cada dia. Periodicamente
-- (revisar_em_semanas) o app pede um novo questionario.

CREATE TABLE skin_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  review_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX skin_routines_one_active ON skin_routines (user_id) WHERE status = 'ACTIVE';
CREATE INDEX skin_routines_user_idx ON skin_routines (user_id, created_at DESC);
ALTER TABLE skin_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE skin_routines FORCE ROW LEVEL SECURITY;
CREATE POLICY skin_routines_self ON skin_routines FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE ON skin_routines TO closet_app;

-- Etapas feitas por dia (desmarcar = apagar a linha). day e a data local da usuaria (Brasil).
CREATE TABLE skin_logs (
  routine_id uuid NOT NULL REFERENCES skin_routines(id) ON DELETE CASCADE,
  day date NOT NULL,
  step_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  done_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (routine_id, day, step_id)
);
CREATE INDEX skin_logs_day_idx ON skin_logs (user_id, day);
ALTER TABLE skin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE skin_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY skin_logs_self ON skin_logs FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, DELETE ON skin_logs TO closet_app;
