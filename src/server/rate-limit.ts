import "server-only";

/** Limite de tentativas de login, em memória (uma instância do servidor). Protege contra adivinhação de senha:
 * por e-mail (6 erros em 15 min) e por endereço de rede (30 erros em 15 min). Zera a cada deploy, o que é aceitável. */
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { email: 6, ip: 30 };
const fails = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (fails.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) fails.set(key, list); else fails.delete(key);
  return list;
}
export type LoginKeys = { email: string; ip: string };
export const loginKeys = (email: string, ip: string): LoginKeys => ({ email: `e:${email.toLowerCase()}`, ip: `ip:${ip || "?"}` });

export function loginBlocked(k: LoginKeys): boolean {
  const now = Date.now();
  return recent(k.email, now).length >= LIMITS.email || recent(k.ip, now).length >= LIMITS.ip;
}
export function loginFailed(k: LoginKeys): void {
  const now = Date.now();
  for (const key of [k.email, k.ip]) fails.set(key, [...recent(key, now), now]);
  if (fails.size > 5000) for (const key of fails.keys()) { if (!recent(key, now).length) fails.delete(key); }
}
export function loginOk(k: LoginKeys): void { fails.delete(k.email); }
