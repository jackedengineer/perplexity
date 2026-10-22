import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & { perplexPool?: Pool };
let database: ReturnType<typeof connect> | undefined;

function connect() {
  const pool = globalDatabase.perplexPool ?? new Pool({
    connectionString: getServerEnv().DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    application_name: "perplex-web",
  });
  pool.on("error", () => console.error(JSON.stringify({ event: "database.pool_error" })));
  if (process.env.NODE_ENV !== "production") globalDatabase.perplexPool = pool;
  return drizzle(pool, { schema });
}

export function getDb() {
  return database ??= connect();
}
