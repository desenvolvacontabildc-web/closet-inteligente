import { redirect } from "next/navigation";
import { withProfile } from "@/server/profile-session";
import { generateColorimetria, saveColorStep } from "@/server/style-actions";
import SubmitButton from "@/components/submit-button";
import {
  CABELO_OPCOES, TINGIDO_OPCOES, OLHOS_OPCOES, BRONZEAMENTO_OPCOES,
  PROFUNDIDADE_PELE_SWATCHES, BRANCO_SWATCHES, METAL_SWATCHES,
  SUBTOM_OPCOES, INTENSIDADE_OPCOES, CONTRASTE_OPCOES,
  CORES_PALETA, NEUTROS_PALETA,
} from "@/server/color-options";

const TOTAL_STEPS = 8;

function Chips({ name, options, defaultValue }: { name: string; options: any[]; defaultValue?: string }) {
  return <div className="chip-group">
    {options.map((o: any) => {
      const value = typeof o === "string" ? o : o.value;
      const label = typeof o === "string" ? o : o.label;
      return <label key={value} className="chip">
        <input type="radio" name={name} value={value} defaultChecked={defaultValue === value} />
        <span>{label}</span>
      </label>;
    })}
  </div>;
}

function StrategyCards({ name, options, defaultValue }: { name: string; options: any[]; defaultValue?: string }) {
  return <>{options.map((o: any) => (
    <label key={o.value} className="strategy-card">
      <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} />
      <strong>{o.label}</strong> — {o.desc}
    </label>
  ))}</>;
}

function ColorPicker({ name, options, defaultValue, defaultValues, multiple }: { name: string; options: any[]; defaultValue?: string; defaultValues?: string[]; multiple?: boolean }) {
  const selected = new Set(defaultValues || []);
  return <div className="swatches">
    {options.map((o: any) => {
      const checked = multiple ? selected.has(o.value) : defaultValue === o.value;
      return <label key={o.value} className="swatch">
        <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value} defaultChecked={checked} />
        {o.hex ? <span style={{ background: o.hex }} /> : <span className="ph">?</span>}
        {o.label}
      </label>;
    })}
  </div>;
}

function Progress({ step }: { step: number }) {
  return <div className="step-progress">
    {Array.from({ length: TOTAL_STEPS }).map((_, i) => <span key={i} className={i < step ? "done" : ""} />)}
  </div>;
}

function wrap(step: number, title: string, body: any, error?: string) {
  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">COLORIMETRIA</span><a href="/cuidese">Sair</a></div>
    <Progress step={step - 1} />
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <h1>{title}</h1>
    <form action={saveColorStep} className="form">
      <input type="hidden" name="step" value={step} />
      {body}
      <SubmitButton pendingText="Salvando...">Continuar</SubmitButton>
    </form>
  </main>;
}

