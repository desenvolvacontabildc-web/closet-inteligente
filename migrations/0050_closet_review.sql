-- Revisao periodica do closet: pecas pouco usadas podem ser mantidas (e a pergunta so volta depois
-- de um tempo), doadas ou descartadas. Tambem guarda as sugestoes de compra por tendencia.
ALTER TABLE closet_items
  ADD COLUMN keep_until timestamptz,
  ADD COLUMN last_reviewed_at timestamptz;

ALTER TABLE profiles
  ADD COLUMN closet_review_snooze_until timestamptz,
  ADD COLUMN wardrobe_gap_trends jsonb;
