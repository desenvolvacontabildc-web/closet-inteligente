-- Recompensa por indicacao: quem indica 10 amigas que viram assinantes (cada uma gera um credito 'REFERRAL_<id>' em
-- credit_grants na primeira vez que ela paga) ganha a Colorimetria de presente. Como e um gatilho sobre credit_grants,
-- vale para qualquer caminho de ativacao (Pix, cartao ou liberacao manual da administradora) e nunca duplica.

CREATE FUNCTION referral_colorimetria_reward() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF left(NEW.reason, 9) = 'REFERRAL_'
     AND (SELECT count(*) FROM credit_grants g WHERE g.user_id = NEW.user_id AND left(g.reason, 9) = 'REFERRAL_') >= 10 THEN
    INSERT INTO user_modules(user_id, module, status, origin) VALUES (NEW.user_id, 'COLORIMETRIA', 'LIBERADA', 'INDICACAO')
      ON CONFLICT (user_id, module) DO NOTHING;
    IF FOUND THEN
      PERFORM notify_admin('PAYMENT', NEW.user_id, 'Colorimetria liberada por indicação',
        who_is(NEW.user_id) || ' indicou 10 amigas assinantes e ganhou a Colorimetria de presente.');
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION referral_colorimetria_reward() FROM PUBLIC;

CREATE TRIGGER credit_grants_referral_reward AFTER INSERT ON credit_grants
  FOR EACH ROW EXECUTE FUNCTION referral_colorimetria_reward();
