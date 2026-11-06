"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bumpAndCheckAiUsage } from "./limits";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { parseAiJson } from "./ai-json";
import {
  FIO, ESPESSURA, COMPRIMENTO, COURO, QUIMICA, TEMPO_QUIMICA, QUEIXAS, ELASTICIDADE, POROSIDADE, LAVAGEM, CALOR, SOL,
  OBJETIVOS, VEZES_SEMANA, ORCAMENTO, STEP_TYPES, labelOf, labelsOf,
  type Opt, type Answers, type HairPlan, type HairWeek, type HairStep,
} from "./hair-options";

const BACK = "/cuidese/cronograma";

const one = (f: FormData, name: string, opts: Opt[]): string => {
  const v = String(f.get(name) || "");
  return opts.some((o) => o.value === v) ? v : "";
};
const many = (f: FormData, name: string, opts: Opt[], max = 12): string[] =>
  f.getAll(name).map(String).filter((v, i, a) => opts.some((o) => o.value === v) && a.indexOf(v) === i).slice(0, max);
const text = (f: FormData, name: string, max: number): string => String(f.get(name) || "").replace(/\s+/g, " ").trim().slice(0, max);

function readAnswers(f: FormData): Answers {
  return {
    fio: one(f, "fio", FIO), espessura: one(f, "espessura", ESPESSURA), comprimento: one(f, "comprimento", COMPRIMENTO),
    couro: one(f, "couro", COURO), quimica: many(f, "quimica", QUIMICA), tempo_quimica: one(f, "tempo_quimica", TEMPO_QUIMICA),
    queixas: many(f, "queixas", QUEIXAS), elasticidade: one(f, "elasticidade", ELASTICIDADE), porosidade: one(f, "porosidade", POROSIDADE),
    lavagem: one(f, "lavagem", LAVAGEM), calor: one(f, "calor", CALOR), sol: one(f, "sol", SOL),
    objetivos: many(f, "objetivos", OBJETIVOS, 3), vezes_semana: one(f, "vezes_semana", VEZES_SEMANA), orcamento: one(f, "orcamento", ORCAMENTO),
    gestante: f.get("gestante") === "1", alergias: text(f, "alergias", 160), produtos_atuais: text(f, "produtos_atuais", 240),
  };
}

const strs = (v: unknown, max: number, len: number): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim().slice(0, len)).filter(Boolean).slice(0, max) : [];

/** Nunca confia no JSON da IA: normaliza, limita tamanhos e gera os ids das etapas no servidor. */
function normalizePlan(raw: any, vezes: number): HairPlan | null {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.semanas)) return null;
  const semanas: HairWeek[] = [];
  for (const w of raw.semanas.slice(0, 8)) {
    const numero = semanas.length + 1;
    const etapas: HairStep[] = [];
    for (const e of Array.isArray(w?.etapas) ? w.etapas.slice(0, Math.max(vezes, 1) + 1) : []) {
      const tipo = String(e?.tipo || "").toUpperCase();
      const titulo = String(e?.titulo || "").trim().slice(0, 90);
      if (!STEP_TYPES[tipo] || !titulo) continue;
      etapas.push({
        id: `s${numero}-${etapas.length + 1}`, tipo, titulo,
        como_fazer: String(e?.como_fazer || "").trim().slice(0, 700),
        preferir: strs(e?.preferir, 6, 90), evitar: strs(e?.evitar, 5, 90), exemplos: strs(e?.exemplos, 4, 110),
      });
    }
    if (etapas.length) semanas.push({ numero, foco: String(w?.foco || "").trim().slice(0, 140), etapas });
  }
  if (semanas.length < 3) return null;
  const resumo = String(raw.resumo || "").trim().slice(0, 1200);
  if (!resumo) return null;
  return {
    resumo,
    perfil: (Array.isArray(raw.perfil) ? raw.perfil : []).slice(0, 7)
      .map((p: any) => ({ rotulo: String(p?.rotulo || "").trim().slice(0, 40), valor: String(p?.valor || "").trim().slice(0, 120) }))
      .filter((p: any) => p.rotulo && p.valor),
    prioridades: strs(raw.prioridades, 5, 140),
    justificativa_periodo: String(raw.justificativa_periodo || "").trim().slice(0, 400),
    semanas, dicas: strs(raw.dicas, 6, 200), alerta: String(raw.alerta || "").trim().slice(0, 400),
  };
}

