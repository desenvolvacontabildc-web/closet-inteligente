-- Tipo de closet escolhido no cadastro/Perfil: feminino (padrao), masculino ou infantil. Afeta as sugestoes da IA (looks, mala,
-- capsula, o que comprar), o estilo das imagens e quais recursos aparecem (Colorimetria e Cuide-se nao se aplicam ao infantil).
-- No infantil nunca usamos foto de corpo/avatar de crianca: as imagens sao sempre ilustracao generica.
ALTER TABLE profiles
  ADD COLUMN closet_type text NOT NULL DEFAULT 'FEMININO' CHECK (closet_type IN ('FEMININO','MASCULINO','INFANTIL')),
  ADD COLUMN closet_age integer CHECK (closet_age IS NULL OR closet_age BETWEEN 0 AND 17);

CREATE FUNCTION closet_profile(p_user uuid) RETURNS TABLE(closet_type text, closet_age integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.closet_type, p.closet_age FROM profiles p WHERE p.user_id = p_user;
$$;
REVOKE ALL ON FUNCTION closet_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION closet_profile(uuid) TO closet_app;

CREATE FUNCTION set_closet_type(p_user uuid, p_type text, p_age integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_type NOT IN ('FEMININO','MASCULINO','INFANTIL') THEN RAISE EXCEPTION 'Tipo de closet inválido.'; END IF;
  UPDATE profiles SET closet_type = p_type, closet_age = CASE WHEN p_type = 'INFANTIL' THEN p_age ELSE NULL END, updated_at = now() WHERE user_id = p_user;
END $$;
REVOKE ALL ON FUNCTION set_closet_type(uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_closet_type(uuid,text,integer) TO closet_app;
