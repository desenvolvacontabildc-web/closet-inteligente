"use server";
import OpenAI from "openai";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { bumpAndCheckAiUsage } from "./limits";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { parseAiJson } from "./ai-json";
import {
  PELE, SENSIBILIDADE, TOM, IDADE, QUEIXAS, OBJETIVOS, ROTINA_ATUAL, ATIVOS_USADOS, MAQUIAGEM, SOL, TEMPO, ORCAMENTO,
  SKIN_STEP_TYPES, labelOf, labelsOf, dayStr, addDays,
  type Opt, type SkinAnswers, type SkinPlan, type SkinStep,
} from "./skin-options";

const BACK = "/cuidese/skincare";

const one = (f: FormData, name: string, opts: Opt[]): string => {
  const v = String(f.get(name) || "");
  return opts.some((o) => o.value === v) ? v : "";
};
const many = (f: FormData, name: string, opts: Opt[], max = 14): string[] =>
  f.getAll(name).map(String).filter((v, i, a) => opts.some((o) => o.value === v) && a.indexOf(v) === i).slice(0, max);
const text = (f: FormData, name: string, max: number): string => String(f.get(name) || "").replace(/\s+/g, " ").trim().slice(0, max);

function readAnswers(f: FormData): SkinAnswers {
  return {
    pele: one(f, "pele", PELE), sensibilidade: one(f, "sensibilidade", SENSIBILIDADE), tom: one(f, "tom", TOM), idade: one(f, "idade", IDADE),
    queixas: many(f, "queixas", QUEIXAS), objetivos: many(f, "objetivos", OBJETIVOS, 3), rotina_atual: one(f, "rotina_atual", ROTINA_ATUAL),
    ativos: many(f, "ativos", ATIVOS_USADOS), maquiagem: one(f, "maquiagem", MAQUIAGEM), sol: one(f, "sol", SOL), tempo: one(f, "tempo", TEMPO),
    orcamento: one(f, "orcamento", ORCAMENTO), gestante: f.get("gestante") === "1", dermato: f.get("dermato") === "1",
    alergias: text(f, "alergias", 160), produtos_atuais: text(f, "produtos_atuais", 240),
  };
}

const strs = (v: unknown, max: number, len: number): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim().slice(0, len)).filter(Boolean).slice(0, max) : [];

function normalizeSteps(raw: unknown, prefix: "am" | "pm", max: number): SkinStep[] {
  const out: SkinStep[] = [];
  for (const e of Array.isArray(raw) ? raw.slice(0, max + 2) : []) {
    const tipo = String((e as any)?.tipo || "").toUpperCase();
    const titulo = String((e as any)?.titulo || "").trim().slice(0, 90);
    if (!SKIN_STEP_TYPES[tipo] || !titulo || out.length >= max) continue;
    const dias = Array.isArray((e as any)?.dias)
      ? Array.from(new Set((e as any).dias.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))) as number[]
      : [];
    out.push({
      id: `${prefix}${out.length + 1}`, tipo, titulo,
      como_fazer: String((e as any)?.como_fazer || "").trim().slice(0, 600),
      preferir: strs((e as any)?.preferir, 6, 90), evitar: strs((e as any)?.evitar, 5, 90), exemplos: strs((e as any)?.exemplos, 4, 110),
      dias: dias.length >= 7 ? [] : dias.sort((a, b) => a - b),
    });
  }
  return out;
}

/** Nunca confia no JSON da IA: normaliza, limita e garante o protetor solar de manhã (regra de segurança). */
function normalizePlan(raw: any): SkinPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const manha = normalizeSteps(raw.manha, "am", 6);
  const noite = normalizeSteps(raw.noite, "pm", 7);
  if (manha.length < 2 || noite.length < 2) return null;
  const resumo = String(raw.resumo || "").trim().slice(0, 1200);
  if (!resumo) return null;
  if (!manha.some((s) => s.tipo === "PROTETOR_SOLAR")) {
    manha.push({
      id: `am${manha.length + 1}`, tipo: "PROTETOR_SOLAR", titulo: "Protetor solar FPS 30 a 50+ (todo dia)",
      como_fazer: "Aplique por último, cerca de 2 dedos de produto no rosto e pescoço. Reaplique a cada 2 ou 3 horas se estiver exposta ao sol.",
      preferir: ["Filtros de amplo espectro (UVA e UVB)", "Textura adequada ao seu tipo de pele"], evitar: ["Pular nos dias nublados ou dentro de casa perto da janela"], exemplos: [], dias: [],
    });
  }
  const rev = Math.round(Number(raw.revisar_em_semanas));
  return {
    resumo,
    perfil: (Array.isArray(raw.perfil) ? raw.perfil : []).slice(0, 7)
      .map((p: any) => ({ rotulo: String(p?.rotulo || "").trim().slice(0, 40), valor: String(p?.valor || "").trim().slice(0, 120) }))
      .filter((p: any) => p.rotulo && p.valor),
    prioridades: strs(raw.prioridades, 5, 140), manha, noite, dicas: strs(raw.dicas, 6, 200),
    alerta: String(raw.alerta || "").trim().slice(0, 400),
    revisar_em_semanas: Number.isFinite(rev) ? Math.min(12, Math.max(4, rev)) : 8,
  };
}

