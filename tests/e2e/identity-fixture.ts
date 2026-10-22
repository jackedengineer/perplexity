import { randomUUID, createHmac, createHash } from "node:crypto";
import { Pool } from "pg";
import type { BrowserContext } from "@playwright/test";

export async function identityFixture(context: BrowserContext, name = "Curious Tester") {
  const url = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!url || new URL(url).hostname !== "ep-sweet-night-az8bacv2-pooler.c-3.ap-southeast-1.aws.neon.tech" || !secret) throw new Error("Dedicated development Neon credentials required");
  const db = new Pool({ connectionString: url, max: 1 });
  const id = `e2e-${randomUUID()}`;
  const token = randomUUID();
  const cleanupRate = async () => {
    const direct = new URL(process.env.DATABASE_URL_DIRECT ?? 'http://missing');
    if (direct.hostname !== 'ep-sweet-night-az8bacv2.c-3.ap-southeast-1.aws.neon.tech') throw new Error('Dedicated development owner required for fixture cleanup');
    const owner = new Pool({connectionString: direct.toString(), max: 1});
    try { await owner.query('DELETE FROM request_rate_buckets WHERE bucket_key=$1', ['user:'+createHash('sha256').update('perplex:subject:'+id).digest('hex')]); }
    finally { await owner.end(); }
  };
  try {
    await db.query('INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,$2,$3,true)', [id, name, `${id}@example.test`]);
    await db.query(`INSERT INTO session (id,token,user_id,expires_at,created_at,updated_at)
      VALUES ($1,$2,$3,now()+interval '5 days',now()-interval '2 days',now()-interval '2 days')`, [id, token, id]);
    const signature = createHmac("sha256", secret).update(token).digest("base64");
    await context.addCookies([{ name: "perplex.session_token", value: encodeURIComponent(`${token}.${signature}`),
      domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    return { id, db, cleanup: async () => { try { await db.query('DELETE FROM "user" WHERE id=$1', [id]); await cleanupRate(); } finally { await db.end(); } } };
  } catch (error) { await db.query('DELETE FROM "user" WHERE id=$1', [id]); await db.end(); throw error; }
}
