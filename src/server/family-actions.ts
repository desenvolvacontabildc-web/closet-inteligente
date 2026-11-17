"use server";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPool } from "./db";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "./auth";
import { withProfile } from "./profile-session";
import { bounce } from "./action-error";
import { flash } from "./flash";
import { createPixPayment } from "./mercadopago";
import { isClosetType } from "./closet-type";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const UUID = /^[0-9a-f-]{36}$/i;
const PLANS = ["ARRUMADA", "FASHION", "SUPER_STAR"];
const KNOWN = ["Dê um nome ao closet", "Cada conta pode ter até 5 closets", "Tipo de closet inválido", "Plano inválido", "Idade inválida"];

/** Cria um closet extra na mesma conta (ex.: o do filho). Tem plano e pagamento próprios, que podem ser pagos juntos no Pix. */
export async function addCloset(f: FormData) {
  const name = String(f.get("name") || "").trim().slice(0, 40);
  const type = String(f.get("closet_type") || "");
  const plan = String(f.get("plan") || "ARRUMADA");
  const ageRaw = String(f.get("closet_age") || "").trim();
  const age = ageRaw === "" ? null : Math.floor(Number(ageRaw));
  if (!name) bounce("/perfil#closets", "Dê um nome ao closet (por exemplo, o nome da criança).");
  if (!isClosetType(type)) bounce("/perfil#closets", "Escolha o tipo do closet.");
  if (!PLANS.includes(plan)) bounce("/perfil#closets", "Escolha um plano.");
  let id: string | null = null;
  try {
    id = await withProfile(async (c, userId) => (await c.query("SELECT add_child_closet($1,$2,$3,$4,$5) id", [userId, name, type, type === "INFANTIL" ? age : null, plan])).rows[0].id as string, { allowSuspended: true });
  } catch (e: any) {
    const m = String(e?.message || "");
    console.error("addCloset falhou:", m);
    bounce("/perfil#closets", KNOWN.some((k) => m.includes(k)) ? m : "Não foi possível criar o closet agora. Tente de novo em instantes.");
  }
  if (!id) redirect("/");
  await flash("Closet criado. Toque em Entrar para usá-lo.");
  redirect("/perfil#closets");
}

/** Troca de closet: a sessão passa a ser a do closet escolhido (da mesma conta). */
export async function switchCloset(f: FormData) {
  const target = String(f.get("closet_id") || "");
  const back = String(f.get("back") || "/home");
  if (!UUID.test(target)) redirect("/perfil");
  const ok = await withProfile(async (c, userId) => !!(await c.query("SELECT family_can_switch($1,$2) ok", [userId, target])).rows[0]?.ok, { allowSuspended: true });
  if (!ok) redirect("/perfil");
  const token = randomBytes(32).toString("base64url");
  await getPool().query("SELECT create_auth_session($1,$2)", [hash(token), target]);
  (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  redirect(/^\/[a-z0-9/_-]*$/i.test(back) ? back : "/home");
}

const needsPay = (m: any) => m.status !== "ACTIVE" || (m.payment_method === "PIX" && m.current_period_end && new Date(m.current_period_end).getTime() - Date.now() < 5 * 86400000);

/** Pix único para os closets marcados: cada um é ativado com o seu plano quando o pagamento é confirmado. */
export async function startFamilyPix(f: FormData) {
  const wanted = f.getAll("closet_id").map(String).filter((v) => UUID.test(v));
  const ctx = await withProfile(async (c, userId) => {
    const fam = (await c.query("SELECT * FROM my_family($1)", [userId])).rows as any[];
    const ids = wanted.length ? wanted : fam.filter(needsPay).map((m) => m.user_id as string);
    if (ids.length === 0) return { ok: false as const, message: "Todos os closets já estão em dia." };
    let cover: any;
    try { cover = (await c.query("SELECT family_cover($1,$2::uuid[]) v", [userId, ids])).rows[0].v; }
    catch (e: any) { return { ok: false as const, message: String(e?.message || "").includes("inválido") ? "Closet inválido." : "Escolha ao menos um closet." }; }
    const email = (await c.query("SELECT email FROM app_users WHERE id=closet_family_root($1)", [userId])).rows[0]?.email as string;
    const plan = String(fam.find((m) => m.user_id === userId)?.plan || "ARRUMADA");
    return { ok: true as const, userId, email, cover, plan, n: ids.length };
  }, { allowSuspended: true });
  if (!ctx) redirect("/assinatura");
  if (!ctx.ok) bounce("/assinatura", ctx.message);
  const total = Number(ctx.cover.total_cents);
  if (!(total > 0)) bounce("/assinatura", "Não foi possível calcular o valor agora.");

  let charge;
  try {
    charge = await createPixPayment({
      amountCents: total, description: `Closet Inteligente - ${ctx.n} closet${ctx.n === 1 ? "" : "s"}`,
      payerEmail: ctx.email, externalReference: ctx.userId, idempotencyKey: randomUUID(),
    });
  } catch (e) {
    console.error("startFamilyPix falhou:", e);
    bounce("/assinatura", "Não foi possível gerar a cobrança Pix agora. Tente de novo em instantes.");
  }
  await withProfile(async (c, userId) => {
    await c.query("SELECT create_payment_charge($1,'PIX',$2,$3,$4,$5,$6,$7)", [userId, ctx.plan, total, charge.id, charge.qrCode, charge.qrCodeBase64, charge.expiresAt]);
    await c.query("SELECT tag_charge_covers($1,$2,$3::jsonb)", [userId, charge.id, JSON.stringify(ctx.cover.covers)]);
    return true;
  }, { allowSuspended: true });
  await flash("Pix gerado. Escaneie o QR code ou copie o código para pagar.");
  redirect("/assinatura?charge=pix");
}
