export const TRANSPORTE_OPCOES = ["Avião", "Carro", "Ônibus", "Cruzeiro", "Outro"];
export const BAGAGEM_OPCOES = ["Item pessoal", "Mala de mão", "Mala média", "Mala grande/despachada", "Ainda não sei"];
export const SENSIBILIDADE_OPCOES = ["Sinto mais frio", "Temperatura normal", "Sinto mais calor"];
export const OBJETIVO_OPCOES = [
  { value: "PASSEIO", label: "Passeio / lazer", desc: "Viagem para descansar, passear e curtir." },
  { value: "TRABALHO", label: "Trabalho", desc: "Viagem a trabalho: reuniões, eventos e compromissos profissionais." },
  { value: "MISTO", label: "Trabalho e passeio", desc: "Compromissos profissionais e também tempo livre para passear." },
];
export const PERIODO_OPCOES = [{ value: "DIA", label: "De dia" }, { value: "NOITE", label: "À noite" }];
export const EVENTO_TIPOS = [
  "Reunião", "Seminário / congresso", "Almoço de negócios", "Jantar de negócios", "Jantar formal", "Jantar casual",
  "Almoço", "Casamento", "Festa / balada", "Evento social", "Palestra / apresentação", "Passeio especial", "Praia / piscina", "Outro",
];
/** Atividades de lazer (os compromissos agora são cadastrados um a um, com período e dress code). */
export const LAZER_OPCOES = ["Passeios turísticos", "Compras", "Praia/piscina", "Academia/atividade física", "Igreja", "Vida noturna", "Dia casual", "Outro"];
export const DRESS_CODE_OPCOES = ["Casual", "Casual elegante", "Executivo/profissional", "Esporte fino", "Social", "Formal", "Festa", "Outro"];
export const ESTILO_OPCOES = ["Elegante", "Sofisticada", "Profissional", "Moderna", "Feminina", "Criativa", "Casual", "Descontraída", "Minimalista", "Marcante", "Confortável"];
export const PRIORIDADE_OPCOES = ["Máximo conforto", "Equilíbrio entre conforto e elegância", "Produções mais elaboradas"];
export const REPETICAO_OPCOES = ["Quero repetir o mínimo possível", "Posso repetir peças estratégicas", "Quero uma mala bem enxuta e não me importo em repetir"];
export const LAVANDERIA_OPCOES = ["Sim", "Não", "Talvez"];
export const ESTRATEGIA_OPCOES = [
  { value: "ESSENCIAL", label: "Mala essencial", desc: "A menor quantidade possível de peças, com máximo reaproveitamento." },
  { value: "EQUILIBRADA", label: "Mala equilibrada", desc: "Boa variedade de looks sem levar peças em excesso." },
  { value: "MAIS_OPCOES", label: "Mala com mais opções", desc: "Mais alternativas de looks e menor necessidade de repetição." },
];
export const NECESSIDADE_OPCOES = ["Vou caminhar bastante", "Possibilidade de chuva", "Muito frio", "Muito calor", "Praia/piscina", "Academia", "Evento formal", "Trabalho", "Longos deslocamentos", "Mudanças grandes de temperatura", "Nenhuma", "Outra"];
export const INCLUIR_OPCOES = ["Roupas", "Sapatos", "Bolsas", "Acessórios", "Joias/bijuterias", "Beleza e maquiagem", "Skincare", "Cabelo", "Higiene pessoal", "Outros itens de viagem"];
export const CHECKLIST_TEMPLATE = ["Partes de cima", "Partes de baixo", "Vestidos", "Terceiras peças", "Sapatos", "Bolsas", "Acessórios", "Roupa íntima", "Pijama", "Beleza", "Higiene", "Medicamentos pessoais", "Eletrônicos/carregadores", "Documentos"];

export type TripEvent = { id: string; tipo: string; periodo: "DIA" | "NOITE"; dress_code: string; detalhe: string };
