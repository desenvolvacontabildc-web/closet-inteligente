"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { mySubscription, hasPlanAtLeast, bumpAndCheckAiUsage } from "./limits";
import { bounce } from "./action-error";
export async function generateCapsule(f: FormData) {
  const target = Math.min(30, Math.max(5, Number(f.get("target") || 15)));
  await withProfile(async (c, userId) => {
    const sub = await mySubscription(c, userId);
    if (!hasPlanAtLeast(sub, "FASHION")) bounce("/capsula", "O Closet Cápsula é exclusivo dos planos Fashion e Super Star (ou do teste gratuito). Fale com a administradora para migrar de plano.");
    if (!process.env.OPENAI_API_KEY) bounce("/capsula", "Recurso de IA não configurado.");
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) bounce("/capsula", budget.message || "Limite de uso de IA atingido.");
    const items = (await c.query("SELECT id,name,category,color FROM closet_items WHERE status='ACTIVE'")).rows;
    if (items.length === 0) bounce("/capsula", "Cadastre peças no closet antes de gerar uma cápsula.");
    const out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text:
            `Você é uma consultora de imagem especialista em guarda-roupa cápsula. Peças reais disponíveis (use SOMENTE estas, nunca invente):\n${JSON.stringify(items)}\n` +
            `Selecione até ${target} peças que, juntas, formem a cápsula mais versátil possível (o maior número de combinações diferentes entre si). ` +
            `Responda apenas JSON: {"item_ids":["..."],"reasoning":"...","combinations_estimate":numero}. ` +
            `item_ids deve conter só ids da lista fornecida, no máximo ${target}. Em reasoning, explique brevemente a lógica da seleção.`,
        }],
      }],
    });
    let parsed: any;
    try { parsed = JSON.parse(out.output_text); } catch { bounce("/capsula", "A IA não retornou uma cápsula válida. Tente novamente."); }
    const validIds = new Set(items.map((i: any) => i.id));
    const ids = (Array.isArray(parsed.item_ids) ? parsed.item_ids : []).filter((id: string) => validIds.has(id));
    if (ids.length === 0) bounce("/capsula", "Não foi possível montar uma cápsula com as peças atuais do seu closet.");
    await c.query("DELETE FROM capsule_items WHERE user_id=$1", [userId]);
    for (const id of ids) {
      await c.query("INSERT INTO capsule_items(user_id,tenant_id,item_id) VALUES($1,current_setting('app.tenant_id')::uuid,$2)", [userId, id]);
    }
    await c.query(
      "INSERT INTO capsules(user_id,tenant_id,reasoning,combinations_estimate,updated_at) VALUES($1,current_setting('app.tenant_id')::uuid,$2,$3,now()) ON CONFLICT (user_id) DO UPDATE SET reasoning=excluded.reasoning,combinations_estimate=excluded.combinations_estimate,updated_at=now()",
      [userId, String(parsed.reasoning || "").slice(0, 2000), Number(parsed.combinations_estimate) || null],
    );
    return true;
  });
  redirect("/capsula");
}
