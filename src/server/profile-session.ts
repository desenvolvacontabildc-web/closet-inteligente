import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "./db";
import { SESSION_COOKIE } from "./auth";

/** Resolve identity only from the HttpOnly session, and scope RLS to one transaction. */
export async function withProfile<T>(work: (c: PoolClient, userId: string) => Promise<T>): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const c = await getPool().connect();
  let discard = false;
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.session_hash',$1,true)", [createHash("sha256").update(token).digest("hex")]);
    const s = await c.query("SELECT * FROM resolve_session(current_setting('app.session_hash'))");
    if (!s.rowCount) { await c.query("ROLLBACK"); return null; }
    const { user_id, tenant_id } = s.rows[0];
    await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)", [user_id, tenant_id]);
    const result = await work(c, user_id);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { discard = true; }
    throw e;
  } finally { c.release(discard); }
}
