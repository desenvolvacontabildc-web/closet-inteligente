import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { submitSkinQuestionnaire } from "@/server/skin-actions";
import { skinStats } from "@/server/skin-progress";
import SubmitButton from "@/components/submit-button";
import CuidesePaywall from "@/components/cuidese-paywall";
import { cuideseAccess, extraPricing } from "@/server/extras";
import SkinChecklist, { type ChecklistStep } from "@/components/skin-checklist";
import { Chips, Question } from "@/components/q-chips";
import {
  PELE, SENSIBILIDADE, TOM, IDADE, QUEIXAS, OBJETIVOS, ROTINA_ATUAL, ATIVOS_USADOS, MAQUIAGEM, SOL, TEMPO, ORCAMENTO,
  SKIN_STEP_TYPES, WEEKDAYS, dayStr, weekdayOf, addDays, hourNow, stepAppliesOn,
  type SkinAnswers, type SkinPlan, type SkinStep,
} from "@/server/skin-options";

const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Questionnaire({ d, again }: { d: Partial<SkinAnswers>; again: boolean }) {
  return <form action={submitSkinQuestionnaire} className="form">
    <Question title="Como é a sua pele?"><Chips name="pele" options={PELE} value={d.pele} /></Question>
    <Question title="Como ela reage a produtos?"><Chips name="sensibilidade" options={SENSIBILIDADE} value={d.sensibilidade} /></Question>
    <Question title="Tom de pele"><Chips name="tom" options={TOM} value={d.tom} /></Question>
    <Question title="Idade"><Chips name="idade" options={IDADE} value={d.idade} /></Question>
    <Question title="O que mais incomoda hoje?" hint="Marque tudo o que se aplica."><Chips name="queixas" options={QUEIXAS} value={d.queixas} multiple /></Question>
    <Question title="O que você quer para a sua pele?" hint="Escolha até 3."><Chips name="objetivos" options={OBJETIVOS} value={d.objetivos} multiple /></Question>
    <Question title="Como é a sua rotina hoje?"><Chips name="rotina_atual" options={ROTINA_ATUAL} value={d.rotina_atual} /></Question>
    <Question title="Quais ativos você já usa?"><Chips name="ativos" options={ATIVOS_USADOS} value={d.ativos} multiple /></Question>
    <Question title="Usa maquiagem?"><Chips name="maquiagem" options={MAQUIAGEM} value={d.maquiagem} /></Question>
    <Question title="Exposição ao sol"><Chips name="sol" options={SOL} value={d.sol} /></Question>
    <Question title="Quanto tempo você tem para a rotina?"><Chips name="tempo" options={TEMPO} value={d.tempo} /></Question>
    <Question title="Quanto quer investir por produto?"><Chips name="orcamento" options={ORCAMENTO} value={d.orcamento} /></Question>
    <Question title="Cuidados especiais">
      <label className="chip-inline"><input type="checkbox" name="gestante" value="1" defaultChecked={d.gestante} /> Estou grávida ou amamentando</label>
      <label className="chip-inline"><input type="checkbox" name="dermato" value="1" defaultChecked={d.dermato} /> Faço tratamento com dermatologista ou uso isotretinoína</label>
      <label>Alguma alergia ou sensibilidade a produto ou ingrediente? (opcional)
        <input name="alergias" maxLength={160} defaultValue={d.alergias || ""} placeholder="Ex.: fragrância, ácido salicílico" />
      </label>
      <label>Quais produtos você usa hoje? (opcional)
        <input name="produtos_atuais" maxLength={240} defaultValue={d.produtos_atuais || ""} placeholder="Sabonete, hidratante, protetor..." />
      </label>
    </Question>
    <SubmitButton pendingText="Montando a sua rotina...">{again ? "Gerar novo diagnóstico e rotina" : "Gerar minha rotina"}</SubmitButton>
  </form>;
}

