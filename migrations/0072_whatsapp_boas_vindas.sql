-- WhatsApp da usuaria (pedido no cadastro): usado para as boas-vindas da Aura (assistente) e suporte.
-- welcome_sent_at controla quem ja recebeu a mensagem de boas-vindas; quem ja existe nao recebe de novo.
ALTER TABLE profiles ADD COLUMN whatsapp text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN welcome_sent_at timestamptz;
UPDATE profiles SET welcome_sent_at = now();

-- Salva o WhatsApp da propria usuaria (so digitos, com 55). Vazio apaga. Devolve '' se ok, ou a mensagem de erro.
CREATE FUNCTION set_my_whatsapp(p_user uuid, p_whatsapp text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_digits text;
BEGIN
  v_digits := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
  IF v_digits = '' THEN
    UPDATE profiles SET whatsapp = '' WHERE user_id = p_user;
    RETURN '';
  END IF;
  IF length(v_digits) IN (10,11) THEN v_digits := '55' || v_digits; END IF;
  IF length(v_digits) NOT IN (12,13) OR left(v_digits,2) <> '55' THEN
    RETURN 'Informe o seu WhatsApp com DDD (ex.: 81 98888-7777).';
  END IF;
  UPDATE profiles SET whatsapp = v_digits WHERE user_id = p_user;
  RETURN '';
END $$;
REVOKE ALL ON FUNCTION set_my_whatsapp(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_my_whatsapp(uuid,text) TO closet_app;
