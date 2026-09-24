-- Dossie de colorimetria mais completo (paleta, neutros, metais, orientacao de
-- maquiagem/cabelo etc.), guardado como jsonb pra nao precisar de migration nova
-- a cada campo novo que o dossie ganhar.
ALTER TABLE style_profiles ADD COLUMN dossier jsonb NOT NULL DEFAULT '{}'::jsonb;
