import "server-only";
import { Pool } from "pg";

const globalDb = globalThis as unknown as { closetPool?: Pool };

export function getPool(): Pool {
  if (!process.env.PGHOST || !process.env.PGDATABASE ||
      !process.env.PGUSER || !process.env.PGPASSWORD) {
    throw new Error("Configuração PostgreSQL incompleta.");
  }
  globalDb.closetPool ??= new Pool({
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  return globalDb.closetPool;
}
