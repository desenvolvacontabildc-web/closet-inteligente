/** Opções e tipos do Skincare. Usado pela tela (chips), pela ação (validação e prompt) e pelo lembrete da Home. */
export type Opt = { value: string; label: string };

export const PELE: Opt[] = [
  { value: "SECA", label: "Seca" }, { value: "NORMAL", label: "Normal" },
  { value: "MISTA", label: "Mista (zona T oleosa)" }, { value: "OLEOSA", label: "Oleosa" },
];
export const SENSIBILIDADE: Opt[] = [
  { value: "NAO", label: "Não reage com facilidade" }, { value: "UM_POUCO", label: "Um pouco sensível" },
  { value: "MUITO", label: "Muito sensível (arde, avermelha)" },
];
export const TOM: Opt[] = [
  { value: "CLARA", label: "Clara" }, { value: "MORENA_CLARA", label: "Morena clara" },
  { value: "MORENA", label: "Morena" }, { value: "NEGRA", label: "Negra ou retinta" },
];
export const IDADE: Opt[] = [
  { value: "ATE_19", label: "Até 19" }, { value: "20_29", label: "20 a 29" }, { value: "30_39", label: "30 a 39" },
  { value: "40_49", label: "40 a 49" }, { value: "50_MAIS", label: "50 ou mais" },
];
export const QUEIXAS: Opt[] = [
  { value: "ACNE", label: "Acne ou espinhas" }, { value: "CRAVOS", label: "Cravos" }, { value: "POROS", label: "Poros dilatados" },
  { value: "OLEOSIDADE", label: "Oleosidade" }, { value: "RESSECAMENTO", label: "Ressecamento" }, { value: "DESCAMACAO", label: "Descamação" },
  { value: "MANCHAS", label: "Manchas" }, { value: "MELASMA", label: "Melasma" }, { value: "LINHAS", label: "Linhas finas e rugas" },
  { value: "FLACIDEZ", label: "Perda de firmeza" }, { value: "OLHEIRAS", label: "Olheiras" }, { value: "VERMELHIDAO", label: "Vermelhidão ou rosácea" },
  { value: "OPACA", label: "Pele sem brilho" }, { value: "CICATRIZES", label: "Marcas de acne" },
];
export const OBJETIVOS: Opt[] = [
  { value: "HIDRATAR", label: "Hidratar" }, { value: "ACNE", label: "Controlar a acne" }, { value: "MANCHAS", label: "Clarear manchas" },
  { value: "ANTIIDADE", label: "Prevenir sinais da idade" }, { value: "UNIFORMIZAR", label: "Uniformizar o tom" },
  { value: "LUMINOSIDADE", label: "Mais luminosidade" }, { value: "OLEOSIDADE", label: "Controlar a oleosidade" },
  { value: "ACALMAR", label: "Acalmar a pele" }, { value: "PREVENIR", label: "Só manter a pele saudável" },
];
export const ROTINA_ATUAL: Opt[] = [
  { value: "NENHUMA", label: "Quase nada" }, { value: "BASICA", label: "Sabonete e hidratante" },
  { value: "MEDIA", label: "Limpeza, hidratante e protetor" }, { value: "COMPLETA", label: "Rotina completa com séruns" },
];
export const ATIVOS_USADOS: Opt[] = [
  { value: "NENHUM", label: "Nenhum ativo" }, { value: "PROTETOR", label: "Protetor solar todo dia" }, { value: "VITAMINA_C", label: "Vitamina C" },
  { value: "RETINOIDE", label: "Retinol ou retinoide" }, { value: "ACIDOS", label: "Ácidos (glicólico, salicílico...)" },
  { value: "NIACINAMIDA", label: "Niacinamida" }, { value: "HIALURONICO", label: "Ácido hialurônico" },
];
export const MAQUIAGEM: Opt[] = [
  { value: "NUNCA", label: "Quase nunca" }, { value: "AS_VEZES", label: "Às vezes" }, { value: "DIARIO", label: "Quase todo dia" },
];
export const SOL: Opt[] = [
  { value: "POUCA", label: "Pouca (maior parte em ambiente fechado)" }, { value: "MODERADA", label: "Moderada" }, { value: "MUITA", label: "Muita (rua, praia, esporte)" },
];
export const TEMPO: Opt[] = [
  { value: "RAPIDA", label: "Rápida (até 3 passos)" }, { value: "MEDIA", label: "Média (4 a 5 passos)" }, { value: "COMPLETA", label: "Tenho tempo para uma rotina completa" },
];
export const ORCAMENTO: Opt[] = [
  { value: "ECONOMICO", label: "Econômico" }, { value: "MEDIO", label: "Intermediário" }, { value: "PREMIUM", label: "Premium" }, { value: "FLEXIVEL", label: "Tanto faz" },
];

/** Tipos de etapa (valor -> rótulo). */
export const SKIN_STEP_TYPES: Record<string, string> = {
  DEMAQUILANTE: "Demaquilante",
  LIMPEZA: "Limpeza",
  TONICO: "Tônico ou essência",
  SERUM: "Sérum",
  TRATAMENTO: "Tratamento",
  ESFOLIACAO: "Esfoliação",
  MASCARA: "Máscara",
  CONTORNO_OLHOS: "Área dos olhos",
  HIDRATANTE: "Hidratante",
  PROTETOR_SOLAR: "Protetor solar",
  LABIOS: "Lábios",
  PONTUAL: "Tratamento pontual",
};

export type SkinAnswers = {
  pele: string; sensibilidade: string; tom: string; idade: string;
  queixas: string[]; objetivos: string[]; rotina_atual: string; ativos: string[];
  maquiagem: string; sol: string; tempo: string; orcamento: string;
  gestante: boolean; dermato: boolean; alergias: string; produtos_atuais: string;
};
export type SkinStep = { id: string; tipo: string; titulo: string; como_fazer: string; preferir: string[]; evitar: string[]; exemplos: string[]; dias: number[] };
export type SkinPlan = {
  resumo: string; perfil: { rotulo: string; valor: string }[]; prioridades: string[];
  manha: SkinStep[]; noite: SkinStep[]; dicas: string[]; alerta: string; revisar_em_semanas: number;
};

export function labelOf(opts: Opt[], value: string): string { return opts.find((o) => o.value === value)?.label || value; }
export function labelsOf(opts: Opt[], values: string[]): string { return values.map((v) => labelOf(opts, v)).join(", "); }

// ---- datas no fuso do Brasil (a rotina é por dia local da usuária) ----
const TZ = "America/Sao_Paulo";
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export function dayStr(d: Date = new Date()): string { return d.toLocaleDateString("en-CA", { timeZone: TZ }); }
export function weekdayOf(day: string): number { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
export function addDays(day: string, n: number): string { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
export function hourNow(): number { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date())) % 24; }
/** A etapa vale hoje? (`dias` vazio = todos os dias) */
export function stepAppliesOn(step: SkinStep, weekday: number): boolean { return !step.dias.length || step.dias.includes(weekday); }
