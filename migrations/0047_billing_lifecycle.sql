-- Ciclo de vida da cobranca: desconto de cartao nos primeiros meses, suspensao automatica
-- apos 5 dias de atraso, avisos ao admin e funcoes de gestao ampliadas.

-- ---------------------------------------------------------------- estrutura
ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','BLOCKED','CANCELED'));
ALTER TABLE subscriptions
  ADD COLUMN overdue_since timestamptz,
  ADD COLUMN promo_cycles_left integer NOT NULL DEFAULT 0,
  ADD COLUMN cycles_paid integer NOT NULL DEFAULT 0;

ALTER TABLE plan_config
  ADD COLUMN promo_price_cents integer CHECK (promo_price_cents IS NULL OR promo_price_cents >= 0),
  ADD COLUMN promo_months integer NOT NULL DEFAULT 3 CHECK (promo_months >= 0);
UPDATE plan_config SET promo_price_cents = 1990 WHERE plan = 'ARRUMADA';
UPDATE plan_config SET promo_price_cents = 3990 WHERE plan = 'FASHION';
UPDATE plan_config SET promo_price_cents = 8990 WHERE plan = 'SUPER_STAR';

CREATE TABLE admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX admin_notifications_unread_idx ON admin_notifications(created_at) WHERE read_at IS NULL;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications FORCE ROW LEVEL SECURITY;
-- Sem policies/GRANTs: so as funcoes SECURITY DEFINER abaixo leem e escrevem.

