-- Looks com peças que a usuária ainda NÃO tem: a IA monta o look do zero (ou a partir de uma peça) e diz o que vale comprar para fechá-lo.
-- Cada peça do look é "CLOSET" (já tem) ou "BUY" (comprar); a lista de compras sai das peças BUY. Pode virar imagem (ilustração) sob demanda.
CREATE TABLE wish_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  occasion text NOT NULL DEFAULT '',
  mode text NOT NULL CHECK (mode IN ('ZERO','PECA')),
  pieces jsonb NOT NULL DEFAULT '[]'::jsonb,
  tip text NOT NULL DEFAULT '',
  illustration_object_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wish_looks_user_idx ON wish_looks(user_id, created_at DESC);
ALTER TABLE wish_looks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wish_looks FORCE ROW LEVEL SECURITY;
CREATE POLICY wish_looks_self ON wish_looks FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON wish_looks TO closet_app;
