-- Mala Inteligente: substitui o formulario simples de "Mala de Viagem" por um assistente
-- em etapas (chips/checkbox, sem texto livre) que cruza destino+clima+agenda+estilo+closet
-- real pra montar uma mala versatil. Cada resposta do questionario fica salva em rascunho
-- (status PLANEJAMENTO) ate a cliente confirmar e gerar (status CONCLUIDA).
CREATE TABLE trip_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  destino text NOT NULL DEFAULT '',
  data_ida date,
  data_volta date,
  transporte text NOT NULL DEFAULT '',
  bagagem text NOT NULL DEFAULT '',
  clima jsonb NOT NULL DEFAULT '{}'::jsonb,
  sensibilidade_termica text NOT NULL DEFAULT 'NORMAL',
  atividades jsonb NOT NULL DEFAULT '[]'::jsonb,
  dress_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  estilo jsonb NOT NULL DEFAULT '[]'::jsonb,
  levar_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  evitar_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  prioridade text NOT NULL DEFAULT '',
  repeticao text NOT NULL DEFAULT '',
  lavanderia text NOT NULL DEFAULT '',
  estrategia text NOT NULL DEFAULT '',
  necessidades jsonb NOT NULL DEFAULT '[]'::jsonb,
  incluir jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PLANEJAMENTO' CHECK (status IN ('PLANEJAMENTO','CONCLUIDA')),
  reasoning text NOT NULL DEFAULT '',
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE trip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_plans_self ON trip_plans FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_plans TO closet_app;

-- Pecas selecionadas pra mala (o "closet reduzido" da viagem), separado dos looks/dia --
-- assim a tela de resultado consegue mostrar "pecas selecionadas" e "looks da viagem"
-- como duas secoes distintas, ambas apontando pras mesmas pecas reais.
CREATE TABLE trip_items (
  trip_id uuid NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES closet_items(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  PRIMARY KEY (trip_id, item_id)
);
ALTER TABLE trip_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_items FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_items_self ON trip_items FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id',true),'')::uuid AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT, DELETE ON trip_items TO closet_app;

-- Liga cada look (kind='TRIP') a um dia/periodo da viagem, pra organizar "DIA 1 - VIAGEM",
-- "DIA 2 - JANTAR" etc. na tela de resultado.
ALTER TABLE looks ADD COLUMN trip_id uuid REFERENCES trip_plans(id) ON DELETE CASCADE;
ALTER TABLE looks ADD COLUMN trip_day integer;
ALTER TABLE looks ADD COLUMN trip_period text NOT NULL DEFAULT '';
