"use server";
import OpenAI, { toFile } from "openai";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bumpAndCheckAiUsage, checkImageAllowance } from "./limits";
import { bounce } from "./action-error";
const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
async function readObject(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const ch of await store.getObject(process.env.S3_BUCKET || "closet-private", key) as any) chunks.push(Buffer.from(ch));
  return Buffer.concat(chunks);
}
/** Gera a ilustração do look a partir das peças reais (quando há foto) ou só do texto.
 * Sunburst tem mais precisão pra edição com fotos de referência; Flare é mais rápido pra gerar do zero.
 * Só é chamada sob demanda (botão "Gerar inspiração em imagem"), nunca automaticamente ao montar o look.
 * `style` controla COMO VOCÊ QUER VISUALIZAR ESTE LOOK: REALISTA (foto-realista, sem estética de
 * desenho), AVATAR (usa o avatar personalizado da cliente como figura) ou ILUSTRACAO (croqui
 * genérico de moda, sem personalizar a figura mesmo se houver avatar). */
async function generateIllustration(c: any, userId: string, lookId: string, itemIds: string[], description: string, style: "REALISTA" | "AVATAR" | "ILUSTRACAO") {
  const openai = new OpenAI({ timeout: 120000 });
  const photos = (await c.query(
    "SELECT DISTINCT ON (item_id) item_id, object_key, content_type FROM closet_item_photos WHERE item_id = ANY($1::uuid[]) ORDER BY item_id, created_at DESC LIMIT 2",
    [itemIds],
  )).rows;
  let avatarKey: string | null = null;
  if (style === "AVATAR") {
    const avatarRow = (await c.query("SELECT avatar_illustration_object_key FROM profiles WHERE user_id=$1", [userId])).rows[0];
    avatarKey = avatarRow?.avatar_illustration_object_key || null;
    if (!avatarKey) return "NO_AVATAR" as const;
  }
  let likenessRef: { key: string; type: string } | null = null;
  if (style === "REALISTA") {
    const bodyRow = (await c.query("SELECT body_photo_object_key, body_photo_content_type FROM profiles WHERE user_id=$1", [userId])).rows[0];
    if (bodyRow?.body_photo_object_key) likenessRef = { key: bodyRow.body_photo_object_key, type: bodyRow.body_photo_content_type || "image/jpeg" };
  }
  // Nunca inventar peça de destaque (bolsa, sapato, acessório) que não esteja na lista real
  // de peças do look -- pra não parecer que a cliente tem algo que ela não tem.
  const semInvencao = "IMPORTANTE: mostre somente as peças listadas na combinação. Para qualquer item não descrito (sapato, bolsa, acessório), use algo básico, neutro e discreto (ex.: sapato nude simples, sem bolsa à vista) -- nunca invente uma peça de destaque, cor ou estampa chamativa que não esteja na lista, pra não parecer uma peça real que a cliente não tem.";
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
  let img;
  try {
    if (avatarKey || likenessRef || photos.length > 0) {
      const refs: { key: string; type: string }[] = [];
      if (avatarKey) refs.push({ key: avatarKey, type: "image/png" });
      if (likenessRef) refs.push(likenessRef);
      for (const p of photos) refs.push({ key: p.object_key, type: p.content_type });
      const files = await Promise.all(refs.map(async (r, i) => toFile(await readObject(r.key), `ref-${i}.png`, { type: r.type })));
      img = await openai.images.edit({ model: "gpt-image-2.5-sunburst", image: files, size: "1024x1024", quality: "medium", prompt: `${avatarKey || likenessRef ? "" : "Use estas fotos reais das peças como referência de cor, textura e caimento. "}${promptBase}` });
    } else {
      img = await openai.images.generate({ model: "gpt-image-2.5-flare", size: "1024x1024", quality: "medium", prompt: promptBase });
    }
  } catch {
    return "FAILED" as const;
  }
  const b64 = img.data?.[0]?.b64_json;
  if (!b64) return "FAILED" as const;
  const buf = Buffer.from(b64, "base64");
  const key = `looks/${lookId}/illustration.png`;
  await store.putObject(process.env.S3_BUCKET || "closet-private", key, buf, buf.length, { "Content-Type": "image/png" });
  await c.query("UPDATE looks SET illustration_object_key=$1, visual_style=$2 WHERE id=$3", [key, style, lookId]);
  await c.query("SELECT log_image_generation($1,current_setting('app.tenant_id')::uuid)", [userId]);
  return "OK" as const;
}

/** Botão "Gerar inspiração em imagem" em cada look -- consome só o orçamento de geração de
 * imagem (não o de operações de IA, que é pra raciocínio/texto, contador separado). */
