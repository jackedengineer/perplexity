import "server-only";
import { getDb } from "@/db";
import { getServerEnv } from "./env";
import { createAuth } from "./auth-factory";
import {cache} from 'react';

let auth: ReturnType<typeof createAuth> | undefined;
const requestAuth=cache(()=>createAuth(getDb(),getServerEnv()));
export function getAuth() {
  return process.env.DEPLOYMENT_PLATFORM==='cloudflare'?requestAuth():auth??=createAuth(getDb(),getServerEnv());
}
