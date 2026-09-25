-- Sugestao de "pecas coringa pra comprar", gerada sob demanda a partir do closet real
-- da cliente (nunca automatico). Um resultado por cliente, sobrescrito a cada geracao.
ALTER TABLE profiles ADD COLUMN wardrobe_gap_sufficient boolean;
ALTER TABLE profiles ADD COLUMN wardrobe_gap_reasoning text;
ALTER TABLE profiles ADD COLUMN wardrobe_gap_suggestions jsonb;
ALTER TABLE profiles ADD COLUMN wardrobe_gap_updated_at timestamptz;