function normalize(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function colorTokens(name: string): string[] {
  return normalize(name).split(/[\s/–-]+/).filter((w) => w.length > 2);
}

function ColorSection({ title, items }: { title: string; items?: { name: string; hex: string }[] }) {
  if (!items || items.length === 0) return null;
  return <div className="color-section">
    <h3>{title}</h3>
    <div className="swatches">
      {items.map((c, i) => c?.hex && <div key={i} className="swatch-display"><span style={{ background: c.hex }} />{c.name}</div>)}
    </div>
  </div>;
}

function ResultsView({ dossier, profile, closetItems, error }: any) {
  const melhores = dossier.melhores_cores || {};
  const allFavorable: { name: string; hex: string }[] = ([] as any[]).concat(
    melhores.neutros || [], melhores.claras || [], melhores.medias || [], melhores.profundas || [], melhores.destaque || [], melhores.proximas_rosto || [],
  ).filter((c: any) => c?.hex);
  const favorableTokens = new Set(allFavorable.flatMap((c) => colorTokens(c.name)));
  const itemTokenSets = closetItems.map((it: any) => ({ it, tokens: new Set([...colorTokens(it.color || ""), ...colorTokens(it.name || "")]) }));
  const closetMatches = itemTokenSets.filter(({ tokens }: any) => [...tokens].some((t) => favorableTokens.has(t))).map(({ it }: any) => it);
  const allTokensInCloset = new Set(itemTokenSets.flatMap(({ tokens }: any) => [...tokens]));
  const gaps = allFavorable.filter((c) => !colorTokens(c.name).some((t) => allTokensInCloset.has(t)));

  return <main className="shell narrow">
    <a href="/cuidese">← Cuide-se</a>
    <h1>Sua colorimetria</h1>
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <section className="card">
      <p><strong>Subtom:</strong> {dossier.subtom}{dossier.confidence && ` · confiança ${dossier.confidence}`}</p>
      {dossier.profundidade && <p><strong>Profundidade:</strong> {dossier.profundidade}</p>}
      {dossier.intensidade && <p><strong>Intensidade:</strong> {dossier.intensidade}</p>}
      {dossier.contraste && <p><strong>Contraste:</strong> {dossier.contraste}</p>}
      {dossier.reasoning && <p>{dossier.reasoning}</p>}
    </section>

    <h2>Suas melhores cores</h2>
    <ColorSection title="Neutros recomendados" items={melhores.neutros} />
    <ColorSection title="Cores claras" items={melhores.claras} />
    <ColorSection title="Cores médias" items={melhores.medias} />
    <ColorSection title="Cores profundas" items={melhores.profundas} />
    <ColorSection title="Cores de destaque" items={melhores.destaque} />
    <ColorSection title="Interessantes perto do rosto" items={melhores.proximas_rosto} />
    <ColorSection title="Metais" items={dossier.metais} />

    {dossier.combinacoes_recomendadas?.length > 0 && <div className="color-section">
      <h3>Combinações recomendadas</h3>
      {dossier.combinacoes_recomendadas.map((combo: any, i: number) => (
        <div key={i} className="combo-card">
          <div className="dots">{(combo.cores || []).map((c: any, j: number) => c?.hex && <span key={j} style={{ background: c.hex }} />)}</div>
          <p>{(combo.cores || []).map((c: any) => c.name).join(" + ")}{combo.nota ? ` — ${combo.nota}` : ""}</p>
        </div>
      ))}
    </div>}

    {dossier.cores_com_estrategia?.length > 0 && <div className="color-section">
      <h3>Cores para usar com mais estratégia</h3>
      <p className="hint">Não são cores proibidas -- só pedem mais cuidado perto do rosto.</p>
      {dossier.cores_com_estrategia.map((c: any, i: number) => c?.hex && (
        <div key={i} className="strategy-swatch">
          <span className="dot" style={{ background: c.hex }} />
          <p><strong>{c.name}</strong>{c.nota ? ` — ${c.nota}` : ""}</p>
        </div>
      ))}
    </div>}

    {(dossier.orientacao_maquiagem || dossier.orientacao_cabelo) && <section className="card">
      {dossier.orientacao_maquiagem && <p><strong>Maquiagem:</strong> {dossier.orientacao_maquiagem}</p>}
      {dossier.orientacao_cabelo && <p><strong>Cabelo:</strong> {dossier.orientacao_cabelo}</p>}
    </section>}

    {dossier.notes && <p className="look-meta">{dossier.notes}</p>}
    {profile.photo_consent_at && <p><small>Autorização de uso da foto registrada em {new Date(profile.photo_consent_at).toLocaleString("pt-BR")}.</small></p>}

    <h2>Sua colorimetria × seu closet</h2>
    {closetMatches.length > 0 ? <>
      <p className="look-meta">Peças que você já tem e que estão na sua paleta favorável:</p>
      <div className="product-grid">
        {closetMatches.map((it: any) => (
          <div key={it.id} className="card">
            {it.photo_id ? <img src={`/api/closet/photos/${it.photo_id}`} alt={it.name} /> : <span className="look-thumb-placeholder">👗</span>}
            <h3>{it.name}</h3><p className="look-meta">{it.category}</p>
          </div>
        ))}
      </div>
    </> : <p className="look-meta">Nenhuma peça do closet bateu claramente com as cores da sua paleta pelo nome/cor cadastrados. Isso pode só significar que a cor não está bem descrita no cadastro.</p>}

    {gaps.length > 0 && <div className="color-section">
      <h3>Possíveis lacunas</h3>
      <p className="hint">Cores da sua paleta que ainda não aparecem no seu closet:</p>
      <div className="swatches">{gaps.map((c, i) => <div key={i} className="swatch-display"><span style={{ background: c.hex }} />{c.name}</div>)}</div>
    </div>}
  </main>;
}

export default async function Colorimetria({ searchParams }: { searchParams: Promise<{ error?: string; step?: string }> }) {
  const { error, step: stepRaw } = await searchParams;
  const step = Number(stepRaw || 0);
  const data = await withProfile(async (c, userId) => {
    const mod = (await c.query("SELECT status,origin FROM my_module_status($1,'COLORIMETRIA')", [userId])).rows[0];
    const status = mod?.status || "NAO_ADQUIRIDA";
    const profile = (await c.query("SELECT subtom,favorable_colors,avoid_colors,notes,dossier,answers,photo_consent_at,updated_at FROM style_profiles WHERE user_id=$1", [userId])).rows[0] || null;
    let closetItems: any[] = [];
    if (status === "CONCLUIDA") {
      closetItems = (await c.query(
        `SELECT ci.id,ci.name,ci.category,ci.color,
          (SELECT p.id FROM closet_item_photos p WHERE p.item_id=ci.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id
         FROM closet_items ci WHERE ci.status='ACTIVE'`,
      )).rows;
    }
    return { status, profile, closetItems };
  });
  if (!data) redirect("/");
  const { status, profile, closetItems } = data;
  const answers = profile?.answers || {};
  const dossier = profile?.dossier && Object.keys(profile.dossier).length > 0 ? profile.dossier : null;

  if (status === "NAO_ADQUIRIDA") {
    return <main className="shell narrow">
      <a href="/cuidese">← Cuide-se</a>
      <h1>Colorimetria pessoal</h1>
      <p>Um questionário visual rápido (e, se quiser, uma foto) pra descobrir as cores que mais favorecem você -- com cruzamento com o que você já tem no closet.</p>
      {error && <p role="alert" className="trial-banner">{error}</p>}
      <div className="trial-banner"><p>Experiência avulsa, liberação única (não é recurso mensal): <strong>R$ 59,90</strong>, ou incluída ao assinar o plano <strong>Super Star</strong>. Fale com a administradora pra liberar.</p></div>
    </main>;
  }

  if (status === "CONCLUIDA") {
    if (dossier) return <ResultsView dossier={dossier} profile={profile} closetItems={closetItems} error={error} />;
    return <main className="shell narrow"><a href="/cuidese">← Cuide-se</a><h1>Colorimetria pessoal</h1><p>Resultado concluído anteriormente, mas sem dossiê detalhado salvo.</p></main>;
  }

  if (!step || step < 1) {
    return <main className="shell narrow">
      <a href="/cuidese">← Cuide-se</a>
      <h1>Vamos descobrir sua paleta de cores</h1>
      <p>Um questionário curto e visual -- quase tudo é só marcar a opção. No final, você pode (se quiser) enviar uma foto pra complementar. É uma estimativa por IA, não substitui uma análise presencial de uma colorista profissional.</p>
      {error && <p role="alert" className="trial-banner">{error}</p>}
      <a href="/colorimetria?step=1"><button>Começar</button></a>
    </main>;
  }

  if (step === 1) return wrap(1, "Seu cabelo", <>
    <label>Cor natural do seu cabelo</label>
    <Chips name="cabelo_natural" options={CABELO_OPCOES} defaultValue={answers.cabelo_natural} />
    <label>Seu cabelo está tingido hoje?</label>
    <Chips name="cabelo_tingido" options={TINGIDO_OPCOES} defaultValue={answers.cabelo_tingido} />
    <label>Se tingiu, qual cor está usando agora? (opcional)<input name="cabelo_atual_cor" defaultValue={answers.cabelo_atual_cor || ""} /></label>
  </>, error);

  if (step === 2) return wrap(2, "Olhos e reação ao sol", <>
    <label>Cor dos seus olhos</label>
    <Chips name="olhos" options={OLHOS_OPCOES} defaultValue={answers.olhos} />
    <label>Como sua pele reage ao sol?</label>
    <Chips name="bronzeamento" options={BRONZEAMENTO_OPCOES} defaultValue={answers.bronzeamento} />
  </>, error);

  if (step === 3) return wrap(3, "Profundidade da sua pele", <>
    <p>Escolha o tom mais parecido com o seu.</p>
    <ColorPicker name="profundidade_pele" options={PROFUNDIDADE_PELE_SWATCHES} defaultValue={answers.profundidade_pele} />
  </>, error);

  if (step === 4) return wrap(4, "Branco e metais", <>
    <label>Perto do rosto, o que mais combina com você?</label>
    <ColorPicker name="branco_pref" options={[...BRANCO_SWATCHES, { value: "nao_sei", label: "Não sei", hex: null }]} defaultValue={answers.branco_pref} />
    <label>Qual metal de joia mais harmoniza com você?</label>
    <ColorPicker name="metal_pref" options={[...METAL_SWATCHES, { value: "ambos", label: "Ambos", hex: null }, { value: "nao_sei", label: "Não sei", hex: null }]} defaultValue={answers.metal_pref} />
  </>, error);

  if (step === 5) return wrap(5, "Subtom, intensidade e contraste", <>
    <label>Qual subtom você acha que tem?</label>
    <Chips name="subtom_autodeclarado" options={SUBTOM_OPCOES} defaultValue={answers.subtom_autodeclarado} />
    <label>Que intensidade de cor você prefere usar?</label>
    <StrategyCards name="intensidade_pref" options={INTENSIDADE_OPCOES} defaultValue={answers.intensidade_pref} />
    <label>Qual contraste você percebe entre seu cabelo, pele e olhos?</label>
    <StrategyCards name="contraste_pref" options={CONTRASTE_OPCOES} defaultValue={answers.contraste_pref} />
  </>, error);

  if (step === 6) return wrap(6, "Cores que iluminam seu rosto", <>
    <p>Marque as cores que você sente que te iluminam, quando usadas perto do rosto.</p>
    <ColorPicker name="cores_iluminam" options={CORES_PALETA} defaultValues={answers.cores_iluminam || []} multiple />
  </>, error);

  if (step === 7) return wrap(7, "Cores que não favorecem tanto", <>
    <p>Marque as cores que você sente que não favorecem tanto perto do rosto.</p>
    <ColorPicker name="cores_nao_favorecem" options={CORES_PALETA} defaultValues={answers.cores_nao_favorecem || []} multiple />
  </>, error);

  if (step === 8) return wrap(8, "Suas preferências", <>
    <label>Cores favoritas (só por gosto pessoal)</label>
    <ColorPicker name="cores_favoritas" options={CORES_PALETA} defaultValues={answers.cores_favoritas || []} multiple />
    <label>Cores que você prefere evitar (só por gosto, não precisa ter a ver com o que fica bem)</label>
    <ColorPicker name="cores_evitar_preferencia" options={CORES_PALETA} defaultValues={answers.cores_evitar_preferencia || []} multiple />
    <label>Neutros favoritos</label>
    <ColorPicker name="neutros_favoritos" options={NEUTROS_PALETA} defaultValues={answers.neutros_favoritos || []} multiple />
  </>, error);

  return <main className="shell narrow">
    <div className="top"><span className="eyebrow">COLORIMETRIA</span><a href="/cuidese">Sair</a></div>
    <Progress step={TOTAL_STEPS} />
    {error && <p role="alert" className="trial-banner">{error}</p>}
    <h1>Revisar e descobrir sua paleta</h1>
    <p>Questionário completo! Se quiser, envie também uma foto (rosto e/ou pulso, luz natural, sem filtro, sem maquiagem pesada) pra complementar -- é opcional, e a foto não fica salva depois da análise.</p>
    <form action={generateColorimetria} encType="multipart/form-data" className="form">
      <label>Foto (opcional)<input type="file" name="photo" accept="image/*" /></label>
      <label className="checkbox"><input type="checkbox" name="consent" /> Autorizo o uso desta foto pela IA, só para esta análise.</label>
      <SubmitButton pendingText="Descobrindo sua paleta... (pode levar até 20s, um pouco mais se enviar foto)">Descobrir minha paleta</SubmitButton>
    </form>
    <a href={`/colorimetria?step=${TOTAL_STEPS}`}>← Voltar</a>
  </main>;
}
