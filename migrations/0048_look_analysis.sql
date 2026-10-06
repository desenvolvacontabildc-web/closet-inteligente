-- "Analisar esse look": a usuaria envia uma foto do que esta vestindo, a IA opina e ela pode
-- salvar como look pronto. Enquanto nao salva, a analise fica como rascunho (kind = 'ANALYSIS'),
-- que nao aparece em Meus looks nem na Home.
ALTER TABLE looks DROP CONSTRAINT looks_kind_check;
ALTER TABLE looks ADD CONSTRAINT looks_kind_check CHECK (kind IN ('MANUAL','SUGGESTED','DAILY','TRIP','ANALYSIS'));

-- Pecas que a IA enxergou na foto: [{"descricao": "...", "closet_item_id": "uuid" | null}]
ALTER TABLE looks ADD COLUMN described_pieces jsonb NOT NULL DEFAULT '[]'::jsonb;