export async function generateLookIllustration(f: FormData) {
  const lookId = String(f.get("look_id") || "");
  const returnPath = String(f.get("return_path") || "/looks");
  const requestedStyle = String(f.get("visual_style") || "");
  await withProfile(async (c, userId) => {
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
    const result = await generateIllustration(c, userId, lookId, item_ids || [], `${name || "look"} (${occasion || "sem ocasião"}): ${(pieces || []).join(", ")}`, style);
    if (result === "NO_AVATAR") bounce(returnPath, "Você ainda não tem um avatar personalizado. Crie o seu avatar no Perfil primeiro.");
    if (result === "FAILED") bounce(returnPath, "Não foi possível gerar a imagem agora (sem créditos ou fora do ar). Tente de novo mais tarde.");
    return true;
  });
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

/** Busca o clima atual da cidade cadastrada no perfil (geocodificação + previsão via
 * Open-Meteo, sem chave de API) e devolve um trecho pra incluir no pedido à IA. Falha
 * aqui (sem cidade cadastrada, API fora do ar, cidade não encontrada) nunca deve travar
 * a geração do look -- só volta string vazia. */
async function weatherContext(c: any, userId: string): Promise<string> {
  const row = (await c.query("SELECT city FROM profiles WHERE user_id=$1", [userId])).rows[0];
  const city = String(row?.city || "").trim();
  if (!city) return "";
  try {
    const geo: any = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`, { signal: AbortSignal.timeout(4000) }).then(r => r.json());
    const loc = geo?.results?.[0];
    if (!loc) return "";
    const fc: any = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,precipitation&timezone=auto`, { signal: AbortSignal.timeout(4000) }).then(r => r.json());
    const temp = fc?.current?.temperature_2m;
    if (temp === undefined || temp === null) return "";
    const chovendo = Number(fc?.current?.precipitation || 0) > 0;
    return ` Clima agora em ${loc.name || city}: ${Math.round(temp)}°C${chovendo ? ", chovendo" : ""}. Leve isso em conta na escolha das peças (mais leves se estiver quente, com casaco/blazer se estiver frio, evite tecidos delicados se estiver chovendo).`;
  } catch {
    return "";
  }
}

/** Núcleo compartilhado: pede N looks à IA usando somente peças reais ativas e salva.
 * Looks salvos são ilimitados -- só a operação de IA (esta chamada) é contada. */
async function generateLooksFromRequest(c: any, userId: string, request: string, maxLooks: number, kind: "SUGGESTED" | "DAILY" | "TRIP", tripLabel = "", returnPath = "/looks"): Promise<{ createdCount: number; note?: string }> {
  if (!process.env.OPENAI_API_KEY) bounce(returnPath, "Sugestão por IA não configurada: defina OPENAI_API_KEY no servidor.");
  const budget = await bumpAndCheckAiUsage(c, userId);
  if (!budget.ok) bounce(returnPath, budget.message || "Limite de operações de IA atingido.");
  const items = (await c.query("SELECT id,name,category,color,attributes FROM closet_items WHERE status='ACTIVE'")).rows;
  if (items.length === 0) bounce(returnPath, "Cadastre ao menos uma peça no closet antes de pedir sugestões de look.");
  const recent = (await c.query(
    `SELECT l.name, l.occasion, (SELECT array_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
     FROM looks l WHERE l.created_at >= now() - interval '14 days' ORDER BY l.created_at DESC LIMIT 10`,
  )).rows;
  const weather = kind === "TRIP" ? "" : await weatherContext(c, userId);
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
            `Peças reais disponíveis no closet, com atributos de estilo já analisados (use SOMENTE estas peças, nunca invente peças novas; use os atributos — estilo, formalidade, estação, ocasiões, combina_com — pra decidir a curadoria):\n${JSON.stringify(items)}\n` +
            (recent.length > 0 ? `Looks já sugeridos ou usados nos últimos 14 dias (evite repetir exatamente a mesma combinação; pode reutilizar peças individuais, mas varie a composição):\n${JSON.stringify(recent)}\n` : "") +
            `Monte até ${maxLooks} looks distintos e coerentes com o pedido, usando apenas essas peças. ` +
            (maxLooks > 1 ? `Se o pedido envolver múltiplos dias, monte um look por dia, variando as combinações mesmo repetindo peças individuais. ` : "") +
            `Responda apenas JSON no formato {"looks":[{"item_ids":["..."],"name":"...","occasion":"..."}],"note":"..."}. ` +
            `Cada item_ids deve conter somente ids da lista fornecida. Se não houver peças suficientes para ${maxLooks} looks bons e variados, gere menos e explique em "note".`,
        }],
      }],
    });
  } catch {
    bounce(returnPath, "A IA de sugestão está indisponível no momento (sem créditos ou fora do ar). Tente de novo mais tarde ou monte o look manualmente.");
  }
  let parsed: any;
  try { parsed = JSON.parse(out.output_text); } catch { bounce(returnPath, "A IA não retornou uma sugestão válida. Tente novamente."); }
  const validIds = new Set(items.map((i: any) => i.id));
  const proposals = Array.isArray(parsed.looks) ? parsed.looks.slice(0, maxLooks) : [];
  let created = 0;
  for (const p of proposals) {
    const ids = Array.isArray(p.item_ids) ? p.item_ids.filter((id: string) => validIds.has(id)) : [];
    if (ids.length === 0) continue;
    const name = String(p.name || "").slice(0, 120), occasion = String(p.occasion || "").slice(0, 120);
    const look = await c.query(
      "INSERT INTO looks(tenant_id,user_id,name,occasion,kind,trip_label) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,$4,$5) RETURNING id",
      [userId, name, occasion, kind, tripLabel],
    );
    const lookId = look.rows[0].id;
    for (const id of ids) {
      await c.query(
        "INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3)",
        [lookId, id, userId],
      );
    }
    created++;
  }
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
  await withProfile(async (c, userId) => {
    const result = await generateLooksFromRequest(c, userId, request, 5, "SUGGESTED", "", "/looks");
    if (result.createdCount === 0) bounce("/looks", "Não foi possível montar nenhum look com as peças atuais do seu closet para esse pedido.");
    return true;
  });
  redirect("/looks");
}

