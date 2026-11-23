"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { parseAiJson } from "./ai-json";
import { bumpAndCheckAiUsage } from "./limits";
import { closetKindC, closetNote } from "./closet-type";
import { dayStr } from "./skin-options";

const BACK = "/looks/coringas";
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Estação do ano no Brasil (hemisfério sul) pelo mês. */
function estacao(m: number): string {
  if (m === 12 || m <= 2) return "verão";
  if (m <= 5) return "outono";
  if (m <= 8) return "inverno";
  return "primavera";
}

/** Gera as sugestões de compras coringa do mês. Só uma vez por mês: se já existir, apenas mostra. */
export async function generateJokerSuggestions() {
  const today = dayStr();                    // yyyy-mm-dd no horário de Recife
  const month = `${today.slice(0, 8)}01`;
  const monthNum = Number(today.slice(5, 7));
  const year = today.slice(0, 4);

  const ctx = await withProfile(async (c, userId) => {
    const have = (await c.query("SELECT 1 FROM joker_suggestions WHERE month=$1", [month])).rowCount;
    if (have) return { exists: true as const };
    const items = (await c.query("SELECT name,category,color FROM closet_items WHERE status='ACTIVE' ORDER BY created_at DESC LIMIT 120")).rows as { name: string; category: string; color: string }[];
    if (items.length < 3) return { few: true as const };
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) return { error: budget.message || "Limite de operações de IA atingido." };
    const prof = (await c.query("SELECT city, answers FROM profiles WHERE user_id=$1", [userId])).rows[0] || {};
    return { items, city: String(prof.city || "").trim(), answers: (prof.answers || {}) as Record<string, string>, note: closetNote(await closetKindC(c, userId)) };
  });
  if (!ctx) redirect("/");
  if ("exists" in ctx) redirect(BACK);
  if ("few" in ctx) bounce(BACK, "Cadastre pelo menos 3 peças para eu indicar o que combina com o seu closet.");
  if ("error" in ctx) bounce(BACK, ctx.error);

  const a = ctx.answers;
  const prompt =
    `Você é uma consultora de imagem experiente e CONSCIENTE: ajuda a cliente a comprar menos e melhor, nunca por impulso.${ctx.note}\n` +
    `Hoje é ${today} (${MESES[monthNum - 1]} de ${year}), estação: ${estacao(monthNum)} no Brasil. Cidade da cliente: ${ctx.city || "não informada (considere o clima do Brasil)"}.\n` +
    `Estilo da cliente: ${a.style || "não informado"}. Rotina: ${a.routine || "não informada"}. Como quer se sentir: ${a.feeling || "não informado"}. Como NÃO quer parecer: ${a.avoid || "não informado"}.\n` +
    `Peças que ela já tem: ${JSON.stringify(ctx.items)}\n\n` +
    `Indique de 3 a 5 peças CORINGA para ela comprar neste mês, que cairiam bem entre as peças que ela já tem e destravariam mais looks. Regras obrigatórias:\n` +
    `1. Só peças adequadas à estação atual (${estacao(monthNum)}) e ao clima da cidade dela; nada fora de estação.\n` +
    `2. Alinhadas à moda atual de ${year}, mas sem modismos passageiros: prefira clássicos atualizados que ela use por muitos anos.\n` +
    `3. Fiéis ao estilo dela e ao que ela disse que NÃO quer vestir.\n` +
    `4. Nada que repita o que ela já tem (uma peça equivalente no closet): complete lacunas.\n` +
    `5. Cada peça deve combinar com pelo menos 3 peças que ela já tem (cite os nomes EXATOS delas em goes_with).\n` +
    `6. Compra consciente: versátil, durável, de boa qualidade e fácil de cuidar. Se o closet dela já estiver bem completo, diga isso na introdução e indique só 1 ou 2 peças. Não cite marcas.\n` +
    `Descreva cada peça de forma específica e fácil de achar numa loja (tipo, cor, modelagem e tecido).\n` +
    `Responda apenas JSON: {"intro":"1 ou 2 frases acolhedoras sobre o que falta no closet dela","pieces":[{"name":"peça específica","category":"blusa|calça|saia|vestido|casaco|sapato|bolsa|acessório|outro","color":"cor","why":"por que cai bem no estilo dela e na estação, em 1 frase","goes_with":["nome exato de peça dela","..."],"tip":"dica de uso ou de compra consciente em 1 frase"}]}`;

  let parsed: any = null;
  try {
    const out = await new OpenAI({ timeout: 90000 }).responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    });
    parsed = parseAiJson(out.output_text);
  } catch (e) {
    console.error("generateJokerSuggestions falhou (IA):", e);
    bounce(BACK, "A IA está indisponível no momento. Tente de novo em instantes.");
  }
  const owned = new Map(ctx.items.map((i) => [i.name.toLowerCase(), i.name]));
  const pieces = (Array.isArray(parsed?.pieces) ? parsed.pieces : []).slice(0, 5).map((p: any) => {
    const name = clip(p?.name, 100); if (!name) return null;
    const goes = (Array.isArray(p?.goes_with) ? p.goes_with : []).map((g: any) => owned.get(clip(g, 120).toLowerCase())).filter(Boolean).slice(0, 5) as string[];
    return { name, category: clip(p?.category, 30) || "outro", color: clip(p?.color, 40), why: clip(p?.why, 220), goes_with: goes, tip: clip(p?.tip, 200) };
  }).filter(Boolean);
  if (pieces.length === 0) bounce(BACK, "Não consegui montar as sugestões agora. Tente de novo em instantes.");

  const saved = await withProfile(async (c, userId) => {
    await c.query("INSERT INTO joker_suggestions(tenant_id,user_id,month,intro,pieces) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,$4::jsonb) ON CONFLICT (user_id,month) DO NOTHING",
      [userId, month, clip(parsed?.intro, 400), JSON.stringify(pieces)]);
    return true;
  });
  if (!saved) redirect("/");
  await flash("Suas compras coringa de " + MESES[monthNum - 1] + " estão prontas!");
  redirect(BACK);
}
