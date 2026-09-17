"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
const TRIAL_DAILY_LOOK_LIMIT = 2;
export async function createLook(f: FormData) {
  const name = String(f.get("name") || "").trim();
  const occasion = String(f.get("occasion") || "").trim();
  const itemIds = f.getAll("items").map(String).filter(Boolean);
  if (itemIds.length === 0) throw new Error("Selecione ao menos uma peça para o look.");
  await withProfile(async (c, userId) => {
    const sub = (await c.query("SELECT * FROM my_subscription($1)", [userId])).rows[0];
    if (sub?.status === "TRIAL") {
      const cnt = await c.query("SELECT count(*) n FROM looks WHERE created_at::date = current_date");
      if (Number(cnt.rows[0].n) >= TRIAL_DAILY_LOOK_LIMIT) {
        throw new Error(`No teste gratuito, o limite é de ${TRIAL_DAILY_LOOK_LIMIT} looks criados por dia. Assine para criar sem limite.`);
      }
    }
    const valid = await c.query("SELECT id FROM closet_items WHERE id = ANY($1::uuid[])", [itemIds]);
    if (valid.rowCount !== itemIds.length) throw new Error("Alguma peça selecionada não pertence ao seu closet.");
    const look = await c.query(
      "INSERT INTO looks(tenant_id,user_id,name,occasion) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3) RETURNING id",
      [userId, name, occasion],
    );
    const lookId = look.rows[0].id;
    for (const itemId of itemIds) {
      await c.query(
        "INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3)",
        [lookId, itemId, userId],
      );
    }
    return true;
  });
  redirect("/looks");
}
export async function deleteLook(f: FormData) {
  const id = String(f.get("id") || "");
  await withProfile(async (c) => {
    await c.query("DELETE FROM looks WHERE id=$1", [id]);
    return true;
  });
  redirect("/looks");
}
