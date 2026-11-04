-- Foto padronizada da peca: versao "de catalogo" (so a peca, fundo liso, mesma luz) gerada a partir da foto
-- original. A original nunca e apagada nem alterada: ela segue como referencia para gerar os looks e
-- pode ser vista na tela da peca. As telas passam a mostrar a padronizada quando existir.
ALTER TABLE closet_items
  ADD COLUMN standard_object_key text,
  ADD COLUMN standard_content_type text,
  ADD COLUMN standard_status text CHECK (standard_status IS NULL OR standard_status IN ('DONE','FAILED')),
  ADD COLUMN standard_at timestamptz;
