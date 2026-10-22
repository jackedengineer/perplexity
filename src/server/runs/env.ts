import { AdmissionError } from "./errors";
import { parseAdmissionConfig,admissionPolicySchema,FREE_ADMISSION_POLICY } from "./policy";

export function parseAdmissionEnvironment(env: Record<string, string | undefined>) {
  try {
    return parseAdmissionConfig({ activeKeyId: env.RUN_HMAC_ACTIVE_KEY_ID,
      keys: JSON.parse(env.RUN_HMAC_KEYS_JSON ?? "null") });
  } catch { throw new AdmissionError("CONFIGURATION_UNAVAILABLE"); }
}

// Deployment namespace only; grants remain privileged and never come from the browser.
export function parseAdmissionPolicyEnvironment(env: Record<string,string | undefined>) {
  const policy = admissionPolicySchema.safeParse({ ...FREE_ADMISSION_POLICY,operatorBudgetKey: env.RUN_OPERATOR_BUDGET_KEY ?? FREE_ADMISSION_POLICY.operatorBudgetKey });
  if (!policy.success) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
  return Object.freeze(policy.data);
}