export default async function Skincare({ searchParams }: { searchParams: Promise<{ error?: string; novo?: string; dia?: string; f_a?: string }> }) {
  const sp = await searchParams;
  const today = dayStr();
  const data = await withProfile(async (c, userId) => {
    const access = await cuideseAccess(c, userId);
    if (!access.access) return { access, price: (await extraPricing(c, "CUIDESE")).price_cents, routines: [] as any[], active: null as any, logs: [] as { day: string; step_id: string }[] };
    const routines = (await c.query("SELECT id,answers,plan,status,started_at,review_at,completed_at FROM skin_routines ORDER BY created_at DESC LIMIT 6")).rows;
    const active = routines.find((r: any) => r.status === "ACTIVE") || null;
    const logs: { day: string; step_id: string }[] = active
      ? (await c.query("SELECT day::text AS day, step_id FROM skin_logs WHERE routine_id=$1 AND day >= $2::date", [active.id, addDays(today, -30)])).rows : [];
    return { access, price: 0, routines, active, logs };
  });
  if (!data) redirect("/");
  if (!data.access.access) return <CuidesePaywall title="Skincare" priceCents={data.price} until={data.access.until} />;
  const { routines, active, logs } = data;

  let typed: Partial<SkinAnswers> | null = null;
  try { typed = sp.f_a ? JSON.parse(sp.f_a) : null; } catch { typed = null; }
  const defaults: Partial<SkinAnswers> = typed || (routines[0]?.answers as Partial<SkinAnswers>) || {};
  const head = <>
    <Link href="/cuidese">← Cuide-se</Link>
    <span className="eyebrow">CUIDE-SE</span>
    <h1>Skincare</h1>
  </>;

  if (!active || sp.novo === "1") {
    return <main className="shell narrow">
      {head}
      <p className="look-meta">
        {active ? "Responda de novo para gerar um novo diagnóstico e uma nova rotina. A rotina atual será encerrada."
          : routines.length ? "Atualize as respostas: a pele muda com o tempo, e a rotina muda junto."
            : "Responda algumas perguntas e eu monto a sua rotina de manhã e de noite, com os ingredientes certos para a sua pele."}
      </p>
      {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}
      <Questionnaire d={defaults} again={!!routines.length} />
      {active && <p><Link href="/cuidese/skincare">Voltar à rotina atual</Link></p>}
    </main>;
  }

  const plan = active.plan as SkinPlan;
  const yesterday = sp.dia === "ontem";
  const day = yesterday ? addDays(today, -1) : today;
  const wd = weekdayOf(day);
  const doneToday = new Set(logs.filter((l) => l.day === day).map((l) => l.step_id));
  const mk = (s: SkinStep): ChecklistStep => ({
    id: s.id, tipo: SKIN_STEP_TYPES[s.tipo] || s.tipo, titulo: s.titulo, como_fazer: s.como_fazer, preferir: s.preferir, evitar: s.evitar,
    exemplos: s.exemplos, done: doneToday.has(s.id), note: s.dias.length ? "dia alternado" : undefined,
  });
  const am = plan.manha.filter((s) => stepAppliesOn(s, wd)).map(mk);
  const pm = plan.noite.filter((s) => stepAppliesOn(s, wd)).map(mk);
  const { week, streak } = skinStats(plan, new Date(active.started_at), logs);
  const reviewDue = Date.now() > new Date(active.review_at).getTime();
  const nowAm = hourNow() < 15;
  const special = [
    ...plan.manha.filter((s) => s.dias.length).map((s) => ({ s, p: "Manhã" })),
    ...plan.noite.filter((s) => s.dias.length).map((s) => ({ s, p: "Noite" })),
  ];
  const past = routines.filter((r: any) => r.status === "COMPLETED");

  const periodCard = (label: string, steps: ChecklistStep[], current: boolean) => steps.length > 0 && <section className={`card skin-card${current && !yesterday ? " current" : ""}`}>
    <h2>{label}</h2>
    <SkinChecklist key={`${day}-${label}`} routineId={active.id} day={day} steps={steps} />
  </section>;

  return <main className="shell narrow">
    {head}
    {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}

    {reviewDue && <section className="card hair-finish">
      <h2>Hora de reavaliar a pele</h2>
      <p>Já se passaram as {plan.revisar_em_semanas} semanas previstas para esta rotina. Um novo questionário gera um novo diagnóstico e ajusta os produtos.</p>
      <Link href="/cuidese/skincare?novo=1" className="button-link">Fazer o novo questionário</Link>
    </section>}

    <section className="skin-today-head">
      <p className="hair-q-title">{yesterday ? "Ontem" : "Hoje"} · {WEEKDAYS[wd]}, {dm(day)}</p>
      <p className="look-meta">
        {yesterday ? <Link href="/cuidese/skincare">Voltar para hoje</Link> : <Link href="/cuidese/skincare?dia=ontem">Esqueci de marcar ontem</Link>}
      </p>
    </section>

    {nowAm ? <>{periodCard("Manhã", am, true)}{periodCard("Noite", pm, false)}</> : <>{periodCard("Noite", pm, true)}{periodCard("Manhã", am, false)}</>}

    <section className="card">
      <h2>Sua constância</h2>
      <p><strong>{streak}</strong> {streak === 1 ? "dia" : "dias"} seguidos com a rotina em dia</p>
      <div className="skin-week" aria-label="Últimos 7 dias">
        {week.map((d) => {
          const ratio = d.planned ? d.done / d.planned : 0;
          const cls = d.before ? "off" : ratio >= 0.75 ? "full" : d.done > 0 ? "part" : "none";
          return <div key={d.day} className="skin-dot-col">
            <span className={`skin-dot ${cls}`} title={`${d.done} de ${d.planned} etapas`} />
            <small>{SHORT[weekdayOf(d.day)]}</small>
          </div>;
        })}
      </div>
      <p className="look-meta">Dia em dia = 75% ou mais das etapas feitas.</p>
    </section>

    {special.length > 0 && <section className="card">
      <h2>Ativos em dias alternados</h2>
      <p className="look-meta">Esses produtos são mais fortes e entram só em alguns dias. Siga a agenda para a pele se adaptar.</p>
      <ul>
        {special.map(({ s, p }) => <li key={s.id}><strong>{s.titulo}</strong> · {p}: {s.dias.map((n) => SHORT[n]).join(", ")}</li>)}
      </ul>
    </section>}

    <section className="card">
      <h2>Seu diagnóstico</h2>
      <p>{plan.resumo}</p>
      {plan.perfil.length > 0 && <dl className="hair-profile">
        {plan.perfil.map((p) => <div key={p.rotulo}><dt>{p.rotulo}</dt><dd>{p.valor}</dd></div>)}
      </dl>}
      {plan.prioridades.length > 0 && <>
        <p className="hair-q-title">Prioridades</p>
        <ul>{plan.prioridades.map((p) => <li key={p}>{p}</li>)}</ul>
      </>}
      {plan.alerta && <p className="look-meta"><strong>Atenção:</strong> {plan.alerta}</p>}
      <p className="look-meta">Reavaliar a pele em cerca de {plan.revisar_em_semanas} semanas (por volta de {dm(dayStr(new Date(active.review_at)))}).</p>
    </section>

    {plan.dicas.length > 0 && <section className="card">
      <h2>Dicas da especialista</h2>
      <ul>{plan.dicas.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>}

    {!reviewDue && <p><Link href="/cuidese/skincare?novo=1">Refazer o questionário agora</Link></p>}

    {past.length > 0 && <details className="card">
      <summary>Rotinas anteriores</summary>
      <ul>{past.map((r: any) => <li key={r.id}>{dm(dayStr(new Date(r.started_at)))}/{String(new Date(r.started_at).getFullYear()).slice(2)} a {r.completed_at ? `${dm(dayStr(new Date(r.completed_at)))}/${String(new Date(r.completed_at).getFullYear()).slice(2)}` : "?"}</li>)}</ul>
    </details>}
  </main>;
}
