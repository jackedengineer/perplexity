import type { SafetyCategory } from "./policy";
import type { SafetyInput } from "./provider";

// Deliberately narrow credential formats, not an intent/keyword classifier.
const secrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/u,
  /\bsk-or-v1-[a-f0-9]{64}\b/u,
  /\bsk-(?:proj-|ant-api03-)?[A-Za-z0-9_-]{40,256}\b/u,
  /\bghp_[A-Za-z0-9]{36}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{80,255}\b/u,
  /\bAIza[A-Za-z0-9_-]{35}\b/u,
  /\baws_secret_access_key[\s=:"']+[A-Za-z0-9/+]{40}\b/iu,
  /\b(?:postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?|https?):\/\/[^\s/:@]{1,128}:[^\s/@]{1,256}@/iu,
];
export function inspectInput(input: SafetyInput): SafetyCategory | null {
  const inspected = [input.text,...input.context.map((turn)=>turn.text)].map((text)=>text.normalize("NFKC").replace(/\p{Cf}/gu,""));
  if (inspected.some((text)=>text.length > 16_000 || text.trim().length === 0)) throw new Error("Invalid inspection text");
  if (inspected.some((text)=>secrets.some((pattern)=>pattern.test(text)))) return "ACCIDENTAL_SECRET";
  if (inspected.some((text)=>/^\s*(?:<\|im_start\|>|<\|start_header_id\|>)(?:system|developer)\b/iu.test(text))) return "PROMPT_INJECTION";
  return null;
}
