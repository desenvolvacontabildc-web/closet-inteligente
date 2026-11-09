import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { saveTripStep, addTripEvent, removeTripEvent, generateTripPlan, toggleChecklistItem, removeTripItem, addTripItem, swapTripItem, deleteTripLook, regenerateTripLook } from "@/server/trip-actions";
import {
  TRANSPORTE_OPCOES, BAGAGEM_OPCOES, SENSIBILIDADE_OPCOES, OBJETIVO_OPCOES, EVENTO_TIPOS, PERIODO_OPCOES, LAZER_OPCOES, DRESS_CODE_OPCOES,
  ESTILO_OPCOES, PRIORIDADE_OPCOES, REPETICAO_OPCOES, LAVANDERIA_OPCOES, ESTRATEGIA_OPCOES, NECESSIDADE_OPCOES, INCLUIR_OPCOES, CHECKLIST_TEMPLATE, type TripEvent,
} from "@/server/trip-options";
import { generateLookIllustration } from "@/server/look-actions";
import { aiUsageRemaining, imageGenerationsRemaining } from "@/server/limits";
import SubmitButton from "@/components/submit-button";
import ConfirmButton from "@/components/confirm-button";
import TripPoster from "@/components/trip-poster";

const TOTAL_STEPS = 9;
const OBJETIVO_LABEL: Record<string, string> = { PASSEIO: "Passeio / lazer", TRABALHO: "Trabalho", MISTO: "Trabalho e passeio" };

function Chips({ name, options, defaultValues, multiple = true }: { name: string; options: string[]; defaultValues: string[]; multiple?: boolean }) {
  return <div className="chip-group">
    {options.map(opt => (
      <label className="chip" key={opt}>
        <input type={multiple ? "checkbox" : "radio"} name={name} value={opt} defaultChecked={defaultValues.includes(opt)} />
        <span>{opt}</span>
      </label>
    ))}
  </div>;
}

function Progress({ step }: { step: number }) {
  return <div className="step-progress" aria-label={`Etapa ${step} de ${TOTAL_STEPS}`}>
    {Array.from({ length: TOTAL_STEPS }, (_, i) => <span key={i} className={i < step ? "done" : ""} />)}
  </div>;
}

/** Ordem de montagem de um look "na mesa": parte de cima, de baixo, camada, calçado, bolsa e acessórios. */
function slot(category: string): number {
  const c = (category || "").toLowerCase();
  if (/vestid|macac/.test(c)) return 1;
  if (/blus|camis|top|regata|camiset|malha|tricot|suéter|sueter/.test(c)) return 0;
  if (/cal[çc]a|saia|short|bermuda|legging/.test(c)) return 1;
  if (/blazer|casaco|jaqueta|cardig|colete|kimono|quimono|sobretudo|trench/.test(c)) return 2;
  if (/sapat|sand[áa]l|t[êe]nis|bota|rasteir|scarpin|slingback|cal[çc]ad/.test(c)) return 3;
  if (/bolsa|mochila|clutch/.test(c)) return 4;
  return 5;
}

