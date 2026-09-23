-- Atributos estruturados da peca (Personal Stylist), preenchidos pela IA uma unica vez
-- na analise da foto e reaproveitados em toda consulta de looks -- nunca reanalisa a foto
-- de novo pra montar um look. JSONB em vez de colunas rigidas: mais facil de estender
-- sem migration nova a cada novo atributo, e closet_items ja existe (nao duplica entidade).
ALTER TABLE closet_items ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
