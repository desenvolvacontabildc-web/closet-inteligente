"use server";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { bumpAndCheckAiUsage } from "./limits";
import { parseAiJson } from "./ai-json";
import { CHECKLIST_TEMPLATE, EVENTO_TIPOS, DRESS_CODE_OPCOES, type TripEvent } from "./trip-options";

const store = new Client({ endPoint: (process.env.S3_ENDPOINT || "http://storage:9000").replace(/^https?:\/\//, "").split(":")[0], port: 9000, useSSL: false, accessKey: process.env.S3_ACCESS_KEY_ID || "closet-web", secretKey: process.env.S3_SECRET_ACCESS_KEY || "" });
const UUID = /^[0-9a-f-]{36}$/i;

async function removeObjects(keys: (string | null | undefined)[]) {
  for (const key of keys) {
    if (!key) continue;
    try { await store.removeObject(process.env.S3_BUCKET || "closet-private", key); } catch { /* objeto órfão é inofensivo */ }
  }
}

export async function createTrip() {
  let id = "";
  await withProfile(async (c, userId) => {
    const r = await c.query("INSERT INTO trip_plans(tenant_id,user_id) VALUES(current_setting('app.tenant_id')::uuid,$1) RETURNING id", [userId]);
    id = r.rows[0].id;
    return true;
  });
  if (!id) redirect("/");
  redirect(`/mala/${id}?step=1`);
}

export async function deleteTrip(f: FormData) {
  const id = String(f.get("trip_id") || "");
  const keys = await withProfile(async (c) => {
    const imgs = (await c.query("SELECT illustration_object_key k FROM looks WHERE trip_id=$1 AND illustration_object_key IS NOT NULL", [id])).rows.map((r: any) => r.k as string);
    await c.query("DELETE FROM trip_plans WHERE id=$1", [id]);
    return imgs;
  });
  await removeObjects(keys ?? []);
  await flash("Mala excluída.", "info");
  redirect("/mala");
}

async function fetchWeather(destino: string, dataIda: string | null): Promise<any> {
  if (!destino) return {};
  try {
    const geo: any = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destino.split(",")[0])}&count=1&language=pt&format=json`, { signal: AbortSignal.timeout(4000) }).then(r => r.json());
    const loc = geo?.results?.[0];
    if (!loc) return {};
    const fc: any = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max&timezone=auto${dataIda ? `&start_date=${dataIda}&end_date=${dataIda}` : ""}`, { signal: AbortSignal.timeout(4000) }).then(r => r.json());
    const i = 0;
    const min = fc?.daily?.temperature_2m_min?.[i], max = fc?.daily?.temperature_2m_max?.[i], chuva = fc?.daily?.precipitation_probability_max?.[i];
    if (min === undefined) return { local: loc.name, previsao_disponivel: false };
    return { local: loc.name, previsao_disponivel: true, temp_min: Math.round(min), temp_max: Math.round(max), chance_chuva: chuva };
  } catch {
    return {};
  }
}

function daysBetween(ida: string | null, volta: string | null): number | null {
  if (!ida || !volta) return null;
  const n = Math.round((new Date(volta).getTime() - new Date(ida).getTime()) / 86400000) + 1;
  return Number.isFinite(n) ? n : null;
}

/** Cada etapa do questionário grava só os campos daquela etapa e avança. Etapas:
 * 1 viagem · 2 clima · 3 motivo · 4 compromissos · 5 lazer · 6 estilo · 7 preferências · 8 estratégia · 9 extras. */
