import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { submitHairQuestionnaire, toggleHairStep } from "@/server/hair-actions";
import SubmitButton from "@/components/submit-button";
import CuidesePaywall from "@/components/cuidese-paywall";
import { cuideseAccess, extraPricing } from "@/server/extras";
import {
  FIO, ESPESSURA, COMPRIMENTO, COURO, QUIMICA, TEMPO_QUIMICA, QUEIXAS, ELASTICIDADE, POROSIDADE, LAVAGEM, CALOR, SOL,
  OBJETIVOS, VEZES_SEMANA, ORCAMENTO, STEP_TYPES, type Opt, type Answers, type HairPlan,
} from "@/server/hair-options";

function Chips({ name, options, value, multiple }: { name: string; options: Opt[]; value?: string | string[]; multiple?: boolean }) {
  const sel = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return <div className="chip-group">
    {options.map((o) => <label key={o.value} className="chip">
      <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value} defaultChecked={sel.has(o.value)} />
      <span>{o.label}</span>
    </label>)}
  </div>;
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <div className="hair-q">
    <p className="hair-q-title">{title}</p>
    {hint && <p className="look-meta">{hint}</p>}
    {children}
  </div>;
}

function Questionnaire({ d, again }: { d: Partial<Answers>; again: boolean }) {
  return <form action={submitHairQuestionnaire} className="form">
    <Question title="Como é o seu cabelo?"><Chips name="fio" options={FIO} value={d.fio} /></Question>
    <Question title="Espessura dos fios"><Chips name="espessura" options={ESPESSURA} value={d.espessura} /></Question>
    <Question title="Comprimento"><Chips name="comprimento" options={COMPRIMENTO} value={d.comprimento} /></Question>
    <Question title="Como está o seu couro cabeludo?"><Chips name="couro" options={COURO} value={d.couro} /></Question>
    <Question title="O que já foi feito no cabelo?" hint="Pode marcar mais de uma."><Chips name="quimica" options={QUIMICA} value={d.quimica} multiple /></Question>
    <Question title="Há quanto tempo foi a última química?"><Chips name="tempo_quimica" options={TEMPO_QUIMICA} value={d.tempo_quimica} /></Question>
    <Question title="O que mais incomoda hoje?" hint="Marque tudo o que se aplica."><Chips name="queixas" options={QUEIXAS} value={d.queixas} multiple /></Question>
    <Question title="Teste da elasticidade" hint="Pegue um fio molhado, limpo e sem produto, e estique devagar entre os dedos.">
      <Chips name="elasticidade" options={ELASTICIDADE} value={d.elasticidade} />
    </Question>
    <Question title="Teste da porosidade" hint="Solte um fio limpo e seco num copo com água e espere alguns minutos.">
      <Chips name="porosidade" options={POROSIDADE} value={d.porosidade} />
    </Question>
    <Question title="Com que frequência você lava o cabelo?"><Chips name="lavagem" options={LAVAGEM} value={d.lavagem} /></Question>
    <Question title="Usa calor (chapinha, secador, babyliss)?"><Chips name="calor" options={CALOR} value={d.calor} /></Question>
    <Question title="Exposição a sol, praia ou piscina"><Chips name="sol" options={SOL} value={d.sol} /></Question>
    <Question title="O que você mais quer para o seu cabelo?" hint="Escolha até 3."><Chips name="objetivos" options={OBJETIVOS} value={d.objetivos} multiple /></Question>
    <Question title="Quantas vezes por semana você consegue fazer um tratamento?"><Chips name="vezes_semana" options={VEZES_SEMANA} value={d.vezes_semana} /></Question>
    <Question title="Quanto quer investir por produto?"><Chips name="orcamento" options={ORCAMENTO} value={d.orcamento} /></Question>
    <Question title="Cuidados especiais">
      <label className="chip-inline"><input type="checkbox" name="gestante" value="1" defaultChecked={d.gestante} /> Estou grávida ou amamentando</label>
      <label>Alguma alergia ou sensibilidade a produto ou ingrediente? (opcional)
        <input name="alergias" maxLength={160} defaultValue={d.alergias || ""} placeholder="Ex.: sulfato, fragrância" />
      </label>
      <label>Quais produtos você usa hoje? (opcional)
        <input name="produtos_atuais" maxLength={240} defaultValue={d.produtos_atuais || ""} placeholder="Shampoo, condicionador, máscara..." />
      </label>
    </Question>
    <SubmitButton pendingText="Montando o seu cronograma...">{again ? "Gerar novo diagnóstico e ciclo" : "Gerar meu cronograma"}</SubmitButton>
  </form>;
}

