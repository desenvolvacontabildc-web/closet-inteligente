"use server";
import OpenAI, { toFile } from "openai";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bumpAndCheckAiUsage, checkImageAllowance, consumeImageAllowance } from "./limits";
import { bounce } from "./action-error";
import { fetchCurrentWeather } from "./weather";
const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
async function readObject(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const ch of await store.getObject(process.env.S3_BUCKET || "closet-private", key) as any) chunks.push(Buffer.from(ch));
  return Buffer.concat(chunks);
}

/** Toda geração por IA deste arquivo segue 3 fases -- ler (transação curta), chamar a IA
 * (sem nenhuma conexão do pool presa) e gravar (nova transação curta) -- pra nunca travar o
 * pool de conexões do banco durante uma chamada externa que pode levar bastante tempo. */

/** Fase 1 da ilustração: monta o prompt e junta as referências de foto, sem chamar a IA. */
async function prepareIllustration(c: any, userId: string, itemIds: string[], description: string, style: "REALISTA" | "AVATAR" | "ILUSTRACAO"): Promise<
  | { ok: true; promptBase: string; refs: { key: string; type: string }[]; hasIdentityRef: boolean }
  | { ok: false; result: "NO_AVATAR" }
> {
  // Uma foto de referência por peça do look (até 4) -- com menos peças com foto real, a IA
  // precisa "adivinhar" as demais só pelo nome e acaba inventando cor/corte errado.
  const photos = (await c.query(
    "SELECT DISTINCT ON (item_id) item_id, object_key, content_type FROM closet_item_photos WHERE item_id = ANY($1::uuid[]) ORDER BY item_id, created_at DESC LIMIT 4",
    [itemIds],
  )).rows;
  let avatarKey: string | null = null;
  if (style === "AVATAR") {
    const avatarRow = (await c.query("SELECT avatar_illustration_object_key FROM profiles WHERE user_id=$1", [userId])).rows[0];
    avatarKey = avatarRow?.avatar_illustration_object_key || null;
    if (!avatarKey) return { ok: false, result: "NO_AVATAR" };
  }
  let likenessRef: { key: string; type: string } | null = null;
  if (style === "REALISTA") {
    const bodyRow = (await c.query("SELECT body_photo_object_key, body_photo_content_type FROM profiles WHERE user_id=$1", [userId])).rows[0];
    if (bodyRow?.body_photo_object_key) likenessRef = { key: bodyRow.body_photo_object_key, type: bodyRow.body_photo_content_type || "image/jpeg" };
  }
  // Nunca inventar peça de roupa ou acessório extra, nem alterar cor/estampa das peças reais
  // referenciadas -- pra não parecer que a cliente tem algo que ela não tem.
  const semInvencao =
    "IMPORTANTE, siga rigorosamente: a cliente veste SOMENTE estas peças, nada além disso: " + description + ". " +
    "NÃO adicione nenhuma peça de roupa extra que não esteja nessa lista (sem blazer, casaco, cardigã, colete, lenço, cinto vistoso ou camada extra por conta própria). " +
    "Cada peça de roupa que tiver uma imagem de referência real deve aparecer EXATAMENTE como está na foto de referência -- mesma cor, tecido, corte e estampa, sem inventar variação. " +
    "Para qualquer item não descrito na lista e sem referência (ex.: sapato, bolsa), use algo básico, neutro e discreto (ex.: sapato nude simples, sem bolsa à vista) -- nunca invente uma peça de destaque, cor ou estampa chamativa que não esteja na lista.";
  let promptBase: string;
  if (style === "REALISTA") {
    promptBase = likenessRef
      ? `Fotografia de moda realista, aparência fotográfica (NÃO desenho, NÃO ilustração, NÃO croqui). Use a primeira imagem de referência para manter o mesmo rosto, tom de pele e aparência da pessoa nela (é uma foto real dela, autorizada por ela mesma), de corpo inteiro, ` +
        `iluminação natural de estúdio. Vestindo esta combinação: ${description}. ${semInvencao} Fundo neutro claro, sem texto na imagem.`
      : `Fotografia de moda realista, aparência fotográfica (NÃO desenho, NÃO ilustração, NÃO croqui), modelo genérica de corpo inteiro sem identidade real de nenhuma pessoa (a cliente ainda não enviou uma foto de referência), ` +
        `iluminação natural de estúdio. Vestindo esta combinação: ${description}. ${semInvencao} Fundo neutro claro, sem texto na imagem.`;
  } else if (style === "AVATAR") {
    promptBase =
      `Ilustração editorial de moda, estilo croqui/silhueta estilizada, sem rosto detalhado e sem identidade real de nenhuma pessoa. ` +
      `Use a primeira imagem de referência como o avatar/silhueta da cliente (mantenha as mesmas proporções de corpo e a pose), sem copiar roupa nem rosto dela. ` +
      `Vestindo esta combinação: ${description}. ${semInvencao} Fundo neutro claro, traço elegante, sem texto na imagem.`;
  } else {
    promptBase =
      `Ilustração editorial de moda, estilo croqui/silhueta estilizada, figura genérica de moda, sem rosto detalhado e sem identidade real de nenhuma pessoa. ` +
      `Vestindo esta combinação: ${description}. ${semInvencao} Fundo neutro claro, traço elegante, sem texto na imagem.`;
  }
  const refs: { key: string; type: string }[] = [];
  if (avatarKey) refs.push({ key: avatarKey, type: "image/png" });
  if (likenessRef) refs.push(likenessRef);
  for (const p of photos) refs.push({ key: p.object_key, type: p.content_type });
  return { ok: true, promptBase, refs, hasIdentityRef: !!(avatarKey || likenessRef) };
}

