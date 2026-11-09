-- Custo estimado por imagem ajustado ao consumo real medido na OpenAI (conta Desenvolvacontabil, 3 a 9/11/2026):
-- US$ 5,395 em 174 imagens = US$ 0,031 por imagem, cerca de R$ 0,17 (a R$ 5,50 por dolar). Antes a estimativa
-- era R$ 0,30. E so uma estimativa para o painel da administradora; o gasto real esta na pagina Usage da OpenAI.
CREATE OR REPLACE FUNCTION admin_image_spend(p_actor uuid)
RETURNS TABLE(month_count bigint, estimated_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY
    SELECT count(*), count(*) * 17
    FROM image_generation_log
    WHERE created_at >= date_trunc('month', now());
END $$;