export async function saveTripStep(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const step = Number(f.get("step") || 1);
  const back = `/mala/${tripId}?step=${step}`;
  if (!UUID.test(tripId)) bounce("/mala", "Mala não encontrada.");
  await withProfile(async (c) => {
    const trip = await c.query("SELECT id FROM trip_plans WHERE id=$1", [tripId]);
    if (!trip.rowCount) bounce("/mala", "Mala não encontrada.");
    if (step === 1) {
      const destino = String(f.get("destino") || "").trim().slice(0, 120);
      const dataIda = String(f.get("data_ida") || "") || null;
      const dataVolta = String(f.get("data_volta") || "") || null;
      const diasInformados = Math.floor(Number(f.get("dias") || 0));
      const transporte = String(f.get("transporte") || "");
      const bagagem = String(f.get("bagagem") || "");
      if (!destino) bounce(back, "Informe o destino da viagem.");
      let dias = daysBetween(dataIda, dataVolta);
      if (dataIda && dataVolta && (dias === null || dias < 1)) bounce(back, "A data de volta precisa ser depois da data de ida.");
      if (dias === null) {
        if (!(diasInformados >= 1 && diasInformados <= 60)) bounce(back, "Informe as datas de ida e volta ou, se ainda não sabe, quantos dias vai durar a viagem.");
        dias = diasInformados;
      }
      if (dias > 60) bounce(back, "A viagem pode ter no máximo 60 dias.");
      const clima = await fetchWeather(destino, dataIda);
      await c.query("UPDATE trip_plans SET destino=$1,data_ida=$2,data_volta=$3,dias=$4,transporte=$5,bagagem=$6,clima=$7::jsonb,updated_at=now() WHERE id=$8",
        [destino, dataIda, dataVolta, dias, transporte, bagagem, JSON.stringify(clima), tripId]);
    } else if (step === 2) {
      await c.query("UPDATE trip_plans SET sensibilidade_termica=$1,updated_at=now() WHERE id=$2", [String(f.get("sensibilidade_termica") || "Temperatura normal"), tripId]);
    } else if (step === 3) {
      const objetivo = String(f.get("objetivo") || "");
      if (!["PASSEIO", "TRABALHO", "MISTO"].includes(objetivo)) bounce(back, "Escolha o motivo da viagem.");
      await c.query("UPDATE trip_plans SET objetivo=$1,updated_at=now() WHERE id=$2", [objetivo, tripId]);
    } else if (step === 4) {
      await c.query("UPDATE trip_plans SET updated_at=now() WHERE id=$1", [tripId]); // compromissos são adicionados um a um, na própria tela
    } else if (step === 5) {
      await c.query("UPDATE trip_plans SET atividades=$1::jsonb,updated_at=now() WHERE id=$2", [JSON.stringify(f.getAll("atividades").map(String)), tripId]);
    } else if (step === 6) {
      const estilo = f.getAll("estilo").map(String).slice(0, 3);
      await c.query("UPDATE trip_plans SET estilo=$1::jsonb,updated_at=now() WHERE id=$2", [JSON.stringify(estilo), tripId]);
    } else if (step === 7) {
      const levar = f.getAll("levar_ids").map(String).filter((v) => UUID.test(v));
      const evitar = f.getAll("evitar_ids").map(String).filter((v) => UUID.test(v));
      await c.query("UPDATE trip_plans SET levar_ids=$1::jsonb,evitar_ids=$2::jsonb,prioridade=$3,repeticao=$4,lavanderia=$5,updated_at=now() WHERE id=$6",
        [JSON.stringify(levar), JSON.stringify(evitar), String(f.get("prioridade") || ""), String(f.get("repeticao") || ""), String(f.get("lavanderia") || ""), tripId]);
    } else if (step === 8) {
      await c.query("UPDATE trip_plans SET estrategia=$1,updated_at=now() WHERE id=$2", [String(f.get("estrategia") || "EQUILIBRADA"), tripId]);
    } else if (step === 9) {
      await c.query("UPDATE trip_plans SET necessidades=$1::jsonb,incluir=$2::jsonb,updated_at=now() WHERE id=$3",
        [JSON.stringify(f.getAll("necessidades").map(String)), JSON.stringify(f.getAll("incluir").map(String)), tripId]);
    }
    return true;
  });
  redirect(`/mala/${tripId}?step=${step + 1}`);
}

/** Acrescenta um compromisso (ex.: seminário, de dia, dress code executivo). Cada um vira um look próprio. */
export async function addTripEvent(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const back = `/mala/${tripId}?step=4`;
  if (!UUID.test(tripId)) bounce("/mala", "Mala não encontrada.");
  const tipo = String(f.get("tipo") || "");
  const periodo = String(f.get("periodo") || "");
  const dress = String(f.get("dress_code") || "");
  const detalhe = String(f.get("detalhe") || "").trim().slice(0, 140);
  if (!EVENTO_TIPOS.includes(tipo)) bounce(back, "Escolha o tipo do compromisso.");
  if (periodo !== "DIA" && periodo !== "NOITE") bounce(back, "Diga se o compromisso é de dia ou à noite.");
  const ok = await withProfile(async (c) => {
    const row = (await c.query("SELECT eventos FROM trip_plans WHERE id=$1 FOR UPDATE", [tripId])).rows[0];
    if (!row) return "missing" as const;
    const eventos: TripEvent[] = Array.isArray(row.eventos) ? row.eventos : [];
    if (eventos.length >= 20) return "full" as const;
    eventos.push({ id: randomUUID(), tipo, periodo, dress_code: DRESS_CODE_OPCOES.includes(dress) ? dress : "", detalhe });
    await c.query("UPDATE trip_plans SET eventos=$1::jsonb, updated_at=now() WHERE id=$2", [JSON.stringify(eventos), tripId]);
    return "ok" as const;
  });
  if (ok === null) redirect("/");
  if (ok === "missing") bounce("/mala", "Mala não encontrada.");
  if (ok === "full") bounce(back, "Dá para cadastrar até 20 compromissos por viagem.");
  await flash("Compromisso adicionado.");
  redirect(back);
}