/** Fase 2 da ilustração: lê as fotos de referência do S3 (não é o banco) e chama a IA. */
async function callIllustrationAI(refs: { key: string; type: string }[], promptBase: string, hasIdentityRef: boolean): Promise<{ ok: true; buf: Buffer } | { ok: false }> {
  const openai = new OpenAI({ timeout: 120000 });
  let img;
  try {
    if (refs.length > 0) {
      const files = await Promise.all(refs.map(async (r, i) => toFile(await readObject(r.key), `ref-${i}.png`, { type: r.type })));
      img = await openai.images.edit({ model: "gpt-image-2.5-sunburst", image: files, size: "1024x1024", quality: "medium", prompt: `${hasIdentityRef ? "" : "Use estas fotos reais das peças como referência de cor, textura e caimento. "}${promptBase}` });
    } else {
      img = await openai.images.generate({ model: "gpt-image-2.5-flare", size: "1024x1024", quality: "medium", prompt: promptBase });
    }
  } catch (e) {
    console.error("callIllustrationAI falhou:", e);
    return { ok: false };
  }
  const b64 = img.data?.[0]?.b64_json;
  if (!b64) return { ok: false };
  return { ok: true, buf: Buffer.from(b64, "base64") };
}

/** Fase 3 da ilustração: grava o resultado já pronto. */
async function writeIllustrationResult(c: any, userId: string, lookId: string, buf: Buffer, style: string): Promise<"OK" | "FAILED"> {
  const key = `looks/${lookId}/illustration.png`;
  try {
    await store.putObject(process.env.S3_BUCKET || "closet-private", key, buf, buf.length, { "Content-Type": "image/png" });
  } catch (e) {
    console.error("writeIllustrationResult putObject falhou:", e);
    return "FAILED";
  }
  await c.query("UPDATE looks SET illustration_object_key=$1, visual_style=$2 WHERE id=$3", [key, style, lookId]);
  await c.query("SELECT log_image_generation($1,current_setting('app.tenant_id')::uuid)", [userId]);
  return "OK";
}

/** Botão "Gerar inspiração em imagem" em cada look -- consome só o orçamento de geração de
 * imagem (não o de operações de IA, que é pra raciocínio/texto, contador separado). */
