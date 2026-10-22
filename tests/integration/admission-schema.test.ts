import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const owner = randomUUID(), other = randomUUID(), conversation = randomUUID();
const run = randomUUID();
beforeAll(async () => {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) await db.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
  for (const [id, subject] of [[owner, "admission-owner"], [other, "admission-other"]]) {
    await db.query('INSERT INTO "user" (id,name,email) VALUES ($1,$1,$2)', [subject, `${subject}@example.test`]);
    await db.query('INSERT INTO app_users (id,auth_subject) VALUES ($1,$2)', [id, subject]);
  }
  await db.query(`INSERT INTO conversations (id,user_id,creation_request_id,creation_fingerprint,title)
    VALUES ($1,$2,$3,'fingerprint','Admission test')`, [conversation, owner, randomUUID()]);
});
afterAll(() => db.close());
const insertRun = (id = randomUUID(), userId = owner, intent = randomUUID(), status = "RECEIVED") => db.query(`INSERT INTO runs
  (id,user_id,conversation_id,client_request_id,payload_hmac,hmac_key_id,catalog_version,price_version,entitlement_version,operator_budget_key,
   answer_credits,provider_reserve_micro_usd,admitted_revision,status,deadline_at)
  VALUES ($1,$2,$3,$4,$5,'test-v1','catalog-v1','price-v1','grant-v1','schema-test',5,50000,1,$6,now()+interval '45 seconds')`,
[id,userId,conversation,intent,"a".repeat(64),status]);

it("enforces run ownership and prevents concurrent active runs and duplicate intents", async () => {
  const intent = randomUUID();
  await insertRun(run, owner, intent);
  await expect(insertRun()).rejects.toThrow(/unique/);
  await expect(insertRun(randomUUID(), other, randomUUID(), "TIMED_OUT")).rejects.toThrow(/foreign key/);
  await db.query("UPDATE runs SET status='TIMED_OUT' WHERE id=$1", [run]);
  await expect(insertRun(randomUUID(), owner, intent, "TIMED_OUT")).rejects.toThrow(/unique/);
  await expect(db.query("UPDATE runs SET payload_hmac='raw-text' WHERE id=$1", [run])).rejects.toThrow(/check/);
  await expect(db.query("UPDATE runs SET deadline_at=created_at WHERE id=$1", [run])).rejects.toThrow(/check/);
});
it("bounds budgets without treating customer credits as provider money", async () => {
  const id = randomUUID();
  await db.query(`INSERT INTO usage_buckets (id,user_id,kind,starts_at,ends_at,entitlement_version,credit_limit,provider_limit_micro_usd)
    VALUES ($1,$2,'PERIOD',now(),now()+interval '1 day','grant-v1',10,100000)`, [id, owner]);
  for (const update of ["reserved_credits=-1", "reserved_credits=11", "reserved_provider_micro_usd=100001", "settled_provider_micro_usd=-1", "ends_at=starts_at"]) {
    await expect(db.exec(`UPDATE usage_buckets SET ${update} WHERE id='${id}'`)).rejects.toThrow(/check/);
  }
  await db.query("UPDATE usage_buckets SET reserved_credits=5,reserved_provider_micro_usd=50000 WHERE id=$1", [id]);
  await expect(db.query("UPDATE usage_buckets SET settled_credits=6 WHERE id=$1", [id])).rejects.toThrow(/check/);
});
it("constrains attempt counters and exact window sizes", async () => {
  await expect(db.query(`INSERT INTO admission_attempt_buckets (user_id,kind,starts_at,ends_at,attempts)
    VALUES ($1,'MINUTE',now(),now()+interval '1 day',1)`, [owner])).rejects.toThrow(/check/);
  await expect(db.query(`INSERT INTO admission_attempt_buckets (user_id,kind,starts_at,ends_at,attempts)
    VALUES ($1,'DAY',now(),now()+interval '1 day',-1)`, [owner])).rejects.toThrow(/check/);
});

it("binds reservations to the run quote, owner, operator namespace and correct window kinds", async () => {
  const buckets = [randomUUID(), randomUUID()], globals = [randomUUID(), randomUUID()];
  for (const [i, kind] of ["PERIOD", "DAY"].entries()) {
    await db.query(`INSERT INTO usage_buckets (id,user_id,kind,starts_at,ends_at,entitlement_version,credit_limit,provider_limit_micro_usd)
      VALUES ($1,$2,$3,'2026-01-01','2026-02-01','grant-v1',10,100000)`, [buckets[i],owner,kind]);
    await db.query(`INSERT INTO operator_usage_buckets (id,budget_key,kind,starts_at,ends_at,provider_limit_micro_usd)
      VALUES ($1,'schema-test',$2,'2026-01-01','2026-02-01',100000)`, [globals[i],kind]);
  }
  const insert = (userId = owner, credits = 5, periodId = buckets[0], key = "schema-test") => db.query(`INSERT INTO usage_reservations
    (run_id,user_id,operator_budget_key,answer_credits,provider_reserve_micro_usd,period_bucket_id,day_bucket_id,operator_period_bucket_id,operator_day_bucket_id)
    VALUES ($1,$2,$3,$4,50000,$5,$6,$7,$8)`, [run,userId,key,credits,periodId,buckets[1],globals[0],globals[1]]);
  await expect(insert(other)).rejects.toThrow(/foreign key/);
  await expect(insert(owner, 6)).rejects.toThrow(/foreign key/);
  await expect(insert(owner, 5, buckets[1])).rejects.toThrow(/foreign key/);
  await expect(insert(owner, 5, buckets[0], "other-budget")).rejects.toThrow(/foreign key/);
  await insert();
  await expect(insert()).rejects.toThrow(/duplicate/);
  await db.query('DELETE FROM "user" WHERE id=$1', ["admission-owner"]);
  expect((await db.query("SELECT * FROM usage_reservations")).rows).toHaveLength(0);
});
