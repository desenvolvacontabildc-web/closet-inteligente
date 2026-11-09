-- Fotos de catalogo por mes: Arrumada 15, Fashion 20, Super Star 50. Aproveita a folga de custo deixada pelos looks em
-- imagem (15, 30 e 50). Custo de IA no pior caso (imagem a R$ 0,14, pedido de IA a R$ 0,015):
-- Arrumada R$ 6,45 (32%), Fashion R$ 11,50 (29%), Super Star R$ 23,00 (29%).
UPDATE plan_config SET standard_photo_monthly_limit = 15, updated_at = now() WHERE plan = 'ARRUMADA';
UPDATE plan_config SET standard_photo_monthly_limit = 20, updated_at = now() WHERE plan = 'FASHION';
UPDATE plan_config SET standard_photo_monthly_limit = 50, updated_at = now() WHERE plan = 'SUPER_STAR';