function buildPrompt(a: SkinAnswers): string {
  return (
    `Você é uma especialista em cuidados com a pele (dermocosmética e rotina de skincare), conversando com a cliente em português do Brasil, com tom acolhedor e objetivo. ` +
    `Com base nas respostas abaixo, faça um DIAGNÓSTICO da pele e monte uma ROTINA DE MANHÃ e uma ROTINA DE NOITE.\n\n` +
    `RESPOSTAS DA CLIENTE:\n` +
    `- Tipo de pele: ${labelOf(PELE, a.pele)}; sensibilidade: ${labelOf(SENSIBILIDADE, a.sensibilidade) || "não informada"}; tom de pele: ${labelOf(TOM, a.tom) || "não informado"}; idade: ${labelOf(IDADE, a.idade) || "não informada"}.\n` +
    `- Queixas: ${labelsOf(QUEIXAS, a.queixas) || "nenhuma marcada"}.\n` +
    `- Objetivos: ${labelsOf(OBJETIVOS, a.objetivos) || "não informados"}.\n` +
    `- Rotina atual: ${labelOf(ROTINA_ATUAL, a.rotina_atual) || "não informada"}. Ativos que já usa: ${labelsOf(ATIVOS_USADOS, a.ativos) || "não informado"}.\n` +
    `- Maquiagem: ${labelOf(MAQUIAGEM, a.maquiagem) || "não informado"}. Exposição ao sol: ${labelOf(SOL, a.sol) || "não informada"}.\n` +
    `- Tempo disponível: ${labelOf(TEMPO, a.tempo) || "médio"}. Orçamento por produto: ${labelOf(ORCAMENTO, a.orcamento) || "flexível"}.\n` +
    `- Gestante ou amamentando: ${a.gestante ? "SIM" : "não"}. Acompanhamento dermatológico ou uso de isotretinoína: ${a.dermato ? "SIM" : "não"}.\n` +
    `- Alergias ou sensibilidades: ${a.alergias || "nenhuma informada"}. Produtos que já usa: ${a.produtos_atuais || "não informados"}.\n\n` +
    `REGRAS:\n` +
    `1. Monte "manha" (2 a 6 etapas) e "noite" (2 a 7 etapas), na ORDEM de aplicação. Respeite o tempo disponível (rápida = no máximo 3 etapas por período). Mais etapas não é melhor: priorize o que resolve as queixas.\n` +
    `2. Manhã SEMPRE termina com protetor solar (tipo PROTETOR_SOLAR), todos os dias. Retinoides e ácidos fortes só à NOITE.\n` +
    `3. Ativos de ação forte (retinoide, ácidos esfoliantes, esfoliação) entram em dias alternados usando "dias" (lista de números de 0=domingo a 6=sábado em que a etapa vale; lista vazia ou ausente = todos os dias). Nunca coloque retinoide e ácido esfoliante na mesma noite. Comece de forma gradual (por exemplo, 2 noites por semana) e explique como aumentar.\n` +
    `4. Tipos permitidos em "tipo": DEMAQUILANTE, LIMPEZA, TONICO, SERUM, TRATAMENTO, ESFOLIACAO, MASCARA, CONTORNO_OLHOS, HIDRATANTE, PROTETOR_SOLAR, LABIOS, PONTUAL. Se usa maquiagem ou protetor, a noite começa com demaquilante e limpeza (limpeza em duas etapas).\n` +
    `5. Em cada etapa informe: "titulo" curto; "como_fazer" prático (quantidade, ordem, tempo de espera, frequência); "preferir" com 3 a 5 ingredientes ou ativos que o produto deve conter (ex.: ácido hialurônico, glicerina, ceramidas, niacinamida, vitamina C estável, ácido salicílico, ácido azelaico, ácido tranexâmico, pantenol, filtros de amplo espectro); "evitar" com 1 a 3 itens; "exemplos" com até 3 tipos de produto ou linhas de referência do mercado brasileiro adequadas ao orçamento (apenas sugestões; a cliente deve conferir o rótulo).\n` +
    `6. Segurança: se grávida ou amamentando, NÃO inclua retinoides nem ácidos em alta concentração; use alternativas seguras e peça confirmação médica no "alerta". Se faz tratamento dermatológico ou usa isotretinoína, monte só uma rotina gentil de apoio (limpeza suave, hidratante, protetor solar, lábios), sem esfoliantes nem ativos fortes, e diga para seguir a orientação do médico. Pele muito sensível: poucos produtos e sem fragrância. Tom de pele mais escuro: cuidado com ácidos e esfoliação agressivos (risco de manchas pós-inflamatórias). Respeite alergias informadas. Recomende teste em uma pequena área antes de produtos novos.\n` +
    `7. Não faça diagnóstico médico. Se houver acne cística ou dolorosa, lesões que mudam, sangram ou não cicatrizam, ou vermelhidão persistente, indique em "alerta" procurar um dermatologista.\n` +
    `8. Em "revisar_em_semanas" informe em quantas semanas (4 a 12) ela deve reavaliar a pele e refazer o questionário.\n\n` +
    `Responda APENAS JSON neste formato: {"resumo":"diagnóstico em 3 a 5 frases","perfil":[{"rotulo":"Tipo de pele","valor":"..."},{"rotulo":"Sensibilidade","valor":"..."},{"rotulo":"Principal necessidade","valor":"..."},{"rotulo":"Cuidado-chave","valor":"..."}],"prioridades":["..."],"manha":[{"tipo":"LIMPEZA","titulo":"...","como_fazer":"...","preferir":["..."],"evitar":["..."],"exemplos":["..."],"dias":[]}],"noite":[{"tipo":"TRATAMENTO","titulo":"...","como_fazer":"...","preferir":["..."],"evitar":["..."],"exemplos":["..."],"dias":[2,4,6]}],"dicas":["..."],"alerta":"","revisar_em_semanas":8}`
  );
}

