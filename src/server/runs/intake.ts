import type { SubmitQuery } from "@/server/contracts/chat";
import type { AdmissionResult } from "./admit";
import { AdmissionError } from "./errors";
import { readSubmission } from "./input";

type Dependencies = {
  identity: () => Promise<{ user: { id: string } } | null>;
  origin: () => string;
  admit: (subject: string, input: SubmitQuery) => Promise<AdmissionResult>;
  log: (event: { event: "runs.admission"; requestId: string; outcome: string; durationMs: number }) => void;
};
// Internal only until input/output gates, execution and settlement are connected.
export function createRunIntake(dependencies: Dependencies) {
  return async (request: Request) => {
    const requestId = crypto.randomUUID(), startedAt = performance.now();
    let result: AdmissionResult;
    try {
      const identity = await dependencies.identity();
      if (!identity) throw new AdmissionError("UNAUTHENTICATED");
      const input = await readSubmission(request, dependencies.origin());
      result = await dependencies.admit(identity.user.id, input);
    } catch (error) {
      // Never propagate driver errors: their messages can contain SQL parameters.
      result = { kind: "DENIED", code: error instanceof AdmissionError ? error.code : "CONFIGURATION_UNAVAILABLE" };
    }
    dependencies.log({ event: "runs.admission", requestId, outcome: result.kind === "DENIED" ? result.code : result.kind,
      durationMs: Math.round(performance.now()-startedAt) });
    return { ...result, requestId };
  };
}