export async function generateLookIllustration(f: FormData) {
  const lookId = String(f.get("look_id") || "");
  const returnPath = String(f.get("return_path") || "/looks");
  const requestedStyle = String(f.get("visual_style") || "");

  const prep = await withProfile(async (c, userId) => {
    const allowance = await checkImageAllowance(c, userId);
    if (!allowance.ok) bounce(returnPath, allowance.message || "Limite de gerações de imagem atingido.");
    const prof = (await c.query("SELECT default_visual_style FROM profiles WHERE user_id=$1", [userId])).rows[0];
    const style = (["REALISTA", "AVATAR", "ILUSTRACAO"].includes(requestedStyle) ? requestedStyle : prof?.default_visual_style || "ILUSTRACAO") as "REALISTA" | "AVATAR" | "ILUSTRACAO";
    const look = await c.query(
      `SELECT l.name, l.occasion, (SELECT array_agg(ci.id::text) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS item_ids,
        (SELECT array_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
       FROM looks l WHERE l.id=$1`,
      [lookId],
    );
    if (!look.rowCount) bounce(returnPath, "Look não encontrado.");
    const { name, occasion, item_ids, pieces } = look.rows[0];
    const illust = await prepareIllustration(c, userId, item_ids || [], `${name || "look"} (${occasion || "sem ocasião"}): ${(pieces || []).join(", ")}`, style);
    return { userId, allowanceSource: allowance.source, style, illust };
  });
  if (!prep) redirect(returnPath);
  if (!prep.illust.ok) bounce(returnPath, "Você ainda não tem um avatar personalizado. Crie o seu avatar no Perfil primeiro.");

  const aiResult = await callIllustrationAI(prep.illust.refs, prep.illust.promptBase, prep.illust.hasIdentityRef);
  if (!aiResult.ok) bounce(returnPath, "Não foi possível gerar a imagem agora (sem créditos ou fora do ar). Tente de novo mais tarde.");

  const saved = await withProfile(async (c, userId) => {
    const result = await writeIllustrationResult(c, userId, lookId, aiResult.buf, prep.style);
    if (result === "OK") await consumeImageAllowance(c, userId, prep.allowanceSource);
    return result;
  });
  if (!saved) redirect(returnPath);
  if (saved === "FAILED") bounce(returnPath, "Não foi possível salvar a imagem gerada agora. Tente de novo em instantes.");
  redirect(returnPath);
}

/** "Gostei" (salva o look em Looks Aprovados) / "Não é pra mim" -- feedback simples numa
 * imagem/composição gerada. Não interpreta "não gostei" como rejeição das peças do look. */
export async function submitLookFeedback(f: FormData) {
  const lookId = String(f.get("look_id") || "");
  const kind = String(f.get("kind") || "");
  const returnPath = String(f.get("return_path") || "/looks");
  if (kind !== "LIKE" && kind !== "DISLIKE") bounce(returnPath, "Feedback inválido.");
  await withProfile(async (c, userId) => {
    const look = await c.query("SELECT status FROM looks WHERE id=$1", [lookId]);
    if (!look.rowCount) bounce(returnPath, "Look não encontrado.");
    await c.query(
      "INSERT INTO look_feedback(tenant_id,user_id,look_id,kind,context) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,$4)",
      [userId, lookId, kind, returnPath],
    );
    if (kind === "LIKE" && look.rows[0].status !== "WORN") {
      await c.query("UPDATE looks SET status='APPROVED', approved_at=now(), updated_at=now() WHERE id=$1", [lookId]);
    }
    return true;
  });
  redirect(returnPath);
}

/** Marca que a cliente de fato USOU o look (diferente de só ter aprovado a imagem) e
 * pede o feedback pós-uso, que pesa mais na personalização do que um "gostei". */