const dm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default async function Cronograma({ searchParams }: { searchParams: Promise<{ error?: string; novo?: string; f_a?: string }> }) {
  const sp = await searchParams;
  const data = await withProfile(async (c, userId) => {
    const access = await cuideseAccess(c, userId);
    if (!access.access) return { access, price: (await extraPricing(c, "CUIDESE")).price_cents, cycles: [] as any[], counts: new Map<string, number>(), active: null as any, logs: [] as any[] };
    const cycles = (await c.query("SELECT id,answers,plan,weeks,status,started_at,ends_at,completed_at FROM hair_cycles ORDER BY created_at DESC LIMIT 6")).rows;
    const counts = new Map<string, number>(
      (await c.query("SELECT cycle_id, count(*)::int n FROM hair_cycle_logs GROUP BY cycle_id")).rows.map((r: any) => [r.cycle_id, r.n]),
    );
    const active = cycles.find((x: any) => x.status === "ACTIVE") || null;
    const logs: { step_id: string; done_at: Date }[] = active ? (await c.query("SELECT step_id, done_at FROM hair_cycle_logs WHERE cycle_id=$1", [active.id])).rows : [];
    return { access, price: 0, cycles, active, logs, counts };
  });
  if (!data) redirect("/");
  if (!data.access.access) return <CuidesePaywall title="Cronograma Capilar" priceCents={data.price} until={data.access.until} />;
  const { cycles, active, logs, counts } = data;

  let typed: Partial<Answers> | null = null;
  try { typed = sp.f_a ? JSON.parse(sp.f_a) : null; } catch { typed = null; }
  const defaults: Partial<Answers> = typed || (cycles[0]?.answers as Partial<Answers>) || {};
  const showForm = !active || sp.novo === "1";

  const head = <>
    <Link href="/cuidese">← Cuide-se</Link>
    <span className="eyebrow">CUIDE-SE</span>
    <h1>Cronograma Capilar</h1>
  </>;

  if (showForm) {
    return <main className="shell narrow">
      {head}
      <p className="look-meta">
        {active ? "Responda de novo para gerar um novo diagnóstico e um novo ciclo. O ciclo atual será encerrado."
          : cycles.length ? "Seu último ciclo terminou. Atualize as respostas: o cabelo muda e o cronograma muda junto."
            : "Responda algumas perguntas e eu monto o seu cronograma de hidratação, nutrição e reconstrução, com os ingredientes certos para cada etapa."}
      </p>
      {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}
      <Questionnaire d={defaults} again={!!cycles.length} />
      {active && <p><Link href="/cuidese/cronograma">Voltar ao ciclo atual</Link></p>}
    </main>;
  }

  const plan = active.plan as HairPlan;
  const done = new Map(logs.map((l) => [l.step_id, new Date(l.done_at)]));
  const total = plan.semanas.reduce((n, w) => n + w.etapas.length, 0);
  const doneCount = plan.semanas.reduce((n, w) => n + w.etapas.filter((e) => done.has(e.id)).length, 0);
  const started = new Date(active.started_at), ends = new Date(active.ends_at);
  const week = Math.min(active.weeks, Math.max(1, Math.floor((Date.now() - started.getTime()) / (7 * 86400000)) + 1));
  const finished = doneCount >= total || Date.now() > ends.getTime();
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return <main className="shell narrow">
    {head}
    {sp.error && <p role="alert" className="trial-banner">{sp.error}</p>}

    {finished && <section className="card hair-finish">
      <h2>Ciclo {doneCount >= total ? "completo" : "encerrado"}</h2>
      <p>{doneCount >= total ? "Você fez todas as etapas." : `O período previsto terminou em ${dm(ends)}, com ${doneCount} de ${total} etapas feitas.`} Hora de reavaliar o cabelo: um novo questionário gera um novo diagnóstico e um novo ciclo.</p>
      <Link href="/cuidese/cronograma?novo=1" className="button-link">Fazer o novo questionário</Link>
    </section>}

    <section className="card">
      <h2>Seu diagnóstico</h2>
      <p>{plan.resumo}</p>
      {plan.perfil.length > 0 && <dl className="hair-profile">
        {plan.perfil.map((p) => <div key={p.rotulo}><dt>{p.rotulo}</dt><dd>{p.valor}</dd></div>)}
      </dl>}
      {plan.prioridades.length > 0 && <>
        <p className="hair-q-title">Prioridades do ciclo</p>
        <ul>{plan.prioridades.map((p) => <li key={p}>{p}</li>)}</ul>
      </>}
      {plan.alerta && <p className="look-meta"><strong>Atenção:</strong> {plan.alerta}</p>}
    </section>

    <section className="card">
      <h2>Acompanhamento</h2>
      <p className="look-meta">
        Ciclo de {active.weeks} semanas, de {dm(started)} a {dm(ends)}. {plan.justificativa_periodo}
      </p>
      <div className="hair-progress" aria-label={`${pct}% concluído`}><i style={{ width: `${pct}%` }} /></div>
      <p><strong>{doneCount} de {total}</strong> etapas feitas · semana {week} de {active.weeks}</p>
    </section>

    {plan.semanas.map((w) => {
      const wDone = w.etapas.filter((e) => done.has(e.id)).length;
      return <details key={w.numero} id={`semana-${w.numero}`} className="hair-week" open={w.numero === week}>
        <summary>
          <span className="hair-week-title">Semana {w.numero}{w.numero === week ? " · agora" : ""}</span>
          <small>{wDone}/{w.etapas.length} feitas{w.foco ? ` · ${w.foco}` : ""}</small>
        </summary>
        {w.etapas.map((e) => {
          const at = done.get(e.id);
          return <div key={e.id} className={`hair-step${at ? " done" : ""}`}>
            <span className="hair-tag">{STEP_TYPES[e.tipo] || e.tipo}</span>
            <p className="hair-step-title">{e.titulo}</p>
            <form action={toggleHairStep}>
              <input type="hidden" name="cycle_id" value={active.id} />
              <input type="hidden" name="step_id" value={e.id} />
              <SubmitButton pendingText="Salvando..." className={at ? "ghost" : ""}>{at ? `Feita em ${dm(at)} · desfazer` : "Marcar como feita"}</SubmitButton>
            </form>
            <details className="hair-how">
              <summary>Como fazer e o que usar</summary>
              {e.como_fazer && <p>{e.como_fazer}</p>}
              {e.preferir.length > 0 && <p><strong>Prefira produtos que contenham:</strong> {e.preferir.join(", ")}.</p>}
              {e.evitar.length > 0 && <p><strong>Evite:</strong> {e.evitar.join(", ")}.</p>}
              {e.exemplos.length > 0 && <p className="look-meta">Sugestões de referência (confira sempre o rótulo): {e.exemplos.join("; ")}.</p>}
            </details>
          </div>;
        })}
      </details>;
    })}

    {plan.dicas.length > 0 && <section className="card">
      <h2>Dicas da especialista</h2>
      <ul>{plan.dicas.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>}

    {!finished && <p><Link href="/cuidese/cronograma?novo=1">Refazer o questionário agora</Link></p>}

    {cycles.filter((x: any) => x.status === "COMPLETED").length > 0 && <details className="card">
      <summary>Ciclos anteriores</summary>
      <ul>
        {cycles.filter((x: any) => x.status === "COMPLETED").map((x: any) => {
          const t = (x.plan?.semanas || []).reduce((n: number, w: any) => n + (w.etapas?.length || 0), 0);
          return <li key={x.id}>{new Date(x.started_at).toLocaleDateString("pt-BR")} · {x.weeks} semanas · {counts.get(x.id) || 0} de {t} etapas feitas</li>;
        })}
      </ul>
    </details>}
  </main>;
}
