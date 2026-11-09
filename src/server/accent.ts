export const ACCENT_PALETTE: Record<string, string> = {
  "Borgonha rosé": "#8e3a57",
  "Ameixa": "#5e3a63",
  "Caramelo": "#8d6240",
  "Terracota": "#a15a3f",
  "Vinho": "#6e2f40",
  "Rosa antigo": "#9a6676",
  "Verde-oliva": "#5f6b4c",
  "Azul-marinho": "#2f4560",
  "Preto elegante": "#26211f",
};
export const DEFAULT_ACCENT = ACCENT_PALETTE["Borgonha rosé"];
export function resolveAccent(value: string | undefined | null): string {
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (value && ACCENT_PALETTE[value]) return ACCENT_PALETTE[value];
  return DEFAULT_ACCENT;
}
