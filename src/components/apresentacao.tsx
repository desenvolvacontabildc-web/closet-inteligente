"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type PresPlan = { plan: string; name: string; price: number; promo: number | null; promoMonths: number; ai: number | null; img: number | null; std: number | null };
export type PresData = { plans: PresPlan[]; cuidese: number | null; colorimetria: number | null; packMin: number | null } | null;

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const IMG = (n: string) => `/apresentacao/${n}.jpg`;
const ctaFor = (cupom?: string) => (cupom ? `/?cupom=${encodeURIComponent(cupom)}#criar-conta` : "/#criar-conta");

/* ---------- blocos visuais ---------- */
function Tile({ n, i = 0 }: { n: string; i?: number }) {
  return <div className="pres-tile" style={{ ["--i" as string]: i }}><img src={IMG(n)} alt="" loading="lazy" /></div>;
}
function Check({ children }: { children: ReactNode }) {
  return <li><span className="pres-check" aria-hidden="true" />{children}</li>;
}
function Phone({ title, children }: { title: string; children: ReactNode }) {
  return <div className="m-phone" aria-hidden="false">
    <div className="m-notch" />
    <div className="m-head">{title}</div>
    <div className="m-body">{children}</div>
  </div>;
}
function Split({ h, sub, bullets, tag, children }: { h: ReactNode; sub?: ReactNode; bullets?: string[]; tag?: string; children: ReactNode }) {
  return <div className="pres-inner pres-wide">
    <div className="pres-text">
      {tag && <span className="pres-tag">{tag}</span>}
      <h2 className="pres-h">{h}</h2>
      {sub && <p className="pres-sub">{sub}</p>}
      {bullets && <ul className="pres-list">{bullets.map((b) => <Check key={b}>{b}</Check>)}</ul>}
    </div>
    <div className="pres-vis">{children}</div>
  </div>;
}

/* ---------- dados de exemplo (as imagens vêm de peças reais) ---------- */
const PIECES = [
  { n: "p-1-1", cat: "Blusas", name: "Blusa drapeada" }, { n: "p-3-1", cat: "Blusas", name: "Blusa bufante" }, { n: "p-2-1", cat: "Blusas", name: "Camisa de cetim" },
  { n: "p-1-3", cat: "Calças", name: "Calça taupe" }, { n: "p-2-3", cat: "Calças", name: "Calça off-white" }, { n: "p-3-3", cat: "Calças", name: "Calça marinho" },
  { n: "p-1-2", cat: "Bolsas", name: "Bolsa vinho" }, { n: "p-3-2", cat: "Bolsas", name: "Bolsa estruturada" },
  { n: "p-1-5", cat: "Calçados", name: "Sandália nude" }, { n: "p-3-4", cat: "Calçados", name: "Sandália vinho" },
  { n: "p-1-4", cat: "Coletes", name: "Colete taupe" },
];
const CATS = ["Tudo", "Blusas", "Calças", "Bolsas", "Calçados", "Coletes"];

