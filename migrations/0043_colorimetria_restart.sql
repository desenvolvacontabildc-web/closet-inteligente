-- Permite a propria cliente refazer o questionario de Colorimetria (ex.: resultado salvo
-- no formato antigo, antes da reforma visual com paleta de cores reais). Nao e admin-gated
-- porque e a dona do proprio modulo que esta pedindo; so reabre o fluxo, nao concede nada
-- que ela nao tivesse.
CREATE FUNCTION restart_my_colorimetria(p_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE user_modules SET status = 'LIBERADA', completed_at = NULL WHERE user_id = p_user AND module = 'COLORIMETRIA';
$$;
REVOKE ALL ON FUNCTION restart_my_colorimetria(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION restart_my_colorimetria(uuid) TO closet_app;