/** Questionário respondido: a IA faz o diagnóstico e monta a rotina. A rotina anterior (se houver) é encerrada. */
export async function submitSkinQuestionnaire(f: FormData) {
  const answers = readAnswers(f);
  const keep = { a: JSON.stringify(answers) };
  if (!answers.pele) bounce(BACK, "Escolha o seu tipo de pele para continuar.", keep);
  if (!answers.sensibilidade) bounce(BACK, "Conte como a sua pele reage a produtos.", keep);
  if (!answers.objetivos.length) bounce(BACK, "Escolha pelo menos um objetivo para a pele.", keep);
  if (!answers.tempo) bounce(BACK, "Diga quanto tempo você tem para a rotina.", keep);
  if (!process.env.OPENAI_API_KEY) bounce(BACK, "A IA não está configurada no momento.", keep);

  const budget = await withProfile(async (c, userId) => bumpAndCheckAiUsage(c, userId));
  if (!budget) redirect("/");
  if (!budget.ok) bounce(BACK, budget.message || "Limite de operações de IA atingido.", keep);

  let plan: SkinPlan | null = null;
  try {
    const out = await new OpenAI({ timeout: 90000 }).responses.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: buildPrompt(answers) }] }],
    });
    plan = normalizePlan(parseAiJson(out.output_text));
  } catch (e) {
    console.error("submitSkinQuestionnaire: IA falhou:", e);
    bounce(BACK, "Não consegui montar a rotina agora (IA indisponível). Tente de novo em instantes.", keep);
  }
  if (!plan) bounce(BACK, "A resposta da IA veio incompleta. Tente gerar de novo.", keep);

  const finalPlan: SkinPlan = plan;
  const saved = await withProfile(async (c) => {
    await c.query("UPDATE skin_routines SET status='COMPLETED', completed_at=now() WHERE status='ACTIVE'");
    await c.query(
      "INSERT INTO skin_routines(tenant_id,user_id,answers,plan,review_at) VALUES(current_setting('app.tenant_id')::uuid,current_setting('app.user_id')::uuid,$1::jsonb,$2::jsonb,now()+($3::int * interval '7 days'))",
      [JSON.stringify(answers), JSON.stringify(finalPlan), finalPlan.revisar_em_semanas],
    );
    return true;
  });
  if (!saved) redirect("/");
  await flash("Rotina pronta. Comece pelo que está em \"Hoje\".");
  redirect(BACK);
}

/** Marca ou desmarca uma etapa de HOJE (ou de ontem, para quem esqueceu). Chamada direto do navegador, sem
 * recarregar a página: devolve só o resultado. `done` é o estado desejado, então repetir o toque não inverte nada. */
export async function setSkinStep(routineId: string, stepId: string, day: string, done: boolean): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(routineId) || !/^(am|pm)\d{1,2}$/.test(stepId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false };
  const today = dayStr();
  if (day !== today && day !== addDays(today, -1)) return { ok: false };
  const r = await withProfile(async (c) => {
    const rt = (await c.query("SELECT plan FROM skin_routines WHERE id=$1 AND status='ACTIVE'", [routineId])).rows[0];
    if (!rt) return false;
    const plan = rt.plan as SkinPlan;
    if (![...(plan.manha || []), ...(plan.noite || [])].some((s) => s.id === stepId)) return false;
    if (done) {
      await c.query(
        "INSERT INTO skin_logs(routine_id,day,step_id,tenant_id,user_id) VALUES($1,$2::date,$3,current_setting('app.tenant_id')::uuid,current_setting('app.user_id')::uuid) ON CONFLICT DO NOTHING",
        [routineId, day, stepId],
      );
    } else {
      await c.query("DELETE FROM skin_logs WHERE routine_id=$1 AND day=$2::date AND step_id=$3", [routineId, day, stepId]);
    }
    return true;
  });
  return { ok: !!r };
}
