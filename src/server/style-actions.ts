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

/** "Peças coringa pra comprar" -- analisa o closet real (só nomes/categorias, sem inventar
 * peça que ela não tem) e sugere, no máximo, algumas peças versáteis que fariam falta.
 * Se o closet já for amplo e variado, diz claramente que está suficiente em vez de sugerir
 * por sugerir. Sob demanda (botão em Looks), nunca automático. */
export async function generateWardrobeGaps(f: FormData) {
  const returnPath = String(f.get("return_path") || "/looks");
  await withProfile(async (c, userId) => {
    if (!process.env.OPENAI_API_KEY) bounce(returnPath, "Recurso de IA não configurado.");
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) bounce(returnPath, budget.message || "Limite de operações de IA atingido.");
    const items = (await c.query("SELECT name, category FROM closet_items WHERE status='ACTIVE' ORDER BY category, name")).rows;
    if (items.length === 0) bounce(returnPath, "Cadastre ao menos uma peça no closet antes de pedir essa sugestão.");
    const dossier = (await c.query("SELECT dossier FROM style_profiles WHERE user_id=$1", [userId])).rows[0]?.dossier || null;
    let out: any;
    try {
      out = await new OpenAI().responses.create({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text:
              `Você é uma consultora de imagem. Peças reais e ativas no closet da cliente (nomes já indicam cor/estampa):\n${JSON.stringify(items)}\n` +
              (dossier ? `Colorimetria já feita da cliente (cores favoráveis e a evitar), leve em conta pra sugerir cores que funcionem nela:\n${JSON.stringify(dossier)}\n` : "") +
              `Analise se o closet tem peças "coringa" suficientes (básicos versáteis que combinam entre si e cobrem as categorias principais: parte de cima, parte de baixo, calçado, bolsa, uma peça de destaque/estruturada). ` +
              `Se o closet já for amplo, variado em cor e cobre bem essas categorias, responda que está suficiente -- não sugira por sugerir. ` +
              `Se estiver faltando algo, sugira no máximo 3 peças ESPECÍFICAS (categoria + cor, ex.: "bolsa dourada estruturada", "sandália branca de tiras", "blazer rosa") seguindo regras de estilo de contraste e versatilidade -- ` +
              `por exemplo, se o closet for majoritariamente monocromático ou escuro (muito preto/neutro), priorize UMA peça ou acessório de cor viva ou metálica pra dar destaque e contraste (ex.: bolsa dourada, sandália branca, blazer rosa), em vez de sugerir mais peças na mesma paleta. Nunca sugira algo que ela já tem. ` +
              `Responda apenas JSON: {"sufficient":true|false,"reasoning":"1-2 frases explicando o motivo","suggestions":[{"item":"categoria + cor","why":"1 frase, regra de estilo aplicada"}]}. Se sufficient=true, suggestions deve ser [].`,
          }],
        }],
      });
    } catch {
      bounce(returnPath, "A IA está indisponível no momento (sem créditos ou fora do ar). Tente de novo mais tarde.");
    }
    let parsed: any;
    try { parsed = JSON.parse(out.output_text); } catch { bounce(returnPath, "A IA não retornou um resultado válido. Tente novamente."); }
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map((s: any) => ({ item: String(s.item || "").slice(0, 120), why: String(s.why || "").slice(0, 300) })) : [];
    await c.query(
      "UPDATE profiles SET wardrobe_gap_sufficient=$1, wardrobe_gap_reasoning=$2, wardrobe_gap_suggestions=$3::jsonb, wardrobe_gap_updated_at=now() WHERE user_id=$4",
      [!!parsed.sufficient, String(parsed.reasoning || "").slice(0, 500), JSON.stringify(suggestions), userId],
    );
    return true;
  });
  redirect(returnPath);
}
