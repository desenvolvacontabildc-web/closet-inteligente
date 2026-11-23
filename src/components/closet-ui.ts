/** Textos do menu e da tela inicial que mudam conforme o tipo de closet (feminino, masculino ou infantil). Sem dependências de servidor: pode ser usado em qualquer componente. */
export type UiKind = "FEMININO" | "MASCULINO" | "INFANTIL";

export const asKind = (v: unknown): UiKind => (v === "MASCULINO" || v === "INFANTIL" ? v : "FEMININO");

export type UiCopy = {
  nav: { closet: string; looks: string; vitrine: string };
  spark: string;
  welcomeEyebrow: string;
  startPieces: string;
  dayLook: string;
  quick: { look: string; wish: string; analyze: string; add: string; vitrine: string; bazar: string; trip: string };
};

const FEM: UiCopy = {
  nav: { closet: "Meu Closet", looks: "Looks", vitrine: "Vitrine" },
  spark: "✦",
  welcomeEyebrow: "SEU CLOSET ESTÁ PRONTO",
  startPieces: "Cadastre pelo menos 8 peças (de preferência com uma foto sua vestindo cada uma).",
  dayLook: "Look para hoje",
  quick: { look: "Criar look", wish: "Looks com peças novas", analyze: "Analisar meu look", add: "Adicionar peças", vitrine: "Comprar com desconto", bazar: "Bazar e aluguel", trip: "Mala de viagem" },
};

const COPY: Record<UiKind, UiCopy> = {
  FEMININO: FEM,
  MASCULINO: {
    ...FEM,
    nav: { closet: "Meu Closet", looks: "Looks", vitrine: "Compras" },
    spark: "◆",
    welcomeEyebrow: "SEU GUARDA-ROUPA ESTÁ PRONTO",
    startPieces: "Cadastre pelo menos 8 peças (camisas, calças, bermudas, sapatos e o que mais você usa). Uma foto sua vestindo cada uma ajuda.",
    dayLook: "Look de hoje",
    quick: { look: "Montar look", wish: "O que vale comprar", analyze: "Analisar meu look", add: "Adicionar peças", vitrine: "Comprar com desconto", bazar: "Bazar e aluguel", trip: "Mala de viagem" },
  },
  INFANTIL: {
    nav: { closet: "Armário", looks: "Looks", vitrine: "Compras" },
    spark: "★",
    welcomeEyebrow: "O ARMÁRIO DA PEQUENA ESTÁ PRONTO",
    startPieces: "Cadastre pelo menos 8 peças (vestidos, shorts, blusinhas, tênis e laços). Fotografe cada peça aberta sobre a cama ou no cabide.",
    dayLook: "Look do dia dela",
    quick: { look: "Montar look", wish: "O que vale comprar", analyze: "Analisar um look", add: "Adicionar peças", vitrine: "Comprar com desconto", bazar: "Bazar e aluguel", trip: "Mala de viagem" },
  },
};

export const uiCopy = (kind: unknown): UiCopy => COPY[asKind(kind)];
