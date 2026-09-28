import Link from "next/link";
import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import {
  saveTripStep, generateTripPlan, toggleChecklistItem, removeTripItem,
  TRANSPORTE_OPCOES, BAGAGEM_OPCOES, SENSIBILIDADE_OPCOES, ATIVIDADE_OPCOES, DRESS_CODE_OPCOES,
  ESTILO_OPCOES, PRIORIDADE_OPCOES, REPETICAO_OPCOES, LAVANDERIA_OPCOES, ESTRATEGIA_OPCOES,
  NECESSIDADE_OPCOES, INCLUIR_OPCOES,
} from "@/server/trip-actions";
import { generateLookIllustration, deleteLook } from "@/server/look-actions";
import { aiUsageRemaining, imageGenerationsRemaining } from "@/server/limits";
import SubmitButton from "@/components/submit-button";

const TOTAL_STEPS = 9;

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
  return <div className="step-progress">
    {Array.from({ length: TOTAL_STEPS }, (_, i) => <span key={i} className={i < step ? "done" : ""} />)}
  </div>;
}

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
    let selectedItems: any[] = [], looks: any[] = [];
    if (trip.status === "CONCLUIDA") {
      selectedItems = (await c.query(`SELECT ci.id,ci.name,ci.category,
          (SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id
        FROM trip_items ti JOIN closet_items ci ON ci.id=ti.item_id WHERE ti.trip_id=$1 ORDER BY ci.category,ci.name`, [id])).rows;
      looks = (await c.query(`SELECT l.id,l.name,l.occasion,l.trip_day,l.trip_period,l.illustration_object_key IS NOT NULL AS has_illustration,
          (SELECT json_agg(json_build_object('id',ci.id,'name',ci.name,'photo_id',(SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1)))
           FROM look_items li JOIN closet_items ci ON ci.id=li.item_id WHERE li.look_id=l.id) AS items
        FROM looks l WHERE l.trip_id=$1 ORDER BY l.trip_day, l.created_at`, [id])).rows;
    }
    return { trip, closetItems, aiRemaining, imgRemaining, selectedItems, looks };
  });
  if (!data) redirect("/mala");
  const { trip, closetItems, aiRemaining, imgRemaining, selectedItems, looks } = data;

  const backLink = <Link href={`/mala/${id}?step=${Math.max(1, step - 1)}`}>← Voltar</Link>;
  const wrap = (title: string, body: any, formAction?: any) => (
    <main className="shell narrow">
      <div className="top"><span className="eyebrow">MALA INTELIGENTE</span><Link href="/mala">Sair</Link></div>
      <Progress step={step} />
      {error && <p role="alert" className="trial-banner">{error}</p>}
      <h1>{title}</h1>
      {formAction ? <form action={formAction} className="form">
        <input type="hidden" name="trip_id" value={id} />
        <input type="hidden" name="step" value={step} />
        {body}
        <SubmitButton pendingText="Salvando...">Continuar</SubmitButton>
      </form> : body}
    </main>
  );

  if (step === 1) return wrap("Sobre a viagem", <>
    <label>Destino (cidade e país)<input name="destino" defaultValue={trip.destino} required /></label>
    <label>Data de ida<input name="data_ida" type="date" defaultValue={trip.data_ida ? String(trip.data_ida).slice(0, 10) : ""} /></label>
    <label>Data de volta<input name="data_volta" type="date" defaultValue={trip.data_volta ? String(trip.data_volta).slice(0, 10) : ""} /></label>
    <p className="look-meta">Como você vai viajar?</p>
    <Chips name="transporte" options={TRANSPORTE_OPCOES} defaultValues={[trip.transporte]} multiple={false} />
    <p className="look-meta">Qual bagagem você pretende levar?</p>
    <Chips name="bagagem" options={BAGAGEM_OPCOES} defaultValues={[trip.bagagem]} multiple={false} />
  </>, saveTripStep);

  if (step === 2) return wrap("Clima previsto", <>
    {trip.clima?.previsao_disponivel
      ? <p className="look-meta">🌤️ {trip.clima.local}: mínima {trip.clima.temp_min}°C, máxima {trip.clima.temp_max}°C, chance de chuva {trip.clima.chance_chuva}%.</p>
      : <p className="look-meta">Não consegui a previsão exata pra essa data ainda (data muito distante ou destino não encontrado) -- a IA vai considerar o clima típico da região.</p>}
    <p className="look-meta">Você sente mais frio ou calor do que a maioria das pessoas?</p>
    <Chips name="sensibilidade_termica" options={SENSIBILIDADE_OPCOES} defaultValues={[trip.sensibilidade_termica]} multiple={false} />
  </>, saveTripStep);

  if (step === 3) return wrap("O que você pretende fazer na viagem?", <>
    <Chips name="atividades" options={ATIVIDADE_OPCOES} defaultValues={trip.atividades || []} />
  </>, saveTripStep);

  if (step === 4) return wrap("Algum compromisso tem dress code específico?", <>
    <Chips name="dress_codes" options={DRESS_CODE_OPCOES} defaultValues={trip.dress_codes || []} />
  </>, saveTripStep);

  if (step === 5) return wrap("Como você quer se sentir e se apresentar? (até 3)", <>
    <Chips name="estilo" options={ESTILO_OPCOES} defaultValues={trip.estilo || []} />
  </>, saveTripStep);

  if (step === 6) return wrap("Preferências", <>
    <p className="look-meta">Alguma peça que você faz questão de levar?</p>
    <div className="item-picker">
      {closetItems.map((it: any) => (
        <label key={it.id}>
          <input type="checkbox" name="levar_ids" value={it.id} defaultChecked={(trip.levar_ids || []).includes(it.id)} />
          {it.photo_id ? <img src={`/api/closet/photos/${it.photo_id}`} alt={it.name} /> : <span className="ph">👕</span>}
          {it.name}
        </label>
      ))}
    </div>
    <p className="look-meta">Alguma peça que você NÃO quer levar nesta viagem?</p>
    <div className="item-picker">
      {closetItems.map((it: any) => (
        <label key={it.id}>
          <input type="checkbox" name="evitar_ids" value={it.id} defaultChecked={(trip.evitar_ids || []).includes(it.id)} />
          {it.photo_id ? <img src={`/api/closet/photos/${it.photo_id}`} alt={it.name} /> : <span className="ph">👕</span>}
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

  if (step === 7) return wrap("Qual estratégia você prefere?", <>
    {ESTRATEGIA_OPCOES.map(opt => (
      <label className="strategy-card" key={opt.value}>
        <input type="radio" name="estrategia" value={opt.value} defaultChecked={trip.estrategia === opt.value || (!trip.estrategia && opt.value === "EQUILIBRADA")} />
        <strong>{opt.label}</strong>
        <p className="look-meta">{opt.desc}</p>
      </label>
    ))}
  </>, saveTripStep);

  if (step === 8) return wrap("Sua viagem terá alguma destas situações?", <>
    <Chips name="necessidades" options={NECESSIDADE_OPCOES} defaultValues={trip.necessidades || []} />
  </>, saveTripStep);

  if (step === 9) return wrap("O que você quer que a Mala Inteligente organize?", <>
    <Chips name="incluir" options={INCLUIR_OPCOES} defaultValues={trip.incluir || []} />
  </>, saveTripStep);

  if (step === 10 || (trip.status === "PLANEJAMENTO" && step === 0)) {
    const dias = trip.data_ida && trip.data_volta ? Math.max(1, Math.round((new Date(trip.data_volta).getTime() - new Date(trip.data_ida).getTime()) / 86400000) + 1) : null;
    return <main className="shell narrow">
      <div className="top"><span className="eyebrow">MALA INTELIGENTE</span><Link href="/mala">Sair</Link></div>
      <h1>Revisar e gerar sua mala</h1>
      {error && <p role="alert" className="trial-banner">{error}</p>}
      <div className="card">
        <p><strong>Destino:</strong> {trip.destino || "—"}</p>
        {dias && <p><strong>Duração:</strong> {dias} dia(s)</p>}
        <p><strong>Transporte:</strong> {trip.transporte || "—"} · <strong>Bagagem:</strong> {trip.bagagem || "—"}</p>
        <p><strong>Estilo:</strong> {(trip.estilo || []).join(", ") || "—"}</p>
        <p><strong>Estratégia:</strong> {ESTRATEGIA_OPCOES.find(o => o.value === trip.estrategia)?.label || "Equilibrada"}</p>
        {backLink}
      </div>
      <form action={generateTripPlan}>
        <input type="hidden" name="trip_id" value={id} />
        <SubmitButton disabled={aiRemaining === 0} pendingText="Montando sua mala... (pode levar até 30s)">Gerar minha mala</SubmitButton>
      </form>
    </main>;
  }

  if (trip.status === "CONCLUIDA") {
    const byCategory = new Map<string, any[]>();
    for (const it of selectedItems) { const arr = byCategory.get(it.category) || []; arr.push(it); byCategory.set(it.category, arr); }
    const byDay = new Map<number, any[]>();
    for (const l of looks) { const arr = byDay.get(l.trip_day) || []; arr.push(l); byDay.set(l.trip_day, arr); }
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

    return <main className="shell">
      <div className="top"><span className="eyebrow">MINHA MALA</span><Link href="/mala">Voltar</Link></div>
      <h1>{trip.destino}</h1>
      <div className="trial-banner">
        <p>{selectedItems.length} peças · {looks.length} looks possíveis · {[...byDay.keys()].length} dia(s) com look definido</p>
      </div>
      {trip.reasoning && <p className="look-meta">{trip.reasoning}</p>}
      {(trip.alerts || []).length > 0 && <div className="card">
        <h2>⚠️ Alertas</h2>
        {trip.alerts.map((a: string, i: number) => <p key={i} className="look-meta">{a}</p>)}
      </div>}

      <section className="card">
        <h2>Peças selecionadas para a mala</h2>
        {[...byCategory.entries()].map(([cat, its]) => (
          <div key={cat}>
            <h3>{cat}</h3>
            <div className="product-grid">
              {its.map((it: any) => (
                <div className="card secondary" key={it.id}>
                  {it.photo_id ? <img src={`/api/closet/photos/${it.photo_id}`} alt={it.name} /> : <span className="look-thumb-placeholder">👕</span>}
                  <h3>{it.name}</h3>
                  <form action={removeTripItem}><input type="hidden" name="trip_id" value={id} /><input type="hidden" name="item_id" value={it.id} /><button className="link">Remover</button></form>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Looks da viagem</h2>
        {[...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, dayLooks]) => (
          <div key={day}>
            <h3>Dia {day}</h3>
            <div className="grid">
              {dayLooks.map((l: any) => (
                <div className="look-card" key={l.id}>
                  {l.has_illustration ? <img src={`/api/looks/${l.id}/illustration`} alt={l.name} /> : <span className="look-thumb-placeholder">✨<small>Sem imagem ainda</small></span>}
                  <h3>{l.trip_period || l.name}</h3>
                  <p className="look-pieces">{(l.items || []).map((it: any) => it.name).join(" + ")}</p>
                  <div className="look-actions">
                    {!l.has_illustration && <form action={generateLookIllustration}>
                      <input type="hidden" name="look_id" value={l.id} /><input type="hidden" name="return_path" value={`/mala/${id}`} />
                      <SubmitButton disabled={imgRemaining === 0} className="link" pendingText="Gerando...">🖼️ Gerar inspiração em imagem</SubmitButton>
                    </form>}
                    <form action={deleteLook}><input type="hidden" name="id" value={l.id} /><button className="link">Excluir look</button></form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {combinations.size > 0 && <section className="card">
        <h2>Mais looks com as mesmas peças</h2>
        <p className="look-meta">Combinações possíveis sem adicionar nenhuma peça nova à mala.</p>
        <ul>
          {[...combinations.entries()].filter(([, s]) => s.size > 0).map(([name, s]) => (
            <li key={name}><strong>{name}</strong> combina com: {[...s].join(", ")}</li>
          ))}
        </ul>
      </section>}

      <section className="card">
        <h2>Checklist da mala</h2>
        {Object.keys(checklist).map((label) => (
          <form action={toggleChecklistItem} key={label} className="checkbox">
            <input type="hidden" name="trip_id" value={id} /><input type="hidden" name="label" value={label} />
            <button type="submit" className="link">{checklist[label] ? "☑" : "☐"} {label}</button>
          </form>
        ))}
      </section>
    </main>;
  }

  redirect(`/mala/${id}?step=1`);
}