function buildPrompt(a: Answers): string {
  const vezes = Number(a.vezes_semana) || 2;
  return (
    `Você é uma especialista em cuidados capilares (tricologia estética e cronograma capilar), conversando com a cliente em português do Brasil, com tom acolhedor e objetivo. ` +
    `Com base nas respostas abaixo, faça um DIAGNÓSTICO do cabelo e monte um CRONOGRAMA CAPILAR em semanas.\n\n` +
    `RESPOSTAS DA CLIENTE:\n` +
    `- Tipo de fio: ${labelOf(FIO, a.fio)}; espessura: ${labelOf(ESPESSURA, a.espessura) || "não informada"}; comprimento: ${labelOf(COMPRIMENTO, a.comprimento) || "não informado"}.\n` +
    `- Couro cabeludo: ${labelOf(COURO, a.couro) || "não informado"}.\n` +
    `- Química: ${labelsOf(QUIMICA, a.quimica) || "não informada"}; última química: ${labelOf(TEMPO_QUIMICA, a.tempo_quimica) || "não informada"}.\n` +
    `- Queixas: ${labelsOf(QUEIXAS, a.queixas) || "nenhuma marcada"}.\n` +
    `- Teste de elasticidade do fio molhado: ${labelOf(ELASTICIDADE, a.elasticidade) || "não informado"}. Teste de porosidade (fio na água): ${labelOf(POROSIDADE, a.porosidade) || "não informado"}.\n` +
    `- Lava o cabelo: ${labelOf(LAVAGEM, a.lavagem) || "não informado"}. Calor (chapinha, secador, babyliss): ${labelOf(CALOR, a.calor) || "não informado"}. Exposição a sol, praia ou piscina: ${labelOf(SOL, a.sol) || "não informada"}.\n` +
    `- Objetivos: ${labelsOf(OBJETIVOS, a.objetivos) || "não informados"}.\n` +
    `- Consegue fazer tratamento ${vezes} vez(es) por semana. Orçamento por produto: ${labelOf(ORCAMENTO, a.orcamento) || "flexível"}.\n` +
    `- Gestante ou amamentando: ${a.gestante ? "SIM (evite ativos não recomendados nesse período e sugira confirmar com o médico)" : "não"}.\n` +
    `- Alergias ou sensibilidades: ${a.alergias || "nenhuma informada"}. Produtos que já usa: ${a.produtos_atuais || "não informados"}.\n\n` +
    `REGRAS:\n` +
    `1. Escolha o período do ciclo (total de semanas, entre 4 e 8) conforme a NECESSIDADE real do cabelo: danos fortes, química recente, quebra ou transição pedem ciclos mais longos; cabelo saudável, ciclos curtos de manutenção. Explique em "justificativa_periodo".\n` +
    `2. Cada semana deve ter EXATAMENTE ${vezes} etapa(s), uma por lavagem de tratamento. Alterne hidratação, nutrição e reconstrução conforme a necessidade (o equilíbrio é o ponto central: elasticidade que estica e não volta pede mais reconstrução; fio que quebra logo e ressecado pede hidratação e nutrição; evite excesso de reconstrução, que deixa o fio rígido). Pode usar limpeza profunda (ex.: 1 vez a cada 2 a 4 semanas) e cuidado do couro cabeludo quando fizer sentido.\n` +
    `3. Tipos permitidos em "tipo": HIDRATACAO, NUTRICAO, RECONSTRUCAO, LIMPEZA_PROFUNDA, COURO_CABELUDO, FINALIZACAO.\n` +
    `4. Em cada etapa, informe: "titulo" curto; "como_fazer" com o passo a passo prático (quantidade, tempo de pausa, enxágue); "preferir" com 3 a 5 componentes ou ativos que o produto deve conter (ex.: na hidratação, pantenol, ureia, glicerina, aloe vera, ácido hialurônico; na nutrição, óleos e manteigas como argan, karité, coco, murumuru, ceramidas; na reconstrução, aminoácidos, queratina hidrolisada, proteínas de arroz ou trigo, colágeno); "evitar" com 1 a 3 itens (ingredientes ou práticas) para o caso dela; "exemplos" com até 3 tipos de produto ou linhas de referência do mercado brasileiro adequadas ao orçamento (apenas sugestões; a cliente deve conferir o rótulo).\n` +
    `5. Respeite alergias, gravidez, química recente e sensibilidade do couro cabeludo. Não faça diagnóstico médico: se houver queda intensa, descamação persistente ou irritação, indique no campo "alerta" procurar um dermatologista ou tricologista.\n` +
    `6. Seja realista e específica para este cabelo; nada genérico.\n\n` +
    `Responda APENAS JSON neste formato: {"resumo":"diagnóstico em 3 a 5 frases","perfil":[{"rotulo":"Tipo de fio","valor":"..."},{"rotulo":"Porosidade","valor":"..."},{"rotulo":"Elasticidade","valor":"..."},{"rotulo":"Couro cabeludo","valor":"..."},{"rotulo":"Necessidade principal","valor":"..."}],"prioridades":["..."],"total_semanas":6,"justificativa_periodo":"...","semanas":[{"numero":1,"foco":"...","etapas":[{"tipo":"HIDRATACAO","titulo":"...","como_fazer":"...","preferir":["..."],"evitar":["..."],"exemplos":["..."]}]}],"dicas":["..."],"alerta":""}`
  );
}

