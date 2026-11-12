export const BAZAR_CATEGORIES = ["Vestido", "Blusa", "Calça", "Saia", "Conjunto", "Casaco e blazer", "Sapato", "Bolsa", "Acessório", "Fantasia", "Outros"];
const UNIT: Record<string, string> = { DIA: " / dia", EVENTO: " / evento", PECA: "" };
export function bazarPrice(cents: number, unit: string): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "")}${UNIT[unit] ?? ""}`;
}
export const BAZAR_KIND: Record<string, string> = { ALUGUEL: "Aluguel", BAZAR: "Bazar" };