/** Botão "Look de hoje": gera 2 opções (cabem lado a lado na tela e custa menos em geração
 * de imagem), reaproveita as de hoje se já existirem. */
export async function generateTodayLook(f: FormData) {
  const baseItemId = String(f.get("base_item_id") || "").trim();
  await withProfile(async (c, userId) => {
    const existing = await c.query("SELECT id FROM looks WHERE kind='DAILY' AND created_at::date=current_date LIMIT 1");
    if (existing.rowCount) return true;
    let request = "Monte 2 opções de look para hoje, variadas entre si, práticas e alinhadas com o estilo da cliente para um dia comum, usando peças reais do closet ativo.";
    if (baseItemId) {
      const base = await c.query("SELECT name FROM closet_items WHERE id=$1 AND status='ACTIVE'", [baseItemId]);
      if (base.rowCount) request = `A cliente quer usar esta peça como base em todas as opções: "${base.rows[0].name}". ${request}`;
    }
    await generateLooksFromRequest(c, userId, request, 2, "DAILY", "", "/home");
    return true;
  });
  redirect("/home");
}

export async function suggestTrip(f: FormData) {
  const destino = String(f.get("destino") || "").trim();
  const diasRaw = Number(f.get("dias") || 0);
  const observacoes = String(f.get("observacoes") || "").trim();
  const dias = Math.min(7, Math.max(1, Math.floor(diasRaw) || 1));
  if (!destino) bounce("/mala", "Informe o destino da viagem.");
  await withProfile(async (c, userId) => {
    const request = `Mala de viagem para ${destino}, ${dias} dia${dias === 1 ? "" : "s"}. ${observacoes || ""}`.trim();
    const result = await generateLooksFromRequest(c, userId, request, dias, "TRIP", destino, "/mala");
    if (result.createdCount === 0) bounce("/mala", "Não foi possível montar looks para essa viagem com as peças atuais do seu closet.");
    return true;
  });
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
 * (nunca elogiar por padrão) -- distinguindo o que é observação visual do que é inferência. */
export async function uploadLookPhoto(f: FormData) {
  const lookId = String(f.get("look_id") || "");
  const file = f.get("photo");
  if (!(file instanceof File) || file.size === 0) bounce("/looks", "Envie uma foto sua usando o look.");
  if (!file.type.startsWith("image/")) bounce("/looks", "Envie um arquivo de imagem.");
  if (file.size > 10 * 1024 * 1024) bounce("/looks", "A foto é muito grande. Envie uma imagem de até 10MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const objectKey = `looks/${lookId}/photo-${randomUUID()}`;

  await withProfile(async (c, userId) => {
    const look = await c.query(
      `SELECT l.name, l.occasion, (SELECT array_agg(ci.name) FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS pieces
       FROM looks l WHERE l.id=$1`,
      [lookId],
    );
    if (!look.rowCount) bounce("/looks", "Look não encontrado.");
    await store.putObject(process.env.S3_BUCKET || "closet-private", objectKey, buf, buf.length, { "Content-Type": file.type });
    await c.query(
      "UPDATE looks SET photo_object_key=$1, photo_content_type=$2, status='PHOTOGRAPHED', photo_evaluation=NULL, photo_evaluated_at=NULL, updated_at=now() WHERE id=$3",
      [objectKey, file.type, lookId],
    );
    if (process.env.OPENAI_API_KEY) {
      const budget = await bumpAndCheckAiUsage(c, userId);
      if (budget.ok) {
        try {
          const { pieces, occasion } = look.rows[0];
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
                    `Peças que deveriam compor o look: ${(pieces || []).join(", ") || "não informado"}. Ocasião: ${occasion || "não informada"}.\n` +
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
          await c.query("UPDATE looks SET photo_evaluation=$1, photo_evaluated_at=now() WHERE id=$2", [JSON.stringify(evaluation), lookId]);
        } catch { /* avaliação é um extra; falha aqui não deve impedir o upload da foto */ }
      }
    }
    return true;
  });
  redirect("/looks");
}