/** Questionário respondido: a IA faz o diagnóstico e monta o ciclo. O ciclo anterior (se houver) é encerrado. */
export async function submitHairQuestionnaire(f: FormData) {
  const answers = readAnswers(f);
  const keep = { a: JSON.stringify(answers) };
  if (!answers.fio) bounce(BACK, "Escolha o tipo de fio para continuar.", keep);
  if (!answers.couro) bounce(BACK, "Conte como é o seu couro cabeludo.", keep);
  if (!answers.vezes_semana) bounce(BACK, "Diga quantas vezes por semana você consegue fazer um tratamento.", keep);
  if (!answers.quimica.length) bounce(BACK, "Marque o que já foi feito no cabelo (ou \"Nenhuma\").", keep);
  if (!process.env.OPENAI_API_KEY) bounce(BACK, "A IA não está configurada no momento.", keep);

  // Fase 1: confere o limite de IA (sem manter conexão presa durante a chamada).
  const budget = await withProfile(async (c, userId) => bumpAndCheckAiUsage(c, userId));
  if (!budget) redirect("/");
  if (!budget.ok) bounce(BACK, budget.message || "Limite de operações de IA atingido.", keep);

  // Fase 2: IA.
  let plan: HairPlan | null = null;
  try {
    const out = await new OpenAI({ timeout: 90000 }).responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: buildPrompt(answers) }] }],
    });
    plan = normalizePlan(parseAiJson(out.output_text), Number(answers.vezes_semana) || 2);
  } catch (e) {
    console.error("submitHairQuestionnaire: IA falhou:", e);
    bounce(BACK, "Não consegui montar o cronograma agora (IA indisponível). Tente de novo em instantes.", keep);
  }
  if (!plan) bounce(BACK, "A resposta da IA veio incompleta. Tente gerar de novo.", keep);

  // Fase 3: encerra o ciclo anterior e grava o novo.
  const finalPlan: HairPlan = plan;
  const weeks = finalPlan.semanas.length;
  const saved = await withProfile(async (c) => {
    await c.query("UPDATE hair_cycles SET status='COMPLETED', completed_at=now() WHERE status='ACTIVE'");
    await c.query(
      "INSERT INTO hair_cycles(tenant_id,user_id,answers,plan,weeks,ends_at) VALUES(current_setting('app.tenant_id')::uuid,current_setting('app.user_id')::uuid,$1::jsonb,$2::jsonb,$3::int,now()+($3::int * interval '7 days'))",
      [JSON.stringify(answers), JSON.stringify(finalPlan), weeks],
    );
    return true;
  });
  if (!saved) redirect("/");
  await flash(`Cronograma pronto: ciclo de ${weeks} semanas.`);
  redirect(BACK);
}

/** Marca (ou desmarca) uma etapa do ciclo ativo como feita. */
export async function toggleHairStep(f: FormData) {
  const cycleId = String(f.get("cycle_id") || ""), stepId = String(f.get("step_id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(cycleId) || !/^s\d{1,2}-\d{1,2}$/.test(stepId)) bounce(BACK, "Etapa inválida.");
  const r = await withProfile(async (c) => {
    const cy = (await c.query("SELECT plan FROM hair_cycles WHERE id=$1 AND status='ACTIVE'", [cycleId])).rows[0];
    if (!cy) return { state: "gone" as const };
    const steps: HairStep[] = (cy.plan?.semanas || []).flatMap((w: HairWeek) => w.etapas || []);
    const step = steps.find((s) => s.id === stepId);
    if (!step) return { state: "gone" as const };
    const del = await c.query("DELETE FROM hair_cycle_logs WHERE cycle_id=$1 AND step_id=$2", [cycleId, stepId]);
    let state: "done" | "undone" = "undone";
    if (!del.rowCount) {
      await c.query(
        "INSERT INTO hair_cycle_logs(cycle_id,step_id,tenant_id,user_id) VALUES($1,$2,current_setting('app.tenant_id')::uuid,current_setting('app.user_id')::uuid) ON CONFLICT DO NOTHING",
        [cycleId, stepId],
      );
      state = "done";
    }
    const doneCount = Number((await c.query("SELECT count(*)::int n FROM hair_cycle_logs WHERE cycle_id=$1", [cycleId])).rows[0].n);
    return { state, title: step.titulo, all: doneCount >= steps.length };
  });
  if (!r) redirect("/");
  if (r.state === "gone") bounce(BACK, "Esse ciclo não está mais ativo.");
  if (r.state === "done") {
    await flash(r.all ? "Ciclo completo! Responda o novo questionário para gerar o próximo." : `Etapa registrada: ${r.title}.`);
  } else {
    await flash("Registro desfeito.", "info");
  }
  redirect(BACK);
}
