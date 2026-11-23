-- 1) Sugestoes de compras coringa: uma por usuaria por mes (a IA indica o que comprar para combinar com as pecas que ela ja tem).
CREATE TABLE joker_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  month date NOT NULL,
  intro text NOT NULL DEFAULT '',
  pieces jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);
ALTER TABLE joker_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE joker_suggestions FORCE ROW LEVEL SECURITY;
CREATE POLICY joker_suggestions_self ON joker_suggestions FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON joker_suggestions TO closet_app;

-- 2) Questionario de feedback das testadoras (uma resposta por usuaria; pode ser refeita)
CREATE TABLE feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE feedback_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY feedback_self ON feedback_responses FOR ALL TO closet_app
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON feedback_responses TO closet_app;

CREATE FUNCTION admin_feedback_list(p_actor uuid)
RETURNS TABLE(user_id uuid, name text, email text, answers jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT f.user_id, COALESCE(p.display_name, u.email)::text, u.email::text, f.answers, f.updated_at
    FROM feedback_responses f JOIN app_users u ON u.id = f.user_id LEFT JOIN profiles p ON p.user_id = f.user_id ORDER BY f.updated_at DESC;
END $$;
REVOKE ALL ON FUNCTION admin_feedback_list(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_feedback_list(uuid) TO closet_app;

-- 3) Visao de uso por testadora, para personalizar as mensagens
CREATE FUNCTION admin_tester_overview(p_actor uuid)
RETURNS TABLE(user_id uuid, name text, email text, whatsapp text, created_at timestamptz, last_login_at timestamptz, sub_status text, offer_code text,
              pieces integer, looks integer, images integer, ai_ops integer, feedback_done boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
    SELECT u.id, COALESCE(p.display_name, '')::text, u.email::text, COALESCE(p.whatsapp, '')::text, u.created_at, u.last_login_at, effective_status(u.id),
           (SELECT o.code FROM offer_redemptions o WHERE o.user_id = u.id),
           (SELECT count(*)::int FROM closet_items ci WHERE ci.user_id = u.id),
           ((SELECT count(*)::int FROM looks l WHERE l.user_id = u.id AND l.kind <> 'ANALYSIS') + (SELECT count(*)::int FROM wish_looks w WHERE w.user_id = u.id)),
           (SELECT count(*)::int FROM image_generation_log g WHERE g.user_id = u.id),
           COALESCE((SELECT sum(a.count)::int FROM ai_usage a WHERE a.user_id = u.id), 0),
           EXISTS (SELECT 1 FROM feedback_responses f WHERE f.user_id = u.id)
    FROM app_users u LEFT JOIN profiles p ON p.user_id = u.id
    WHERE NOT u.is_admin AND u.archived_at IS NULL AND u.parent_user_id IS NULL AND u.password_hash IS NOT NULL
      AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status <> 'CANCELED')
    ORDER BY u.created_at;
END $$;
REVOKE ALL ON FUNCTION admin_tester_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_tester_overview(uuid) TO closet_app;