export async function removeTripEvent(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const eventId = String(f.get("event_id") || "");
  if (!UUID.test(tripId)) bounce("/mala", "Mala não encontrada.");
  await withProfile(async (c) => {
    const row = (await c.query("SELECT eventos FROM trip_plans WHERE id=$1 FOR UPDATE", [tripId])).rows[0];
    if (!row) return false;
    const eventos = (Array.isArray(row.eventos) ? row.eventos : []).filter((e: TripEvent) => e.id !== eventId);
    await c.query("UPDATE trip_plans SET eventos=$1::jsonb, updated_at=now() WHERE id=$2", [JSON.stringify(eventos), tripId]);
    return true;
  });
  await flash("Compromisso removido.", "info");
  redirect(`/mala/${tripId}?step=4`);
}

/** Motor de seleção: cruza tudo que foi respondido (inclusive os compromissos) com o closet real e monta
 * a mala. Nunca inventa peça -- só usa closet_items reais; o que faltar vira alerta, não peça.
 * 3 fases (ler / chamar IA / gravar) para não prender conexão do pool durante a chamada à OpenAI. */
export async function generateTripPlan(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const review = `/mala/${tripId}?step=10`;
  if (!UUID.test(tripId)) bounce("/mala", "Mala não encontrada.");
  const ctx = await withProfile(async (c, userId) => {
    const tripRow = (await c.query("SELECT * FROM trip_plans WHERE id=$1", [tripId])).rows[0];
    if (!tripRow) return { ok: false as const, message: "Mala não encontrada.", notFound: true };
    if (!String(tripRow.destino || "").trim()) return { ok: false as const, message: "Preencha o destino da viagem na etapa 1 antes de gerar a mala." };
    if (!tripRow.dias) return { ok: false as const, message: "Informe as datas (ou quantos dias vai durar a viagem) na etapa 1 antes de gerar a mala." };
    const items = (await c.query("SELECT id,name,category,color,attributes FROM closet_items WHERE status='ACTIVE'")).rows;
    if (items.length < 5) return { ok: false as const, message: "Cadastre pelo menos 5 peças no closet antes de gerar a mala." };
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) return { ok: false as const, message: budget.message || "Limite de operações de IA atingido." };
    return { ok: true as const, tripRow, items };
  });
  if (!ctx) redirect("/");
  if (!ctx.ok) bounce(ctx.notFound ? "/mala" : review, ctx.message);
  const { tripRow, items } = ctx;

  const dias: number = tripRow.dias;
  const eventos: TripEvent[] = Array.isArray(tripRow.eventos) ? tripRow.eventos : [];
  const metaQtd: Record<string, string> = { ESSENCIAL: "entre 8 e 10 peças principais", EQUILIBRADA: "entre 12 e 16 peças principais", MAIS_OPCOES: "entre 18 e 22 peças principais" };
  const levarNomes = items.filter((i: any) => (tripRow.levar_ids || []).includes(i.id)).map((i: any) => i.name);
  const evitarIds = new Set(tripRow.evitar_ids || []);
  const candidatos = items.filter((i: any) => !evitarIds.has(i.id));
  const objetivoTxt: Record<string, string> = { PASSEIO: "passeio/lazer", TRABALHO: "trabalho", MISTO: "trabalho e passeio" };
  const agenda = eventos.length === 0
    ? "Nenhum compromisso específico cadastrado: monte looks para o deslocamento e para a rotina de cada dia conforme o motivo da viagem."
    : eventos.map((e, i) => `#${i + 1} ${e.periodo === "NOITE" ? "à noite" : "de dia"}: ${e.tipo}${e.dress_code ? `, dress code ${e.dress_code}` : ""}${e.detalhe ? `, detalhe: ${e.detalhe}` : ""}`).join("\n");

  let parsed: any;
  try {
    const out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text:
            `Você é uma consultora de imagem montando uma mala de viagem real, usando SOMENTE peças que a cliente realmente tem no closet (nunca invente peça nova).\n` +
            `Destino: ${tripRow.destino}. Duração: ${dias} dia(s). Motivo da viagem: ${objetivoTxt[tripRow.objetivo] || "não informado"}. Transporte: ${tripRow.transporte || "não informado"}. Bagagem: ${tripRow.bagagem || "não informado"}.\n` +
            `Clima esperado: ${JSON.stringify(tripRow.clima)}. Sensibilidade térmica da cliente: ${tripRow.sensibilidade_termica}.\n` +
            `COMPROMISSOS (cada um precisa de um look PRÓPRIO, adequado ao período, ao tipo e ao dress code; o detalhe do local importa -- ex.: à beira-mar pede tecido leve e calçado confortável):\n${agenda}\n` +
            `Outras atividades de lazer: ${(tripRow.atividades || []).join(", ") || "nenhuma informada"}.\n` +
            `Como ela quer se sentir/se apresentar (até 3): ${(tripRow.estilo || []).join(", ") || "não informado"}.\n` +
            `Peças que ela FAZ QUESTÃO de levar (inclua todas se possível): ${levarNomes.join(", ") || "nenhuma exigência"}.\n` +
            `Prioridade: ${tripRow.prioridade || "não informado"}. Sobre repetir peças: ${tripRow.repeticao || "não informado"}. Acesso a lavanderia: ${tripRow.lavanderia || "não informado"}.\n` +
            `Estratégia de mala escolhida: ${tripRow.estrategia || "EQUILIBRADA"} -- monte aproximadamente ${metaQtd[tripRow.estrategia] || metaQtd.EQUILIBRADA}.\n` +
            `Necessidades especiais da viagem: ${(tripRow.necessidades || []).join(", ") || "nenhuma"}.\n` +
            `Peças reais disponíveis (use SOMENTE estas, nunca invente outra; use os atributos de estilo/formalidade para decidir):\n${JSON.stringify(candidatos)}\n` +
            `REGRAS: (1) Distribua os compromissos pelos ${dias} dia(s) de forma realista (compromissos de dia e de noite no mesmo dia são possíveis). (2) Inclua um look de deslocamento/chegada no dia 1 e, se a viagem tiver mais de 2 dias, um de retorno. ` +
            `(3) Para os dias sem compromisso, monte looks de ${objetivoTxt[tripRow.objetivo] || "rotina"} (no máximo um por dia livre). (4) Reaproveite peças versáteis entre looks diferentes conforme a preferência de repetição, mas cada compromisso deve ter um look distinto dos demais. ` +
            `(5) Se o closet não atende bem algum compromisso (ex.: jantar formal sem peça adequada), NÃO invente uma peça: registre em "alerts" e monte o melhor possível com o que existe.\n` +
            `Responda apenas JSON: {"selected_item_ids":["..."],"looks":[{"day":1,"label":"Dia 1 · Chegada","event":null,"occasion":"...","item_ids":["..."]}],"alerts":["..."],"reasoning":"1-3 frases explicando a lógica da mala"}. ` +
            `Em "event" use o número do compromisso (#) que o look atende, ou null. Em "label" escreva algo curto no formato "Dia N · nome do compromisso (dia/noite)".`,
        }],
      }],
    });
    parsed = parseAiJson(out.output_text);
  } catch (e) {
    console.error("generateTripPlan falhou (IA):", e);
    bounce(review, "A IA está indisponível no momento (sem créditos ou fora do ar). Tente de novo em alguns minutos.");
  }
  if (!parsed || !Array.isArray(parsed.looks)) {
    console.error("generateTripPlan: resposta da IA inválida");
    bounce(review, "A IA não devolveu uma mala válida desta vez. Tente gerar de novo.");
  }

  const validIds = new Set(items.map((i: any) => i.id));
  const looksProposals = (parsed.looks as any[]).filter((p) => Array.isArray(p?.item_ids) && p.item_ids.some((id: string) => validIds.has(id))).slice(0, 40);
  if (looksProposals.length === 0) bounce(review, "Não consegui montar looks com as peças atuais do seu closet. Cadastre mais peças e tente de novo.");
  const alerts: string[] = Array.isArray(parsed.alerts) ? parsed.alerts.map((a: any) => String(a).slice(0, 300)) : [];
  // Compromissos sem look viram alerta (a IA às vezes esquece algum).
  const coveredEvents = new Set(looksProposals.map((p) => Number(p.event)).filter((n) => Number.isInteger(n)));
  eventos.forEach((e, i) => { if (!coveredEvents.has(i + 1)) alerts.push(`Não consegui um look próprio para: ${e.tipo} (${e.periodo === "NOITE" ? "à noite" : "de dia"}). Você pode gerar uma alternativa nos ajustes.`); });
  const allLookItemIds = new Set<string>();
  for (const p of looksProposals) for (const id of p.item_ids) if (validIds.has(id)) allLookItemIds.add(id);
  const selected = new Set<string>([...(Array.isArray(parsed.selected_item_ids) ? parsed.selected_item_ids : []).filter((id: string) => validIds.has(id)), ...allLookItemIds]);

  const replacedKeys: (string | null)[] = [];
  const saved = await withProfile(async (c, userId) => {
    replacedKeys.push(...(await c.query("SELECT illustration_object_key k FROM looks WHERE trip_id=$1", [tripId])).rows.map((r: any) => r.k));
    await c.query("DELETE FROM trip_items WHERE trip_id=$1", [tripId]);
    await c.query("DELETE FROM looks WHERE trip_id=$1", [tripId]);
    for (const itemId of selected) {
      await c.query("INSERT INTO trip_items(trip_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3) ON CONFLICT DO NOTHING", [tripId, itemId, userId]);
    }
    for (const p of looksProposals) {
      const ids: string[] = Array.from(new Set((p.item_ids as string[]).filter((id) => validIds.has(id))));
      const day = Math.min(dias, Math.max(1, Number(p.day) || 1));
      const occasionText = String(p.occasion || p.label || "Look da viagem").slice(0, 120);
      const label = String(p.label || `Dia ${day} · ${occasionText}`).slice(0, 120);
      const lookRow = await c.query(
        "INSERT INTO looks(tenant_id,user_id,name,occasion,kind,trip_label,trip_id,trip_day,trip_period) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$3,'TRIP',$4,$5,$6,$7) RETURNING id",
        [userId, label, occasionText, tripRow.destino, tripId, day, label],
      );
      for (const id of ids) {
        await c.query("INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3)", [lookRow.rows[0].id, id, userId]);
      }
    }
    const checklist: Record<string, boolean> = {};
    for (const label of CHECKLIST_TEMPLATE) checklist[label] = false;
    await c.query(
      "UPDATE trip_plans SET status='CONCLUIDA', reasoning=$1, alerts=$2::jsonb, checklist=$3::jsonb, updated_at=now() WHERE id=$4",
      [String(parsed.reasoning || "").slice(0, 500), JSON.stringify(alerts), JSON.stringify(checklist), tripId],
    );
    return true;
  });
  if (!saved) redirect("/");
  await removeObjects(replacedKeys);
  await flash("Mala pronta! Veja a visão geral e ajuste o que quiser.");
  redirect(`/mala/${tripId}`);
}

