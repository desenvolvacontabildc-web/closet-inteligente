-- Foto de corpo inteiro (opcional, com consentimento proprio) usada como referencia
-- pra gerar um avatar ilustrado com as proporcoes da cliente (croqui, sem rosto real,
-- mesma logica de privacidade ja usada nas ilustracoes de look).
ALTER TABLE profiles ADD COLUMN body_photo_object_key text;
ALTER TABLE profiles ADD COLUMN body_photo_content_type text;
ALTER TABLE profiles ADD COLUMN body_photo_consent_at timestamptz;
ALTER TABLE profiles ADD COLUMN avatar_illustration_object_key text;
