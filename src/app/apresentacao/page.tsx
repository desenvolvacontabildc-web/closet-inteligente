import type { Metadata } from "next";
import { getPool } from "@/server/db";
import Apresentacao, { type PresData, type PresCta } from "@/components/apresentacao";
import { WAITLIST_URL } from "@/components/support";

const TITLE = "Closet Inteligente: veja como funciona";
const DESC = "Looks com as suas peças, mala de viagem, cores, skincare e cabelo, tudo em um app. Teste grátis por 7 dias, sem cartão.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://closet.desenvolvacontabil.com.br"),
  title: TITLE,
  description: DESC,
  openGraph: { title: TITLE, description: DESC, type: "website", locale: "pt_BR", images: [{ url: "/apresentacao/og.jpg", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: ["/apresentacao/og.jpg"] },
};
export const dynamic = "force-dynamic";

const NAMES: Record<string, string> = { ARRUMADA: "Arrumada", FASHION: "Fashion", SUPER_STAR: "Super Star" };

/** Preços e limites vêm do banco (os mesmos da tela de Assinatura), para a apresentação nunca ficar desatualizada.
 * Qualquer falha cai para um texto sem números. */
async function load(): Promise<PresData> {
  try {
    const pool = getPool();
    const plans = [];
    for (const p of ["ARRUMADA", "FASHION", "SUPER_STAR"]) {
      const pr = (await pool.query("SELECT base_price_cents, promo_price_cents, promo_months FROM get_plan_pricing($1)", [p])).rows[0];
      const cfg = (await pool.query("SELECT ai_ops_monthly_limit, image_gen_monthly_limit FROM get_plan_config($1)", [p])).rows[0];
      const std = (await pool.query("SELECT get_standard_limit($1) l", [p])).rows[0]?.l ?? null;
      plans.push({ plan: p, name: NAMES[p], price: pr.base_price_cents, promo: pr.promo_price_cents, promoMonths: pr.promo_months, ai: cfg?.ai_ops_monthly_limit ?? null, img: cfg?.image_gen_monthly_limit ?? null, std });
    }
    const cu = (await pool.query("SELECT price_cents FROM extra_price_info('CUIDESE')")).rows[0]?.price_cents ?? null;
    const col = (await pool.query("SELECT price_cents FROM extra_price_info('COLORIMETRIA')")).rows[0]?.price_cents ?? null;
    const packMin = (await pool.query("SELECT min(price_cents) m FROM list_credit_packs()")).rows[0]?.m ?? null;
    return { plans, cuidese: cu, colorimetria: col, packMin };
  } catch (e) {
    console.error("apresentacao: falha ao ler precos:", e);
    return null;
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ cupom?: string }> }) {
  const { cupom } = await searchParams;
  const code = /^[A-Za-z0-9_-]{3,32}$/.test(cupom || "") ? cupom!.toLowerCase() : "";
  let valid = false, inviteOnly = true;
  try {
    const pool = getPool();
    inviteOnly = (await pool.query("SELECT get_signup_mode() m")).rows[0]?.m === "INVITE";
    if (code) valid = ((await pool.query("SELECT check_offer($1) m", [code])).rows[0]?.m ?? "x") === ""; // '' = código válido
  } catch (e) { console.error("apresentacao: falha ao conferir o modo de cadastro:", e); }
  // Com código válido: cadastro com o código. Sem código: lista de espera (modo por convite) ou cadastro aberto.
  const cta: PresCta = valid
    ? { href: `/?cupom=${encodeURIComponent(code)}#criar-conta`, label: "Criar minha conta grátis", short: "Criar minha conta", sub: "Crie a sua conta em um minuto e comece o seu teste.", external: false }
    : inviteOnly
      ? { href: WAITLIST_URL, label: "Entrar na lista de espera", short: "Lista de espera", sub: "As vagas do teste esgotaram. Entre na lista de espera e seja avisada quando abrirem novas vagas.", external: true }
      : { href: "/#criar-conta", label: "Criar minha conta grátis", short: "Criar minha conta", sub: "Crie a sua conta em um minuto e teste tudo por 7 dias, sem cartão.", external: false };
  return <Apresentacao data={await load()} cta={cta} />;
}
