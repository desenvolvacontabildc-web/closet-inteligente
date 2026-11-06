-- Cronograma Capilar (Cuide-se): a usuaria responde um questionario, a IA (no papel de especialista em
-- cabelos) devolve um diagnostico e um cronograma por semanas (hidratacao, nutricao, reconstrucao...),
-- com ingredientes a preferir/evitar em cada etapa. A usuaria registra no app cada etapa feita. Quando o
-- ciclo termina (periodo estimado pela necessidade do cabelo), um novo questionario gera novo ciclo.

CREATE TABLE hair_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  weeks integer NOT NULL CHECK (weeks BETWEEN 2 AND 12),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- No maximo um ciclo ativo por usuaria.
CREATE UNIQUE INDEX hair_cycles_one_active ON hair_cycles (user_id) WHERE status = 'ACTIVE';
CREATE INDEX hair_cycles_user_idx ON hair_cycles (user_id, created_at DESC);
ALTER TABLE hair_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hair_cycles FORCE ROW LEVEL SECURITY;
CREATE POLICY hair_cycles_self ON hair_cycles FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE ON hair_cycles TO closet_app;

-- Etapas ja feitas (uma linha por etapa concluida; desfazer = apagar a linha).
CREATE TABLE hair_cycle_logs (
  cycle_id uuid NOT NULL REFERENCES hair_cycles(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  done_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, step_id)
);
ALTER TABLE hair_cycle_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hair_cycle_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY hair_cycle_logs_self ON hair_cycle_logs FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, DELETE ON hair_cycle_logs TO closet_app;
