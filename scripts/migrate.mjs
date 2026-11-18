import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

const password = process.env.DB_APP_PASSWORD;
if (!password || password.length < 32) {
  throw new Error("DB_APP_PASSWORD precisa ter pelo menos 32 caracteres.");
}
const client = new pg.Client({ connectionTimeoutMillis: 10000 });
let phase = "conexão";
try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(736201)");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
  for (const name of files) {
    const sql = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await client.query("SELECT checksum FROM schema_migrations WHERE name = $1", [name]);
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`Migration alterada após aplicação: ${name}`);
      continue;
    }
    phase = `migration ${name}`;
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)", [name, checksum]);
      await client.query("COMMIT");
      console.log(`Migration aplicada: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  // PostgreSQL role passwords cannot be query parameters. Quote the literal;
  // never print this command or raw database errors containing its contents.
  phase = "senha do papel closet_app";
  const literal = "'" + password.replaceAll("'", "''") + "'";
  await client.query("SET standard_conforming_strings = on");
  await client.query(`ALTER ROLE closet_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${literal}`);
  console.log("Migrations concluídas.");
} catch (error) {
  console.error(`Falha nas migrations (etapa: ${phase}).`);
  // Erros de SQL das migrations não carregam segredos e dizem exatamente o que falhou. O da etapa da senha pode citar o comando, então fica omitido.
  if (phase.startsWith("migration ") || phase === "conexão") console.error(`Motivo: ${error?.message || error}${error?.position ? ` (posição ${error.position})` : ""}`);
  else console.error("Detalhes omitidos para não expor segredos.");
  process.exitCode = 1;
} finally {
  await client.end(); // also releases the advisory lock
}
