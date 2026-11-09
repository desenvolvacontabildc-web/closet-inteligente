import type { Metadata } from "next";
import { getPool } from "@/server/db";
import Apresentacao, { type PresData } from "@/components/apresentacao";

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

export default async function Page() {
  return <Apresentacao data={await load()} />;
}
