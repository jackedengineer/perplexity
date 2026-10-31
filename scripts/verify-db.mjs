import { databaseEnvironment } from "./database-environment.ts";
import { Pool } from "pg";
import {runtimePermissionQuery,assertRuntimePermissions} from "./database-permissions.ts";

const maintenance = databaseEnvironment();
for (const key of ["DATABASE_URL", "DATABASE_URL_DIRECT"]) {
  const pool = new Pool({ connectionString: maintenance[key], max: 1, connectionTimeoutMillis: 5000 });
  let phase = "CONNECT";
  try {
    const start = performance.now();
    const client = await pool.connect();
    try {
    const tls = client.connection.stream.encrypted === true && client.connection.stream.authorized === true;
    phase = "CATALOG";
    const result = await client.query(`SELECT
      current_setting('server_version_num')::integer AS version,
      (SELECT count(*)::integer FROM information_schema.tables
       WHERE table_schema='public' AND table_name IN ('user','session','account','verification','rate_limit','app_users','conversations','messages','runs','usage_buckets','operator_usage_buckets','usage_reservations','admission_attempt_buckets','input_safety_reviews','run_retrievals','run_sources','source_passages','provider_calls','output_safety_reviews','message_citations','run_settlements','provider_usage_resolutions','run_reconciliations','request_rate_buckets','run_plans','message_feedback')) AS tables`);
    phase = "PERMISSIONS";
    const permissions = await client.query(runtimePermissionQuery);
    if(key==='DATABASE_URL')assertRuntimePermissions(permissions.rows[0]);
    phase = "TLS_SCHEMA";
    if (!tls || result.rows[0].tables !== 26) throw new Error("Database check failed");
    console.log(JSON.stringify({ connection: key, ...result.rows[0], permissions: permissions.rows[0], verifiedTls: tls, connectAndQueryMs: Math.round(performance.now() - start) }));
    } finally { client.release(); }
  } catch {
    console.error(JSON.stringify({ connection: key, phase, error: "Database verification failed; check credentials, TLS and migrations." }));
    process.exitCode = 1;
  } finally { await pool.end(); }
}
