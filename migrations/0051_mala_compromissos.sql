-- Mala Inteligente v2: a mala passa a ser montada a partir dos COMPROMISSOS da viagem (cada um com
-- periodo dia/noite, tipo, dress code e detalhe), do motivo (passeio/trabalho/misto) e da
-- quantidade de dias, para gerar um look por compromisso em vez de looks genericos.
ALTER TABLE trip_plans
  ADD COLUMN objetivo text NOT NULL DEFAULT '',
  ADD COLUMN dias integer CHECK (dias IS NULL OR (dias >= 1 AND dias <= 60)),
  ADD COLUMN eventos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Trocar uma peca de um look da mala = apagar a ligacao antiga e criar a nova (look_items nao tem UPDATE).
-- Nada novo a conceder: look_items ja tem SELECT/INSERT/DELETE e trip_items tem SELECT/INSERT/DELETE.
