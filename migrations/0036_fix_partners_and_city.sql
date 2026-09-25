-- admin_list_partners tinha "id" ambiguo: a funcao RETORNA uma coluna "id" (das
-- parceiras) e o corpo checava "WHERE id = p_actor" contra app_users, sem qualificar
-- a tabela -- o Postgres nao sabia se "id" era a coluna de retorno ou app_users.id,
-- e a funcao sempre estourava erro (nenhuma admin conseguia abrir Administracao de
-- parceiras, silenciosamente cai pra "Acesso restrito" no app).
CREATE OR REPLACE FUNCTION admin_list_partners(p_actor uuid)
RETURNS TABLE(id uuid, store_name text, email text, package text, approved boolean, created_at timestamptz, item_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users au WHERE au.id = p_actor AND au.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT p.id,p.store_name,p.email,p.package,p.approved,p.created_at,
    (SELECT count(*)::int FROM partner_items WHERE partner_id=p.id AND active) FROM partners p ORDER BY p.created_at DESC;
END $$;

-- Cidade da cliente, usada pra puxar o clima atual e levar isso em conta nas sugestões
-- de look (mais leve se estiver quente, casaco se estiver frio, etc).
ALTER TABLE profiles ADD COLUMN city text NOT NULL DEFAULT '';