export async function markLookWorn(f: FormData) {
  const lookId = String(f.get("look_id") || "");
  const returnPath = String(f.get("return_path") || "/looks");
  await withProfile(async (c) => {
    const look = await c.query("SELECT id FROM looks WHERE id=$1", [lookId]);
    if (!look.rowCount) bounce(returnPath, "Look não encontrado.");
    await c.query("UPDATE looks SET status='WORN', worn_at=now(), updated_at=now() WHERE id=$1", [lookId]);
    return true;
  });
  redirect(returnPath);
}

export async function submitPostUseFeedback(f: FormData) {
  const lookId = String(f.get("look_id") || "");
  const sentiment = String(f.get("sentiment") || "");
  const returnPath = String(f.get("return_path") || "/looks");
  const valid = ["AMEI", "GOSTEI", "MUDARIA", "NAO_REPETIRIA"];
  if (!valid.includes(sentiment)) bounce(returnPath, "Escolha uma opção válida.");
  await withProfile(async (c, userId) => {
    const look = await c.query("SELECT id FROM looks WHERE id=$1", [lookId]);
    if (!look.rowCount) bounce(returnPath, "Look não encontrado.");
    await c.query(
      "INSERT INTO look_feedback(tenant_id,user_id,look_id,kind,sentiment,context) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,'POST_USE',$3,$4)",
      [userId, lookId, sentiment, returnPath],
    );
    return true;
  });
  redirect(returnPath);
}

/** Vira um trecho pra incluir no pedido à IA -- só influencia a ESCOLHA das peças, nunca
 * deve aparecer no nome/ocasião do look (isso é mostrado como aviso próprio na Home, não
 * dentro do look). Falha aqui nunca deve travar a geração do look -- só volta string vazia. */
async function weatherPromptHint(city: string): Promise<string> {
  const w = await fetchCurrentWeather(city);
  if (!w) return "";
  return ` Clima agora em ${w.city}: ${w.temp}°C${w.chovendo ? ", chovendo" : ""}. Leve isso em conta SÓ NA ESCOLHA DAS PEÇAS (mais leves se estiver quente, com casaco/blazer se estiver frio, evite tecidos delicados se estiver chovendo). IMPORTANTE: nunca mencione o clima, a temperatura ou algo como "dia chuvoso"/"dia quente" no nome ou na ocasião do look -- esses campos descrevem a ocasião real (ex. "Dia casual", "Reunião"), não o tempo.`;
}

/** Núcleo compartilhado: pede N looks à IA usando somente peças reais ativas e salva.
 * Looks salvos são ilimitados -- só a operação de IA (esta chamada) é contada. Gerencia
 * suas próprias transações curtas (não recebe `c` de fora) -- a chamada à IA roda
 * inteiramente sem nenhuma conexão do pool presa. */
