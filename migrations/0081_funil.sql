-- Funil de conversao para a administradora: cadastro -> primeira peca -> primeiro look -> look aprovado -> volta -> pagamento,
-- mais o custo de IA do grupo. Considera so contas reais (sem admin, sem closets filhos e sem arquivadas).
CREATE FUNCTION admin_funnel(p_actor uuid, p_days integer)
RETURNS TABLE(cadastros integer, onboarding integer, com_peca integer, com_look integer, look_aprovado integer, voltou integer,
              com_lembretes integer, pagou integer, ativas integer, em_teste integer, imagens integer, ai_ops integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
  WITH g AS (
    SELECT u.id, u.created_at, u.last_login_at FROM app_users u
    WHERE NOT u.is_admin AND u.parent_user_id IS NULL AND u.archived_at IS NULL
      AND (p_days <= 0 OR u.created_at >= now() - make_interval(days => p_days))
  )
  SELECT
    (SELECT count(*)::int FROM g),
    (SELECT count(*)::int FROM g JOIN profiles p ON p.user_id = g.id WHERE p.onboarding_completed),
    (SELECT count(*)::int FROM g WHERE EXISTS (SELECT 1 FROM closet_items ci WHERE ci.user_id = g.id)),
    (SELECT count(*)::int FROM g WHERE EXISTS (SELECT 1 FROM looks l WHERE l.user_id = g.id AND l.kind NOT IN ('TRIP','ANALYSIS'))
                                     OR EXISTS (SELECT 1 FROM wish_looks w WHERE w.user_id = g.id)),
    (SELECT count(*)::int FROM g WHERE EXISTS (SELECT 1 FROM looks l WHERE l.user_id = g.id AND l.status IN ('APPROVED','WORN'))),
    (SELECT count(*)::int FROM g WHERE g.last_login_at IS NOT NULL AND g.last_login_at >= g.created_at + interval '1 day'),
    (SELECT count(*)::int FROM g WHERE EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = g.id)),
    (SELECT count(*)::int FROM g WHERE EXISTS (SELECT 1 FROM payment_charges pc WHERE pc.user_id = g.id AND pc.status = 'approved')
                                     OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = g.id AND s.cycles_paid > 0)),
    (SELECT count(*)::int FROM g WHERE effective_status(g.id) = 'ACTIVE'),
    (SELECT count(*)::int FROM g WHERE effective_status(g.id) = 'TRIAL'),
    (SELECT count(*)::int FROM image_generation_log il WHERE il.user_id IN (SELECT id FROM g)),
    COALESCE((SELECT sum(a.count)::int FROM ai_usage a WHERE a.user_id IN (SELECT id FROM g)), 0);
END $$;
REVOKE ALL ON FUNCTION admin_funnel(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_funnel(uuid, integer) TO closet_app;

-- Por semana de cadastro (ultimas 8): quantas entraram e quantas chegaram a cada etapa.
CREATE FUNCTION admin_funnel_weeks(p_actor uuid)
RETURNS TABLE(week date, cadastros integer, com_peca integer, com_look integer, pagou integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
  SELECT w::date,
    (SELECT count(*)::int FROM app_users u WHERE NOT u.is_admin AND u.parent_user_id IS NULL AND u.archived_at IS NULL AND date_trunc('week', u.created_at) = w),
    (SELECT count(*)::int FROM app_users u WHERE NOT u.is_admin AND u.parent_user_id IS NULL AND u.archived_at IS NULL AND date_trunc('week', u.created_at) = w
        AND EXISTS (SELECT 1 FROM closet_items ci WHERE ci.user_id = u.id)),
    (SELECT count(*)::int FROM app_users u WHERE NOT u.is_admin AND u.parent_user_id IS NULL AND u.archived_at IS NULL AND date_trunc('week', u.created_at) = w
        AND (EXISTS (SELECT 1 FROM looks l WHERE l.user_id = u.id AND l.kind NOT IN ('TRIP','ANALYSIS')) OR EXISTS (SELECT 1 FROM wish_looks x WHERE x.user_id = u.id))),
    (SELECT count(*)::int FROM app_users u WHERE NOT u.is_admin AND u.parent_user_id IS NULL AND u.archived_at IS NULL AND date_trunc('week', u.created_at) = w
        AND (EXISTS (SELECT 1 FROM payment_charges pc WHERE pc.user_id = u.id AND pc.status = 'approved') OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.cycles_paid > 0)))
  FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w
  ORDER BY w DESC;
END $$;
REVOKE ALL ON FUNCTION admin_funnel_weeks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_funnel_weeks(uuid) TO closet_app;
