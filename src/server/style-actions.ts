"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { hasColorimetria, bumpAndCheckAiUsage } from "./limits";
import { bounce } from "./action-error";
import { CORES_PALETA, NEUTROS_PALETA, TINGIDO_OPCOES, BRONZEAMENTO_OPCOES, PROFUNDIDADE_PELE_SWATCHES, BRANCO_SWATCHES, METAL_SWATCHES, SUBTOM_OPCOES, INTENSIDADE_OPCOES, CONTRASTE_OPCOES } from "./color-options";

function labelFor(list: { value: string; label: string }[], value: string): string {
  return list.find((o) => o.value === value)?.label || value;
}
function labelsFor(list: { value: string; label: string }[], values: string[]): string {
  return (values || []).map((v) => labelFor(list, v)).filter(Boolean).join(", ") || "não informado";
}

/** Etapas do questionário (todas de marcar opção, quase nada de texto livre) -- salva
 * incrementalmente em `answers` pra sobreviver a voltar/avançar e retomar depois. */
export async function saveColorStep(f: FormData) {
  const step = Number(f.get("step") || 0);
  await withProfile(async (c, userId) => {
    await c.query(
      "INSERT INTO style_profiles(user_id,tenant_id) VALUES($1,current_setting('app.tenant_id')::uuid) ON CONFLICT (user_id) DO NOTHING",
      [userId],
    );
    const current = (await c.query("SELECT answers FROM style_profiles WHERE user_id=$1", [userId])).rows[0]?.answers || {};
    let patch: Record<string, any> = {};
    if (step === 1) patch = { cabelo_natural: String(f.get("cabelo_natural") || ""), cabelo_tingido: String(f.get("cabelo_tingido") || ""), cabelo_atual_cor: String(f.get("cabelo_atual_cor") || "") };
    else if (step === 2) patch = { olhos: String(f.get("olhos") || ""), bronzeamento: String(f.get("bronzeamento") || "") };
    else if (step === 3) patch = { profundidade_pele: String(f.get("profundidade_pele") || "") };
    else if (step === 4) patch = { branco_pref: String(f.get("branco_pref") || ""), metal_pref: String(f.get("metal_pref") || "") };
    else if (step === 5) patch = { subtom_autodeclarado: String(f.get("subtom_autodeclarado") || ""), intensidade_pref: String(f.get("intensidade_pref") || ""), contraste_pref: String(f.get("contraste_pref") || "") };
    else if (step === 6) patch = { cores_iluminam: f.getAll("cores_iluminam").map(String) };
    else if (step === 7) patch = { cores_nao_favorecem: f.getAll("cores_nao_favorecem").map(String) };
    else if (step === 8) patch = { cores_favoritas: f.getAll("cores_favoritas").map(String), cores_evitar_preferencia: f.getAll("cores_evitar_preferencia").map(String), neutros_favoritos: f.getAll("neutros_favoritos").map(String) };
    const updated = { ...current, ...patch };
    await c.query("UPDATE style_profiles SET answers=$1::jsonb WHERE user_id=$2", [JSON.stringify(updated), userId]);
    return true;
  });
  redirect(`/colorimetria?step=${step + 1}`);
}

