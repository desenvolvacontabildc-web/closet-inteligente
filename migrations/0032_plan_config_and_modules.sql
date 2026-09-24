-- Especificacao mestre (atualizacao de produto/planos): preco-base e limites de IA/imagem
-- deixam de ser hardcoded no JS e passam a viver no banco, editaveis pelo admin.
-- Looks salvos passam a ser ilimitados em todos os planos (a gating fica só em
-- "operacoes de IA" e "geracoes de imagem", contadores independentes que ja existiam
-- como ai_usage e image_generation_log).
CREATE TABLE plan_config (
  plan text PRIMARY KEY CHECK (plan IN ('ARRUMADA','FASHION','SUPER_STAR')),
  base_price_cents integer NOT NULL CHECK (base_price_cents >= 0),
  ai_ops_monthly_limit integer, -- NULL = sem limite (evitar usar sem necessidade real)
  image_gen_monthly_limit integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO plan_config(plan,base_price_cents,ai_ops_monthly_limit,image_gen_monthly_limit) VALUES
  ('ARRUMADA', 2990, 40, 10),
  ('FASHION', 5990, 100, 30),
  ('SUPER_STAR', 11990, 300, 100);
ALTER TABLE plan_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_config FORCE ROW LEVEL SECURITY;

-- Leitura de config de plano nao e sensivel (preco e limite sao publicos dentro do app);
-- qualquer usuario logado pode ler o proprio plano.
CREATE FUNCTION get_plan_config(p_plan text)
RETURNS TABLE(plan text, base_price_cents integer, ai_ops_monthly_limit integer, image_gen_monthly_limit integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT plan, base_price_cents, ai_ops_monthly_limit, image_gen_monthly_limit FROM plan_config WHERE plan = p_plan;
$$;
REVOKE ALL ON FUNCTION get_plan_config(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_plan_config(text) TO closet_app;

CREATE FUNCTION admin_list_plan_config(p_actor uuid)
RETURNS TABLE(plan text, base_price_cents integer, ai_ops_monthly_limit integer, image_gen_monthly_limit integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  RETURN QUERY SELECT plan, base_price_cents, ai_ops_monthly_limit, image_gen_monthly_limit FROM plan_config ORDER BY base_price_cents;
END $$;
REVOKE ALL ON FUNCTION admin_list_plan_config(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_plan_config(uuid) TO closet_app;

CREATE FUNCTION admin_set_plan_config(p_actor uuid, p_plan text, p_price_cents integer, p_ai_limit integer, p_image_limit integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF p_plan NOT IN ('ARRUMADA','FASHION','SUPER_STAR') THEN
    RAISE EXCEPTION 'Plano inválido.';
  END IF;
  IF p_price_cents < 0 THEN
    RAISE EXCEPTION 'Preço não pode ser negativo.';
  END IF;
  UPDATE plan_config SET base_price_cents = p_price_cents, ai_ops_monthly_limit = p_ai_limit, image_gen_monthly_limit = p_image_limit, updated_at = now()
    WHERE plan = p_plan;
  INSERT INTO audit_log(actor_user_id,action,details)
    VALUES (p_actor,'SET_PLAN_CONFIG', jsonb_build_object('plan',p_plan,'price_cents',p_price_cents,'ai_limit',p_ai_limit,'image_limit',p_image_limit));
END $$;
REVOKE ALL ON FUNCTION admin_set_plan_config(uuid,text,integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_plan_config(uuid,text,integer,integer,integer) TO closet_app;

-- Modulos/experiencias avulsas (ex.: Colorimetria) -- liberacao unica, nao mensal,
-- que sobrevive a downgrade de plano. Arquitetura generica pra reaproveitar em
-- futuros modulos (Meu Cabelo, Assinatura de Estilo etc.) sem migration nova por modulo.
CREATE TABLE user_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('COLORIMETRIA')),
  status text NOT NULL DEFAULT 'LIBERADA' CHECK (status IN ('NAO_ADQUIRIDA','LIBERADA','EM_ANALISE','CONCLUIDA')),
  origin text NOT NULL CHECK (origin IN ('COMPRA_AVULSA','SUPER_STAR','INDICACAO','CORTESIA_ADMIN','CAMPANHA')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  UNIQUE(user_id, module)
);
ALTER TABLE user_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_modules FORCE ROW LEVEL SECURITY;

CREATE FUNCTION my_module_status(p_user uuid, p_module text)
RETURNS TABLE(status text, origin text, completed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT status, origin, completed_at FROM user_modules WHERE user_id = p_user AND module = p_module;
$$;
REVOKE ALL ON FUNCTION my_module_status(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_module_status(uuid,text) TO closet_app;

CREATE FUNCTION complete_my_module(p_user uuid, p_module text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE user_modules SET status = 'CONCLUIDA', completed_at = now() WHERE user_id = p_user AND module = p_module;
$$;
REVOKE ALL ON FUNCTION complete_my_module(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_my_module(uuid,text) TO closet_app;

CREATE FUNCTION admin_grant_module(p_actor uuid, p_target uuid, p_module text, p_origin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF p_module NOT IN ('COLORIMETRIA') THEN
    RAISE EXCEPTION 'Módulo inválido.';
  END IF;
  IF p_origin NOT IN ('COMPRA_AVULSA','SUPER_STAR','INDICACAO','CORTESIA_ADMIN','CAMPANHA') THEN
    RAISE EXCEPTION 'Origem inválida.';
  END IF;
  -- Upsert simples: também serve pra "liberação excepcional" quando a admin quer reabrir
  -- uma Colorimetria já concluída (ex.: cliente pede reavaliação).
  INSERT INTO user_modules(user_id,module,status,origin,granted_at,completed_at) VALUES (p_target,p_module,'LIBERADA',p_origin,now(),NULL)
    ON CONFLICT (user_id,module) DO UPDATE SET status='LIBERADA', origin=excluded.origin, granted_at=now(), completed_at=NULL;
  INSERT INTO audit_log(actor_user_id,action,target_user_id,details)
    VALUES (p_actor,'GRANT_MODULE',p_target, jsonb_build_object('module',p_module,'origin',p_origin));
END $$;
REVOKE ALL ON FUNCTION admin_grant_module(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_module(uuid,uuid,text,text) TO closet_app;

-- Assinar Super Star pela primeira vez libera a Colorimetria automaticamente (beneficio do
-- plano), e isso nao e removido num downgrade posterior -- so a liberacao manual do admin
-- muda depois disso.
CREATE OR REPLACE FUNCTION admin_set_subscription(p_actor uuid, p_target uuid, p_status text, p_fee_cents integer, p_discount_cents integer, p_notes text, p_plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = p_actor AND is_admin) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  IF p_status NOT IN ('TRIAL','ACTIVE','PAST_DUE','BLOCKED','CANCELED') THEN
    RAISE EXCEPTION 'Status inválido.';
  END IF;
  IF p_plan NOT IN ('ARRUMADA','FASHION','SUPER_STAR') THEN
    RAISE EXCEPTION 'Plano inválido.';
  END IF;
  IF p_target = p_actor AND p_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Não é possível bloquear ou cancelar a própria conta de administradora.';
  END IF;
  IF p_fee_cents < 0 OR p_discount_cents < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos.';
  END IF;
  INSERT INTO subscriptions(user_id,status,monthly_fee_cents,discount_cents,notes,plan,updated_at)
    VALUES (p_target,p_status,p_fee_cents,p_discount_cents,p_notes,p_plan,now())
    ON CONFLICT (user_id) DO UPDATE SET status=excluded.status, monthly_fee_cents=excluded.monthly_fee_cents,
      discount_cents=excluded.discount_cents, notes=excluded.notes, plan=excluded.plan, updated_at=now();
  IF p_status IN ('BLOCKED','CANCELED') THEN
    DELETE FROM auth_sessions WHERE user_id = p_target;
  END IF;
  IF p_plan = 'SUPER_STAR' THEN
    INSERT INTO user_modules(user_id,module,status,origin) VALUES (p_target,'COLORIMETRIA','LIBERADA','SUPER_STAR')
      ON CONFLICT (user_id,module) DO NOTHING;
  END IF;
  INSERT INTO audit_log(actor_user_id,action,target_user_id,details)
    VALUES (p_actor,'SET_SUBSCRIPTION',p_target,
      jsonb_build_object('status',p_status,'plan',p_plan,'fee_cents',p_fee_cents,'discount_cents',p_discount_cents));
END $$;
