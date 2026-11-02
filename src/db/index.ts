import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import {cache} from 'react';
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & { perplexPool?: Pool };
let database: ReturnType<typeof connect> | undefined;

function connect(requestScoped=false) {
  let pool = requestScoped?undefined:globalDatabase.perplexPool;
  if (!pool) {
    pool = new Pool({
      connectionString: getServerEnv().DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 10_000,
      query_timeout: 10_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      application_name: "perplex-web",
      // Workers must not reuse another invocation's I/O. Transactions still use
      // one checked-out client; releasing it closes that connection afterwards.
      ...(requestScoped?{maxUses:1}:{}),
    });
    const removedClients = new WeakSet<PoolClient>();
    if (requestScoped) pool.on("remove", (client) => removedClients.add(client));
    pool.on("error", (error, client) => {
      // Native workerd TLS can emit this late close error after pg has already
      // removed a maxUses:1 connection. It cannot affect another query. Preserve
      // all active-query errors and every other pool error (including on Node).
      if (requestScoped && client && removedClients.has(client) &&
          error.message === "This socket has been closed.") return;
      console.error(JSON.stringify({ event: "database.pool_error" }));
    });
  }
  if (!requestScoped&&process.env.NODE_ENV !== "production") globalDatabase.perplexPool = pool;
  return drizzle(pool, { schema });
}

// React memoizes within a Server Component request. In Route Handlers cache()
// intentionally creates fresh instances rather than a cross-invocation singleton.
const requestDatabase=cache(()=>connect(true));
export function getDb() {
  return process.env.DEPLOYMENT_PLATFORM==='cloudflare'?requestDatabase():database??=connect();
}
