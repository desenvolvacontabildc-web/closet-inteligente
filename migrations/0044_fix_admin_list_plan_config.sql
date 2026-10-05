-- 0032 declared RETURNS TABLE(plan ...) and selected bare "plan" inside plpgsql,
-- which is ambiguous with the output column and made the admin plan list always fail.
CREATE OR REPLACE FUNCTION admin_list_plan_config(p_actor uuid)
RETURNS TABLE(plan text, base_price_cents integer, ai_ops_monthly_limit integer, image_gen_monthly_limit integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY SELECT pc.plan, pc.base_price_cents, pc.ai_ops_monthly_limit, pc.image_gen_monthly_limit
    FROM plan_config pc ORDER BY pc.base_price_cents;
END $$;
