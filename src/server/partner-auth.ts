"use server";
import { randomBytes, createHash, scrypt as sc, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { getPool } from "./db";
const scrypt = promisify(sc);
const PARTNER_COOKIE = "closet_partner_session";
const COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
async function makeHash(p: string) { if (p.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres."); const salt = randomBytes(16), key = (await scrypt(p, salt, 64)) as Buffer; return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`; }
async function checkHash(p: string, v: string | null) { if (!v?.startsWith("scrypt$")) return false; const [, s, k] = v.split("$"); const key = (await scrypt(p, Buffer.from(s, "hex"), 64)) as Buffer; return key.length === k.length / 2 && timingSafeEqual(key, Buffer.from(k, "hex")); }
const hashToken = (v: string) => createHash("sha256").update(v).digest("hex");

/** Resolve a identidade da parceira só a partir do cookie próprio, nunca de um id vindo do cliente. */
export async function withPartner<T>(work: (c: PoolClient, partnerId: string, storeName: string, pkg: string, approved: boolean) => Promise<T>): Promise<T | null> {
  const token = (await cookies()).get(PARTNER_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const c = await getPool().connect();
  try {
    const s = await c.query("SELECT * FROM partner_resolve_session($1)", [hashToken(token)]);
    if (!s.rowCount) return null;
    const { partner_id, store_name, package: pkg, approved } = s.rows[0];
    return await work(c, partner_id, store_name, pkg, approved);
  } finally { c.release(); }
}

export async function partnerRegister(f: FormData) {
  const storeName = String(f.get("store_name") || "").trim();
  const email = String(f.get("email") || "").trim().toLowerCase();
  const instagram = String(f.get("instagram") || "").trim();
  const whatsapp = String(f.get("whatsapp") || "").trim();
  const pkg = String(f.get("package") || "BASICA");
  const ph = await makeHash(String(f.get("password") || ""));
  if (!storeName || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe o nome da loja e um e-mail válido.");
  const c = await getPool().connect();
  try {
    const id = (await c.query("SELECT partner_register($1,$2,$3,$4,$5,$6) id", [storeName, email, ph, instagram, whatsapp, pkg])).rows[0].id;
    const t = randomBytes(32).toString("base64url");
    await c.query("SELECT partner_create_session($1,$2)", [hashToken(t), id]);
    (await cookies()).set(PARTNER_COOKIE, t, COOKIE_OPTS);
  } catch (e) {
    if ((e as any).code === "23505") throw new Error("Este e-mail já está cadastrado como parceira.");
    throw e;
  } finally { c.release(); }
  redirect("/parceiras/painel?novo=1");
}

export async function partnerLogin(f: FormData) {
  const email = String(f.get("email") || "").trim().toLowerCase();
  const p = String(f.get("password") || "");
  const c = await getPool().connect();
  try {
    const q = await c.query("SELECT id,password_hash FROM partner_lookup_login($1)", [email]);
    if (!q.rowCount || !(await checkHash(p, q.rows[0].password_hash))) redirect("/parceiras?error=credentials");
    const t = randomBytes(32).toString("base64url");
    await c.query("SELECT partner_create_session($1,$2)", [hashToken(t), q.rows[0].id]);
    (await cookies()).set(PARTNER_COOKIE, t, COOKIE_OPTS);
  } finally { c.release(); }
  redirect("/parceiras/painel");
}

export async function partnerLogout() {
  const token = (await cookies()).get(PARTNER_COOKIE)?.value;
  if (token) { const c = await getPool().connect(); try { await c.query("SELECT partner_logout($1)", [hashToken(token)]); } finally { c.release(); } }
  (await cookies()).delete(PARTNER_COOKIE);
  redirect("/parceiras");
}
