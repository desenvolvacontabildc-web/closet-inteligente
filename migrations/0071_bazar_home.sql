-- Resumo do Bazar para a tela inicial (feedzinho de novidades): quantas pecas ha disponiveis (de outras usuarias),
-- quantas entraram nos ultimos 7 dias e as mais recentes com foto.
CREATE FUNCTION bazar_home(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH vis AS (
    SELECT b.id, b.kind, b.title, b.price_cents, b.price_unit, b.created_at,
           (SELECT ph.id FROM bazar_photos ph WHERE ph.post_id = b.id ORDER BY ph.created_at LIMIT 1) AS photo_id
    FROM bazar_posts b
    WHERE b.status = 'ACTIVE' AND NOT b.hidden AND b.user_id <> p_user AND bazar_owner_ok(b.user_id)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM vis),
    'alugueis', (SELECT count(*) FROM vis WHERE kind = 'ALUGUEL'),
    'bazar', (SELECT count(*) FROM vis WHERE kind = 'BAZAR'),
    'novas', (SELECT count(*) FROM vis WHERE created_at > now() - interval '7 days'),
    'latest', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, kind, title, price_cents, price_unit, photo_id FROM vis WHERE photo_id IS NOT NULL ORDER BY created_at DESC LIMIT 4) x), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION bazar_home(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_home(uuid) TO closet_app;
