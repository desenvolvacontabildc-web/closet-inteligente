export const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Em teste", ACTIVE: "Ativa", PAST_DUE: "Em atraso", SUSPENDED: "Suspensa",
  TRIAL_EXPIRED: "Teste encerrado", BLOCKED: "Bloqueada", CANCELED: "Cancelada",
};
export const PLAN_LABEL: Record<string, string> = { ARRUMADA: "Arrumada", FASHION: "Fashion", SUPER_STAR: "Super Star" };
export const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
export const brlInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
