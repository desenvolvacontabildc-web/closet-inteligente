export const ACCENT_PALETTE: Record<string, string> = {
  "Caramelo": "#a9714c",
  "Terracota": "#b2694a",
  "Vinho": "#7d3f4d",
  "Rosa antigo": "#a97887",
  "Verde-oliva": "#6b7353",
  "Azul-marinho": "#3d4f66",
  "Preto elegante": "#2f2a28",
};
export const DEFAULT_ACCENT = ACCENT_PALETTE["Caramelo"];
export function resolveAccent(value: string | undefined | null): string {
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (value && ACCENT_PALETTE[value]) return ACCENT_PALETTE[value];
  return DEFAULT_ACCENT;
}