function buildColorimetriaPrompt(a: Record<string, any>, hasPhoto: boolean): string {
  return (
    `Você é uma consultora de colorimetria pessoal. A cliente respondeu um questionário estruturado (não é texto livre da cliente, são escolhas de opções fixas). ` +
    `Classifique cada conclusão sua como OBSERVÁVEL (só quando vier claramente de uma foto), AUTODECLARADO (resposta direta do questionário), PERCEPÇÃO (sua leitura de estilo) ou PREFERÊNCIA (gosto pessoal, não é sobre o que fica bem). ` +
    `Quando dois sinais conflitarem (ex.: subtom autodeclarado diferente do que a foto sugere), REDUZA a confiança em vez de forçar uma conclusão única -- explique o conflito em reasoning.\n\n` +
    `Respostas do questionário:\n` +
    `- Cor natural do cabelo: ${a.cabelo_natural || "não informado"}${a.cabelo_tingido && a.cabelo_tingido !== "nao" ? ` (cabelo hoje: ${labelFor(TINGIDO_OPCOES, a.cabelo_tingido)}${a.cabelo_atual_cor ? ", cor atual: " + a.cabelo_atual_cor : ""})` : ""}\n` +
    `- Cor dos olhos: ${a.olhos || "não informado"}\n` +
    `- Reação da pele ao sol: ${labelFor(BRONZEAMENTO_OPCOES, a.bronzeamento || "")}\n` +
    `- Profundidade de pele (escolhida numa escala visual clara→profunda): ${labelFor(PROFUNDIDADE_PELE_SWATCHES, a.profundidade_pele || "")}\n` +
    `- Entre branco puro e off-white, o que mais harmoniza perto do rosto: ${labelFor(BRANCO_SWATCHES, a.branco_pref || "")}\n` +
    `- Metal de joia que mais harmoniza: ${labelFor(METAL_SWATCHES, a.metal_pref || "")}\n` +
    `- Subtom que a cliente ACHA que tem (autodeclarado, pode estar errado): ${labelFor(SUBTOM_OPCOES, a.subtom_autodeclarado || "")}\n` +
    `- Intensidade de cor que a cliente prefere usar: ${labelFor(INTENSIDADE_OPCOES, a.intensidade_pref || "")}\n` +
    `- Contraste entre cabelo/pele/olhos que a cliente percebe em si: ${labelFor(CONTRASTE_OPCOES, a.contraste_pref || "")}\n` +
    `- Cores que a cliente sente que iluminam o rosto dela (percepção dela, use como pista, não como verdade absoluta): ${labelsFor(CORES_PALETA, a.cores_iluminam || [])}\n` +
    `- Cores que a cliente sente que NÃO favorecem perto do rosto: ${labelsFor(CORES_PALETA, a.cores_nao_favorecem || [])}\n` +
    `- Cores favoritas por PREFERÊNCIA pessoal (gosto, não é sobre o que fica bem -- pode ser diferente das que favorecem): ${labelsFor(CORES_PALETA, a.cores_favoritas || [])}\n` +
    `- Cores que a cliente prefere evitar só por gosto pessoal (não confundir com o que não favorece): ${labelsFor(CORES_PALETA, a.cores_evitar_preferencia || [])}\n` +
    `- Neutros favoritos: ${labelsFor(NEUTROS_PALETA, a.neutros_favoritos || [])}\n\n` +
    (hasPhoto
      ? `A cliente também autorizou o uso de uma foto (rosto e/ou pulso) só para esta análise, pra complementar (não substituir) o questionário. Observe pele, cabelo, olhos e veias visíveis. Se a foto não permitir uma leitura confiável (iluminação ruim, filtro, maquiagem pesada, ângulo ruim), diga isso claramente em notes em vez de inventar precisão que a foto não permite.\n\n`
      : `A cliente optou por não enviar foto -- baseie a análise inteiramente no questionário estruturado acima, e diga em notes que sem foto a confiança é naturalmente um pouco menor.\n\n`) +
    `Determine subtom (quente, frio ou neutro), profundidade, intensidade e contraste, cruzando TODOS os sinais acima (nunca conclua só de uma resposta isolada). ` +
    `Monte a paleta de cores que favorecem, sempre com nome E código hexadecimal de cor real (nunca invente um hex que não corresponda ao nome). Nunca diga "nunca use esta cor" -- para cores que não favorecem tanto perto do rosto, explique como usar com estratégia (longe do rosto, em acessórios, combinada com um neutro que favoreça). ` +
    `Responda apenas JSON no formato: {` +
    `"subtom":"quente|frio|neutro","confidence":"alta|media|baixa",` +
    `"profundidade":"...","intensidade":"...","contraste":"...",` +
    `"melhores_cores":{` +
    `"neutros":[{"name":"...","hex":"#rrggbb"}],` +
    `"claras":[{"name":"...","hex":"#rrggbb"}],` +
    `"medias":[{"name":"...","hex":"#rrggbb"}],` +
    `"profundas":[{"name":"...","hex":"#rrggbb"}],` +
    `"destaque":[{"name":"...","hex":"#rrggbb"}],` +
    `"proximas_rosto":[{"name":"...","hex":"#rrggbb"}]` +
    `},` +
    `"metais":[{"name":"...","hex":"#rrggbb"}],` +
    `"combinacoes_recomendadas":[{"cores":[{"name":"...","hex":"#rrggbb"},{"name":"...","hex":"#rrggbb"}],"nota":"..."}],` +
    `"cores_com_estrategia":[{"name":"...","hex":"#rrggbb","nota":"como usar com estratégia"}],` +
    `"orientacao_maquiagem":"...","orientacao_cabelo":"...",` +
    `"reasoning":"1-3 frases explicando como cruzou os sinais e por que chegou nessa conclusão, mencionando conflitos se houver",` +
    `"notes":"limitações da análise (foto ou falta dela, respostas conflitantes, etc.)"` +
    `}.`
  );
}

