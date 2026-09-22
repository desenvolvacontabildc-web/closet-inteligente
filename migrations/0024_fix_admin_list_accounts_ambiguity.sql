-- admin_list_accounts falhava com "column reference is_admin is ambiguous": a funcao
-- retorna uma coluna chamada is_admin (RETURNS TABLE), e o PL/pgSQL cria uma variavel
-- interna com esse mesmo nome, conflitando com app_users.is_admin na checagem de acesso
-- do ator. O app escondia esse erro e mostrava "Acesso restrito" mesmo para administradoras
-- de verdade. Corrige qualificando a tabela na checagem.
CREATE OR REPLACE FUNCTION admin_list_accounts(p_actor uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamptz,
              sub_status text, plan text, trial_ends_at timestamptz, monthly_fee_cents integer, discount_cents integer, notes text, is_admin boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, p.display_name, u.created_at,
           COALESCE(s.status,'ACTIVE'), COALESCE(s.plan,'ARRUMADA'), s.trial_ends_at,
           COALESCE(s.monthly_fee_cents,0), COALESCE(s.discount_cents,0), COALESCE(s.notes,''),
           u.is_admin
    FROM app_users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at;
END $$;