async function generateLooksFromRequest(userId: string, request: string, maxLooks: number, kind: "SUGGESTED" | "DAILY" | "TRIP", tripLabel = "", returnPath = "/looks"): Promise<{ createdCount: number; note?: string }> {
  const ctx = await withProfile(async (c) => {
    if (!process.env.OPENAI_API_KEY) return { ok: false as const, message: "Sugestão por IA não configurada: defina OPENAI_API_KEY no servidor." };
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) return { ok: false as const, message: budget.message || "Limite de operações de IA atingido." };
    const items = (await c.query("SELECT id,name,category,color,attributes FROM closet_items WHERE status='ACTIVE'")).rows;
    if (items.length === 0) return { ok: false as const, message: "Cadastre ao menos uma peça no closet antes de pedir sugestões de look." };
    const recent = (await c.query(
      `SELECT l.name, l.occasion, (SELECT array_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
       FROM looks l WHERE l.created_at >= now() - interval '14 days' ORDER BY l.created_at DESC LIMIT 10`,
    )).rows;
    const cityRow = (await c.query("SELECT city FROM profiles WHERE user_id=$1", [userId])).rows[0];
    return { ok: true as const, items, recent, city: String(cityRow?.city || "").trim() };
  });
  if (!ctx) bounce(returnPath, "Sessão expirada. Faça login de novo.");
  if (!ctx.ok) bounce(returnPath, ctx.message);

  const weather = kind === "TRIP" ? "" : await weatherPromptHint(ctx.city);
  const requestWithWeather = `${request}${weather}`;
  let out: any;
  try {
    out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text:
            `Você é uma consultora de imagem (personal stylist). Pedido da cliente: "${requestWithWeather}".\n` +
            `Peças reais disponíveis no closet, com atributos de estilo já analisados (use SOMENTE estas peças, nunca invente peças novas; use os atributos — estilo, formalidade, estação, ocasiões, combina_com — pra decidir a curadoria):\n${JSON.stringify(ctx.items)}\n` +
            (ctx.recent.length > 0 ? `Looks já sugeridos ou usados nos últimos 14 dias (evite repetir exatamente a mesma combinação; pode reutilizar peças individuais, mas varie a composição):\n${JSON.stringify(ctx.recent)}\n` : "") +
            `Monte até ${maxLooks} looks distintos e coerentes com o pedido, usando apenas essas peças. ` +
            (maxLooks > 1 ? `Se o pedido envolver múltiplos dias, monte um look por dia, variando as combinações mesmo repetindo peças individuais. ` : "") +
            `Responda apenas JSON no formato {"looks":[{"item_ids":["..."],"name":"...","occasion":"..."}],"note":"..."}. ` +
            `Cada item_ids deve conter somente ids da lista fornecida. Se não houver peças suficientes para ${maxLooks} looks bons e variados, gere menos e explique em "note".`,
        }],
      }],
    });
  } catch (e) {
    console.error("generateLooksFromRequest falhou (IA):", e);
    bounce(returnPath, "A IA de sugestão está indisponível no momento (sem créditos ou fora do ar). Tente de novo mais tarde ou monte o look manualmente.");
  }
  let parsed: any;
  try { parsed = JSON.parse(out.output_text); } catch (e) { console.error("generateLooksFromRequest JSON inválido:", e); bounce(returnPath, "A IA não retornou uma sugestão válida. Tente novamente."); }

  const created = await withProfile(async (c, savedUserId) => {
    const validIds = new Set(ctx.items.map((i: any) => i.id));
    const proposals = Array.isArray(parsed.looks) ? parsed.looks.slice(0, maxLooks) : [];
    let count = 0;
    for (const p of proposals) {
      const ids = Array.isArray(p.item_ids) ? p.item_ids.filter((id: string) => validIds.has(id)) : [];
      if (ids.length === 0) continue;
      const name = String(p.name || "").slice(0, 120), occasion = String(p.occasion || "").slice(0, 120);
      const look = await c.query(
        "INSERT INTO looks(tenant_id,user_id,name,occasion,kind,trip_label) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5) RETURNING id",
        [savedUserId, name, occasion, kind, tripLabel],
      );
      const lookId = look.rows[0].id;
      for (const id of ids) {
        await c.query(
          "INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3)",
          [lookId, id, savedUserId],
        );
      }
      count++;
    }
    return count;
  });
  if (created === null) bounce(returnPath, "Sessão expirada. Faça login de novo.");
  return { createdCount: created, note: parsed.note };
}

