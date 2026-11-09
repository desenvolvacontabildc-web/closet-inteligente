/** Lógica de harmonia de cores da roleta (pura, sem React): usada pelo componente e testável sozinha. */
export type PaletteColor = { name: string; hex: string; neutral: boolean; tokens: string[] };
export type Hsl = { h: number; s: number; l: number };
export type Group = { key: string; title: string; hint: string; colors: PaletteColor[] };

export const isValidHex = (hex: unknown): hex is string => typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex.trim());

export function hexToHsl(hex: string): Hsl {
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

export const hueDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** Neutro = o que a análise já classificou como neutro, ou o que na prática se comporta como neutro (cinzas, preto, off-white). */
export function isNeutral(c: PaletteColor, hsl: Hsl) { return c.neutral || hsl.s < 0.14 || hsl.l < 0.1 || hsl.l > 0.9; }

/** Regras clássicas de harmonia, aplicadas SÓ às cores da paleta da pessoa. */
export function harmonize(base: PaletteColor, all: PaletteColor[], hsl: Map<string, Hsl>): Group[] {
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
