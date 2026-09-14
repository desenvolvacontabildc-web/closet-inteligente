import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import { getPool } from "./db";

export const SESSION_COOKIE = "closet_session";
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Future authenticated routes must use this boundary, never a supplied user ID.
 * Tokens are random 32-byte base64url values; only SHA-256 hashes are stored.
 * Session creation/login/logout are deliberately outside Sprint 0.
 */
export async function withTenant<T>(
  tenantId: string,
  work: (client: PoolClient, userId: string) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error("Tenant inválido.");
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error("Autenticação necessária.");
  }
  const client = await getPool().connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    const role = await client.query<{ unsafe: boolean }>(
      "SELECT rolsuper OR rolbypassrls OR rolname <> 'closet_app' AS unsafe FROM pg_roles WHERE rolname = current_user",
    );
    if (role.rows[0]?.unsafe !== false) throw new Error("Papel de banco inadequado para a aplicação.");
    await client.query("SELECT set_config('app.session_hash', $1, true)", [
      createHash("sha256").update(token).digest("hex"),
    ]);
    const session = await client.query<{ user_id: string }>(
      "SELECT user_id FROM auth_sessions WHERE token_hash = current_setting('app.session_hash') AND expires_at > now()",
    );
    const userId = session.rows[0]?.user_id;
    if (!userId) throw new Error("Sessão inválida ou expirada.");
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)",
      [userId, tenantId],
    );
    const membership = await client.query(
      "SELECT 1 FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2",
      [userId, tenantId],
    );
    if (!membership.rowCount) throw new Error("Acesso ao tenant negado.");
    const result = await work(client, userId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