/** Segue o padrão de 3 fases (ler / chamar IA / gravar) pra nunca manter uma conexão do
 * pool presa durante a chamada à OpenAI. */
export async function generateColorimetria(f: FormData) {
  const consent = f.get("consent") === "on";
  const photo = f.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto && !consent) bounce("/colorimetria?step=9", "Autorize o uso da foto para incluí-la na análise, ou envie sem foto.");
  if (hasPhoto && !(photo as File).type.startsWith("image/")) bounce("/colorimetria?step=9", "Envie um arquivo de imagem.");
  if (hasPhoto && (photo as File).size > 8 * 1024 * 1024) bounce("/colorimetria?step=9", "A foto é muito grande. Envie uma imagem de até 8MB.");
  const dataUrl = hasPhoto ? `data:${(photo as File).type};base64,${Buffer.from(await (photo as File).arrayBuffer()).toString("base64")}` : null;

  const ctx = await withProfile(async (c, userId) => {
    if (!(await hasColorimetria(c, userId))) return { ok: false as const, message: "A Colorimetria ainda não foi liberada na sua conta." };
    if (!process.env.OPENAI_API_KEY) return { ok: false as const, message: "Recurso de IA não configurado." };
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) return { ok: false as const, message: budget.message || "Limite de operações de IA atingido." };
    const answers = (await c.query("SELECT answers FROM style_profiles WHERE user_id=$1", [userId])).rows[0]?.answers || {};
    return { ok: true as const, answers };
  });
  if (!ctx) redirect("/colorimetria");
  if (!ctx.ok) bounce("/colorimetria", ctx.message);

  const promptText = buildColorimetriaPrompt(ctx.answers, hasPhoto);
  const content: any[] = [{ type: "input_text", text: promptText }];
  if (dataUrl) content.push({ type: "input_image", image_url: dataUrl, detail: "low" });
  let out: any;
  try {
    out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content }],
    });
  } catch (e) {
    console.error("generateColorimetria falhou (IA):", e);
    bounce("/colorimetria", "A IA está indisponível no momento (sem créditos ou fora do ar). Tente de novo mais tarde.");
  }
  let parsed: any;
  try { parsed = JSON.parse(out.output_text); } catch (e) { console.error("generateColorimetria JSON inválido:", e); bounce("/colorimetria", "A IA não retornou um resultado válido. Tente novamente."); }
  const melhores = parsed.melhores_cores || {};
  const favorableFlat = ([] as any[]).concat(melhores.destaque || [], melhores.proximas_rosto || [], melhores.claras || [], melhores.medias || [], melhores.profundas || [])
    .map((c: any) => c?.name).filter(Boolean).join(", ");
  const avoidFlat = (parsed.cores_com_estrategia || []).map((c: any) => c?.name).filter(Boolean).join(", ");

  const saved = await withProfile(async (c, userId) => {
    await c.query(
      "INSERT INTO style_profiles(user_id,tenant_id,subtom,favorable_colors,avoid_colors,notes,dossier,photo_consent_at,updated_at) VALUES($1,current_setting('app.tenant_id')::uuid,$2,$3,$4,$5,$6::jsonb,$7,now()) " +
      "ON CONFLICT (user_id) DO UPDATE SET subtom=excluded.subtom,favorable_colors=excluded.favorable_colors,avoid_colors=excluded.avoid_colors,notes=excluded.notes,dossier=excluded.dossier,photo_consent_at=COALESCE(excluded.photo_consent_at,style_profiles.photo_consent_at),updated_at=now()",
      [userId, String(parsed.subtom || "").slice(0, 200), favorableFlat.slice(0, 1000), avoidFlat.slice(0, 1000), String(parsed.notes || parsed.reasoning || "").slice(0, 1000), JSON.stringify(parsed), hasPhoto ? new Date() : null],
    );
    await c.query("SELECT complete_my_module($1,'COLORIMETRIA')", [userId]);
    return true;
  });
  if (!saved) redirect("/colorimetria");
  redirect("/colorimetria");
}

