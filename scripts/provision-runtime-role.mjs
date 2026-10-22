import { randomBytes } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local", quiet: true });
const direct = new URL(process.env.DATABASE_URL_DIRECT ?? "");
if (!direct.hostname.endsWith(".neon.tech") || direct.pathname !== "/perplex" || !direct.username.endsWith("_owner")) {
  throw new Error("Run only against the dedicated perplex development database using its owner URL.");
}
const pool = new Pool({ connectionString: direct.toString(), max: 1 });
const password = randomBytes(32).toString("hex");
const role = "perplex_web";
try {
  const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
  if (exists.rowCount) throw new Error("Runtime role already exists. No credentials were changed.");
  // Identifiers are fixed; PostgreSQL quotes the generated password as a SQL literal.
  const creation = await pool.query("SELECT format('CREATE ROLE perplex_web LOGIN NOINHERIT NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text) AS statement", [password]);
  await pool.query("BEGIN");
  await pool.query(creation.rows[0].statement);
  await pool.query('GRANT CONNECT ON DATABASE perplex TO perplex_web');
  await pool.query('GRANT USAGE ON SCHEMA public TO perplex_web');
  await pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON "user", session, account, verification, rate_limit TO perplex_web');
  await pool.query('GRANT SELECT, INSERT ON app_users TO perplex_web');
  await pool.query('GRANT SELECT, INSERT, UPDATE ON conversations TO perplex_web');
  await pool.query('GRANT SELECT ON messages TO perplex_web');
  await pool.query(`GRANT SELECT, INSERT ON runs, usage_reservations, admission_attempt_buckets TO perplex_web;
    GRANT UPDATE (status, updated_at, attempt_version) ON runs TO perplex_web;
    GRANT UPDATE (attempts) ON admission_attempt_buckets TO perplex_web;
    GRANT SELECT ON usage_buckets, operator_usage_buckets TO perplex_web;
    GRANT UPDATE (reserved_credits, reserved_provider_micro_usd) ON usage_buckets TO perplex_web;
    GRANT UPDATE (reserved_provider_micro_usd) ON operator_usage_buckets TO perplex_web`);
  await pool.query("COMMIT");
  const runtimeUrl = new URL(process.env.DATABASE_URL);
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  const runtime = new Pool({ connectionString: runtimeUrl.toString(), max: 1 });
  try {
    const { rows } = await runtime.query(`SELECT
      has_schema_privilege(current_user,'public','CREATE') AS can_create,
      has_table_privilege(current_user,'public.session','TRUNCATE') AS can_truncate,
      has_table_privilege(current_user,'public.session','INSERT') AS can_insert`);
    if (rows[0].can_create || rows[0].can_truncate || !rows[0].can_insert) throw new Error("Unexpected runtime privileges");
  } finally { await runtime.end(); }
  const env = await readFile(".env.local", "utf8");
  await writeFile(".env.local.tmp", env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${JSON.stringify(runtimeUrl.toString())}`), { mode: 0o600 });
  await rename(".env.local.tmp", ".env.local");
  console.log("Runtime role verified: auth CRUD, conversation metadata DML and read-only history; no permanent schema creation or table truncation. Owner URL retained for migrations.");
} catch (error) {
  await pool.query("ROLLBACK");
  console.error(JSON.stringify({ event: "runtime_role.provision_failed", code: error.code ?? "SETUP_ERROR" }));
  process.exitCode = 1;
} finally { await pool.end(); }