export async function toggleChecklistItem(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const label = String(f.get("label") || "");
  await withProfile(async (c) => {
    const row = (await c.query("SELECT checklist FROM trip_plans WHERE id=$1", [tripId])).rows[0];
    if (!row) bounce(`/mala/${tripId}`, "Mala não encontrada.");
    const checklist = row.checklist || {};
    checklist[label] = !checklist[label];
    await c.query("UPDATE trip_plans SET checklist=$1::jsonb, updated_at=now() WHERE id=$2", [JSON.stringify(checklist), tripId]);
    return true;
  });
  redirect(`/mala/${tripId}#checklist`);
}

/** Tira a peça da mala e dos looks dela; looks que ficariam sem nenhuma peça são descartados. */
export async function removeTripItem(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const itemId = String(f.get("item_id") || "");
  if (!UUID.test(tripId) || !UUID.test(itemId)) bounce("/mala", "Peça inválida.");
  const res = await withProfile(async (c) => {
    await c.query("DELETE FROM trip_items WHERE trip_id=$1 AND item_id=$2", [tripId, itemId]);
    await c.query("DELETE FROM look_items WHERE item_id=$2 AND look_id IN (SELECT id FROM looks WHERE trip_id=$1)", [tripId, itemId]);
    const emptied = (await c.query(`SELECT l.id, l.illustration_object_key k FROM looks l WHERE l.trip_id=$1 AND NOT EXISTS (SELECT 1 FROM look_items li WHERE li.look_id=l.id)`, [tripId])).rows;
    if (emptied.length) await c.query("DELETE FROM looks WHERE id=ANY($1::uuid[])", [emptied.map((e: any) => e.id)]);
    return { emptied: emptied.length, keys: emptied.map((e: any) => e.k) };
  });
  await removeObjects(res?.keys ?? []);
  await flash(res && res.emptied > 0 ? `Peça removida da mala. ${res.emptied} look${res.emptied === 1 ? "" : "s"} que só tinha${res.emptied === 1 ? "" : "m"} essa peça saiu${res.emptied === 1 ? "" : "ram"} também.` : "Peça removida da mala e dos looks.", "info");
  redirect(`/mala/${tripId}`);
}

