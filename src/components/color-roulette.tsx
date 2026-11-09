"use client";
import { useMemo, useRef, useState } from "react";

export type PaletteColor = { name: string; hex: string; neutral: boolean; tokens: string[] };
export type RoulettePiece = { id: string; name: string; category: string; photoId: string | null; tokens: string[] };

type Hsl = { h: number; s: number; l: number };
function hexToHsl(hex: string): Hsl {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0.5 };
  const n = parseInt(m[1], 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h, s, l };
}
const hueDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** Neutro = o que a análise já classificou como neutro, ou o que na prática se comporta como neutro (cinzas, preto, off-white). */
function isNeutral(c: PaletteColor, hsl: Hsl) { return c.neutral || hsl.s < 0.14 || hsl.l < 0.1 || hsl.l > 0.9; }

type Group = { key: string; title: string; hint: string; colors: PaletteColor[] };

/** Regras clássicas de harmonia, aplicadas SÓ às cores da paleta da pessoa. */
function harmonize(base: PaletteColor, all: PaletteColor[], hsl: Map<string, Hsl>): Group[] {
  const bh = hsl.get(base.hex)!;
  const others = all.filter((c) => c.hex !== base.hex);
  const neutrals = others.filter((c) => isNeutral(c, hsl.get(c.hex)!));
  const chroma = others.filter((c) => !isNeutral(c, hsl.get(c.hex)!));
  if (isNeutral(base, bh)) {
    return [
      { key: "neutros", title: "Neutros que acompanham", hint: "Combinam entre si; varie a claridade para criar contraste.", colors: neutrals },
      { key: "destaque", title: "Cores para dar vida", hint: "Qualquer cor da sua paleta funciona com um neutro.", colors: chroma },
    ].filter((g) => g.colors.length);
  }
  const withD = chroma.map((c) => ({ c, d: hueDiff(bh.h, hsl.get(c.hex)!.h), dl: Math.abs(bh.l - hsl.get(c.hex)!.l) }));
  return [
    { key: "neutros", title: "Neutros (sempre seguros)", hint: "Equilibram a cor escolhida em qualquer ocasião.", colors: neutrals },
    { key: "tom", title: "Tom sobre tom", hint: "Mesma família de cor, em claridades diferentes: visual elegante e alongado.", colors: withD.filter((x) => x.d <= 25 && x.dl >= 0.1).map((x) => x.c) },
    { key: "vizinhas", title: "Cores vizinhas", hint: "Ficam lado a lado no círculo: combinação suave e harmoniosa.", colors: withD.filter((x) => x.d > 25 && x.d <= 70).map((x) => x.c) },
    { key: "contraste", title: "Contraste", hint: "Opostas no círculo: efeito marcante e cheio de energia.", colors: withD.filter((x) => x.d >= 140).map((x) => x.c) },
    { key: "ousadas", title: "Ousadas", hint: "Combinações mais atrevidas; use uma delas em pequena dose.", colors: withD.filter((x) => x.d > 70 && x.d < 140).map((x) => x.c) },
  ].filter((g) => g.colors.length);
}

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)}A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}

const matches = (piece: RoulettePiece, color: PaletteColor) => piece.tokens.some((t) => color.tokens.includes(t));

/** Roleta de combinações: marque uma cor da sua paleta e veja quais outras cores da paleta harmonizam com ela,
 * além das peças do seu closet nessas cores. Tudo calculado na hora, sem gerar imagem. */
