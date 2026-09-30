ALTER TABLE style_profiles ADD COLUMN answers jsonb NOT NULL DEFAULT '{}'::jsonb;