export async function addTripItem(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const itemId = String(f.get("item_id") || "");
  if (!UUID.test(tripId) || !UUID.test(itemId)) bounce(`/mala/${tripId}`, "Escolha a peça que quer acrescentar.");
  await withProfile(async (c, userId) => {
    const ok = await c.query("SELECT 1 FROM closet_items WHERE id=$1 AND status='ACTIVE'", [itemId]);
    if (!ok.rowCount) bounce(`/mala/${tripId}`, "Peça não encontrada.");
    await c.query("INSERT INTO trip_items(trip_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3) ON CONFLICT DO NOTHING", [tripId, itemId, userId]);
    return true;
  });
  await flash("Peça acrescentada à mala.");
  redirect(`/mala/${tripId}`);
}

/** Troca uma peça por outra do closet dentro de UM look da mala. */
export async function swapTripItem(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const lookId = String(f.get("look_id") || "");
  const oldId = String(f.get("old_item_id") || "");
  const newId = String(f.get("new_item_id") || "");
  const back = `/mala/${tripId}#ajustes`;
  if (![tripId, lookId, oldId, newId].every((v) => UUID.test(v))) bounce(`/mala/${tripId}`, "Escolha a peça que sai e a que entra.");
  if (oldId === newId) bounce(back, "Escolha uma peça diferente para entrar no lugar.");
  const ok = await withProfile(async (c, userId) => {
    const look = await c.query("SELECT 1 FROM looks WHERE id=$1 AND trip_id=$2", [lookId, tripId]);
    const inLook = await c.query("SELECT 1 FROM look_items WHERE look_id=$1 AND item_id=$2", [lookId, oldId]);
    const fresh = await c.query("SELECT 1 FROM closet_items WHERE id=$1 AND status='ACTIVE'", [newId]);
    if (!look.rowCount || !inLook.rowCount || !fresh.rowCount) return false;
    await c.query("DELETE FROM look_items WHERE look_id=$1 AND item_id=$2", [lookId, oldId]);
    await c.query("INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3) ON CONFLICT DO NOTHING", [lookId, newId, userId]);
    await c.query("INSERT INTO trip_items(trip_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3) ON CONFLICT DO NOTHING", [tripId, newId, userId]);
    // A peça que saiu deixa de ocupar espaço na mala se nenhum outro look da viagem a usa.
    await c.query(`DELETE FROM trip_items WHERE trip_id=$1 AND item_id=$2 AND NOT EXISTS (SELECT 1 FROM look_items li JOIN looks l ON l.id=li.look_id WHERE l.trip_id=$1 AND li.item_id=$2)`, [tripId, oldId]);
    return true;
  });
  if (!ok) bounce(back, "Não consegui trocar essa peça. Atualize a página e tente de novo.");
  await flash("Peça trocada no look.");
  redirect(back);
}

