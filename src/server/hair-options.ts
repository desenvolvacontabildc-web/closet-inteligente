/** Opções do questionário do Cronograma Capilar. Usado pela tela (chips) e pelo servidor (validação e prompt). */
export type Opt = { value: string; label: string };

export const FIO: Opt[] = [
  { value: "LISO", label: "Liso" }, { value: "ONDULADO", label: "Ondulado" },
  { value: "CACHEADO", label: "Cacheado" }, { value: "CRESPO", label: "Crespo" },
];
export const ESPESSURA: Opt[] = [
  { value: "FINO", label: "Fio fino" }, { value: "MEDIO", label: "Fio médio" }, { value: "GROSSO", label: "Fio grosso" },
];
export const COMPRIMENTO: Opt[] = [
  { value: "CURTO", label: "Curto" }, { value: "MEDIO", label: "Na altura dos ombros" }, { value: "LONGO", label: "Longo" },
];
export const COURO: Opt[] = [
  { value: "OLEOSO", label: "Oleoso" }, { value: "NORMAL", label: "Normal" }, { value: "SECO", label: "Seco" },
  { value: "MISTO", label: "Raiz oleosa e pontas secas" }, { value: "SENSIVEL", label: "Sensível ou irritado" },
  { value: "DESCAMACAO", label: "Caspa ou descamação" },
];
export const QUIMICA: Opt[] = [
  { value: "NENHUMA", label: "Nenhuma (cabelo natural)" }, { value: "ALISAMENTO", label: "Progressiva, escova definitiva ou alisamento" },
  { value: "RELAXAMENTO", label: "Relaxamento" }, { value: "COLORACAO", label: "Coloração" },
  { value: "DESCOLORACAO", label: "Descoloração, mechas ou luzes" }, { value: "HENNA", label: "Henna" },
  { value: "ONDULACAO", label: "Permanente ou ondulação" },
];
export const TEMPO_QUIMICA: Opt[] = [
  { value: "NUNCA", label: "Nunca fiz química" }, { value: "MENOS_1", label: "Menos de 1 mês" },
  { value: "1_3", label: "1 a 3 meses" }, { value: "3_6", label: "3 a 6 meses" }, { value: "MAIS_6", label: "Mais de 6 meses" },
];
export const QUEIXAS: Opt[] = [
  { value: "RESSECADO", label: "Ressecado" }, { value: "QUEBRA", label: "Quebra" }, { value: "FRIZZ", label: "Frizz" },
  { value: "PONTAS", label: "Pontas duplas" }, { value: "QUEDA", label: "Queda" }, { value: "SEM_BRILHO", label: "Sem brilho" },
  { value: "SEM_VOLUME", label: "Pouco volume" }, { value: "VOLUME_EXCESSO", label: "Volume em excesso" },
  { value: "OLEOSIDADE", label: "Oleosidade na raiz" }, { value: "CACHO_MAL_DEFINIDO", label: "Cachos mal definidos" },
  { value: "CRESCIMENTO_LENTO", label: "Crescimento lento" }, { value: "EMARANHADO", label: "Embaraça muito" },
];
export const ELASTICIDADE: Opt[] = [
  { value: "VOLTA", label: "Estica um pouco e volta ao normal" },
  { value: "NAO_VOLTA", label: "Estica muito e não volta (fica mole)" },
  { value: "QUEBRA", label: "Quebra logo ao esticar" },
  { value: "NAO_SEI", label: "Não sei / não testei" },
];
export const POROSIDADE: Opt[] = [
  { value: "BAIXA", label: "Boia na água" }, { value: "MEDIA", label: "Fica no meio" },
  { value: "ALTA", label: "Afunda rápido" }, { value: "NAO_SEI", label: "Não sei / não testei" },
];
export const LAVAGEM: Opt[] = [
  { value: "DIARIA", label: "Todo dia" }, { value: "3_4", label: "3 a 4 vezes por semana" },
  { value: "2", label: "2 vezes por semana" }, { value: "1", label: "1 vez por semana" }, { value: "MENOS", label: "Menos de 1 vez por semana" },
];
export const CALOR: Opt[] = [
  { value: "NUNCA", label: "Nunca uso" }, { value: "AS_VEZES", label: "Às vezes" }, { value: "SEMPRE", label: "Quase sempre" },
];
export const SOL: Opt[] = [
  { value: "POUCA", label: "Pouca" }, { value: "MODERADA", label: "Moderada" }, { value: "MUITA", label: "Muita (sol, praia ou piscina)" },
];
export const OBJETIVOS: Opt[] = [
  { value: "HIDRATAR", label: "Hidratar" }, { value: "RECUPERAR", label: "Recuperar danos" }, { value: "CRESCER", label: "Crescer com saúde" },
  { value: "QUEDA", label: "Reduzir a queda" }, { value: "FRIZZ", label: "Controlar o frizz" }, { value: "CACHOS", label: "Definir cachos ou ondas" },
  { value: "BRILHO", label: "Dar brilho" }, { value: "VOLUME", label: "Ganhar volume" }, { value: "COR", label: "Manter a cor" },
  { value: "TRANSICAO", label: "Transição capilar" }, { value: "OLEOSIDADE", label: "Controlar a oleosidade" },
];
export const VEZES_SEMANA: Opt[] = [
  { value: "1", label: "1 vez" }, { value: "2", label: "2 vezes" }, { value: "3", label: "3 vezes" }, { value: "4", label: "4 vezes ou mais" },
];
export const ORCAMENTO: Opt[] = [
  { value: "ECONOMICO", label: "Econômico" }, { value: "MEDIO", label: "Intermediário" },
  { value: "PREMIUM", label: "Premium" }, { value: "FLEXIVEL", label: "Tanto faz" },
];

/** Tipos de etapa que a IA pode usar no cronograma (valor -> rótulo). */
export const STEP_TYPES: Record<string, string> = {
  HIDRATACAO: "Hidratação",
  NUTRICAO: "Nutrição",
  RECONSTRUCAO: "Reconstrução",
  LIMPEZA_PROFUNDA: "Limpeza profunda",
  COURO_CABELUDO: "Cuidado do couro cabeludo",
  FINALIZACAO: "Finalização e proteção",
};

export type Answers = {
  fio: string; espessura: string; comprimento: string; couro: string;
  quimica: string[]; tempo_quimica: string; queixas: string[];
  elasticidade: string; porosidade: string; lavagem: string; calor: string; sol: string;
  objetivos: string[]; vezes_semana: string; orcamento: string;
  gestante: boolean; alergias: string; produtos_atuais: string;
};

export type HairStep = { id: string; tipo: string; titulo: string; como_fazer: string; preferir: string[]; evitar: string[]; exemplos: string[] };
export type HairWeek = { numero: number; foco: string; etapas: HairStep[] };
export type HairPlan = {
  resumo: string; perfil: { rotulo: string; valor: string }[]; prioridades: string[];
  justificativa_periodo: string; semanas: HairWeek[]; dicas: string[]; alerta: string;
};

export function labelOf(opts: Opt[], value: string): string {
  return opts.find((o) => o.value === value)?.label || value;
}
export function labelsOf(opts: Opt[], values: string[]): string {
  return values.map((v) => labelOf(opts, v)).join(", ");
}