/** Tipo do look para a faixa do pôster (AEROLOOK, PASSEIO, TRABALHO, EVENTO). */
function lookTag(l: any): string {
  const t = `${l.trip_period || ""} ${l.occasion || ""} ${l.name || ""}`.toLowerCase();
  if (/chegad|retorn|desloc|aerop|aeroporto|viagem|embarque/.test(t)) return "AEROLOOK";
  if (/reuni|semin|congress|palestr|apresent|neg[óo]ci|trabalh/.test(t)) return "TRABALHO";
  if (/jantar|festa|casament|evento|formal|balada|show/.test(t)) return "EVENTO";
  if (/passeio|lazer|praia|piscina|turism|compras|livre|casual/.test(t)) return "PASSEIO";
  return "LOOK";
}
/** Em qual seção do pôster a peça entra. */
function pieceGroup(it: any): "swim" | "shoes" | "bags" | "accessories" | "clothes" {
  const text = `${it.category || ""} ${it.name || ""}`.toLowerCase();
  if (/biqu[ií]ni|mai[ôo]|sunga|sa[ií]da de praia|canga|par[êe]o/.test(text)) return "swim";
  const s = slot(it.category || it.name);
  if (s === 3) return "shoes";
  if (s === 4) return "bags";
  if (/[óo]culos|cinto|joia|bijut|colar|brinco|pulseira|anel|len[çc]o|chap[ée]u|bon[ée]|rel[óo]gio|acess[óo]rio/.test(text)) return "accessories";
  return "clothes";
}
const periodOf = (l: any) => String(l.trip_period || l.name || "Look").replace(/\s*\(#\d+\)/g, "").trim();

export default async function TripWizard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string; error?: string }> }) {
  const { id } = await params;
  const { step: stepRaw, error } = await searchParams;
  const step = Number(stepRaw || 0);

  const data = await withProfile(async (c, userId) => {
    const trip = (await c.query("SELECT * FROM trip_plans WHERE id=$1", [id])).rows[0];
    if (!trip) return null;
    const closetItems = (await c.query(`SELECT ci.id,ci.name,ci.category,
        (SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id
      FROM closet_items ci WHERE ci.status='ACTIVE' ORDER BY ci.category,ci.name`)).rows;
    const aiRemaining = await aiUsageRemaining(c, userId);
    const imgRemaining = await imageGenerationsRemaining(c, userId);
    const defaultStyle = (await c.query("SELECT default_visual_style FROM profiles WHERE user_id=$1", [userId])).rows[0]?.default_visual_style || "REALISTA";
    let selectedItems: any[] = [], looks: any[] = [];
    if (trip.status === "CONCLUIDA") {
      selectedItems = (await c.query(`SELECT ci.id,ci.name,ci.category,
          (SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id
        FROM trip_items ti JOIN closet_items ci ON ci.id=ti.item_id WHERE ti.trip_id=$1 ORDER BY ci.category,ci.name`, [id])).rows;
      looks = (await c.query(`SELECT l.id,l.name,l.occasion,l.trip_day,l.trip_period,l.illustration_object_key IS NOT NULL AS has_illustration,
          (SELECT json_agg(json_build_object('id',ci.id,'name',ci.name,'category',ci.category,'photo_id',(SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1)))
           FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS items
        FROM looks l WHERE l.trip_id=$1 ORDER BY l.trip_day, l.created_at`, [id])).rows;
    }
    return { trip, closetItems, aiRemaining, imgRemaining, defaultStyle, selectedItems, looks };
  });
  if (!data) redirect("/mala");
  const { trip, closetItems, aiRemaining, imgRemaining, defaultStyle, selectedItems, looks } = data;
  const eventos: TripEvent[] = Array.isArray(trip.eventos) ? trip.eventos : [];

  const wrap = (title: string, body: any, formAction?: any, hint?: string) => (
    <main className="shell narrow">
      <div className="top"><span className="eyebrow">MALA INTELIGENTE · ETAPA {step} DE {TOTAL_STEPS}</span><Link href="/mala">Sair</Link></div>
      <Progress step={step} />
      {error && <p role="alert" className="trial-banner">{error}</p>}
      <h1>{title}</h1>
      {hint && <p className="look-meta">{hint}</p>}
      {formAction ? <form action={formAction} className="form">
        <input type="hidden" name="trip_id" value={id} />
        <input type="hidden" name="step" value={step} />
        {body}
        <div className="wizard-nav">
          {step > 1 && <Link href={`/mala/${id}?step=${step - 1}`}>← Voltar</Link>}
          <SubmitButton pendingText="Salvando...">Continuar</SubmitButton>
        </div>
      </form> : body}
    </main>
  );

  if (step === 1) return wrap("Sobre a viagem", <>
    <label>Destino (cidade e país)<input name="destino" defaultValue={trip.destino} placeholder="Ex.: Lisboa, Portugal" required /></label>
    <div className="two-fields">
      <label>Data de ida<input name="data_ida" type="date" defaultValue={trip.data_ida ? String(trip.data_ida).slice(0, 10) : ""} /></label>
      <label>Data de volta<input name="data_volta" type="date" defaultValue={trip.data_volta ? String(trip.data_volta).slice(0, 10) : ""} /></label>
    </div>
    <label>Ainda não tem as datas? Quantos dias vai durar a viagem?<input name="dias" type="number" min={1} max={60} defaultValue={!trip.data_ida && trip.dias ? trip.dias : ""} placeholder="Ex.: 5" /></label>
    <p className="look-meta">Como você vai viajar?</p>
    <Chips name="transporte" options={TRANSPORTE_OPCOES} defaultValues={[trip.transporte]} multiple={false} />
    <p className="look-meta">Qual bagagem você pretende levar?</p>
    <Chips name="bagagem" options={BAGAGEM_OPCOES} defaultValues={[trip.bagagem]} multiple={false} />
  </>, saveTripStep);

  if (step === 2) return wrap("Clima previsto", <>
    {trip.clima?.previsao_disponivel
      ? <p className="look-meta">{trip.clima.local}: mínima {trip.clima.temp_min}°C, máxima {trip.clima.temp_max}°C, chance de chuva {trip.clima.chance_chuva}%.</p>
      : <p className="look-meta">Não consegui a previsão exata para essa data (data distante ou destino não encontrado). A IA vai considerar o clima típico da região.</p>}
    <p className="look-meta">Você sente mais frio ou calor do que a maioria das pessoas?</p>
    <Chips name="sensibilidade_termica" options={SENSIBILIDADE_OPCOES} defaultValues={[trip.sensibilidade_termica]} multiple={false} />
  </>, saveTripStep);

  if (step === 3) return wrap("Qual é o motivo da viagem?", <>
    {OBJETIVO_OPCOES.map(opt => (
      <label className="strategy-card" key={opt.value}>
        <input type="radio" name="objetivo" value={opt.value} defaultChecked={trip.objetivo === opt.value} required />
        <strong>{opt.label}</strong>
        <p className="look-meta">{opt.desc}</p>
      </label>
    ))}
  </>, saveTripStep);

  if (step === 4) {
    const dia = eventos.filter(e => e.periodo === "DIA").length, noite = eventos.length - dia;
    return <main className="shell narrow">
      <div className="top"><span className="eyebrow">MALA INTELIGENTE · ETAPA 4 DE {TOTAL_STEPS}</span><Link href="/mala">Sair</Link></div>
      <Progress step={4} />
      {error && <p role="alert" className="trial-banner">{error}</p>}
      <h1>Quais são os compromissos?</h1>
      <p className="look-meta">Cadastre um por um (reunião, seminário, almoço de negócios, jantar formal...). Cada compromisso ganha um look próprio, pensado para o período e o dress code. Os dias livres ficam por conta do passeio.</p>

      <div className="card">
        <h2>{eventos.length === 0 ? "Nenhum compromisso ainda" : `${eventos.length} compromisso${eventos.length === 1 ? "" : "s"}`}</h2>
        {eventos.length > 0 && <p className="look-meta">{dia} de dia · {noite} à noite</p>}
        {eventos.length > 0 && <ul className="event-list">
          {eventos.map((e) => (
            <li key={e.id}>
              <span><strong>{e.periodo === "NOITE" ? "✦" : "✦"} {e.tipo}</strong>{e.dress_code ? ` · ${e.dress_code}` : ""}{e.detalhe ? <small>{e.detalhe}</small> : null}</span>
              <form action={removeTripEvent}><input type="hidden" name="trip_id" value={id} /><input type="hidden" name="event_id" value={e.id} /><button className="link" aria-label={`Remover ${e.tipo}`}>Remover</button></form>
            </li>
          ))}
        </ul>}
      </div>

      <form action={addTripEvent} className="card form">
        <h2>＋ Adicionar compromisso</h2>
        <input type="hidden" name="trip_id" value={id} />
        <label>Tipo
          <select name="tipo" required defaultValue="">
            <option value="" disabled>Escolha…</option>
            {EVENTO_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <p className="look-meta">Quando?</p>
        <div className="chip-group">
          {PERIODO_OPCOES.map((p, i) => (
            <label className="chip" key={p.value}><input type="radio" name="periodo" value={p.value} defaultChecked={i === 0} /><span>{p.label}</span></label>
          ))}
        </div>
        <label>Dress code
          <select name="dress_code" defaultValue="">
            <option value="">Sem dress code definido</option>
            {DRESS_CODE_OPCOES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>Detalhes (opcional)<input name="detalhe" maxLength={140} placeholder="Ex.: almoço de negócios à beira-mar" /></label>
        <SubmitButton pendingText="Adicionando...">Adicionar compromisso</SubmitButton>
      </form>

      <form action={saveTripStep} className="wizard-nav">
        <input type="hidden" name="trip_id" value={id} /><input type="hidden" name="step" value={4} />
        <Link href={`/mala/${id}?step=3`}>← Voltar</Link>
        <SubmitButton pendingText="Salvando...">{eventos.length === 0 ? "Sem compromissos, continuar" : "Continuar"}</SubmitButton>
      </form>
    </main>;
  }

  if (step === 5) return wrap("Mais alguma coisa na agenda?", <>
    <Chips name="atividades" options={LAZER_OPCOES} defaultValues={trip.atividades || []} />
  </>, saveTripStep, "Além dos compromissos, o que mais pretende fazer? (opcional)");

  if (step === 6) return wrap("Como você quer se sentir e se apresentar?", <>
    <Chips name="estilo" options={ESTILO_OPCOES} defaultValues={trip.estilo || []} />
  </>, saveTripStep, "Escolha até 3.");

  if (step === 7) return wrap("Preferências", <>
    <p className="look-meta">Alguma peça que você faz questão de levar?</p>
    <div className="item-picker">
      {closetItems.map((it: any) => (
        <label key={it.id}>
          <input type="checkbox" name="levar_ids" value={it.id} defaultChecked={(trip.levar_ids || []).includes(it.id)} />
          {it.photo_id ? <img src={`/api/closet/photos/${it.photo_id}?w=360`} alt={it.name} loading="lazy" /> : <span className="ph">✦</span>}
          {it.name}
        </label>
      ))}
    </div>
    <p className="look-meta">Alguma peça que você NÃO quer levar nesta viagem?</p>
    <div className="item-picker">
      {closetItems.map((it: any) => (
        <label key={it.id}>
          <input type="checkbox" name="evitar_ids" value={it.id} defaultChecked={(trip.evitar_ids || []).includes(it.id)} />
          {it.photo_id ? <img src={`/api/closet/photos/${it.photo_id}?w=360`} alt={it.name} loading="lazy" /> : <span className="ph">✦</span>}
          {it.name}
        </label>
      ))}
    </div>
    <p className="look-meta">Qual sua prioridade nesta viagem?</p>
    <Chips name="prioridade" options={PRIORIDADE_OPCOES} defaultValues={[trip.prioridade]} multiple={false} />
    <p className="look-meta">Como você se sente em relação a repetir peças?</p>
    <Chips name="repeticao" options={REPETICAO_OPCOES} defaultValues={[trip.repeticao]} multiple={false} />
    <p className="look-meta">Você terá acesso a lavanderia?</p>
    <Chips name="lavanderia" options={LAVANDERIA_OPCOES} defaultValues={[trip.lavanderia]} multiple={false} />
  </>, saveTripStep);

  if (step === 8) return wrap("Qual estratégia você prefere?", <>
    {ESTRATEGIA_OPCOES.map(opt => (
      <label className="strategy-card" key={opt.value}>
        <input type="radio" name="estrategia" value={opt.value} defaultChecked={trip.estrategia === opt.value || (!trip.estrategia && opt.value === "EQUILIBRADA")} />
        <strong>{opt.label}</strong>
        <p className="look-meta">{opt.desc}</p>
      </label>
    ))}
  </>, saveTripStep);

  if (step === 9) return wrap("Últimos detalhes", <>
    <p className="look-meta">Sua viagem terá alguma destas situações?</p>
    <Chips name="necessidades" options={NECESSIDADE_OPCOES} defaultValues={trip.necessidades || []} />
    <p className="look-meta">O que você quer que a Mala Inteligente organize?</p>
    <Chips name="incluir" options={INCLUIR_OPCOES} defaultValues={trip.incluir || []} />
  </>, saveTripStep);

  if (step === 10 || (trip.status === "PLANEJAMENTO" && step === 0)) {
    const dia = eventos.filter(e => e.periodo === "DIA").length, noite = eventos.length - dia;
    const faltaBasico = !trip.destino || !trip.dias;
    return <main className="shell narrow">
      <div className="top"><span className="eyebrow">MALA INTELIGENTE · REVISÃO</span><Link href="/mala">Sair</Link></div>
      <h1>Revisar e gerar sua mala</h1>
      {error && <p role="alert" className="trial-banner">{error}</p>}
      {faltaBasico && <p role="alert" className="trial-banner">Faltam o destino e/ou a duração da viagem. <Link href={`/mala/${id}?step=1`}>Preencher agora</Link></p>}
      <div className="card">
        <p><strong>Destino:</strong> {trip.destino || "—"}</p>
        <p><strong>Duração:</strong> {trip.dias ? `${trip.dias} dia${trip.dias === 1 ? "" : "s"}` : "—"}{trip.data_ida ? ` · ${new Date(trip.data_ida).toLocaleDateString("pt-BR")} a ${trip.data_volta ? new Date(trip.data_volta).toLocaleDateString("pt-BR") : "?"}` : ""}</p>
        <p><strong>Motivo:</strong> {OBJETIVO_LABEL[trip.objetivo] || "—"} · <strong>Transporte:</strong> {trip.transporte || "—"} · <strong>Bagagem:</strong> {trip.bagagem || "—"}</p>
        <p><strong>Estilo:</strong> {(trip.estilo || []).join(", ") || "—"}</p>
        <p><strong>Estratégia:</strong> {ESTRATEGIA_OPCOES.find(o => o.value === trip.estrategia)?.label || "Equilibrada"}</p>
        <p><strong>Compromissos:</strong> {eventos.length === 0 ? "nenhum cadastrado" : `${eventos.length} (${dia} de dia, ${noite} à noite)`}</p>
        {eventos.length > 0 && <ul className="event-list compact">{eventos.map(e => <li key={e.id}><span>{e.periodo === "NOITE" ? "✦" : "✦"} {e.tipo}{e.dress_code ? ` · ${e.dress_code}` : ""}{e.detalhe ? ` — ${e.detalhe}` : ""}</span></li>)}</ul>}
        <div className="wizard-nav"><Link href={`/mala/${id}?step=9`}>← Voltar</Link><Link href={`/mala/${id}?step=1`}>Editar respostas</Link></div>
      </div>
      <form action={generateTripPlan}>
        <input type="hidden" name="trip_id" value={id} />
        <SubmitButton disabled={aiRemaining === 0 || faltaBasico} pendingText="Montando sua mala... (pode levar até 40s)">Gerar minha mala</SubmitButton>
        {aiRemaining === 0 && <p className="look-meta">Atenção: Seu limite de operações de IA acabou. Veja os planos em Perfil → Assinatura.</p>}
      </form>
    </main>;
  }

  if (trip.status === "CONCLUIDA") {
    const byCategory = new Map<string, any[]>();
    for (const it of selectedItems) { const arr = byCategory.get(it.category) || []; arr.push(it); byCategory.set(it.category, arr); }
    const sortedLooks = [...looks].sort((a, b) => (a.trip_day - b.trip_day));
    const combinations = new Map<string, Set<string>>();
    for (const l of looks) {
      const names = (l.items || []).map((it: any) => it.name);
      for (const it of (l.items || [])) {
        const s = combinations.get(it.name) || new Set<string>();
        for (const n of names) if (n !== it.name) s.add(n);
        combinations.set(it.name, s);
      }
    }
    const checklist = trip.checklist || {};
    const inTrip = new Set(selectedItems.map((i: any) => i.id));
    const notInTrip = closetItems.filter((i: any) => !inTrip.has(i.id));
    const groupByCategory = (list: any[]) => {
      const m = new Map<string, any[]>();
      for (const it of list) { const arr = m.get(it.category) || []; arr.push(it); m.set(it.category, arr); }
      return [...m.entries()];
    };
    const diasLivres = trip.dias ? Math.max(0, trip.dias - new Set(looks.map((l: any) => l.trip_day)).size) : 0;

    const clima = trip.clima?.previsao_disponivel ? trip.clima : null;
    const datasTxt = trip.data_ida ? `${new Date(trip.data_ida).toLocaleDateString("pt-BR")}${trip.data_volta ? ` a ${new Date(trip.data_volta).toLocaleDateString("pt-BR")}` : ""}` : "";
    const lookLabel = (l: any) => periodOf(l).replace(/^Dia\s*\d+\s*[·\-–:]?\s*/i, "") || l.occasion || "Look";
    const sortedPieces = (l: any) => [...(l.items || [])].sort((a: any, b: any) => slot(a.category) - slot(b.category));
    const checklistArr = [...CHECKLIST_TEMPLATE.filter((label) => label in checklist), ...Object.keys(checklist).filter((label) => !CHECKLIST_TEMPLATE.includes(label))].map((label) => ({ label, done: !!checklist[label] }));
    const checkDone = checklistArr.filter((c) => c.done).length;
    const groupsPdf = (() => {
      const g: Record<string, { name: string; photo: string | null; cat?: string }[]> = { clothes: [], swim: [], shoes: [], bags: [], accessories: [] };
      for (const it of selectedItems) g[pieceGroup(it)].push({ name: it.name, photo: it.photo_id ? `/api/closet/photos/${it.photo_id}` : null, cat: it.category });
      return g;
    })();
    const slug = String(trip.destino || "viagem").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    return <main className="shell trip-result">
      <div className="top no-print"><span className="eyebrow">MINHA MALA</span><Link href="/mala">Voltar</Link></div>

      <header className="trip-hero">
        <span className="trip-hero-eyebrow">Minha mala de viagem</span>
        <h1>{trip.destino}</h1>
        <div className="trip-chips">
          {trip.dias ? <span>{trip.dias} dia{trip.dias === 1 ? "" : "s"}</span> : null}
          {datasTxt ? <span>{datasTxt}</span> : null}
          <span>{OBJETIVO_LABEL[trip.objetivo] || "Viagem"}</span>
          <span>{looks.length} look{looks.length === 1 ? "" : "s"}</span>
          <span>{selectedItems.length} peça{selectedItems.length === 1 ? "" : "s"}</span>
        </div>
        {clima && <p className="trip-clima"><strong>Clima previsto</strong> {clima.local}: {clima.temp_min}°C a {clima.temp_max}°C, chance de chuva {clima.chance_chuva}%.</p>}
        {trip.reasoning && <p className="trip-reasoning">{trip.reasoning}</p>}
        {(trip.alerts || []).length > 0 && <div className="trip-alerts">
          <strong>Atenção</strong>
          {trip.alerts.map((a: string, i: number) => <p key={i}>{a}</p>)}
        </div>}
        <div className="trip-hero-actions no-print">
          <a className="trip-btn" href="#exportar">Gerar PDF para compartilhar</a>
          <a className="trip-btn ghost" href="#ajustes">Ajustar looks e peças</a>
          <Link className="trip-btn ghost" href={`/mala/${id}?step=1`}>Editar respostas</Link>
        </div>
      </header>

      <section>
        <div className="section-head"><h2>Dia a dia</h2><span className="look-meta">Um look para cada compromisso, com as suas peças</span></div>
        <div className="trip-days">
          {sortedLooks.map((l: any) => {
            const pieces = sortedPieces(l);
            return <article className="trip-day" key={l.id}>
              <div className="trip-day-img">
                {l.has_illustration
                  ? <img src={`/api/looks/${l.id}/illustration?w=640`} alt={`Look do dia ${l.trip_day}`} loading="lazy" />
                  : <div className="trip-day-stack">{pieces.slice(0, 4).map((it: any) => it.photo_id ? <img key={it.id} src={`/api/closet/photos/${it.photo_id}?w=360`} alt={it.name} loading="lazy" /> : <span key={it.id} className="board-ph">✦</span>)}</div>}
                <span className="trip-day-pill">Dia {l.trip_day}</span>
              </div>
              <div className="trip-day-body">
                <span className="trip-day-tag">{lookTag(l)}</span>
                <h3>{lookLabel(l)}</h3>
                <ul className="trip-day-pieces">
                  {pieces.map((it: any) => <li key={it.id}>
                    {it.photo_id ? <img src={`/api/closet/photos/${it.photo_id}?w=200`} alt="" loading="lazy" /> : <span className="board-ph">✦</span>}
                    <span><strong>{it.name}</strong><small>{it.category}</small></span>
                  </li>)}
                </ul>
              </div>
            </article>;
          })}
        </div>
        {diasLivres > 0 && <p className="look-meta">{diasLivres} dia{diasLivres === 1 ? "" : "s"} da viagem sem look definido: use as peças da mala conforme o clima e o passeio.</p>}
      </section>

      <section className="card" id="checklist">
        <div className="section-head"><h2>Checklist da mala</h2><span className="look-meta">{checkDone} de {checklistArr.length} itens</span></div>
        <div className="trip-check-bar"><i style={{ width: `${checklistArr.length ? (checkDone / checklistArr.length) * 100 : 0}%` }} /></div>
        <div className="trip-check">
          {checklistArr.map(({ label, done }) => (
            <form action={toggleChecklistItem} key={label} className={`trip-check-item${done ? " done" : ""}`}>
              <input type="hidden" name="trip_id" value={id} /><input type="hidden" name="label" value={label} />
              <button type="submit" aria-pressed={done}><span className="trip-check-box" aria-hidden="true" />{label}</button>
            </form>
          ))}
        </div>
      </section>

      <TripPoster
        destination={trip.destino}
        days={trip.dias || null}
        objective={trip.objetivo === "TRABALHO" ? "TRABALHO" : trip.objetivo === "MISTO" ? "TRABALHO | LAZER" : trip.objetivo === "PASSEIO" ? "LAZER" : ""}
        fileName={`mala-${slug}.png`}
        pdfName={`mala-${slug}.pdf`}
        imagesRemaining={imgRemaining}
        defaultStyle={defaultStyle}
        looks={sortedLooks.map((l: any) => ({
          id: l.id, day: l.trip_day, tag: lookTag(l), label: lookLabel(l),
          imageUrl: l.has_illustration ? `/api/looks/${l.id}/illustration` : null,
          pieces: sortedPieces(l).map((it: any) => ({ name: it.name, photo: it.photo_id ? `/api/closet/photos/${it.photo_id}` : null })),
        }))}
        groups={groupsPdf as any}
        checklist={checklistArr}
        pdf={{
          destination: trip.destino, days: trip.dias || null, dates: datasTxt, objective: OBJETIVO_LABEL[trip.objetivo] || "Viagem",
          clima: clima ? `${clima.local}: mínima ${clima.temp_min}°C, máxima ${clima.temp_max}°C, chance de chuva ${clima.chance_chuva}%.` : null,
          reasoning: trip.reasoning || "", alerts: trip.alerts || [],
          looks: sortedLooks.map((l: any) => ({
            day: l.trip_day, tag: lookTag(l), label: lookLabel(l), imageUrl: l.has_illustration ? `/api/looks/${l.id}/illustration` : null,
            pieces: sortedPieces(l).map((it: any) => ({ name: it.name, cat: it.category, photo: it.photo_id ? `/api/closet/photos/${it.photo_id}` : null })),
          })),
          groups: [{ title: "Roupas", items: groupsPdf.clothes }, { title: "Biquínis e saída", items: groupsPdf.swim }, { title: "Sapatos", items: groupsPdf.shoes }, { title: "Bolsas", items: groupsPdf.bags }, { title: "Acessórios", items: groupsPdf.accessories }],
          checklist: checklistArr,
        }}
      />

      <section id="ajustes" className="no-print">
        <div className="section-head"><h2>Ajustar looks</h2><span className="look-meta">Trocar uma peça, pedir outra versão do look ou descartá-lo</span></div>
        {sortedLooks.length === 0 && <p className="empty-note">Todos os looks foram descartados. Use "Gerar de novo" abaixo para montar a mala outra vez.</p>}
        {sortedLooks.map((l: any) => {
          const lookIds = new Set((l.items || []).map((it: any) => it.id));
          const alternatives = groupByCategory(closetItems.filter((i: any) => !lookIds.has(i.id)));
          return <details className="more adjust" key={l.id}>
            <summary>Dia {l.trip_day} · {periodOf(l).replace(/^Dia\s*\d+\s*[·\-–:]?\s*/i, "") || l.occasion}</summary>
            <p className="look-meta">{(l.items || []).map((it: any) => it.name).join(" + ")}</p>

            <form action={swapTripItem} className="stack">
              <input type="hidden" name="trip_id" value={id} /><input type="hidden" name="look_id" value={l.id} />
              <label>Trocar esta peça
                <select name="old_item_id" required defaultValue="">
                  <option value="" disabled>Escolha a peça que sai…</option>
                  {(l.items || []).map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </label>
              <label>Por esta
                <select name="new_item_id" required defaultValue="">
                  <option value="" disabled>Escolha a peça que entra…</option>
                  {alternatives.map(([cat, its]) => <optgroup key={cat} label={cat}>{its.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}</optgroup>)}
                </select>
              </label>
              <SubmitButton pendingText="Trocando...">Trocar peça</SubmitButton>
            </form>

            <div className="action-row">
              <form action={regenerateTripLook}>
                <input type="hidden" name="trip_id" value={id} /><input type="hidden" name="look_id" value={l.id} />
                <SubmitButton disabled={aiRemaining === 0} pendingText="Pensando... (até 20s)">Sugerir outra versão deste look</SubmitButton>
              </form>
              <form action={generateLookIllustration}>
                <input type="hidden" name="look_id" value={l.id} /><input type="hidden" name="return_path" value={`/mala/${id}#ajustes`} />
                <SubmitButton disabled={imgRemaining === 0} pendingText="Gerando imagem... (até 2 min)">{l.has_illustration ? "Gerar imagem de novo" : "Gerar imagem do look"}</SubmitButton>
              </form>
              <form action={deleteTripLook}>
                <input type="hidden" name="trip_id" value={id} /><input type="hidden" name="look_id" value={l.id} />
                <ConfirmButton className="danger-btn" message={`Descartar o look "${periodOf(l)}" da mala? As peças continuam no closet.`} pendingText="Descartando...">Descartar look</ConfirmButton>
              </form>
            </div>
          </details>;
        })}
      </section>


      <section className="card no-print">
        <h2>Peças da mala</h2>
        <p className="look-meta">O que realmente vai na bagagem ({selectedItems.length}).</p>
        {[...byCategory.entries()].map(([cat, its]) => (
          <div key={cat}>
            <h3>{cat}</h3>
            <div className="product-grid">
              {its.map((it: any) => (
                <div className="card secondary" key={it.id}>
                  {it.photo_id ? <img src={`/api/closet/photos/${it.photo_id}?w=360`} alt={it.name} loading="lazy" /> : <span className="look-thumb-placeholder">✦</span>}
                  <h3>{it.name}</h3>
                  <form action={removeTripItem}>
                    <input type="hidden" name="trip_id" value={id} /><input type="hidden" name="item_id" value={it.id} />
                    <ConfirmButton className="link" message={`Tirar "${it.name}" da mala? Ela sai também dos looks desta viagem (looks que ficarem sem peças são descartados).`} pendingText="Removendo...">Remover</ConfirmButton>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ))}
        {notInTrip.length > 0 && <form action={addTripItem} className="stack add-piece">
          <input type="hidden" name="trip_id" value={id} />
          <label>Acrescentar uma peça à mala
            <select name="item_id" required defaultValue="">
              <option value="" disabled>Escolha uma peça do closet…</option>
              {groupByCategory(notInTrip).map(([cat, its]) => <optgroup key={cat} label={cat}>{its.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}</optgroup>)}
            </select>
          </label>
          <SubmitButton pendingText="Acrescentando...">Acrescentar à mala</SubmitButton>
        </form>}
      </section>

      {combinations.size > 0 && <details className="more no-print">
        <summary>Mais combinações com as mesmas peças</summary>
        <p className="look-meta">Combinações possíveis sem levar nada a mais.</p>
        <ul>
          {[...combinations.entries()].filter(([, s]) => s.size > 0).map(([name, s]) => (
            <li key={name}><strong>{name}</strong> combina com: {[...s].join(", ")}</li>
          ))}
        </ul>
      </details>}

      <form action={generateTripPlan} className="no-print">
        <input type="hidden" name="trip_id" value={id} />
        <ConfirmButton className="danger-btn" message="Gerar a mala de novo substitui todos os looks atuais (inclusive os ajustes que você fez). Continuar?" pendingText="Montando... (até 40s)">↻ Gerar a mala de novo</ConfirmButton>
      </form>
    </main>;
  }

  redirect(`/mala/${id}?step=1`);
}
