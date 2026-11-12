export const BAZAR_CATEGORIES = ["Vestido", "Blusa", "Calça", "Saia", "Conjunto", "Casaco e blazer", "Sapato", "Bolsa", "Acessório", "Fantasia", "Outros"];
const UNIT: Record<string, string> = { DIA: " / dia", EVENTO: " / evento", PECA: "" };
export function bazarPrice(cents: number, unit: string): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "")}${UNIT[unit] ?? ""}`;
}
/** Sugere a categoria do Bazar a partir da categoria (texto livre) da peça no closet. */
export function guessBazarCategory(closetCategory: string): string {
  const c = (closetCategory || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const rules: [RegExp, string][] = [
    [/vestido/, "Vestido"], [/blusa|camisa|camiseta|top|regata|cropped|body|malha|suet/, "Blusa"], [/calca|jeans|short|bermuda|legging/, "Calça"],
    [/saia/, "Saia"], [/conjunto|macacao|macaquinho/, "Conjunto"], [/casaco|blazer|jaqueta|colete|cardigan|kimono|sobretudo/, "Casaco e blazer"],
    [/sapato|sandalia|tenis|bota|sapatilha|salto|rasteira|chinelo/, "Sapato"], [/bolsa|mochila|clutch|carteira/, "Bolsa"],
    [/colar|brinco|cinto|lenco|oculos|bijou|pulseira|anel|chapeu|acessor/, "Acessório"], [/fantasia/, "Fantasia"],
  ];
  for (const [re, label] of rules) if (re.test(c)) return label;
  return "Outros";
}
export const BAZAR_KIND: Record<string, string> = { ALUGUEL: "Aluguel", BAZAR: "Bazar" };
