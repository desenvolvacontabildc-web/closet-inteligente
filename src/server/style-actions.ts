"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { mySubscription, hasPlanAtLeast, bumpAndCheckAiUsage } from "./limits";
export async function generateColorimetria(f: FormData) {
  const veias = String(f.get("veias") || "").trim();
  const joia = String(f.get("joia") || "").trim();
  const cabelo = String(f.get("cabelo") || "").trim();
  const olhos = String(f.get("olhos") || "").trim();
  const bronzeamento = String(f.get("bronzeamento") || "").trim();
  if (!veias || !joia) throw new Error("Responda ao menos as perguntas sobre veias e joia.");
  await withProfile(async (c, userId) => {
    const sub = await mySubscription(c, userId);
    if (!hasPlanAtLeast(sub, "SUPER_STAR")) throw new Error("A Colorimetria é exclusiva do plano Super Star (ou do teste gratuito). Fale com a administradora para migrar de plano.");
    if (!process.env.OPENAI_API_KEY) throw new Error("Recurso de IA não configurado.");
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) throw new Error(budget.message);
    const out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text:
            `Você é uma consultora de colorimetria pessoal. A cliente respondeu, sobre si mesma (sem foto, apenas relato):\n` +
            `Cor das veias do pulso: ${veias}\nFica melhor em joia dourada ou prateada: ${joia}\nCor natural do cabelo: ${cabelo || "não informado"}\nCor dos olhos: ${olhos || "não informado"}\nComo a pele reage ao sol: ${bronzeamento || "não informado"}\n` +
            `Com base só nisso, determine o subtom provável (quente, frio ou neutro) e sugira uma paleta de cores que favorecem perto do rosto e cores a evitar. ` +
            `Seja honesta sobre a incerteza: isso é uma estimativa por relato, não uma análise profissional com fotos. ` +
            `Responda apenas JSON: {"subtom":"...","favorable_colors":"...","avoid_colors":"...","notes":"..."}. notes deve mencionar essa limitação.`,
        }],
      }],
    });
    let parsed: any;
    try { parsed = JSON.parse(out.output_text); } catch { throw new Error("A IA não retornou um resultado válido. Tente novamente."); }
    await c.query(
      "INSERT INTO style_profiles(user_id,tenant_id,subtom,favorable_colors,avoid_colors,notes,updated_at) VALUES($1,current_setting('app.tenant_id')::uuid,$2,$3,$4,$5,now()) ON CONFLICT (user_id) DO UPDATE SET subtom=excluded.subtom,favorable_colors=excluded.favorable_colors,avoid_colors=excluded.avoid_colors,notes=excluded.notes,updated_at=now()",
      [userId, String(parsed.subtom || "").slice(0, 200), String(parsed.favorable_colors || "").slice(0, 1000), String(parsed.avoid_colors || "").slice(0, 1000), String(parsed.notes || "").slice(0, 1000)],
    );
    return true;
  });
  redirect("/colorimetria");
}
