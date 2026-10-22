import { AdmissionError } from "./errors";
import { parseAdmissionConfig } from "./policy";

export function parseAdmissionEnvironment(env: Record<string, string | undefined>) {
  try {
    return parseAdmissionConfig({ activeKeyId: env.RUN_HMAC_ACTIVE_KEY_ID,
      keys: JSON.parse(env.RUN_HMAC_KEYS_JSON ?? "null") });
  } catch { throw new AdmissionError("CONFIGURATION_UNAVAILABLE"); }
}
