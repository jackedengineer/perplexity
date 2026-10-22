import { guardVerdictSchema, SAFETY_POLICY, type GuardVerdict } from "./policy";
import { inspectInput } from "./deterministic";
import { INPUT_DETECTOR_VERSION, safetyInputSchema, SafetyProviderError, type InputReason, type SafetyProvider } from "./provider";

export type InputCheck = { verdict: GuardVerdict; reason: InputReason; detectorVersion: typeof INPUT_DETECTOR_VERSION;
  modelId: string | null; durationMs: number };
export function createInputGate(provider: SafetyProvider | undefined) {
  return {
    async evaluate(value: unknown, options: { signal: AbortSignal; deadlineAt: Date }): Promise<InputCheck> {
      const started = performance.now();
      let modelId: string | null = null;
      const result = (verdict: GuardVerdict, reason: InputReason): InputCheck => ({ verdict, reason,
        detectorVersion: INPUT_DETECTOR_VERSION, modelId, durationMs: Math.max(0,Math.round(performance.now()-started)) });
      const unavailable = (reason: InputReason) => result({ decision: "UNAVAILABLE", retryable: false, policyVersion: SAFETY_POLICY.version },reason);
      const parsed = safetyInputSchema.safeParse(value);
      if (!parsed.success) return unavailable("INVALID_INPUT");
      try {
        const category = inspectInput(parsed.data);
        if (category) return result({ decision: "BLOCK", categoryCodes: [category], policyVersion: SAFETY_POLICY.version },
          category === "ACCIDENTAL_SECRET" ? "DETERMINISTIC_SECRET" : "DETERMINISTIC_ABUSE");
      } catch { return unavailable("INVALID_INPUT"); }
      const remaining = Math.min(5000,options.deadlineAt.getTime()-Date.now());
      if (options.signal.aborted) return unavailable("CANCELLED");
      if (!Number.isFinite(remaining) || remaining <= 0) return unavailable("TIMEOUT");
      if (!provider) return unavailable("CONFIGURATION_UNAVAILABLE");
      modelId = provider.modelId;
      const classifierDeadline = Date.now()+remaining;
      const controller = new AbortController();
      const abort = () => controller.abort(); // Do not forward the caller's arbitrary abort reason.
      const timer = setTimeout(abort,remaining);
      options.signal.addEventListener("abort",abort,{ once: true });
      let stopWaiting: (()=>void) | undefined;
      try {
        const interrupted = new Promise<never>((_,reject)=>{
          stopWaiting = () => reject(new Error("Safety check interrupted"));
          controller.signal.addEventListener("abort",stopWaiting,{ once: true });
        });
        const verdict = await Promise.race([Promise.resolve().then(()=>{
          if (controller.signal.aborted) throw new Error("Safety check interrupted");
          return provider.classify(parsed.data,controller.signal);
        }),interrupted]);
        if (options.signal.aborted) return unavailable("CANCELLED");
        if (controller.signal.aborted || Date.now() >= classifierDeadline) return unavailable("TIMEOUT");
        const checked = guardVerdictSchema.safeParse(verdict);
        if (!checked.success) return unavailable("MALFORMED_OUTPUT");
        return result(checked.data,checked.data.decision === "UNAVAILABLE" ? "CLASSIFIER_UNAVAILABLE" : "CLASSIFIER");
      } catch (error) {
        return unavailable(options.signal.aborted ? "CANCELLED" : controller.signal.aborted ? "TIMEOUT"
          : error instanceof SafetyProviderError ? error.reason : "PROVIDER_UNAVAILABLE");
      } finally {
        clearTimeout(timer); options.signal.removeEventListener("abort",abort);
        if (stopWaiting) controller.signal.removeEventListener("abort",stopWaiting);
      }
    },
  };
}
