-- Looks em imagem por mes definidos pela administradora: Arrumada 15, Fashion 30, Super Star 50.
-- Pedidos de IA e fotos de catalogo seguem como na 0059. Custo de IA no pior caso (imagem a R$ 0,14, pedido a R$ 0,015):
-- Arrumada R$ 5,75 (29%), Fashion R$ 10,38 (26%), Super Star R$ 19,36 (24%).
UPDATE plan_config SET image_gen_monthly_limit = 15, updated_at = now() WHERE plan = 'ARRUMADA';
UPDATE plan_config SET image_gen_monthly_limit = 30, updated_at = now() WHERE plan = 'FASHION';
UPDATE plan_config SET image_gen_monthly_limit = 50, updated_at = now() WHERE plan = 'SUPER_STAR';
