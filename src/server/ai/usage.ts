import { z } from "zod";
export type ProviderUsage = { costMicroUsd: bigint | null; inputTokens: number | null; outputTokens: number | null; actualModel: string | null };
export function microUsd(value: unknown): bigint | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const match = /^(\d{1,9})(?:\.(\d{1,18}))?$/u.exec(String(value));
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(6,"0");
  return BigInt(match[1])*1_000_000n+BigInt(fraction.slice(0,6))+( /[1-9]/u.test(fraction.slice(6)) ? 1n : 0n );
}
const tokens = z.int().min(0).max(1_000_000);
export function providerUsage(value: unknown,model?: unknown): ProviderUsage {
  const parsed = z.object({ cost: z.unknown().optional(),prompt_tokens: tokens.optional(),completion_tokens: tokens.optional() }).safeParse(value);
  return { costMicroUsd: parsed.success ? microUsd(parsed.data.cost) : null,
    inputTokens: parsed.success ? parsed.data.prompt_tokens ?? null : null,outputTokens: parsed.success ? parsed.data.completion_tokens ?? null : null,
    actualModel: typeof model === "string" && /^[A-Za-z0-9._:/-]{1,128}$/u.test(model) ? model : null };
}
