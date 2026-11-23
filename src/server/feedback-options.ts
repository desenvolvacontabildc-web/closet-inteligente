/** Perguntas do questionário de feedback (compartilhadas entre a tela das usuárias e o painel). */
export type Question =
  | { id: string; kind: "scale"; label: string; low: string; high: string; optional?: boolean }
  | { id: string; kind: "nps"; label: string }
  | { id: string; kind: "choice"; label: string; options: string[] }
  | { id: string; kind: "multi"; label: string; options: string[] }
  | { id: string; kind: "text"; label: string; placeholder?: string };

export const FEEDBACK_QUESTIONS: Question[] = [
  { id: "facil", kind: "scale", label: "Como foi usar o app no dia a dia?", low: "Difícil", high: "Muito fácil" },
  { id: "looks", kind: "scale", label: "Os looks sugeridos combinaram com você e com as suas peças?", low: "Nada", high: "Muito" },
  { id: "imagens", kind: "scale", label: "O que achou das imagens dos looks?", low: "Fraco", high: "Lindo", optional: true },
  { id: "foto", kind: "scale", label: "E o cadastro das peças pela foto?", low: "Trabalhoso", high: "Prático", optional: true },
  { id: "usou", kind: "multi", label: "Quais recursos você chegou a usar?", options: ["Cadastro de peças", "Cadastro rápido por foto", "Looks do dia", "Imagem do look", "Looks com peças novas", "Mala de viagem", "Colorimetria", "Skincare", "Cronograma capilar", "Bazar", "Vitrine"] },
  { id: "gostou", kind: "text", label: "O que você mais gostou?", placeholder: "Conte o que te encantou" },
  { id: "melhorar", kind: "text", label: "O que mais precisa melhorar?", placeholder: "Pode ser sincera, isso me ajuda muito" },
  { id: "erros", kind: "text", label: "Encontrou algum erro ou algo confuso?", placeholder: "Em qual tela e o que aconteceu" },
  { id: "falta", kind: "text", label: "Sentiu falta de alguma funcionalidade?", placeholder: "O que você gostaria de ter" },
  { id: "preco", kind: "choice", label: "Os planos (a partir de R$ 19,90 por mês) parecem...", options: ["Baratos", "Justos", "Um pouco caros", "Caros"] },
  { id: "assinar", kind: "choice", label: "Você pretende assinar?", options: ["Sim, no cartão recorrente", "Sim, no Pix", "Talvez", "Não"] },
  { id: "nps", kind: "nps", label: "De 0 a 10, o quanto você recomendaria o Closet Inteligente a uma amiga?" },
  { id: "depoimento", kind: "choice", label: "Posso usar o seu comentário como depoimento, com o seu nome?", options: ["Sim", "Sim, sem o meu nome", "Não"] },
];
