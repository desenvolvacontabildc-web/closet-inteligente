"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
const TRIAL_DAILY_LOOK_LIMIT = 2;
const DAILY_AI_LIMIT = 15;
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
export async function suggestLooks(f: FormData) {
  const request = String(f.get("request") || "").trim();
  if (!request) throw new Error('Descreva o que você precisa (ex.: "3 looks para reuniões essa semana").');
  if (!process.env.OPENAI_API_KEY) throw new Error("Sugestão por IA não configurada: defina OPENAI_API_KEY no servidor.");
  await withProfile(async (c, userId) => {
    const sub = (await c.query("SELECT * FROM my_subscription($1)", [userId])).rows[0];
    let maxLooks = 5;
    if (sub?.status === "TRIAL") {
      const cnt = await c.query("SELECT count(*) n FROM looks WHERE created_at::date = current_date");
      const remaining = Math.max(0, TRIAL_DAILY_LOOK_LIMIT - Number(cnt.rows[0].n));
      if (remaining === 0) throw new Error(`No teste gratuito, o limite de ${TRIAL_DAILY_LOOK_LIMIT} looks por dia já foi atingido. Assine para continuar.`);
      maxLooks = remaining;
    }
    const usage = await c.query(
      "INSERT INTO ai_usage(user_id,tenant_id,day,count) VALUES($1,current_setting('app.tenant_id')::uuid,current_date,1) ON CONFLICT (user_id,day) DO UPDATE SET count=ai_usage.count+1 RETURNING count",
      [userId],
    );
    if (usage.rows[0].count > DAILY_AI_LIMIT) throw new Error(`Limite diário de ${DAILY_AI_LIMIT} usos de IA atingido. Tente novamente amanhã.`);
    const items = (await c.query("SELECT id,name,category,color FROM closet_items WHERE status='ACTIVE'")).rows;
    if (items.length === 0) throw new Error("Cadastre ao menos uma peça no closet antes de pedir sugestões de look.");
    const out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text:
            `Você é uma consultora de imagem. Pedido da cliente: "${request}".\n` +
            `Peças reais disponíveis no closet (use SOMENTE estas, nunca invente peças novas):\n${JSON.stringify(items)}\n` +
            `Monte até ${maxLooks} looks distintos e coerentes com o pedido, usando apenas essas peças. ` +
            `Responda apenas JSON no formato {"looks":[{"item_ids":["..."],"name":"...","occasion":"..."}],"note":"..."}. ` +
            `Cada item_ids deve conter somente ids da lista fornecida. Se não houver peças suficientes para ${maxLooks} looks bons, gere menos e explique em "note".`,
        }],
      }],
    });
    let parsed: any;
    try { parsed = JSON.parse(out.output_text); } catch { throw new Error("A IA não retornou uma sugestão válida. Tente novamente."); }
    const validIds = new Set(items.map((i: any) => i.id));
    const proposals = Array.isArray(parsed.looks) ? parsed.looks.slice(0, maxLooks) : [];
    let created = 0;
    for (const p of proposals) {
      const ids = Array.isArray(p.item_ids) ? p.item_ids.filter((id: string) => validIds.has(id)) : [];
      if (ids.length === 0) continue;
      const look = await c.query(
        "INSERT INTO looks(tenant_id,user_id,name,occasion) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3) RETURNING id",
        [userId, String(p.name || "").slice(0, 120), String(p.occasion || "").slice(0, 120)],
      );
      for (const id of ids) {
        await c.query(
          "INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3)",
          [look.rows[0].id, id, userId],
        );
      }
      created++;
    }
    if (created === 0) throw new Error("Não foi possível montar nenhum look com as peças atuais do seu closet para esse pedido.");
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
