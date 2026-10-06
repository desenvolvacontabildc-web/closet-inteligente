export const PARTNER_PACKAGE_LIMIT: Record<string, number | null> = { BASICA: 10, PLUS: 30, PREMIUM: null };
export const PARTNER_PACKAGE_LABEL: Record<string, string> = { BASICA: "Vitrine Básica (até 10 peças)", PLUS: "Vitrine Plus (até 30 peças)", PREMIUM: "Vitrine Premium (peças ilimitadas)" };
/** Imagens que a loja pode gerar por mês no Provador, por pacote. */
export const PARTNER_PACKAGE_IMAGE_LIMIT: Record<string, number> = { BASICA: 10, PLUS: 30, PREMIUM: 100 };
export const PROVADOR_MODEL_LABEL: Record<string, string> = { MINHA_FOTO: "Com a minha foto", MODELO: "Modelo aleatória", MANEQUIM: "Manequim de vitrine" };
