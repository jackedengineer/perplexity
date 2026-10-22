import "server-only";
import { getDb } from "@/db";
import { getServerEnv } from "./env";
import { createAuth } from "./auth-factory";

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return auth ??= createAuth(getDb(), getServerEnv());
}