/** Descarta um look da mala (a peças continuam no closet). */
export async function deleteTripLook(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const lookId = String(f.get("look_id") || "");
  if (![tripId, lookId].every((v) => UUID.test(v))) bounce("/mala", "Look inválido.");
  const keys = await withProfile(async (c) => {
    const r = await c.query("DELETE FROM looks WHERE id=$1 AND trip_id=$2 RETURNING illustration_object_key", [lookId, tripId]);
    return r.rows.map((x: any) => x.illustration_object_key as string | null);
  });
  await removeObjects(keys ?? []);
  await flash("Look descartado da mala.", "info");
  redirect(`/mala/${tripId}#ajustes`);
}

/** Pede à IA UM look alternativo para o mesmo compromisso, preferindo peças que já estão na mala. */
export async function regenerateTripLook(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const lookId = String(f.get("look_id") || "");
  const back = `/mala/${tripId}#ajustes`;
  if (![tripId, lookId].every((v) => UUID.test(v))) bounce("/mala", "Look inválido.");
  const ctx = await withProfile(async (c, userId) => {
    const trip = (await c.query("SELECT destino,clima,estilo,objetivo,eventos,sensibilidade_termica,evitar_ids FROM trip_plans WHERE id=$1", [tripId])).rows[0];
    const look = (await c.query("SELECT trip_period, occasion FROM looks WHERE id=$1 AND trip_id=$2", [lookId, tripId])).rows[0];
    if (!trip || !look) return { ok: false as const, message: "Look não encontrado." };
    const current = (await c.query("SELECT ci.name FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=$1", [lookId])).rows.map((r: any) => r.name);
    const items = (await c.query("SELECT id,name,category,color,attributes FROM closet_items WHERE status='ACTIVE'")).rows;
    const inTrip = new Set((await c.query("SELECT item_id FROM trip_items WHERE trip_id=$1", [tripId])).rows.map((r: any) => r.item_id));
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) return { ok: false as const, message: budget.message || "Limite de operações de IA atingido." };
    return { ok: true as const, trip, look, current, items, inTrip };
  });
  if (!ctx) redirect("/");
  if (!ctx.ok) bounce(back, ctx.message);
  const evitar = new Set(ctx.trip.evitar_ids || []);
  const candidatos = ctx.items.filter((i: any) => !evitar.has(i.id)).map((i: any) => ({ ...i, na_mala: ctx.inTrip.has(i.id) }));

  let parsed: any;
  try {
    const out = await new OpenAI().responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text:
            `Você é uma consultora de imagem. Monte UM look ALTERNATIVO para este compromisso de viagem: "${ctx.look.trip_period}" (${ctx.look.occasion}). Destino: ${ctx.trip.destino}. Clima: ${JSON.stringify(ctx.trip.clima)}. Estilo desejado: ${(ctx.trip.estilo || []).join(", ") || "não informado"}.\n` +
            `NÃO repita a combinação atual (${ctx.current.join(" + ")}); troque pelo menos metade das peças. Prefira peças com "na_mala": true (já estão na mala) e use outras só se for necessário. Use SOMENTE estas peças reais:\n${JSON.stringify(candidatos)}\n` +
            `Responda apenas JSON: {"item_ids":["..."],"occasion":"descrição curta do look"}.`,
        }],
      }],
    });
    parsed = parseAiJson(out.output_text);
  } catch (e) {
    console.error("regenerateTripLook falhou (IA):", e);
    bounce(back, "A IA está indisponível no momento. Tente de novo em alguns minutos.");
  }
  const valid = new Set(ctx.items.map((i: any) => i.id));
  const ids: string[] = Array.from(new Set((Array.isArray(parsed?.item_ids) ? parsed.item_ids : []).filter((id: string) => valid.has(id))));
  if (ids.length === 0) bounce(back, "A IA não devolveu um look válido desta vez. Tente de novo.");

  let oldImageKey: string | null = null;
  const ok = await withProfile(async (c, userId) => {
    const exists = await c.query("SELECT illustration_object_key k FROM looks WHERE id=$1 AND trip_id=$2", [lookId, tripId]);
    if (!exists.rowCount) return false;
    oldImageKey = exists.rows[0].k ?? null;
    await c.query("DELETE FROM look_items WHERE look_id=$1", [lookId]);
    for (const id of ids) {
      await c.query("INSERT INTO look_items(look_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3)", [lookId, id, userId]);
      await c.query("INSERT INTO trip_items(trip_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3) ON CONFLICT DO NOTHING", [tripId, id, userId]);
    }
    await c.query("UPDATE looks SET occasion=$2, illustration_object_key=NULL, updated_at=now() WHERE id=$1", [lookId, String(parsed?.occasion || ctx.look.occasion).slice(0, 120)]);
    return true;
  });
  if (!ok) bounce(back, "Esse look não existe mais. Atualize a página.");
  await removeObjects([oldImageKey]);
  await flash("Novo look montado para esse compromisso.");
  redirect(back);
}