function ClosetTabs() {
  const [cat, setCat] = useState("Tudo");
  const list = PIECES.filter((p) => cat === "Tudo" || p.cat === cat);
  return <Phone title="Meu closet">
    <div className="m-tabs">{CATS.map((c) => <button type="button" key={c} className={c === cat ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</div>
    <div className="m-grid">{list.map((p) => <figure key={p.n}><img src={IMG(p.n)} alt={p.name} loading="lazy" /><figcaption>{p.name}</figcaption></figure>)}</div>
  </Phone>;
}

type Pend = { id: string; img: string; name: string };
const PEND: Pend[] = [{ id: "a", img: "look-1", name: "Marrom e off-white" }, { id: "b", img: "look-3", name: "Clássico marinho" }, { id: "c", img: "look-2", name: "Elegância clara" }];
function Approve() {
  const [state, setState] = useState<Record<string, "ok" | "no">>({});
  const ok = Object.values(state).filter((v) => v === "ok").length;
  const left = PEND.filter((p) => !state[p.id]);
  return <Phone title="Seus looks">
    <div className="m-sec">Para decidir <small>Toque nos botões</small></div>
    {left.length === 0 && <div className="m-empty">Tudo decidido. <button type="button" className="m-link" onClick={() => setState({})}>Ver de novo</button></div>}
    {left.slice(0, 2).map((p) => <div className="m-look" key={p.id}>
      <img src={IMG(p.img)} alt={p.name} loading="lazy" />
      <div className="m-look-b"><b>{p.name}</b>
        <div><button type="button" className="m-yes" onClick={() => setState((s) => ({ ...s, [p.id]: "ok" }))}>Gostei</button><button type="button" className="m-no" onClick={() => setState((s) => ({ ...s, [p.id]: "no" }))}>Não é pra mim</button></div>
      </div>
    </div>)}
    <div className="m-sec">Looks prontos <small>{ok} {ok === 1 ? "aprovado" : "aprovados"}</small></div>
    <div className="m-row">{PEND.filter((p) => state[p.id] === "ok").map((p) => <img key={p.id} src={IMG(p.img)} alt="" className="m-mini" />)}</div>
  </Phone>;
}

const WHEEL: [string, string][] = [["#c65d3b", "Terracota"], ["#d4a017", "Mostarda"], ["#708238", "Oliva"], ["#2f6f6d", "Azul-petróleo"], ["#cc5500", "Laranja queimado"], ["#f4a261", "Pêssego"],
  ["#f28c6b", "Coral"], ["#a3a66b", "Verde sálvia"], ["#c19a6b", "Camel"], ["#af6e3d", "Caramelo"], ["#7a263a", "Vinho"], ["#355e3b", "Verde floresta"]];
const STEP = 360 / WHEEL.length;
function Roulette() {
  const [rot, setRot] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const spin = () => {
    if (busy) return;
    const target = Math.floor(Math.random() * WHEEL.length);
    const desired = (360 - (target * STEP + STEP / 2)) % 360;
    setBusy(true); setPick(null);
    setRot((r) => r - (r % 360) + 360 * 4 + desired);
    timer.current = setTimeout(() => { setPick(target); setBusy(false); }, 3300);
  };
  const at = (k: number) => WHEEL[((k % WHEEL.length) + WHEEL.length) % WHEEL.length];
  const bg = `conic-gradient(${WHEEL.map(([c], i) => `${c} ${i * STEP}deg ${(i + 1) * STEP}deg`).join(",")})`;
  return <div className="pres-roul">
    <div className="pres-roul-wheel"><div className="pres-roul-disc" style={{ background: bg, transform: `rotate(${rot}deg)` }} /><div className="pres-roul-hole" style={{ background: pick != null ? WHEEL[pick][0] : undefined }} /><i /></div>
    <button type="button" onClick={spin} disabled={busy}>{busy ? "Girando..." : pick == null ? "Girar a roleta" : "Girar de novo"}</button>
    <div className="pres-roul-res" aria-live="polite">
      {pick == null ? <span className="pres-note">Toque no botão e veja quais cores combinam.</span> : <>
        <b>{WHEEL[pick][1]}</b> combina com
        <div className="pres-roul-sw">{[[pick - 1, "Vizinha"], [pick + 1, "Vizinha"], [pick + 6, "Contraste"]].map(([k, l]) => <span key={String(l) + k}><i style={{ background: at(k as number)[0] }} />{at(k as number)[1]}<small>{l}</small></span>)}</div>
      </>}
    </div>
  </div>;
}

const AM = ["Limpeza suave", "Vitamina C", "Hidratante", "Protetor solar"];
const PM = ["Limpeza", "Tratamento", "Hidratante"];
function Skin() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const total = AM.length + PM.length;
  const n = Object.values(done).filter(Boolean).length;
  const box = (k: string, label: string) => <label key={k} className={`m-step${done[k] ? " on" : ""}`}><input type="checkbox" checked={!!done[k]} onChange={() => setDone((d) => ({ ...d, [k]: !d[k] }))} /><span />{label}</label>;
  return <Phone title="Skincare">
    <div className="m-prog"><i style={{ width: `${(n / total) * 100}%` }} /></div>
    <div className="m-sec">Manhã <small>{n}/{total} hoje</small></div>
    {AM.map((s) => box("a" + s, s))}
    <div className="m-sec">Noite</div>
    {PM.map((s) => box("p" + s, s))}
    <p className="m-foot">Exemplo de rotina. A sua é montada pelo app, com os ingredientes certos para a sua pele.</p>
  </Phone>;
}

/* ---------- slides ---------- */
type S = { ch: string; node: ReactNode };
function buildSlides(data: PresData, CTA: string): S[] {
  return [
    { ch: "Início", node: <div className="pres-inner" key="0">
      <span className="pres-eyebrow">Apresentação</span>
      <h1 className="pres-h pres-h-xl">Closet Inteligente</h1>
      <p className="pres-sub pres-accent">Um closet que conhece você.</p>
      <div className="pres-hero"><div className="pres-look pres-pop"><img src={IMG("look-1")} alt="Look montado pelo app com peças reais" /></div>
        <div className="pres-float f1"><img src={IMG("p-1-2")} alt="" /></div><div className="pres-float f2"><img src={IMG("p-1-5")} alt="" /></div><div className="pres-float f3"><img src={IMG("p-1-1")} alt="" /></div></div>
      <p className="pres-note">Veja em poucos minutos tudo o que ele faz. Use as setas, deslize ou toque em Tocar.</p>
    </div> },
    { ch: "Início", node: <div className="pres-inner" key="1">
      <h2 className="pres-h">Tanta roupa.<br /><span className="pres-accent">E nada para vestir?</span></h2>
      <p className="pres-sub">O Closet Inteligente conhece as peças que você já tem e transforma o seu guarda-roupa em looks prontos, em cores que favorecem você e em ideias para cada ocasião. Sem gastar mais.</p>
      <div className="pres-tiles">{["p-1-1", "p-1-3", "p-2-1", "p-3-1", "p-1-4", "p-3-3"].map((n, i) => <Tile key={n} n={n} i={i} />)}</div>
    </div> },

    { ch: "Seu closet", node: <Split key="2" tag="Passo 1" h="Cadastre suas peças" sub="Tire a foto e pronto. A inteligência artificial lê a peça e preenche a ficha para você."
      bullets={["Cor, tecido, comprimento e mangas reconhecidos", "Foto de catálogo limpa, sem o fundo bagunçado", "Cadastre aos poucos, no seu ritmo"]}>
      <Phone title="Nova peça">
        <div className="m-photo"><img src={IMG("p-1-1")} alt="" loading="lazy" /><span className="m-badge">Foto de catálogo</span></div>
        <div className="m-sec">Ficha preenchida pela IA</div>
        <div className="m-chips">{["Blusa", "Off-white", "Tecido fluido", "Decote drapeado", "Sem mangas", "Elegante"].map((c, i) => <span key={c} style={{ ["--i" as string]: i }}>{c}</span>)}</div>
      </Phone>
    </Split> },
    { ch: "Seu closet", node: <Split key="3" tag="Passo 2" h="Tudo organizado, no bolso" sub="Veja suas peças por categoria, com foto. Toque numa peça para ver a ficha e os looks possíveis com ela."
      bullets={["Filtros por categoria", "Looks com cada peça, em um toque", "Seu closet sempre à mão"]}>
      <ClosetTabs />
    </Split> },

    { ch: "Looks", node: <Split key="4" tag="Todo dia" h={<>O look do dia, <span className="pres-accent">pensado no clima</span></>} sub="Informe a sua cidade e o app avisa a temperatura e a chance de chuva, e já sugere o look para hoje."
      bullets={["Peças mais leves no calor, casaco no frio", "Quanto mais você usa e avalia, mais ele acerta o seu estilo"]}>
      <Phone title="Início">
        <div className="m-hello">Olá.<small>Hoje na sua cidade: 24°C, chance de chuva.</small></div>
        <div className="m-sec">Look para hoje</div>
        <div className="m-look"><img src={IMG("look-2")} alt="" loading="lazy" /><div className="m-look-b"><b>Dia comum</b><small>Camisa de cetim + calça off-white + bolsa vinho + sandália nude</small></div></div>
      </Phone>
    </Split> },
    { ch: "Looks", node: <Split key="5" tag="Do seu jeito" h="Peça um look" sub="Para uma ocasião, a partir de uma peça que você quer usar, ou monte você mesma. O app combina só o que você tem."
      bullets={["Diga a ocasião: jantar, trabalho, passeio...", "Escolha uma peça e veja os looks com ela", "Ou monte o seu e peça a opinião"]}>
      <Phone title="Pedir sugestão">
        <div className="m-input">Ocasião: jantar com amigas</div>
        <div className="m-btn">Pedir sugestão de looks</div>
        {[["Marrom e off-white", ["p-1-1", "p-1-3", "p-1-5"]], ["Elegância clara", ["p-2-1", "p-2-3", "p-2-4"]], ["Clássico marinho", ["p-3-1", "p-3-3", "p-3-4"]]].map(([t, ps]) => <div className="m-combo" key={t as string}><b>{t as string}</b><div>{(ps as string[]).map((p) => <img key={p} src={IMG(p)} alt="" loading="lazy" />)}</div></div>)}
      </Phone>
    </Split> },
    { ch: "Looks", node: <Split key="6" tag="Antes de vestir" h="Veja o look em imagem" sub="O app cria a imagem do look com as suas roupas. Escolha como quer ver: fotografia realista, o seu avatar com as suas proporções ou ilustração."
      bullets={["Imagem fiel às peças que você cadastrou", "Avatar de estilo com o seu corpo", "Troque o estilo quando quiser"]}>
      <Phone title="Look em imagem">
        <div className="m-seg"><span className="on">Realista</span><span>Meu avatar</span><span>Ilustração</span></div>
        <div className="m-big pres-pop"><img src={IMG("look-1")} alt="" loading="lazy" /></div>
        <div className="m-sec">Marrom e off-white com sobreposição</div>
      </Phone>
    </Split> },
    { ch: "Looks", node: <Split key="7" tag="Você decide" h={<>Gostou? Salve.<br /><span className="pres-accent">Não gostou? Ele some.</span></>} sub="Aprove os looks que combinaram com você, marque os que usou e conte como se sentiu. O app aprende o seu gosto."
      bullets={["Looks prontos, para decidir, usados e descartados", "Descartou sem querer? Dá para restaurar", "Sugestões cada vez mais certeiras"]}>
      <Approve />
    </Split> },
    { ch: "Looks", node: <Split key="8" tag="Consultoria" h="A opinião de uma consultora de imagem" sub="Mande uma foto sua com o look. A consultora do app comenta caimento, proporção e cores, sugere o que mudar e diz quando usar."
      bullets={["Opinião sincera e gentil", "Sugestões do que ajustar", "Se gostar, salve nos looks prontos"]}>
      <Phone title="Analisar esse look">
        <div className="m-big"><img src={IMG("look-3")} alt="" loading="lazy" /></div>
        <div className="m-say"><b>Cores</b>O marinho com o vinho da bolsa cria um contraste elegante.</div>
        <div className="m-say"><b>Proporção</b>A blusa volumosa pede calça mais reta, como a que você usou.</div>
        <div className="m-say"><b>Quando usar</b>Reuniões e jantares.</div>
        <p className="m-foot">Exemplo de análise.</p>
      </Phone>
    </Split> },
    { ch: "Looks", node: <div className="pres-inner" key="9">
      <span className="pres-tag">Viagens</span>
      <h2 className="pres-h">Mala de viagem <span className="pres-accent">sob medida</span></h2>
      <p className="pres-sub">Conte o destino, os dias e os compromissos (reunião, jantar, passeio). O app monta um look para cada um, usando as suas peças.</p>
      <div className="pres-poster"><div className="pres-poster-h">MINHA MALA DE VIAGEM</div>
        <div className="pres-poster-g">{[["look-1", "Dia 1 · Chegada"], ["look-2", "Dia 2 · Seminário"], ["look-3", "Dia 3 · Jantar"]].map(([n, t]) => <figure key={n}><img src={IMG(n)} alt="" loading="lazy" /><figcaption>{t}</figcaption></figure>)}</div></div>
      <p className="pres-note">Troque ou descarte peças, siga o checklist e exporte o pôster. (Exemplo ilustrativo.)</p>
    </div> },
    { ch: "Looks", node: <Split key="10" tag="Fashion e Super Star" h="Closet cápsula: mais looks com menos peças" sub="Escolha quantas peças quer e a IA seleciona, entre as suas, a combinação mais versátil, a que gera mais looks usando menos itens."
      bullets={["Ideal para viagens e para simplificar a rotina", "Estimativa de quantas combinações você ganha", "Feito só com peças que você já tem"]}>
      <Phone title="Closet cápsula">
        <div className="m-sec">Sua cápsula atual</div>
        <div className="m-grid m-grid3">{["p-1-1", "p-2-1", "p-3-1", "p-1-3", "p-3-3", "p-1-2", "p-1-5", "p-3-4"].map((n) => <figure key={n}><img src={IMG(n)} alt="" loading="lazy" /></figure>)}</div>
        <p className="m-foot">Exemplo: 8 peças, dezenas de combinações possíveis.</p>
      </Phone>
    </Split> },
    { ch: "Looks", node: <Split key="11" tag="Compras inteligentes" h="O que vale comprar, de verdade" sub="O app analisa o seu closet e aponta as peças coringa que estão faltando, para você comprar só o que vai usar."
      bullets={["Menos compra por impulso", "Cada sugestão vem com o motivo", "Atualize quando o closet mudar"]}>
      <Phone title="O que vale comprar">
        {[["Blazer em tom neutro", "Combina com quase todas as suas calças e blusas."], ["Sapato fechado nude", "Falta uma opção para dias frios e de chuva."], ["Camisa branca clássica", "Base para vários looks de trabalho."]].map(([a, b]) => <div className="m-say" key={a}><b>{a}</b>{b}</div>)}
        <p className="m-foot">Exemplo de sugestões.</p>
      </Phone>
    </Split> },

    { ch: "Cores", node: <Split key="12" tag="Colorimetria pessoal" h="Descubra a sua paleta de cores" sub="Um questionário visual e rápido (a foto é opcional) revela o seu subtom e as cores que mais favorecem você."
      bullets={["Neutros, cores claras, médias e profundas", "Metais que combinam: dourado, bronze, cobre", "Combinações prontas para usar perto do rosto"]}>
      <Phone title="Sua colorimetria">
        <div className="m-eyebrow">OUTONO QUENTE <small>(exemplo)</small></div>
        <div className="m-attrs"><span><b>Subtom</b> quente</span><span><b>Profundidade</b> média</span><span><b>Contraste</b> médio</span></div>
        {[["Neutros", ["#f6e7c1", "#c19a6b", "#af6e3d", "#5a301f", "#243746"]], ["Claras", ["#f4a261", "#f7b267", "#f28c6b", "#eed9a6", "#a3a66b"]], ["Médias", ["#c65d3b", "#d4a017", "#708238", "#68724d", "#2f6f6d"]], ["Profundas", ["#3b2116", "#2b1b14", "#7a263a", "#355e3b", "#3b4a2a"]]].map(([t, cs]) => <div className="m-pal" key={t as string}><small>{t as string}</small><div>{(cs as string[]).map((c) => <i key={c} style={{ background: c }} />)}</div></div>)}
      </Phone>
    </Split> },
    { ch: "Cores", node: <div className="pres-inner" key="13">
      <span className="pres-tag">Interativo</span>
      <h2 className="pres-h">Roleta de <span className="pres-accent">combinações</span></h2>
      <p className="pres-sub">Gire e descubra quais cores da sua paleta combinam. <b>Nada é gerado: é só cor</b>, sem gastar imagens.</p>
      <Roulette />
    </div> },
    { ch: "Cores", node: <Split key="14" tag="Colorimetria × closet" h="Sua paleta × seu closet" sub="O app mostra as peças que você já tem nas cores que favorecem você, e as cores da paleta que ainda faltam."
      bullets={["Peças do closet que estão na sua paleta", "Possíveis lacunas para as próximas compras", "Lista que abre e fecha com um toque"]}>
      <Phone title="Paleta × closet">
        <div className="m-sec">Peças do seu closet na sua paleta</div>
        <div className="m-grid m-grid3">{["p-1-1", "p-1-2", "p-3-2", "p-1-3", "p-2-3", "p-3-3"].map((n) => <figure key={n}><img src={IMG(n)} alt="" loading="lazy" /></figure>)}</div>
        <div className="m-sec">Possíveis lacunas</div>
        <div className="m-pal"><div>{["#d4a017", "#708238", "#2f6f6d", "#cc5500"].map((c) => <i key={c} style={{ background: c }} />)}</div></div>
        <p className="m-foot">Exemplo.</p>
      </Phone>
    </Split> },

    { ch: "Cuide-se", node: <Split key="15" tag="Cuide-se · Skincare" h="Skincare feito para a sua pele" sub="Responda um questionário e receba a rotina de manhã e de noite, com os ingredientes certos. Marque cada etapa com um toque."
      bullets={["Rotina de manhã e de noite", "Acompanhe a sua constância", "Lembrete do dia na tela inicial"]}>
      <Skin />
    </Split> },
    { ch: "Cuide-se", node: <Split key="16" tag="Cuide-se · Cabelo" h="Cronograma capilar" sub="Um ciclo de semanas com hidratação, nutrição e reconstrução na ordem certa, e o lembrete do dia na tela inicial."
      bullets={["Diagnóstico do seu cabelo", "O componente certo para cada etapa", "Nunca mais esquecer o dia do tratamento"]}>
      <Phone title="Cronograma capilar">
        {[["Semana 1", ["Hidratação", "Nutrição"]], ["Semana 2", ["Reconstrução", "Hidratação"]], ["Semana 3", ["Nutrição", "Hidratação"]], ["Semana 4", ["Hidratação", "Reconstrução"]]].map(([w, ts], i) => <div className={`m-week${i === 1 ? " on" : ""}`} key={w as string}><b>{w as string}{i === 1 ? " · hoje" : ""}</b><div>{(ts as string[]).map((t) => <span key={t}>{t}</span>)}</div></div>)}
        <p className="m-foot">Exemplo de ciclo. O seu é montado pelo app.</p>
      </Phone>
    </Split> },

    { ch: "Descubra", node: <div className="pres-inner" key="17">
      <h2 className="pres-h">Descubra, inspire-se <span className="pres-accent">e economize</span></h2>
      <p className="pres-sub">O app vai além do seu guarda-roupa.</p>
      <div className="pres-cards">
        <div className="pres-card"><b>O que está em alta</b><span>Dicas de stylists e profissionais da moda, pensadas para você usar o que já tem no closet.</span></div>
        <div className="pres-card"><b>Vitrine de lojas parceiras</b><span>Peças selecionadas com desconto exclusivo. Fale direto com a loja pelo WhatsApp ou conheça o Instagram.</span></div>
        <div className="pres-card"><b>Dica de amiga</b><span>Achadinhos de outras lojas recomendados por aqui, com link direto para comprar.</span></div>
      </div>
      <p className="pres-note">Tem uma loja? Divulgue as suas peças na vitrine e use o Provador para mostrá-las vestidas.</p>
    </div> },
    { ch: "Planos", node: <div className="pres-inner" key="18">
      <h2 className="pres-h">Feito para você <span className="pres-accent">se sentir à vontade</span></h2>
      <div className="pres-cards pres-cards2">
        <div className="pres-card"><b>7 dias grátis</b><span>Teste tudo, sem cartão de crédito.</span></div>
        <div className="pres-card"><b>Bônus de imagens</b><span>Ganhe créditos de imagem ao completar 1 mês, 3 meses, 6 meses e 1 ano de uso.</span></div>
        <div className="pres-card"><b>Seus dados são seus</b><span>Peças e fotos ficam só na sua conta. A foto da colorimetria não fica salva depois da análise.</span></div>
        <div className="pres-card"><b>No seu celular</b><span>Instale na tela inicial e use como um aplicativo.</span></div>
      </div>
    </div> },
    { ch: "Planos", node: <div className="pres-inner" key="19">
      <h2 className="pres-h">Escolha o seu <span className="pres-accent">plano</span></h2>
      <p className="pres-sub"><b>7 dias de teste, sem cartão.</b> Depois, o plano que cabe em você.</p>
      {data ? <div className="pres-plans">
        {data.plans.map((p) => <div key={p.plan} className="pres-plan">
          <div className="pres-plan-top"><b>{p.name}</b><span>{brl(p.price)}<small>/mês</small></span></div>
          {p.promo != null && p.promoMonths > 0 && <em>{brl(p.promo)}/mês nos {p.promoMonths} primeiros meses no cartão</em>}
          <small>{p.ai ?? "Ilimitados"} pedidos de IA · {p.img ?? "Ilimitados"} looks em imagem · {p.std ?? "Ilimitadas"} fotos de catálogo por mês{p.plan !== "ARRUMADA" ? " · Cuide-se incluído · Closet cápsula" : ""}</small>
        </div>)}
      </div> : <p className="pres-sub">Planos mensais a partir de um valor acessível, com teste gratuito.</p>}
      <p className="pres-note">
        {data?.cuidese != null ? `Cuide-se no plano Arrumada: ${brl(data.cuidese)}/mês. ` : ""}
        {data?.colorimetria != null ? `Colorimetria: ${brl(data.colorimetria)}, pagamento único. ` : ""}
        {data?.packMin != null ? `Precisa de mais imagens? Créditos a partir de ${brl(data.packMin)}.` : ""}
      </p>
    </div> },
    { ch: "Planos", node: <div className="pres-inner" key="20">
      <h2 className="pres-h pres-h-xl">Pronta para conhecer o <span className="pres-accent">seu closet?</span></h2>
      <p className="pres-sub">Crie a sua conta em um minuto e teste tudo por 7 dias, sem cartão.</p>
      <a className="pres-cta" href={CTA}>Criar minha conta grátis</a>
      <a className="pres-link" href="/">Já tenho conta. Entrar</a>
      <p className="pres-note">As imagens desta apresentação são exemplos gerados pelo app a partir de peças reais.</p>
    </div> },
  ];
}

const AUTO_MS = 8000;

export default function Apresentacao({ data, cupom }: { data: PresData; cupom?: string }) {
  const CTA = ctaFor(cupom);
  const slides = buildSlides(data, CTA);
  const last = slides.length - 1;
  const [i, setI] = useState(0);
  const [play, setPlay] = useState(false);
  const touch = useRef<number | null>(null);
  const go = (n: number) => setI(Math.max(0, Math.min(last, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(i + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i]);

  useEffect(() => {
    if (!play) return;
    if (i >= last) { setPlay(false); return; }
    const t = setTimeout(() => setI(i + 1), AUTO_MS);
    return () => clearTimeout(t);
  }, [play, i, last]);

  const ignore = (t: EventTarget | null) => t instanceof Element && !!t.closest("button,a,input,label");
  return <div className="pres" onTouchStart={(e) => { touch.current = ignore(e.target) ? null : e.touches[0].clientX; }}
    onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (dx < -55) go(i + 1); else if (dx > 55) go(i - 1); }}>
    <div className="pres-top">
      <div className="pres-progress"><i style={{ width: `${((i + 1) / slides.length) * 100}%` }} /></div>
      <div className="pres-top2">
        <span className="pres-ch">{slides[i].ch}</span>
        <span className="pres-count">{i + 1} / {slides.length}</span>
        <button type="button" className="pres-play" onClick={() => { setPlay((p) => !p); if (i >= last) setI(0); }}>{play ? "Pausar" : "Tocar"}</button>
        <a className="pres-skip" href={CTA}>Criar minha conta</a>
      </div>
    </div>
    <div className="pres-stage">
      {slides.map((s, k) => <section key={k} className={`pres-slide${k === i ? " on" : ""}${k < i ? " past" : ""}`} aria-hidden={k !== i}>{s.node}</section>)}
    </div>
    <div className="pres-nav">
      <button type="button" className="ghost" onClick={() => go(i - 1)} disabled={i === 0}>Voltar</button>
      {i < last ? <button type="button" onClick={() => go(i + 1)}>Próximo</button> : <a className="pres-next-cta" href={CTA}>Criar conta</a>}
    </div>
  </div>;
}
