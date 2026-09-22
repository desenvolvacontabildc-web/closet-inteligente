"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { mySubscription, hasPlanAtLeast, bumpAndCheckAiUsage } from "./limits";
import { bounce } from "./action-error";

export async function generateColorimetria(f: FormData) {
  const consent = f.get("consent") === "on";
  const photo = f.get("photo");
  const cabelo = String(f.get("cabelo") || "").trim();
  const olhos = String(f.get("olhos") || "").trim();
  const bronzeamento = String(f.get("bronzeamento") || "").trim();
  if (!consent) bounce("/colorimetria", "É preciso autorizar o uso da sua foto para fazer a análise.");
  if (!(photo instanceof File) || photo.size === 0) bounce("/colorimetria", "Envie uma foto do seu rosto (ou pulso, para ver as veias) em boa iluminação.");
  if (!(photo as File).type.startsWith("image/")) bounce("/colorimetria", "Envie um arquivo de imagem.");
  if ((photo as File).size > 8 * 1024 * 1024) bounce("/colorimetria", "A foto é muito grande. Envie uma imagem de até 8MB.");
  const dataUrl = `data:${(photo as File).type};base64,${Buffer.from(await (photo as File).arrayBuffer()).toString("base64")}`;

  await withProfile(async (c, userId) => {
    const sub = await mySubscription(c, userId);
    if (!hasPlanAtLeast(sub, "SUPER_STAR")) bounce("/colorimetria", "A Colorimetria é exclusiva do plano Super Star (ou do teste gratuito). Fale com a administradora para migrar de plano.");
    if (!process.env.OPENAI_API_KEY) bounce("/colorimetria", "Recurso de IA não configurado.");
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) bounce("/colorimetria", budget.message || "Limite de uso de IA atingido.");
    const out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Você é uma consultora de colorimetria pessoal. A cliente autorizou o uso desta foto (rosto e/ou pulso) só para esta análise. ` +
              `Informações complementares (opcionais, podem estar em branco): cor natural do cabelo: ${cabelo || "não informado"}; cor dos olhos: ${olhos || "não informado"}; como a pele reage ao sol: ${bronzeamento || "não informado"}.\n` +
              `Observando a pele, o cabelo e os olhos visíveis na foto (e as veias do pulso, se aparecerem), determine o subtom provável (quente, frio ou neutro) e sugira uma paleta de cores que favorecem perto do rosto e cores a evitar. ` +
              `Seja honesta sobre a incerteza: mesmo com foto, isso é uma estimativa por IA, não substitui uma análise presencial de uma colorista profissional. ` +
              `Responda apenas JSON: {"subtom":"...","favorable_colors":"...","avoid_colors":"...","notes":"..."}. notes deve mencionar essa limitação.`,
          },
          { type: "input_image", image_url: dataUrl, detail: "low" },
        ],
      }],
    });
    let parsed: any;
    try { parsed = JSON.parse(out.output_text); } catch { bounce("/colorimetria", "A IA não retornou um resultado válido. Tente novamente."); }
    await c.query(
      "INSERT INTO style_profiles(user_id,tenant_id,subtom,favorable_colors,avoid_colors,notes,photo_consent_at,updated_at) VALUES($1,current_setting('app.tenant_id')::uuid,$2,$3,$4,$5,now(),now()) ON CONFLICT (user_id) DO UPDATE SET subtom=excluded.subtom,favorable_colors=excluded.favorable_colors,avoid_colors=excluded.avoid_colors,notes=excluded.notes,photo_consent_at=excluded.photo_consent_at,updated_at=now()",
      [userId, String(parsed.subtom || "").slice(0, 200), String(parsed.favorable_colors || "").slice(0, 1000), String(parsed.avoid_colors || "").slice(0, 1000), String(parsed.notes || "").slice(0, 1000)],
    );
    return true;
  });
  redirect("/colorimetria");
}