-- ---------------------------------------------------------------- avisos ao admin
CREATE FUNCTION notify_admin(p_kind text, p_user uuid, p_title text, p_body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO admin_notifications(kind, user_id, title, body) VALUES (p_kind, p_user, p_title, p_body);
$$;
REVOKE ALL ON FUNCTION notify_admin(text,uuid,text,text) FROM PUBLIC;

CREATE FUNCTION who_is(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE(NULLIF(p.display_name,''), u.email) || ' (' || u.email || ')'
  FROM app_users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = p_user;
$$;
REVOKE ALL ON FUNCTION who_is(uuid) FROM PUBLIC;

CREATE FUNCTION admin_list_notifications(p_actor uuid)
RETURNS TABLE(id uuid, kind text, user_id uuid, title text, body text, created_at timestamptz, read_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT n.id, n.kind, n.user_id, n.title, n.body, n.created_at, n.read_at
    FROM admin_notifications n ORDER BY n.created_at DESC LIMIT 60;
END $$;
REVOKE ALL ON FUNCTION admin_list_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_notifications(uuid) TO closet_app;

CREATE FUNCTION admin_unread_notifications(p_actor uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin)
    THEN (SELECT count(*)::int FROM admin_notifications WHERE read_at IS NULL) ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION admin_unread_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_unread_notifications(uuid) TO closet_app;

CREATE FUNCTION admin_mark_notifications_read(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  UPDATE admin_notifications SET read_at = now() WHERE read_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION admin_mark_notifications_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_mark_notifications_read(uuid) TO closet_app;

-- ---------------------------------------------------------------- status efetivo
-- ACTIVE/PAST_DUE de assinante Mercado Pago vira PAST_DUE ao vencer e SUSPENDED 5 dias depois,
-- calculado na hora do acesso (nao depende de um job rodando). Administradoras e contas
-- manuais (sem Mercado Pago) nunca sao suspensas automaticamente.
CREATE FUNCTION effective_status(p_user uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r subscriptions; v_admin boolean; v_due timestamptz;
BEGIN
  SELECT * INTO r FROM subscriptions s WHERE s.user_id = p_user;
  IF NOT FOUND THEN RETURN 'ACTIVE'; END IF;
  IF r.status = 'TRIAL' AND r.trial_ends_at IS NOT NULL AND r.trial_ends_at < now() THEN RETURN 'TRIAL_EXPIRED'; END IF;
  SELECT a.is_admin INTO v_admin FROM app_users a WHERE a.id = p_user;
  IF COALESCE(v_admin, false) OR r.provider IS DISTINCT FROM 'MERCADOPAGO' OR r.status NOT IN ('ACTIVE','PAST_DUE') THEN
    RETURN r.status;
  END IF;
  v_due := COALESCE(r.overdue_since, CASE WHEN r.payment_method = 'PIX' THEN r.current_period_end END);
  IF v_due IS NULL THEN RETURN r.status; END IF;
  IF now() > v_due + interval '5 days' THEN RETURN 'SUSPENDED'; END IF;
  IF now() > v_due THEN RETURN 'PAST_DUE'; END IF;
  RETURN r.status;
END $$;
REVOKE ALL ON FUNCTION effective_status(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION check_account_access(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT effective_status(p_user);
$$;

DROP FUNCTION my_subscription(uuid);
CREATE FUNCTION my_subscription(p_user uuid)
RETURNS TABLE(status text, plan text, trial_ends_at timestamptz, current_period_end timestamptz, overdue_since timestamptz,
              payment_method text, provider text, promo_cycles_left integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT effective_status(p_user), s.plan, s.trial_ends_at, s.current_period_end, s.overdue_since, s.payment_method, s.provider, s.promo_cycles_left
  FROM subscriptions s WHERE s.user_id = p_user;
$$;
REVOKE ALL ON FUNCTION my_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_subscription(uuid) TO closet_app;

-- ---------------------------------------------------------------- ativacao por pagamento
-- Unico caminho que ativa assinatura paga (Pix e cartao): mantem as regras que o admin ja tinha
-- (Super Star libera Colorimetria; 1o pagamento credita quem indicou).
CREATE FUNCTION activate_paid_subscription(p_user uuid, p_plan text, p_fee_cents integer, p_method text,
  p_preapproval text, p_promo_cycles integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_was_active boolean; v_referrer uuid; v_referrer_tenant uuid;
BEGIN
  SELECT (s.status = 'ACTIVE') INTO v_was_active FROM subscriptions s WHERE s.user_id = p_user;
  INSERT INTO subscriptions(user_id, status, plan, monthly_fee_cents, provider, payment_method, preapproval_id,
                            current_period_end, overdue_since, promo_cycles_left, updated_at)
    VALUES (p_user, 'ACTIVE', p_plan, p_fee_cents, 'MERCADOPAGO', p_method, p_preapproval,
            now() + interval '30 days', NULL, COALESCE(p_promo_cycles, 0), now())
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'ACTIVE', plan = excluded.plan, monthly_fee_cents = excluded.monthly_fee_cents,
      provider = 'MERCADOPAGO', payment_method = excluded.payment_method,
      preapproval_id = COALESCE(excluded.preapproval_id, subscriptions.preapproval_id),
      current_period_end = greatest(now(), COALESCE(subscriptions.current_period_end, now())) + interval '30 days',
      overdue_since = NULL,
      promo_cycles_left = CASE WHEN p_method = 'CARD' THEN COALESCE(p_promo_cycles, 0) ELSE 0 END,
      updated_at = now();
  IF p_plan = 'SUPER_STAR' THEN
    INSERT INTO user_modules(user_id, module, status, origin) VALUES (p_user, 'COLORIMETRIA', 'LIBERADA', 'SUPER_STAR')
      ON CONFLICT (user_id, module) DO NOTHING;
  END IF;
  IF NOT COALESCE(v_was_active, false) THEN
    SELECT u.referred_by INTO v_referrer FROM app_users u WHERE u.id = p_user;
    IF v_referrer IS NOT NULL THEN
      SELECT p.tenant_id INTO v_referrer_tenant FROM profiles p WHERE p.user_id = v_referrer;
      IF v_referrer_tenant IS NOT NULL THEN
        PERFORM grant_bonus_credits(v_referrer, v_referrer_tenant, 'REFERRAL_' || p_user::text, 10);
      END IF;
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION activate_paid_subscription(uuid,text,integer,text,text,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION apply_pix_result(p_provider_payment_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_charge payment_charges%ROWTYPE;
BEGIN
  SELECT * INTO v_charge FROM payment_charges pc WHERE pc.provider_payment_id = p_provider_payment_id AND pc.kind = 'PIX' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE payment_charges pc SET status = p_status, raw = p_raw, updated_at = now() WHERE pc.id = v_charge.id;
  IF p_status = 'approved' AND v_charge.status IS DISTINCT FROM 'approved' THEN
    PERFORM activate_paid_subscription(v_charge.user_id, v_charge.plan, v_charge.amount_cents, 'PIX', NULL, 0);
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
      VALUES (v_charge.user_id, 'PIX_PAYMENT_APPROVED', v_charge.user_id, jsonb_build_object('amount_cents', v_charge.amount_cents, 'plan', v_charge.plan));
    PERFORM notify_admin('PAYMENT', v_charge.user_id, 'Pagamento Pix recebido',
      who_is(v_charge.user_id) || ' pagou R$ ' || replace(to_char(v_charge.amount_cents / 100.0, 'FM999990.00'), '.', ',') || ' e teve o plano ' || v_charge.plan || ' liberado automaticamente.');
  END IF;
  RETURN QUERY SELECT v_charge.user_id;
END $$;

-- Cartao: o preapproval fica registrado como cobranca pendente (plano, valor e quantos ciclos
-- de desconto) ate o Mercado Pago autorizar; so ai a assinatura vira ACTIVE.
CREATE OR REPLACE FUNCTION set_pending_preapproval(p_user uuid, p_preapproval_id text, p_plan text, p_amount_cents integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO payment_charges(user_id, tenant_id, kind, plan, amount_cents, provider_payment_id, raw)
    VALUES (p_user, (SELECT tm.tenant_id FROM tenant_memberships tm WHERE tm.user_id = p_user LIMIT 1), 'CARD_PREAPPROVAL', p_plan, p_amount_cents, p_preapproval_id,
            jsonb_build_object('promo_cycles', COALESCE((SELECT pc.promo_months FROM plan_config pc WHERE pc.plan = p_plan AND pc.promo_price_cents = p_amount_cents), 0)));
$$;

DROP FUNCTION apply_preapproval_result(text,text,text,jsonb);
CREATE FUNCTION apply_preapproval_result(p_preapproval_id text, p_status text, p_external_reference text, p_raw jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user uuid; v_charge payment_charges%ROWTYPE; v_sub subscriptions%ROWTYPE;
BEGIN
  v_user := nullif(p_external_reference,'')::uuid;
  IF v_user IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_users u WHERE u.id = v_user) THEN RETURN; END IF;
  SELECT * INTO v_charge FROM payment_charges pc WHERE pc.provider_payment_id = p_preapproval_id AND pc.kind = 'CARD_PREAPPROVAL' FOR UPDATE;
  SELECT * INTO v_sub FROM subscriptions s WHERE s.user_id = v_user;
  IF p_status = 'authorized' THEN
    IF v_charge.id IS NULL THEN
      RETURN QUERY SELECT v_user;
      RETURN;
    END IF;
    IF v_charge.status IS DISTINCT FROM 'approved' THEN
      UPDATE payment_charges pc SET status = 'approved', raw = p_raw, updated_at = now() WHERE pc.id = v_charge.id;
      PERFORM activate_paid_subscription(v_user, v_charge.plan, v_charge.amount_cents, 'CARD', p_preapproval_id,
        COALESCE((v_charge.raw->>'promo_cycles')::int, 0));
      INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
        VALUES (v_user, 'CARD_SUBSCRIPTION_AUTHORIZED', v_user, jsonb_build_object('plan', v_charge.plan, 'amount_cents', v_charge.amount_cents));
      PERFORM notify_admin('PAYMENT', v_user, 'Assinatura no cartão ativada',
        who_is(v_user) || ' assinou o plano ' || v_charge.plan || ' no cartão (R$ ' || replace(to_char(v_charge.amount_cents / 100.0, 'FM999990.00'), '.', ',') || '/mês) e foi liberada automaticamente.');
    END IF;
  ELSIF p_status IN ('cancelled','paused') THEN
    IF v_charge.id IS NOT NULL AND v_charge.status = 'pending' THEN
      UPDATE payment_charges pc SET status = p_status, raw = p_raw, updated_at = now() WHERE pc.id = v_charge.id;
    ELSIF v_sub.preapproval_id = p_preapproval_id THEN
      UPDATE subscriptions s SET status = 'PAST_DUE', overdue_since = COALESCE(s.overdue_since, now()), updated_at = now() WHERE s.user_id = v_user;
      INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
        VALUES (v_user, 'CARD_SUBSCRIPTION_' || upper(p_status), v_user, p_raw);
      PERFORM notify_admin('OVERDUE', v_user, 'Assinatura no cartão ' || (CASE WHEN p_status = 'cancelled' THEN 'cancelada' ELSE 'pausada' END),
        who_is(v_user) || ': o acesso será suspenso em 5 dias se não regularizar.');
    END IF;
  END IF;
  RETURN QUERY SELECT v_user;
END $$;
REVOKE ALL ON FUNCTION apply_preapproval_result(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_preapproval_result(text,text,text,jsonb) TO closet_app;

DROP FUNCTION apply_authorized_payment_result(text,text,jsonb);
CREATE FUNCTION apply_authorized_payment_result(p_preapproval_id text, p_status text, p_raw jsonb)
RETURNS TABLE(user_id uuid, promo_ended boolean, plan text, base_price_cents integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_sub subscriptions%ROWTYPE; v_ended boolean := false; v_base integer;
BEGIN
  SELECT * INTO v_sub FROM subscriptions s WHERE s.preapproval_id = p_preapproval_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_status = 'approved' THEN
    UPDATE subscriptions s SET status = 'ACTIVE', overdue_since = NULL,
      current_period_end = greatest(now(), COALESCE(s.current_period_end, now())) + interval '30 days',
      cycles_paid = s.cycles_paid + 1,
      promo_cycles_left = greatest(s.promo_cycles_left - 1, 0), updated_at = now()
      WHERE s.user_id = v_sub.user_id;
    IF v_sub.promo_cycles_left = 1 THEN
      v_ended := true;
      SELECT pc.base_price_cents INTO v_base FROM plan_config pc WHERE pc.plan = v_sub.plan;
      UPDATE subscriptions s SET monthly_fee_cents = v_base WHERE s.user_id = v_sub.user_id;
    END IF;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (v_sub.user_id, 'CARD_CYCLE_CHARGED', v_sub.user_id, p_raw);
  ELSIF p_status = 'rejected' THEN
    UPDATE subscriptions s SET status = 'PAST_DUE', overdue_since = COALESCE(s.overdue_since, now()), updated_at = now() WHERE s.user_id = v_sub.user_id;
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (v_sub.user_id, 'CARD_CYCLE_REJECTED', v_sub.user_id, p_raw);
    PERFORM notify_admin('OVERDUE', v_sub.user_id, 'Cobrança no cartão recusada',
      who_is(v_sub.user_id) || ': o Mercado Pago tenta de novo; sem pagamento o acesso é suspenso em 5 dias.');
  END IF;
  RETURN QUERY SELECT v_sub.user_id, v_ended, v_sub.plan, v_base;
END $$;
REVOKE ALL ON FUNCTION apply_authorized_payment_result(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_authorized_payment_result(text,text,jsonb) TO closet_app;

-- Avisa o admin quando nao foi possivel reajustar o valor do cartao ao fim do desconto.
CREATE FUNCTION report_billing_issue(p_user uuid, p_title text, p_body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT notify_admin('ISSUE', p_user, p_title, p_body);
$$;
REVOKE ALL ON FUNCTION report_billing_issue(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION report_billing_issue(uuid,text,text) TO closet_app;

-- ---------------------------------------------------------------- manutencao (vencimentos)
-- Persiste PAST_DUE/SUSPENDED e avisa o admin. O bloqueio em si nao depende disto (e calculado
-- em effective_status); isto so deixa a lista do admin e os avisos em dia. Idempotente.
CREATE FUNCTION run_billing_maintenance() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    UPDATE subscriptions s SET status = 'PAST_DUE', overdue_since = COALESCE(s.overdue_since, s.current_period_end), updated_at = now()
    FROM app_users u
    WHERE u.id = s.user_id AND NOT u.is_admin AND s.provider = 'MERCADOPAGO' AND s.status = 'ACTIVE'
      AND s.payment_method = 'PIX' AND s.current_period_end < now()
    RETURNING s.user_id
  LOOP
    PERFORM notify_admin('OVERDUE', r.user_id, 'Pix vencido', who_is(r.user_id) || ' não renovou o Pix; o acesso é suspenso 5 dias após o vencimento.');
  END LOOP;
  FOR r IN
    UPDATE subscriptions s SET status = 'SUSPENDED', updated_at = now()
    FROM app_users u
    WHERE u.id = s.user_id AND NOT u.is_admin AND s.provider = 'MERCADOPAGO' AND s.status IN ('ACTIVE','PAST_DUE')
      AND s.overdue_since IS NOT NULL AND s.overdue_since < now() - interval '5 days'
    RETURNING s.user_id
  LOOP
    INSERT INTO audit_log(actor_user_id, action, target_user_id, details) VALUES (r.user_id, 'AUTO_SUSPENDED', r.user_id, '{"reason":"5 dias de atraso"}'::jsonb);
    PERFORM notify_admin('SUSPENDED', r.user_id, 'Conta suspensa por atraso', who_is(r.user_id) || ' foi suspensa automaticamente (5 dias de atraso).');
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION run_billing_maintenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION run_billing_maintenance() TO closet_app;

-- ---------------------------------------------------------------- precos e desconto
CREATE FUNCTION get_plan_pricing(p_plan text)
RETURNS TABLE(plan text, base_price_cents integer, promo_price_cents integer, promo_months integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT pc.plan, pc.base_price_cents, pc.promo_price_cents, pc.promo_months FROM plan_config pc WHERE pc.plan = p_plan;
$$;
REVOKE ALL ON FUNCTION get_plan_pricing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_plan_pricing(text) TO closet_app;

CREATE FUNCTION admin_list_plans(p_actor uuid)
RETURNS TABLE(plan text, base_price_cents integer, ai_ops_monthly_limit integer, image_gen_monthly_limit integer, promo_price_cents integer, promo_months integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY SELECT pc.plan, pc.base_price_cents, pc.ai_ops_monthly_limit, pc.image_gen_monthly_limit, pc.promo_price_cents, pc.promo_months
    FROM plan_config pc ORDER BY pc.base_price_cents;
END $$;
REVOKE ALL ON FUNCTION admin_list_plans(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_plans(uuid) TO closet_app;

CREATE FUNCTION admin_set_promo_config(p_actor uuid, p_plan text, p_promo_cents integer, p_months integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_plan NOT IN ('ARRUMADA','FASHION','SUPER_STAR') THEN RAISE EXCEPTION 'Plano inválido.'; END IF;
  IF p_promo_cents IS NOT NULL AND p_promo_cents < 0 THEN RAISE EXCEPTION 'Preço não pode ser negativo.'; END IF;
  IF p_months < 0 OR p_months > 24 THEN RAISE EXCEPTION 'Quantidade de meses inválida.'; END IF;
  UPDATE plan_config SET promo_price_cents = p_promo_cents, promo_months = p_months, updated_at = now() WHERE plan = p_plan;
  INSERT INTO audit_log(actor_user_id, action, details)
    VALUES (p_actor, 'SET_PROMO_CONFIG', jsonb_build_object('plan', p_plan, 'promo_price_cents', p_promo_cents, 'promo_months', p_months));
END $$;
REVOKE ALL ON FUNCTION admin_set_promo_config(uuid,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_promo_config(uuid,text,integer,integer) TO closet_app;

-- ---------------------------------------------------------------- gestao de usuarias
DROP FUNCTION admin_list_accounts(uuid);
CREATE FUNCTION admin_list_accounts(p_actor uuid)
RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamptz,
              sub_status text, plan text, trial_ends_at timestamptz, monthly_fee_cents integer, discount_cents integer, notes text,
              is_admin boolean, last_login_at timestamptz, provider text, payment_method text, current_period_end timestamptz,
              overdue_since timestamptz, closet_count integer, looks_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  RETURN QUERY
    SELECT u.id, u.email, p.display_name, u.created_at,
           effective_status(u.id), COALESCE(s.plan,'ARRUMADA'), s.trial_ends_at,
           COALESCE(s.monthly_fee_cents,0), COALESCE(s.discount_cents,0), COALESCE(s.notes,''),
           u.is_admin, u.last_login_at, s.provider, s.payment_method, s.current_period_end, s.overdue_since,
           (SELECT count(*)::int FROM closet_items ci WHERE ci.user_id = u.id),
           (SELECT count(*)::int FROM looks l WHERE l.user_id = u.id)
    FROM app_users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at;
END $$;
REVOKE ALL ON FUNCTION admin_list_accounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_accounts(uuid) TO closet_app;

CREATE FUNCTION admin_user_overview(p_actor uuid, p_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  SELECT jsonb_build_object(
    'bonus_credits', COALESCE((SELECT p.bonus_image_credits FROM profiles p WHERE p.user_id = p_target), 0),
    'referrals', (SELECT count(*)::int FROM app_users r WHERE r.referred_by = p_target),
    'referral_code', (SELECT u.referral_code FROM app_users u WHERE u.id = p_target),
    'city', (SELECT p.city FROM profiles p WHERE p.user_id = p_target),
    'promo_cycles_left', COALESCE((SELECT s.promo_cycles_left FROM subscriptions s WHERE s.user_id = p_target), 0),
    'cycles_paid', COALESCE((SELECT s.cycles_paid FROM subscriptions s WHERE s.user_id = p_target), 0),
    'modules', COALESCE((SELECT jsonb_agg(jsonb_build_object('module', m.module, 'status', m.status, 'origin', m.origin)) FROM user_modules m WHERE m.user_id = p_target), '[]'::jsonb),
    'charges', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', c.kind, 'plan', c.plan, 'amount_cents', c.amount_cents, 'status', c.status, 'created_at', c.created_at) ORDER BY c.created_at DESC)
                         FROM (SELECT pc.kind, pc.plan, pc.amount_cents, pc.status, pc.created_at FROM payment_charges pc WHERE pc.user_id = p_target ORDER BY pc.created_at DESC LIMIT 12) c), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION admin_user_overview(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_user_overview(uuid,uuid) TO closet_app;

CREATE FUNCTION admin_grant_credits(p_actor uuid, p_target uuid, p_credits integer, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_credits < 1 OR p_credits > 500 THEN RAISE EXCEPTION 'Informe entre 1 e 500 créditos.'; END IF;
  SELECT p.tenant_id INTO v_tenant FROM profiles p WHERE p.user_id = p_target;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Usuária sem perfil concluído.'; END IF;
  PERFORM grant_bonus_credits(p_target, v_tenant, 'ADMIN_' || gen_random_uuid()::text, p_credits);
  INSERT INTO audit_log(actor_user_id, action, target_user_id, details)
    VALUES (p_actor, 'GRANT_CREDITS', p_target, jsonb_build_object('credits', p_credits, 'note', p_note));
END $$;
REVOKE ALL ON FUNCTION admin_grant_credits(uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_credits(uuid,uuid,integer,text) TO closet_app;

-- admin_set_subscription: aceita SUSPENDED, e ao marcar ACTIVE limpa o atraso (e renova o
-- vencimento de contas Mercado Pago ja vencidas, senao o status efetivo continuaria atrasado).
CREATE OR REPLACE FUNCTION admin_set_subscription(p_actor uuid, p_target uuid, p_status text, p_fee_cents integer, p_discount_cents integer, p_notes text, p_plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_was_active boolean; v_referrer uuid; v_referrer_tenant uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = p_actor AND a.is_admin) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF p_status NOT IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','BLOCKED','CANCELED') THEN RAISE EXCEPTION 'Status inválido.'; END IF;
  IF p_plan NOT IN ('ARRUMADA','FASHION','SUPER_STAR') THEN RAISE EXCEPTION 'Plano inválido.'; END IF;
  IF p_target = p_actor AND p_status <> 'ACTIVE' THEN RAISE EXCEPTION 'Não é possível bloquear ou cancelar a própria conta de administradora.'; END IF;
  IF p_fee_cents < 0 OR p_discount_cents < 0 THEN RAISE EXCEPTION 'Valores não podem ser negativos.'; END IF;
  SELECT (s.status = 'ACTIVE') INTO v_was_active FROM subscriptions s WHERE s.user_id = p_target;
  INSERT INTO subscriptions(user_id,status,monthly_fee_cents,discount_cents,notes,plan,updated_at)
    VALUES (p_target,p_status,p_fee_cents,p_discount_cents,p_notes,p_plan,now())
    ON CONFLICT (user_id) DO UPDATE SET status=excluded.status, monthly_fee_cents=excluded.monthly_fee_cents,
      discount_cents=excluded.discount_cents, notes=excluded.notes, plan=excluded.plan, updated_at=now();
  IF p_status = 'ACTIVE' THEN
    UPDATE subscriptions s SET overdue_since = NULL,
      current_period_end = CASE WHEN s.provider = 'MERCADOPAGO' AND s.current_period_end < now() THEN now() + interval '30 days' ELSE s.current_period_end END
      WHERE s.user_id = p_target;
  END IF;
  IF p_status IN ('BLOCKED','CANCELED') THEN DELETE FROM auth_sessions WHERE user_id = p_target; END IF;
  IF p_plan = 'SUPER_STAR' THEN
    INSERT INTO user_modules(user_id,module,status,origin) VALUES (p_target,'COLORIMETRIA','LIBERADA','SUPER_STAR')
      ON CONFLICT (user_id,module) DO NOTHING;
  END IF;
  IF p_status = 'ACTIVE' AND NOT COALESCE(v_was_active, false) THEN
    SELECT u.referred_by INTO v_referrer FROM app_users u WHERE u.id = p_target;
    IF v_referrer IS NOT NULL THEN
      SELECT p.tenant_id INTO v_referrer_tenant FROM profiles p WHERE p.user_id = v_referrer;
      IF v_referrer_tenant IS NOT NULL THEN PERFORM grant_bonus_credits(v_referrer, v_referrer_tenant, 'REFERRAL_' || p_target::text, 10); END IF;
    END IF;
  END IF;
  INSERT INTO audit_log(actor_user_id,action,target_user_id,details)
    VALUES (p_actor,'SET_SUBSCRIPTION',p_target,
      jsonb_build_object('status',p_status,'plan',p_plan,'fee_cents',p_fee_cents,'discount_cents',p_discount_cents,'notes',p_notes));
END $$;
