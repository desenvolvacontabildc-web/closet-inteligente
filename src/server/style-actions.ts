"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { hasColorimetria, bumpAndCheckAiUsage } from "./limits";
import { bounce } from "./action-error";

export async function generateColorimetria(f: FormData) {
  const consent = f.get("consent") === "on";
  const photo = f.get("photo");
  const cabelo = String(f.get("cabelo") || "").trim();
  const tingido = String(f.get("tingido") || "").trim();
  const olhos = String(f.get("olhos") || "").trim();
  const bronzeamento = String(f.get("bronzeamento") || "").trim();
  if (!consent) bounce("/colorimetria", "É preciso autorizar o uso da sua foto para fazer a análise.");
  if (!(photo instanceof File) || photo.size === 0) bounce("/colorimetria", "Envie uma foto do seu rosto (ou pulso, para ver as veias) em boa iluminação.");
  if (!(photo as File).type.startsWith("image/")) bounce("/colorimetria", "Envie um arquivo de imagem.");
  if ((photo as File).size > 8 * 1024 * 1024) bounce("/colorimetria", "A foto é muito grande. Envie uma imagem de até 8MB.");
  const dataUrl = `data:${(photo as File).type};base64,${Buffer.from(await (photo as File).arrayBuffer()).toString("base64")}`;

  await withProfile(async (c, userId) => {
    if (!(await hasColorimetria(c, userId))) bounce("/colorimetria", "A Colorimetria ainda não foi liberada na sua conta.");
    if (!process.env.OPENAI_API_KEY) bounce("/colorimetria", "Recurso de IA não configurado.");
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) bounce("/colorimetria", budget.message || "Limite de operações de IA atingido.");
    let out: any;
    try {
      out = await new OpenAI().responses.create({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Você é uma consultora de colorimetria pessoal. A cliente autorizou o uso desta foto (rosto e/ou pulso) só para esta análise. ` +
                `Dados objetivos informados pela cliente: cor natural do cabelo: ${cabelo || "não informado"}; cabelo tingido atualmente: ${tingido || "não informado"}; cor dos olhos: ${olhos || "não informado"}; reação da pele ao sol: ${bronzeamento || "não informado"}.\n` +
                `Observando a pele, o cabelo e os olhos visíveis na foto (e as veias do pulso, se aparecerem), determine o subtom provável (quente, frio ou neutro), a profundidade (clara a profunda), a intensidade (suave a brilhante) e o contraste (baixo a alto). ` +
                `Seja honesta sobre a incerteza: mesmo com foto, isso é uma estimativa por IA, não substitui uma análise presencial de uma colorista profissional. Se a foto não permitir uma leitura confiável, diga isso em notes em vez de inventar. ` +
                `Monte um dossiê completo. Responda apenas JSON: {"subtom":"...","profundidade":"...","intensidade":"...","contraste":"...",` +
                `"cores_protagonistas":"...","neutros":"...","cores_destaque":"...","melhores_combinacoes":"...","metais":"...",` +
                `"orientacao_maquiagem":"...","orientacao_cabelo":"...","favorable_colors":"...","avoid_colors":"...","cores_que_exigem_estrategia":"...","notes":"..."}. ` +
                `Em avoid_colors e cores_que_exigem_estrategia, nunca oriente a simplesmente descartar a peça -- explique como usar com estratégia (ex.: "essa cor não é das mais favoráveis perto do rosto, mas funciona bem em peças afastadas do rosto ou combinada com acessórios neutros"). notes deve mencionar a limitação da análise por foto.`,
            },
            { type: "input_image", image_url: dataUrl, detail: "low" },
          ],
        }],
      });
    } catch {
      bounce("/colorimetria", "A IA está indisponível no momento (sem créditos ou fora do ar). Tente de novo mais tarde.");
    }
    let parsed: any;
    try { parsed = JSON.parse(out.output_text); } catch { bounce("/colorimetria", "A IA não retornou um resultado válido. Tente novamente."); }
    await c.query(
      "INSERT INTO style_profiles(user_id,tenant_id,subtom,favorable_colors,avoid_colors,notes,dossier,photo_consent_at,updated_at) VALUES($1,current_setting('app.tenant_id')::uuid,$2,$3,$4,$5,$6::jsonb,now(),now()) ON CONFLICT (user_id) DO UPDATE SET subtom=excluded.subtom,favorable_colors=excluded.favorable_colors,avoid_colors=excluded.avoid_colors,notes=excluded.notes,dossier=excluded.dossier,photo_consent_at=excluded.photo_consent_at,updated_at=now()",
      [userId, String(parsed.subtom || "").slice(0, 200), String(parsed.favorable_colors || "").slice(0, 1000), String(parsed.avoid_colors || "").slice(0, 1000), String(parsed.notes || "").slice(0, 1000), JSON.stringify(parsed)],
    );
    await c.query("SELECT complete_my_module($1,'COLORIMETRIA')", [userId]);
    return true;
  });
  redirect("/colorimetria");
}
