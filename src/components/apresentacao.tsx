"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type PresPlan = { plan: string; name: string; price: number; promo: number | null; promoMonths: number; ai: number | null; img: number | null; std: number | null };
export type PresData = { plans: PresPlan[]; cuidese: number | null; colorimetria: number | null; packMin: number | null } | null;

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const IMG = (n: string) => `/apresentacao/${n}.jpg`;
const CTA = "/#criar-conta";

function Tile({ n, i }: { n: string; i: number }) {
  return <div className="pres-tile" style={{ ["--i" as string]: i }}><img src={IMG(n)} alt="" loading="lazy" /></div>;
}
function Check({ children }: { children: ReactNode }) {
  return <li><span className="pres-check" aria-hidden="true" />{children}</li>;
}

function buildSlides(data: PresData): ReactNode[] {
  return [
    // 0 capa
    <div className="pres-inner" key="0">
      <span className="pres-eyebrow">Apresentação</span>
      <h1 className="pres-h pres-h-xl">Closet Inteligente</h1>
      <p className="pres-sub pres-accent">Um closet que conhece você.</p>
      <div className="pres-look pres-pop"><img src={IMG("look-1")} alt="Look montado pelo app com peças reais" /></div>
      <p className="pres-note">Veja em 2 minutos como funciona. Use as setas ou deslize.</p>
    </div>,
    // 1 problema
    <div className="pres-inner" key="1">
      <h2 className="pres-h">Tanta roupa.<br /><span className="pres-accent">E nada para vestir?</span></h2>
      <p className="pres-sub">O Closet Inteligente conhece as peças que você já tem e transforma o seu guarda-roupa em looks prontos, sem você gastar mais.</p>
      <div className="pres-tiles">{["p-1-1", "p-1-3", "p-2-1", "p-3-1", "p-1-4", "p-3-3"].map((n, i) => <Tile key={n} n={n} i={i} />)}</div>
    </div>,
    // 2 cadastre
    <div className="pres-inner" key="2">
      <span className="pres-step">1</span>
      <h2 className="pres-h">Cadastre suas peças</h2>
      <p className="pres-sub">Tire a foto de cada peça. A inteligência artificial reconhece cor, tecido, comprimento e estilo, e cria uma <b>foto de catálogo</b> limpa.</p>
      <div className="pres-tiles">{["p-1-1", "p-1-2", "p-1-3", "p-2-1", "p-1-4", "p-1-5"].map((n, i) => <Tile key={n} n={n} i={i} />)}</div>
    </div>,
    // 3 peça um look
    <div className="pres-inner" key="3">
      <span className="pres-step">2</span>
      <h2 className="pres-h">Peça um look</h2>
      <p className="pres-sub">Para o dia, para uma ocasião ou a partir de uma peça. O app combina <b>só o que você tem</b>.</p>
      <div className="pres-row">
        <div className="pres-col">{["p-2-1", "p-2-2", "p-2-3", "p-2-4"].map((n, i) => <Tile key={n} n={n} i={i} />)}</div>
        <div className="pres-look pres-pop"><img src={IMG("look-2")} alt="Look em imagem" /></div>
      </div>
      <p className="pres-cap">Elegância clara com contraste vinho</p>
    </div>,
    // 4 gostou
    <div className="pres-inner" key="4">
      <span className="pres-step">3</span>
      <h2 className="pres-h">Veja em imagem e escolha</h2>
      <p className="pres-sub">O look aparece com as suas roupas de verdade. <b>Gostou?</b> Salve nos looks prontos. <b>Não gostou?</b> Ele some e o app aprende o seu gosto.</p>
      <div className="pres-two"><div className="pres-look pres-pop"><img src={IMG("look-1")} alt="" loading="lazy" /></div><div className="pres-look pres-pop" style={{ animationDelay: ".15s" }}><img src={IMG("look-3")} alt="" loading="lazy" /></div></div>
      <p className="pres-note">Você também pode mandar uma foto sua e receber uma opinião sincera sobre o look.</p>
    </div>,
    // 5 mala
    <div className="pres-inner" key="5">
      <h2 className="pres-h">Mala de viagem <span className="pres-accent">sob medida</span></h2>
      <p className="pres-sub">Conte o destino, os dias e os compromissos (reunião, jantar, passeio). O app monta um look para cada um, usando suas peças.</p>
      <div className="pres-poster">
        <div className="pres-poster-h">MINHA MALA DE VIAGEM</div>
        <div className="pres-poster-g">{[["look-1", "Dia 1 · Chegada"], ["look-2", "Dia 2 · Seminário"], ["look-3", "Dia 3 · Jantar"]].map(([n, t]) => <figure key={n}><img src={IMG(n)} alt="" loading="lazy" /><figcaption>{t}</figcaption></figure>)}</div>
      </div>
      <p className="pres-note">Troque ou descarte peças, siga o checklist e exporte o pôster. (Exemplo ilustrativo.)</p>
    </div>,
    // 6 roleta
    <div className="pres-inner" key="6">
      <h2 className="pres-h">Combine <span className="pres-accent">por cor</span></h2>
      <p className="pres-sub">Descubra a sua paleta na Colorimetria. Toque numa cor, ou gire a roleta, e veja quais cores combinam e quais peças suas estão nelas. <b>Sem gerar imagem.</b></p>
      <div className="pres-wheel" aria-hidden="true"><i /></div>
      <ul className="pres-list"><Check>Sua paleta de melhores cores e neutros</Check><Check>Harmonias: tom sobre tom, vizinhas, contraste</Check><Check>Suas peças nas cores que combinam</Check></ul>
    </div>,
    // 7 cuide-se
    <div className="pres-inner" key="7">
      <h2 className="pres-h">Cuide-se <span className="pres-accent">também</span></h2>
      <p className="pres-sub">Diagnóstico feito para você, com os ingredientes certos e acompanhamento dia a dia.</p>
      <div className="pres-cards">
        <div className="pres-card"><b>Skincare</b><span>Rotina de manhã e de noite. Marque o que fez com um toque e acompanhe sua constância.</span></div>
        <div className="pres-card"><b>Cronograma capilar</b><span>Ciclo de semanas com hidratação, nutrição e reconstrução, e o componente certo para cada etapa.</span></div>
        <div className="pres-card"><b>Colorimetria pessoal</b><span>Seu subtom, sua paleta e as peças do seu closet que já combinam com ela.</span></div>
      </div>
    </div>,
    // 8 planos
    <div className="pres-inner" key="8">
      <h2 className="pres-h">Comece <span className="pres-accent">grátis</span></h2>
      <p className="pres-sub"><b>7 dias de teste, sem cartão.</b> Depois, escolha o plano que cabe em você.</p>
      {data ? <div className="pres-plans">
        {data.plans.map((p) => <div key={p.plan} className="pres-plan">
          <div className="pres-plan-top"><b>{p.name}</b><span>{brl(p.price)}<small>/mês</small></span></div>
          {p.promo != null && p.promoMonths > 0 && <em>{brl(p.promo)}/mês nos {p.promoMonths} primeiros meses no cartão</em>}
          <small>{p.ai ?? "Ilimitados"} pedidos de IA · {p.img ?? "Ilimitados"} looks em imagem · {p.std ?? "Ilimitadas"} fotos de catálogo por mês{p.plan !== "ARRUMADA" ? " · Cuide-se incluído" : ""}</small>
        </div>)}
      </div> : <p className="pres-sub">Planos mensais a partir de um valor acessível, com teste gratuito.</p>}
      <p className="pres-note">
        {data?.cuidese != null ? `Cuide-se no plano Arrumada: ${brl(data.cuidese)}/mês. ` : ""}
        {data?.colorimetria != null ? `Colorimetria: ${brl(data.colorimetria)}, pagamento único. ` : ""}
        {data?.packMin != null ? `Precisa de mais imagens? Créditos a partir de ${brl(data.packMin)}.` : ""}
      </p>
    </div>,
    // 9 final
    <div className="pres-inner" key="9">
      <h2 className="pres-h pres-h-xl">Pronta para conhecer o <span className="pres-accent">seu closet?</span></h2>
      <p className="pres-sub">Crie a sua conta em um minuto e teste tudo por 7 dias, sem cartão.</p>
      <a className="pres-cta" href={CTA}>Criar minha conta grátis</a>
      <a className="pres-link" href="/">Já tenho conta. Entrar</a>
      <p className="pres-note">As imagens desta apresentação são exemplos gerados pelo app a partir de peças reais.</p>
    </div>,
  ];
}

export default function Apresentacao({ data }: { data: PresData }) {
  const slides = buildSlides(data);
  const last = slides.length - 1;
  const [i, setI] = useState(0);
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

  return <div className="pres" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
    onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (dx < -55) go(i + 1); else if (dx > 55) go(i - 1); }}>
    <div className="pres-top">
      <div className="pres-progress"><i style={{ width: `${((i + 1) / slides.length) * 100}%` }} /></div>
      <a className="pres-skip" href={CTA}>Criar minha conta</a>
    </div>
    <div className="pres-stage">
      {slides.map((s, k) => <section key={k} className={`pres-slide${k === i ? " on" : ""}${k < i ? " past" : ""}`} aria-hidden={k !== i}>{s}</section>)}
    </div>
    <div className="pres-nav">
      <button type="button" className="ghost" onClick={() => go(i - 1)} disabled={i === 0}>Voltar</button>
      <div className="pres-dots" aria-hidden="true">{slides.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
      {i < last ? <button type="button" onClick={() => go(i + 1)}>Próximo</button> : <a className="pres-next-cta" href={CTA}>Criar conta</a>}
    </div>
  </div>;
}
