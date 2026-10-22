import "server-only";
import { parseServerEnv } from "./env-schema";

// Lazy validation lets static pages build without production credentials.
export function getServerEnv() {
  return parseServerEnv(process.env);
}
