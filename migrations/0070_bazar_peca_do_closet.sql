-- Peca do closet -> Bazar: o anuncio guarda de qual peca veio. Ao marcar "Ja vendi" num anuncio de bazar,
-- a peca fica como Vendida no closet (sai dos looks novos, e o historico continua guardado).
ALTER TABLE bazar_posts ADD COLUMN item_id uuid REFERENCES closet_items(id) ON DELETE SET NULL;
CREATE INDEX bazar_posts_item_idx ON bazar_posts(item_id) WHERE item_id IS NOT NULL;

-- Liga o anuncio a uma peca do closet (so se a peca e o anuncio forem da propria usuaria).
CREATE FUNCTION bazar_link_item(p_user uuid, p_post uuid, p_item uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM closet_items ci WHERE ci.id = p_item AND ci.user_id = p_user)
     AND EXISTS (SELECT 1 FROM bazar_posts b WHERE b.id = p_post AND b.user_id = p_user) THEN
    UPDATE bazar_posts SET item_id = p_item WHERE id = p_post AND user_id = p_user;
  END IF;
END $$;
REVOKE ALL ON FUNCTION bazar_link_item(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_link_item(uuid,uuid,uuid) TO closet_app;

-- Anuncio aberto (ativo ou pausado) que veio desta peca, se houver.
CREATE FUNCTION bazar_item_post(p_user uuid, p_item uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT b.id FROM bazar_posts b WHERE b.user_id = p_user AND b.item_id = p_item AND b.status <> 'CLOSED' ORDER BY b.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION bazar_item_post(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bazar_item_post(uuid,uuid) TO closet_app;

-- Encerrar: se for venda (bazar) e o anuncio veio de uma peca, a peca vira Vendida no closet.
CREATE OR REPLACE FUNCTION bazar_set_status(p_user uuid, p_post uuid, p_status text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_item uuid; v_kind text;
BEGIN
  IF p_status NOT IN ('ACTIVE','PAUSED','CLOSED') THEN RETURN 'Situação inválida.'; END IF;
  UPDATE bazar_posts SET status = p_status, updated_at = now() WHERE id = p_post AND user_id = p_user
    RETURNING item_id, kind INTO v_item, v_kind;
  IF NOT FOUND THEN RETURN 'Anúncio não encontrado.'; END IF;
  IF p_status = 'CLOSED' AND v_kind = 'BAZAR' AND v_item IS NOT NULL THEN
    UPDATE closet_items SET status = 'SOLD', updated_at = now() WHERE id = v_item AND user_id = p_user AND status IN ('ACTIVE','EVALUATION','ALTERATION');
  END IF;
  RETURN '';
END $$;
