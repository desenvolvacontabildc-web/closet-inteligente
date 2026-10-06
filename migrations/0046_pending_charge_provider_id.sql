-- my_pending_charge passa a devolver provider_payment_id, pra tela de assinatura poder
-- reconferir o Pix direto no Mercado Pago caso o webhook se perca ou atrase.
DROP FUNCTION my_pending_charge(uuid);
CREATE FUNCTION my_pending_charge(p_user uuid)
RETURNS TABLE(id uuid, kind text, status text, plan text, amount_cents integer, pix_qr_code text, pix_qr_code_base64 text, pix_expires_at timestamptz, created_at timestamptz, provider_payment_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT pc.id, pc.kind, pc.status, pc.plan, pc.amount_cents, pc.pix_qr_code, pc.pix_qr_code_base64, pc.pix_expires_at, pc.created_at, pc.provider_payment_id
  FROM payment_charges pc WHERE pc.user_id = p_user ORDER BY pc.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION my_pending_charge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_pending_charge(uuid) TO closet_app;
