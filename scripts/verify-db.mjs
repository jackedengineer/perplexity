import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local", quiet: true });
for (const key of ["DATABASE_URL", "DATABASE_URL_DIRECT"]) {
  const pool = new Pool({ connectionString: process.env[key], max: 1, connectionTimeoutMillis: 5000 });
  try {
    const start = performance.now();
    const client = await pool.connect();
    try {
    const tls = client.connection.stream.encrypted === true && client.connection.stream.authorized === true;
    const result = await client.query(`SELECT
      current_setting('server_version_num')::integer AS version,
      (SELECT count(*)::integer FROM information_schema.tables
       WHERE table_schema='public' AND table_name IN ('user','session','account','verification','rate_limit','app_users','conversations','messages','runs','usage_buckets','operator_usage_buckets','usage_reservations','admission_attempt_buckets','input_safety_reviews')) AS tables`);
    const permissions = await client.query(`SELECT
      (has_table_privilege(current_user,'conversations','SELECT') AND has_table_privilege(current_user,'conversations','INSERT') AND has_table_privilege(current_user,'conversations','UPDATE')) AS conversations,
      has_table_privilege(current_user,'messages','SELECT') AS history,
      has_table_privilege(current_user,'messages','INSERT') AS message_write,
      has_table_privilege(current_user,'messages','UPDATE') AS message_update,
      (SELECT relrowsecurity FROM pg_class WHERE oid='messages'::regclass) AS message_rls,
      (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user) AS bypass_rls,
      (SELECT relowner=current_user::regrole FROM pg_class WHERE oid='messages'::regclass) AS message_owner,
      (SELECT count(*)::integer FROM pg_policy WHERE polrelid='messages'::regclass AND polname IN ('messages_runtime_read','messages_reviewed_question_insert')) AS message_policies,
      (has_table_privilege(current_user,'input_safety_reviews','SELECT') AND has_table_privilege(current_user,'input_safety_reviews','INSERT')) AS review_write,
      (has_table_privilege(current_user,'input_safety_reviews','UPDATE') OR has_table_privilege(current_user,'input_safety_reviews','DELETE')) AS review_mutation,
      has_schema_privilege(current_user,'public','CREATE') AS schema_create,
      has_table_privilege(current_user,'usage_buckets','INSERT') AS budget_create,
      has_column_privilege(current_user,'usage_buckets','credit_limit','UPDATE') AS budget_limit_write,
      has_column_privilege(current_user,'usage_buckets','reserved_credits','UPDATE') AS reserve_credits,
      has_column_privilege(current_user,'operator_usage_buckets','reserved_provider_micro_usd','UPDATE') AS reserve_operator,
      has_column_privilege(current_user,'operator_usage_buckets','provider_limit_micro_usd','UPDATE') AS operator_limit_write,
      has_column_privilege(current_user,'runs','payload_hmac','UPDATE') AS fingerprint_write,
      has_column_privilege(current_user,'usage_buckets','settled_credits','UPDATE') AS settlement_write,
      has_table_privilege(current_user,'usage_reservations','UPDATE') AS reservation_write`);
    const rights = permissions.rows[0];
    if (key === "DATABASE_URL" && (!rights.conversations || !rights.history || !rights.message_write || rights.message_update || !rights.message_rls || rights.bypass_rls || rights.message_owner || rights.message_policies !== 2 || !rights.review_write || rights.review_mutation || rights.schema_create || rights.budget_create || rights.budget_limit_write || rights.operator_limit_write || rights.fingerprint_write || rights.settlement_write || rights.reservation_write || !rights.reserve_credits || !rights.reserve_operator)) throw new Error("Runtime privilege check failed");
    if (!tls || result.rows[0].tables !== 14) throw new Error("Database check failed");
    console.log(JSON.stringify({ connection: key, ...result.rows[0], permissions: permissions.rows[0], verifiedTls: tls, connectAndQueryMs: Math.round(performance.now() - start) }));
    } finally { client.release(); }
  } catch {
    console.error(JSON.stringify({ connection: key, error: "Database verification failed; check credentials, TLS and migrations." }));
    process.exitCode = 1;
  } finally { await pool.end(); }
}
