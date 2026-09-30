export const CABELO_OPCOES = ["Preto", "Castanho escuro", "Castanho médio", "Castanho claro", "Ruivo", "Loiro escuro", "Loiro claro", "Grisalho/branco"];
export const TINGIDO_OPCOES = [
  { value: "nao", label: "Não, é a cor natural" },
  { value: "parecido", label: "Tingido, em tom parecido com o natural" },
  { value: "mudou", label: "Sim, mudei bastante a cor" },
];
export const OLHOS_OPCOES = ["Castanho escuro", "Castanho claro / mel", "Verde", "Azul", "Cinza", "Misto / heterocromia"];
export const BRONZEAMENTO_OPCOES = [
  { value: "queima_facil", label: "Queima fácil, quase não bronzeia" },
  { value: "queima_bronzeia", label: "Queima um pouco e depois bronzeia" },
  { value: "bronzeia_facil", label: "Bronzeia fácil, raramente queima" },
  { value: "pele_escura", label: "Já sou morena/negra, pele naturalmente escura" },
];
export const PROFUNDIDADE_PELE_SWATCHES = [
  { value: "muito_clara", label: "Muito clara", hex: "#F7E2CF" },
  { value: "clara", label: "Clara", hex: "#F0C9A6" },
  { value: "media_clara", label: "Média clara", hex: "#D9A876" },
  { value: "media", label: "Média", hex: "#B9814F" },
  { value: "media_profunda", label: "Média profunda", hex: "#8B5A34" },
  { value: "profunda", label: "Profunda", hex: "#4A2E1C" },
];
export const BRANCO_SWATCHES = [
  { value: "branco_puro", label: "Branco puro", hex: "#FFFFFF" },
  { value: "off_white", label: "Off-white / marfim", hex: "#F3ECDD" },
];
export const METAL_SWATCHES = [
  { value: "dourado", label: "Dourado", hex: "#D4AF37" },
  { value: "prateado", label: "Prateado", hex: "#C7C7C7" },
];
export const SUBTOM_OPCOES = [
  { value: "quente", label: "Quente" },
  { value: "frio", label: "Frio" },
  { value: "neutro", label: "Neutro" },
  { value: "nao_sei", label: "Não sei" },
];
export const INTENSIDADE_OPCOES = [
  { value: "suave", label: "Suave e amenizada", desc: "Cores levemente acinzentadas, discretas" },
  { value: "media", label: "Equilibrada", desc: "Nem muito viva nem muito discreta" },
  { value: "vibrante", label: "Viva e brilhante", desc: "Cores saturadas, de forte impacto" },
];
export const CONTRASTE_OPCOES = [
  { value: "baixo", label: "Baixo contraste", desc: "Cabelo, pele e olhos em tons parecidos de claridade" },
  { value: "medio", label: "Contraste médio", desc: "Diferença moderada entre cabelo, pele e olhos" },
  { value: "alto", label: "Alto contraste", desc: "Diferença marcante (ex.: cabelo escuro com pele clara)" },
];
export const CORES_PALETA = [
  { value: "preto", label: "Preto", hex: "#1C1C1C" },
  { value: "branco_puro", label: "Branco puro", hex: "#FFFFFF" },
  { value: "off_white", label: "Off-white", hex: "#F3ECDD" },
  { value: "cinza_claro", label: "Cinza claro", hex: "#C9C9C9" },
  { value: "cinza_chumbo", label: "Cinza chumbo", hex: "#4A4A4A" },
  { value: "marinho", label: "Azul-marinho", hex: "#1F2A44" },
  { value: "azul_royal", label: "Azul royal", hex: "#2A52BE" },
  { value: "azul_claro", label: "Azul claro", hex: "#A9C6E8" },
  { value: "turquesa", label: "Turquesa", hex: "#2FB4B0" },
  { value: "verde_esmeralda", label: "Verde esmeralda", hex: "#2E8B57" },
  { value: "verde_oliva", label: "Verde-oliva", hex: "#6B7A3A" },
  { value: "verde_menta", label: "Verde menta", hex: "#A8E4C0" },
  { value: "amarelo", label: "Amarelo", hex: "#F5D547" },
  { value: "mostarda", label: "Mostarda", hex: "#C9A227" },
  { value: "laranja", label: "Laranja", hex: "#E2703A" },
  { value: "coral", label: "Coral", hex: "#F1725A" },
  { value: "vermelho", label: "Vermelho", hex: "#C4342B" },
  { value: "vinho", label: "Vinho", hex: "#6E1F2A" },
  { value: "rosa_antigo", label: "Rosa antigo", hex: "#C98A93" },
  { value: "rosa_bebe", label: "Rosa bebê", hex: "#F4C6CE" },
  { value: "fucsia", label: "Fúcsia/magenta", hex: "#C2378A" },
  { value: "lilas", label: "Lilás", hex: "#B79FCB" },
  { value: "roxo", label: "Roxo", hex: "#5B3A87" },
  { value: "camel", label: "Camel/caramelo", hex: "#C08A4E" },
  { value: "marrom", label: "Marrom chocolate", hex: "#4B2E1E" },
  { value: "nude", label: "Nude/bege", hex: "#D9BFA0" },
  { value: "terracota", label: "Terracota", hex: "#B25A3B" },
];
export const NEUTROS_PALETA = CORES_PALETA.filter((c) =>
  ["preto", "branco_puro", "off_white", "cinza_claro", "cinza_chumbo", "marinho", "marrom", "camel", "nude"].includes(c.value),
);