export async function createLook(f: FormData) {
  const name = String(f.get("name") || "").trim();
  const occasion = String(f.get("occasion") || "").trim();
  const itemIds = f.getAll("items").map(String).filter(Boolean);
  if (itemIds.length === 0) bounce("/looks", "Selecione ao menos uma peça para o look.");
  await withProfile(async (c, userId) => {
    const valid = await c.query("SELECT id FROM closet_items WHERE id = ANY($1::uuid[])", [itemIds]);
    if (valid.rowCount !== itemIds.length) bounce("/looks", "Alguma peça selecionada não pertence ao seu closet.");
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

const APPROVED_LOOK_INTENT = /aprovad|j[áa]\s+aprovei|repetir\s+aquele|repetir\s+o\s+look/i;

export async function suggestLooks(f: FormData) {
  const request = String(f.get("request") || "").trim();
  if (!request) bounce("/looks", 'Descreva o que você precisa (ex.: "3 looks para reuniões essa semana").');
  if (APPROVED_LOOK_INTENT.test(request)) {
    redirect("/looks?filtro=aprovados");
  }
  const userId = await withProfile(async (c, uid) => uid);
  if (!userId) redirect("/");
  const result = await generateLooksFromRequest(userId, request, 5, "SUGGESTED", "", "/looks");
  if (result.createdCount === 0) bounce("/looks", "Não foi possível montar nenhum look com as peças atuais do seu closet para esse pedido.");
  redirect("/looks");
}

/** Botão "Look de hoje": gera 2 opções (cabem lado a lado na tela e custa menos em geração
 * de imagem), reaproveita as de hoje se já existirem. */
export async function generateTodayLook(f: FormData) {
  const baseItemId = String(f.get("base_item_id") || "").trim();
  const pre = await withProfile(async (c, userId) => {
    const existing = await c.query("SELECT id FROM looks WHERE kind='DAILY' AND created_at::date=current_date LIMIT 1");
    if (existing.rowCount) return { userId, skip: true as const, request: "" };
    let request = "Monte 2 opções de look para hoje, variadas entre si, práticas e alinhadas com o estilo da cliente para um dia comum, usando peças reais do closet ativo.";
    if (baseItemId) {
      const base = await c.query("SELECT name FROM closet_items WHERE id=$1 AND status='ACTIVE'", [baseItemId]);
      if (base.rowCount) request = `A cliente quer usar esta peça como base em todas as opções: "${base.rows[0].name}". ${request}`;
    }
    return { userId, skip: false as const, request };
  });
  if (!pre) redirect("/home");
  if (!pre.skip) await generateLooksFromRequest(pre.userId, pre.request, 2, "DAILY", "", "/home");
  redirect("/home");
}

export async function suggestTrip(f: FormData) {
  const destino = String(f.get("destino") || "").trim();
  const diasRaw = Number(f.get("dias") || 0);
  const observacoes = String(f.get("observacoes") || "").trim();
  const dias = Math.min(7, Math.max(1, Math.floor(diasRaw) || 1));
  if (!destino) bounce("/mala", "Informe o destino da viagem.");
  const userId = await withProfile(async (c, uid) => uid);
  if (!userId) redirect("/");
  const request = `Mala de viagem para ${destino}, ${dias} dia${dias === 1 ? "" : "s"}. ${observacoes || ""}`.trim();
  const result = await generateLooksFromRequest(userId, request, dias, "TRIP", destino, "/mala");
  if (result.createdCount === 0) bounce("/mala", "Não foi possível montar looks para essa viagem com as peças atuais do seu closet.");
  redirect("/mala");
}

export async function deleteLook(f: FormData) {
  const id = String(f.get("id") || "");
  await withProfile(async (c) => {
    await c.query("DELETE FROM looks WHERE id=$1", [id]);
    return true;
  });
  redirect("/looks");
}

/** Sobe uma foto real da cliente usando o look e pede à IA para avaliar com sinceridade
 * (nunca elogiar por padrão) -- distinguindo o que é observação visual do que é inferência.
 * Upload roda numa transação curta; a avaliação por IA (opcional, se houver orçamento) roda
 * DEPOIS, sem conexão de banco presa. */
export async function uploadLookPhoto(f: FormData) {
  const lookId = String(f.get("look_id") || "");
  const file = f.get("photo");
  if (!(file instanceof File) || file.size === 0) bounce("/looks", "Envie uma foto sua usando o look.");
  if (!file.type.startsWith("image/")) bounce("/looks", "Envie um arquivo de imagem.");
  if (file.size > 10 * 1024 * 1024) bounce("/looks", "A foto é muito grande. Envie uma imagem de até 10MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const objectKey = `looks/${lookId}/photo-${randomUUID()}`;

  const prep = await withProfile(async (c, userId) => {
    const look = await c.query(
      `SELECT l.name, l.occasion, (SELECT array_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
       FROM looks l WHERE l.id=$1`,
      [lookId],
    );
    if (!look.rowCount) bounce("/looks", "Look não encontrado.");
    try { await store.putObject(process.env.S3_BUCKET || "closet-private", objectKey, buf, buf.length, { "Content-Type": file.type }); }
    catch (e) { console.error("uploadLookPhoto putObject falhou:", e); bounce("/looks", "Não foi possível enviar a foto agora. Tente de novo em instantes."); }
    await c.query(
      "UPDATE looks SET photo_object_key=$1, photo_content_type=$2, status='PHOTOGRAPHED', photo_evaluation=NULL, photo_evaluated_at=NULL, updated_at=now() WHERE id=$3",
      [objectKey, file.type, lookId],
    );
    let canEvaluate = false;
    if (!process.env.OPENAI_API_KEY) {
      console.error("uploadLookPhoto: OPENAI_API_KEY ausente, pulando avaliação automática.");
    } else {
      const budget = await bumpAndCheckAiUsage(c, userId);
      canEvaluate = budget.ok;
      if (!budget.ok) console.error("uploadLookPhoto: orçamento de IA esgotado, pulando avaliação:", budget.message);
    }
    return { pieces: look.rows[0].pieces as string[] | null, occasion: look.rows[0].occasion as string | null, canEvaluate };
  });
  if (!prep) redirect("/looks");

  if (prep.canEvaluate) {
    try {
      const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
      const out = await new OpenAI().responses.create({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Você é uma consultora de imagem sincera e direta, nunca bajuladora. A cliente está usando este look de verdade (foto real, não ilustração). ` +
                `Peças que deveriam compor o look: ${(prep.pieces || []).join(", ") || "não informado"}. Ocasião: ${prep.occasion || "não informada"}.\n` +
                `REGRA OBRIGATÓRIA: não elogie automaticamente. Se algo não funcionou, diga isso claramente (ex.: "não combinou", "a proporção não favoreceu", "está visivelmente amarrotada", "o sapato prejudicou o resultado"). ` +
                `Distinga observação visual (o que está mesmo visível na foto) de inferência (sua opinião de estilo) -- nunca afirme como fato algo que não é visível (ex. evite "esse tecido é de baixa qualidade"; prefira "pela imagem, o tecido aparenta pouca estrutura"). ` +
                `Responda em 4 partes curtas (1-2 frases cada):\n` +
                `- caimento: observação visual de como a roupa cai no corpo (ajuste, comprimento, amassados, sujeira ou desgaste visível).\n` +
                `- proporcao: sua avaliação sincera do equilíbrio de proporções e silhueta -- diga se não favoreceu, sem medo de ser direta.\n` +
                `- cores: harmonia real das cores entre as peças e com o tom de pele, se visível.\n` +
                `- sugestao: o que você mudaria especificamente (troca de peça, ajuste, acessório) -- só elogie sem ressalva se genuinamente não houver nada a melhorar.\n` +
                `Responda apenas JSON: {"caimento":"...","proporcao":"...","cores":"...","sugestao":"..."}.`,
            },
            { type: "input_image", image_url: dataUrl, detail: "low" },
          ],
        }],
      });
      let parsed: any;
      try { parsed = JSON.parse(out.output_text); } catch { parsed = { sugestao: out.output_text }; }
      const evaluation = {
        caimento: String(parsed.caimento || "").slice(0, 500),
        proporcao: String(parsed.proporcao || "").slice(0, 500),
        cores: String(parsed.cores || "").slice(0, 500),
        sugestao: String(parsed.sugestao || "").slice(0, 500),
      };
      await withProfile(async (c) => { await c.query("UPDATE looks SET photo_evaluation=$1, photo_evaluated_at=now() WHERE id=$2", [JSON.stringify(evaluation), lookId]); return true; });
    } catch (e) { console.error("uploadLookPhoto avaliação falhou:", e); /* avaliação é um extra; falha aqui não deve impedir o upload da foto */ }
  }
  redirect("/looks");
}
