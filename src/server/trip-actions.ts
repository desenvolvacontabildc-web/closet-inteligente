"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { bumpAndCheckAiUsage } from "./limits";
import { CHECKLIST_TEMPLATE } from "./trip-options";

export async function createTrip() {
  let id = "";
  await withProfile(async (c, userId) => {
    const r = await c.query("INSERT INTO trip_plans(tenant_id,user_id) VALUES(current_setting('app.tenant_id')::uuid,$1) RETURNING id", [userId]);
    id = r.rows[0].id;
    return true;
  });
  redirect(`/mala/${id}?step=1`);
}

export async function deleteTrip(f: FormData) {
  const id = String(f.get("trip_id") || "");
  await withProfile(async (c) => { await c.query("DELETE FROM trip_plans WHERE id=$1", [id]); return true; });
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

/** Cada etapa do questionário grava só os campos daquela etapa e avança -- tudo por
 * seleção (chip/checkbox), sem texto livre, pra preencher rápido. */
export async function saveTripStep(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const step = Number(f.get("step") || 1);
  const returnStep = step + 1;
  await withProfile(async (c, userId) => {
    const trip = await c.query("SELECT id FROM trip_plans WHERE id=$1", [tripId]);
    if (!trip.rowCount) bounce("/mala", "Mala não encontrada.");
    if (step === 1) {
      const destino = String(f.get("destino") || "").trim();
      const dataIda = String(f.get("data_ida") || "") || null;
      const dataVolta = String(f.get("data_volta") || "") || null;
      const transporte = String(f.get("transporte") || "");
      const bagagem = String(f.get("bagagem") || "");
      if (!destino) bounce(`/mala/${tripId}?step=1`, "Informe o destino.");
      const clima = await fetchWeather(destino, dataIda);
      await c.query("UPDATE trip_plans SET destino=$1,data_ida=$2,data_volta=$3,transporte=$4,bagagem=$5,clima=$6::jsonb,updated_at=now() WHERE id=$7",
        [destino, dataIda, dataVolta, transporte, bagagem, JSON.stringify(clima), tripId]);
    } else if (step === 2) {
      await c.query("UPDATE trip_plans SET sensibilidade_termica=$1,updated_at=now() WHERE id=$2", [String(f.get("sensibilidade_termica") || "NORMAL"), tripId]);
    } else if (step === 3) {
      await c.query("UPDATE trip_plans SET atividades=$1::jsonb,updated_at=now() WHERE id=$2", [JSON.stringify(f.getAll("atividades").map(String)), tripId]);
    } else if (step === 4) {
      await c.query("UPDATE trip_plans SET dress_codes=$1::jsonb,updated_at=now() WHERE id=$2", [JSON.stringify(f.getAll("dress_codes").map(String)), tripId]);
    } else if (step === 5) {
      const estilo = f.getAll("estilo").map(String).slice(0, 3);
      await c.query("UPDATE trip_plans SET estilo=$1::jsonb,updated_at=now() WHERE id=$2", [JSON.stringify(estilo), tripId]);
    } else if (step === 6) {
      const levar = f.getAll("levar_ids").map(String);
      const evitar = f.getAll("evitar_ids").map(String);
      await c.query("UPDATE trip_plans SET levar_ids=$1::jsonb,evitar_ids=$2::jsonb,prioridade=$3,repeticao=$4,lavanderia=$5,updated_at=now() WHERE id=$6",
        [JSON.stringify(levar), JSON.stringify(evitar), String(f.get("prioridade") || ""), String(f.get("repeticao") || ""), String(f.get("lavanderia") || ""), tripId]);
    } else if (step === 7) {
      await c.query("UPDATE trip_plans SET estrategia=$1,updated_at=now() WHERE id=$2", [String(f.get("estrategia") || "EQUILIBRADA"), tripId]);
    } else if (step === 8) {
      await c.query("UPDATE trip_plans SET necessidades=$1::jsonb,updated_at=now() WHERE id=$2", [JSON.stringify(f.getAll("necessidades").map(String)), tripId]);
    } else if (step === 9) {
      await c.query("UPDATE trip_plans SET incluir=$1::jsonb,updated_at=now() WHERE id=$2", [JSON.stringify(f.getAll("incluir").map(String)), tripId]);
    }
    return true;
  });
  redirect(`/mala/${tripId}?step=${returnStep}`);
}

/** Motor de seleção: cruza tudo que foi respondido com o closet real e monta a mala.
 * Nunca inventa peça -- só usa closet_items reais; o que faltar vira alerta, não peça. */
export async function generateTripPlan(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  await withProfile(async (c, userId) => {
    const budget = await bumpAndCheckAiUsage(c, userId);
    if (!budget.ok) bounce(`/mala/${tripId}?step=10`, budget.message || "Limite de operações de IA atingido.");
    const tripRow = (await c.query("SELECT * FROM trip_plans WHERE id=$1", [tripId])).rows[0];
    if (!tripRow) bounce("/mala", "Mala não encontrada.");
    const items = (await c.query("SELECT id,name,category FROM closet_items WHERE status='ACTIVE'")).rows;
    if (items.length === 0) bounce(`/mala/${tripId}?step=10`, "Cadastre ao menos uma peça no closet antes de gerar a mala.");
    const dias = tripRow.data_ida && tripRow.data_volta
      ? Math.max(1, Math.round((new Date(tripRow.data_volta).getTime() - new Date(tripRow.data_ida).getTime()) / 86400000) + 1)
      : 3;
    const metaQtd: Record<string, string> = { ESSENCIAL: "entre 8 e 10 peças principais", EQUILIBRADA: "entre 12 e 16 peças principais", MAIS_OPCOES: "entre 18 e 22 peças principais" };
    const levarNomes = items.filter((i: any) => (tripRow.levar_ids || []).includes(i.id)).map((i: any) => i.name);
    const evitarIds = new Set(tripRow.evitar_ids || []);
    const candidatos = items.filter((i: any) => !evitarIds.has(i.id));

    let out: any;
    try {
      out = await new OpenAI().responses.create({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text:
              `Você é uma consultora de imagem montando uma mala de viagem real, usando SOMENTE peças que a cliente realmente tem no closet (nunca invente peça nova).\n` +
              `Destino: ${tripRow.destino}. Duração: ${dias} dia(s)/noite(s). Transporte: ${tripRow.transporte || "não informado"}. Bagagem: ${tripRow.bagagem || "não informado"}.\n` +
              `Clima esperado: ${JSON.stringify(tripRow.clima)}. Sensibilidade térmica da cliente: ${tripRow.sensibilidade_termica}.\n` +
              `Atividades previstas: ${(tripRow.atividades || []).join(", ") || "não informado"}. Dress codes envolvidos: ${(tripRow.dress_codes || []).join(", ") || "nenhum"}.\n` +
              `Como ela quer se sentir/se apresentar (até 3): ${(tripRow.estilo || []).join(", ") || "não informado"}.\n` +
              `Peças que ela FAZ QUESTÃO de levar (inclua todas se possível): ${levarNomes.join(", ") || "nenhuma exigência"}.\n` +
              `Prioridade: ${tripRow.prioridade || "não informado"}. Sobre repetir peças: ${tripRow.repeticao || "não informado"}. Acesso a lavanderia: ${tripRow.lavanderia || "não informado"}.\n` +
              `Estratégia de mala escolhida: ${tripRow.estrategia} -- monte aproximadamente ${metaQtd[tripRow.estrategia] || metaQtd.EQUILIBRADA}.\n` +
              `Necessidades especiais da viagem: ${(tripRow.necessidades || []).join(", ") || "nenhuma"}.\n` +
              `Peças reais disponíveis (use SOMENTE estas, nunca invente outra):\n${JSON.stringify(candidatos)}\n` +
              `Priorize peças versáteis (que combinam com várias outras, atendem mais de uma ocasião/clima) sobre peças que só formam um único look, exceto quando a ocasião exigir algo específico (ex. evento formal).\n` +
              `Monte também os looks da viagem, organizados por dia (1 a ${dias}) e período/ocasião (ex.: "Dia 1 - Viagem", "Dia 2 - Reunião", "Dia 2 - Jantar"), reaproveitando as mesmas peças selecionadas em looks diferentes sempre que possível.\n` +
              `Se identificar uma necessidade da agenda que o closet dela não atende bem (ex. evento formal sem peça adequada), NÃO invente uma peça -- registre isso em "alerts".\n` +
              `Responda apenas JSON: {"selected_item_ids":["..."],"looks":[{"day":1,"period":"Dia 1 - Viagem","occasion":"...","item_ids":["..."]}],"alerts":["..."],"reasoning":"1-3 frases explicando a lógica da mala"}.`,
          }],
        }],
      });
    } catch {
      bounce(`/mala/${tripId}?step=10`, "A IA está indisponível no momento (sem créditos ou fora do ar). Tente de novo mais tarde.");
    }
    let parsed: any;
    try { parsed = JSON.parse(out.output_text); } catch { bounce(`/mala/${tripId}?step=10`, "A IA não retornou um resultado válido. Tente novamente."); }

    const validIds = new Set(items.map((i: any) => i.id));
    const selected = (Array.isArray(parsed.selected_item_ids) ? parsed.selected_item_ids : []).filter((id: string) => validIds.has(id));
    const looksProposals = Array.isArray(parsed.looks) ? parsed.looks : [];
    const alerts = Array.isArray(parsed.alerts) ? parsed.alerts.map((a: any) => String(a).slice(0, 300)) : [];

    await c.query("DELETE FROM trip_items WHERE trip_id=$1", [tripId]);
    await c.query("DELETE FROM looks WHERE trip_id=$1", [tripId]);
    for (const itemId of selected) {
      await c.query("INSERT INTO trip_items(trip_id,item_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,$3) ON CONFLICT DO NOTHING", [tripId, itemId, userId]);
    }
    for (const p of looksProposals) {
      const ids = Array.isArray(p.item_ids) ? p.item_ids.filter((id: string) => validIds.has(id)) : [];
      if (ids.length === 0) continue;
      const lookRow = await c.query(
        "INSERT INTO looks(tenant_id,user_id,name,occasion,kind,trip_label,trip_id,trip_day,trip_period) VALUES(current_setting('app.tenant_id')::uuid,$1,$2,$2,'TRIP',$3,$4,$5,$6) RETURNING id",
        [userId, String(p.occasion || p.period || "Look da viagem").slice(0, 120), tripRow.destino, tripId, Number(p.day) || 1, String(p.period || "").slice(0, 120)],
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
  redirect(`/mala/${tripId}`);
}

export async function removeTripItem(f: FormData) {
  const tripId = String(f.get("trip_id") || "");
  const itemId = String(f.get("item_id") || "");
  await withProfile(async (c) => {
    await c.query("DELETE FROM trip_items WHERE trip_id=$1 AND item_id=$2", [tripId, itemId]);
    return true;
  });
  redirect(`/mala/${tripId}`);
}
