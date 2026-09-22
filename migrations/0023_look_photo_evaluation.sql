-- Permite anexar uma foto real (a cliente de fato usando o look) e ter a IA avaliando
-- essa foto -- separado da ilustracao gerada por IA, que e so uma representacao estilizada.
ALTER TABLE looks ADD COLUMN photo_object_key text;
ALTER TABLE looks ADD COLUMN photo_content_type text;
ALTER TABLE looks ADD COLUMN photo_evaluation text;
ALTER TABLE looks ADD COLUMN photo_evaluated_at timestamptz;