/** "Peças coringa pra comprar" -- analisa o closet real (só nomes/categorias, sem inventar
 * peça que ela não tem) e sugere, no máximo, algumas peças versáteis que fariam falta.
 * Se o closet já for amplo e variado, diz claramente que está suficiente em vez de sugerir
 * por sugerir. Sob demanda (botão em Looks), nunca automático. */
export async function generateWardrobeGaps(f: FormData) {
  const returnPath = String(f.get("return_path") || "/looks");
  const ctx = await withProfile(async (c, userId) => {
    if (!process.env.OPENAI_API_KEY) return { ok: false as const, message: "Recurso de IA não configurado." };
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) return { ok: false as const, message: budget.message || "Limite de operações de IA atingido." };
    const items = (await c.query("SELECT name, category FROM closet_items WHERE status='ACTIVE' ORDER BY category, name")).rows;
    if (items.length === 0) return { ok: false as const, message: "Cadastre ao menos uma peça no closet antes de pedir essa sugestão." };
    const dossier = (await c.query("SELECT dossier FROM style_profiles WHERE user_id=$1", [userId])).rows[0]?.dossier || null;
    return { ok: true as const, items, dossier };
  });
  if (!ctx) redirect(returnPath);
  if (!ctx.ok) bounce(returnPath, ctx.message);

  let out: any;
  try {
    out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text:
            `Você é uma consultora de imagem. Peças reais e ativas no closet da cliente (nomes já indicam cor/estampa):\n${JSON.stringify(ctx.items)}\n` +
            (ctx.dossier ? `Colorimetria já feita da cliente (cores favoráveis e a evitar), leve em conta pra sugerir cores que funcionem nela:\n${JSON.stringify(ctx.dossier)}\n` : "") +
            `Analise se o closet tem peças "coringa" suficientes (básicos versáteis que combinam entre si e cobrem as categorias principais: parte de cima, parte de baixo, calçado, bolsa, uma peça de destaque/estruturada). ` +
            `Se o closet já for amplo, variado em cor e cobre bem essas categorias, responda que está suficiente -- não sugira por sugerir. ` +
            `Se estiver faltando algo, sugira no máximo 3 peças ESPECÍFICAS (categoria + cor, ex.: "bolsa dourada estruturada", "sandália branca de tiras", "blazer rosa") seguindo regras de estilo de contraste e versatilidade -- ` +
            `por exemplo, se o closet for majoritariamente monocromático ou escuro (muito preto/neutro), priorize UMA peça ou acessório de cor viva ou metálica pra dar destaque e contraste (ex.: bolsa dourada, sandália branca, blazer rosa), em vez de sugerir mais peças na mesma paleta. Nunca sugira algo que ela já tem. ` +
            `Responda apenas JSON: {"sufficient":true|false,"reasoning":"1-2 frases explicando o motivo","suggestions":[{"item":"categoria + cor","why":"1 frase, regra de estilo aplicada"}]}. Se sufficient=true, suggestions deve ser [].`,
        }],
      }],
    });
  } catch (e) {
    console.error("generateWardrobeGaps falhou (IA):", e);
    bounce(returnPath, "A IA está indisponível no momento (sem créditos ou fora do ar). Tente de novo mais tarde.");
  }
  let parsed: any;
  try { parsed = JSON.parse(out.output_text); } catch (e) { console.error("generateWardrobeGaps JSON inválido:", e); bounce(returnPath, "A IA não retornou um resultado válido. Tente novamente."); }
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map((s: any) => ({ item: String(s.item || "").slice(0, 120), why: String(s.why || "").slice(0, 300) })) : [];

  const saved = await withProfile(async (c, userId) => {
    await c.query(
      "UPDATE profiles SET wardrobe_gap_sufficient=$1, wardrobe_gap_reasoning=$2, wardrobe_gap_suggestions=$3::jsonb, wardrobe_gap_updated_at=now() WHERE user_id=$4",
      [!!parsed.sufficient, String(parsed.reasoning || "").slice(0, 500), JSON.stringify(suggestions), userId],
    );
    return true;
  });
  if (!saved) redirect(returnPath);
  redirect(returnPath);
}