export default function ColorRoulette({ colors, pieces }: { colors: PaletteColor[]; pieces: RoulettePiece[] }) {
  const hsl = useMemo(() => new Map(colors.map((c) => [c.hex, hexToHsl(c.hex)])), [colors]);
  const chromatic = useMemo(() => colors.filter((c) => !isNeutral(c, hsl.get(c.hex)!)).sort((a, b) => hsl.get(a.hex)!.h - hsl.get(b.hex)!.h), [colors, hsl]);
  const neutrals = useMemo(() => colors.filter((c) => isNeutral(c, hsl.get(c.hex)!)).sort((a, b) => hsl.get(b.hex)!.l - hsl.get(a.hex)!.l), [colors, hsl]);
  const [sel, setSel] = useState<PaletteColor | null>(null);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [seed, setSeed] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groups = useMemo(() => (sel ? harmonize(sel, colors, hsl) : []), [sel, colors, hsl]);
  const harmonizing = useMemo(() => new Set(groups.flatMap((g) => g.colors.map((c) => c.hex))), [groups]);

  const choose = (c: PaletteColor) => { setSel(c); setSeed(0); };
  const spin = () => {
    if (spinning || !chromatic.length) return;
    const i = Math.floor(Math.random() * chromatic.length);
    const step = 360 / chromatic.length, center = (i + 0.5) * step;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setSpinning(true);
    setRot((r) => 360 * (Math.ceil(r / 360) + 3) - center);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { choose(chromatic[i]); setSpinning(false); }, reduce ? 50 : 1300);
  };

  // Sugestão de trio: cor escolhida + uma cor de harmonia + um neutro. "Outra combinação" troca as duas últimas.
  const trio = useMemo(() => {
    if (!sel) return null;
    const mids = groups.filter((g) => g.key !== "neutros").flatMap((g) => g.colors);
    const neut = groups.find((g) => g.key === "neutros")?.colors || [];
    const pick = <T,>(arr: T[], k: number) => (arr.length ? arr[(seed + k) % arr.length] : null);
    return { base: sel, mid: pick(mids, 0), neutral: pick(neut, 1) };
  }, [sel, groups, seed]);

  const basePieces = useMemo(() => (sel ? pieces.filter((p) => matches(p, sel)) : []), [sel, pieces]);
  const matchPieces = useMemo(() => {
    if (!sel) return [] as { piece: RoulettePiece; color: PaletteColor }[];
    const used = new Set(basePieces.map((p) => p.id));
    const out: { piece: RoulettePiece; color: PaletteColor }[] = [];
    for (const g of groups) for (const c of g.colors) for (const p of pieces) {
      if (!used.has(p.id) && matches(p, c)) { used.add(p.id); out.push({ piece: p, color: c }); }
    }
    return out;
  }, [sel, groups, pieces, basePieces]);

  if (colors.length < 4) return null;
  const SIZE = 320, C = SIZE / 2;
  const nOut = chromatic.length, nIn = neutrals.length;
  const segs = (list: PaletteColor[], r0: number, r1: number, extraRot = 0) => list.map((c, i) => {
    const step = Math.min((2 * Math.PI) / list.length, 2 * Math.PI - 0.02), gap = list.length > 1 ? 0.012 : 0;
    const a0 = -Math.PI / 2 + i * step + gap + extraRot, a1 = -Math.PI / 2 + (i + 1) * step - gap + extraRot;
    const isSel = sel?.hex === c.hex, isHarm = harmonizing.has(c.hex), dim = sel && !isSel && !isHarm;
    return <path key={c.hex + c.name} d={arc(C, C, r0, r1, a0, a1)} fill={c.hex} role="button" tabIndex={0}
      aria-label={`${c.name}${isSel ? " (escolhida)" : isHarm ? " (combina)" : ""}`} aria-pressed={isSel}
      className={`rl-seg${isSel ? " sel" : ""}${isHarm ? " harm" : ""}${dim ? " dim" : ""}`}
      onClick={() => choose(c)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(c); } }}>
      <title>{c.name}</title>
    </path>;
  });

  return <section className="card rl">
    <p className="look-meta">Toque numa cor da sua paleta (ou gire a roleta) e veja quais outras cores da sua paleta combinam com ela, e quais peças você já tem nessas cores. Nada é gerado: é só cor.</p>
    <div className="rl-wheel-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="rl-wheel" role="group" aria-label="Roleta de cores da sua paleta">
        <g className="rl-spin" style={{ transform: `rotate(${rot}deg)`, transformOrigin: "50% 50%", transition: spinning ? "transform 1.3s cubic-bezier(.17,.67,.2,1)" : "none" }}>
          {nOut > 0 && segs(chromatic, 98, 156)}
          {nIn > 0 && segs(neutrals, 56, 92)}
        </g>
        <polygon points={`${C - 9},4 ${C + 9},4 ${C},22`} className="rl-pointer" />
        <circle cx={C} cy={C} r={46} fill={sel ? sel.hex : "#fffdfc"} className="rl-center" />
        {!sel && <text x={C} y={C + 5} textAnchor="middle" className="rl-center-text">Escolha</text>}
      </svg>
      <div className="rl-actions">
        <button type="button" onClick={spin} disabled={spinning || !nOut}>{spinning ? "Girando..." : "Girar a roleta"}</button>
        {sel && <button type="button" className="ghost" onClick={() => setSel(null)}>Limpar</button>}
      </div>
    </div>

    {sel && <>
      <h3 className="rl-title"><span className="rl-dot" style={{ background: sel.hex }} />{sel.name}</h3>
      {trio && (trio.mid || trio.neutral) && <div className="rl-trio">
        <p className="hair-q-title">Sugestão de look em cores</p>
        <div className="rl-trio-row">
          {[trio.base, trio.mid, trio.neutral].filter(Boolean).map((c, i) => <div key={i} className="rl-trio-item"><span style={{ background: (c as PaletteColor).hex }} /><small>{(c as PaletteColor).name}</small></div>)}
        </div>
        <button type="button" className="ghost" onClick={() => setSeed((s) => s + 1)}>Outra combinação</button>
      </div>}
      {groups.map((g) => <div key={g.key} className="rl-group">
        <p className="hair-q-title">{g.title}</p>
        <p className="look-meta">{g.hint}</p>
        <div className="rl-chips">
          {g.colors.map((c) => <button type="button" key={c.hex + c.name} className="rl-chip" onClick={() => choose(c)} title={`Usar ${c.name} como base`}>
            <span style={{ background: c.hex }} />{c.name}
          </button>)}
        </div>
      </div>)}

      <div className="rl-group">
        <p className="hair-q-title">No seu closet, na cor escolhida ({basePieces.length})</p>
        {basePieces.length ? <div className="rl-pieces">{basePieces.slice(0, 24).map((p) => <a key={p.id} href={`/closet/${p.id}`} className="rl-piece" title={p.name}>
          {p.photoId ? <img src={`/api/closet/photos/${p.photoId}?w=240`} alt={p.name} loading="lazy" decoding="async" /> : <span className="look-thumb-placeholder">✦</span>}
          <small>{p.name}</small></a>)}</div>
          : <p className="look-meta">Nenhuma peça cadastrada nessa cor ainda. Boa ideia para a lista de compras.</p>}
      </div>
      <div className="rl-group">
        <p className="hair-q-title">Peças que combinam com ela ({matchPieces.length})</p>
        {matchPieces.length ? <div className="rl-pieces">{matchPieces.slice(0, 30).map(({ piece, color }) => <a key={piece.id} href={`/closet/${piece.id}`} className="rl-piece" title={`${piece.name} (${color.name})`}>
          {piece.photoId ? <img src={`/api/closet/photos/${piece.photoId}?w=240`} alt={piece.name} loading="lazy" decoding="async" /> : <span className="look-thumb-placeholder">✦</span>}
          <i className="rl-badge" style={{ background: color.hex }} /><small>{piece.name}</small></a>)}</div>
          : <p className="look-meta">Você ainda não tem peças nas cores que harmonizam com essa.</p>}
      </div>
    </>}
  </section>;
}
