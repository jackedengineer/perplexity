import { createHash } from "node:crypto";
import { approvedPayloadSchema } from "@/server/contracts/answer";
const hash = (text: string) => createHash("sha256").update(text,"utf8").digest("hex");

// Deterministic field ordering for JSONB reloads. A hash is integrity metadata,
// not proof that a model or the output gate approved the payload.
export function serializeApprovedPayload(value: unknown) {
  const payload = approvedPayloadSchema.parse(value);
  const json = JSON.stringify(payload);
  return {
    payload,
    json,
    payloadHash: hash(json),
    bodyHash: hash(payload.markdown),
  };
}
