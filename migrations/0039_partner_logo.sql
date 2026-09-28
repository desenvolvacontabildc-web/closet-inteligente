-- Logo da loja parceira, pra aparecer junto com as peças dela na Vitrine.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS logo_object_key text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS logo_content_type text;

DROP FUNCTION IF EXISTS storefront_list();
CREATE FUNCTION storefront_list()
RETURNS TABLE(partner_id uuid, store_name text, instagram text, whatsapp text, logo_object_key text, item_id uuid, item_name text, description text, price_cents integer, discount_percent integer, object_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.id, p.store_name, p.instagram, p.whatsapp, p.logo_object_key, i.id, i.name, i.description, i.price_cents, i.discount_percent, i.object_key
  FROM partners p JOIN partner_items i ON i.partner_id = p.id
  WHERE p.approved AND i.active
  ORDER BY p.store_name, i.created_at DESC;
$$;
REVOKE ALL ON FUNCTION storefront_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_list() TO closet_app;

DROP FUNCTION IF EXISTS storefront_logo(uuid);
CREATE FUNCTION storefront_logo(p_partner_id uuid)
RETURNS TABLE(object_key text, content_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.logo_object_key, p.logo_content_type FROM partners p WHERE p.id = p_partner_id AND p.approved AND p.logo_object_key IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION storefront_logo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_logo(uuid) TO closet_app;

DROP FUNCTION IF EXISTS partner_set_logo(uuid,text,text);
CREATE FUNCTION partner_set_logo(p_partner uuid, p_object_key text, p_content_type text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE partners SET logo_object_key = p_object_key, logo_content_type = p_content_type WHERE id = p_partner;
$$;
REVOKE ALL ON FUNCTION partner_set_logo(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_set_logo(uuid,text,text) TO closet_app;
