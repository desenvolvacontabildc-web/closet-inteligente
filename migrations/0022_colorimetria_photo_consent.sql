-- Colorimetria passa a usar foto real da cliente; guardamos so o registro de autorizacao
-- (quando ela consentiu), nunca a foto em si -- a foto e usada em memoria e descartada
-- apos a analise da IA, para minimizar retencao de dado biometrico sensivel.
ALTER TABLE style_profiles ADD COLUMN photo_consent_at timestamptz;
