import type { PublicErrorCode } from "@/server/contracts/errors";

export class AdmissionError extends Error {
  constructor(readonly code: PublicErrorCode) {
    super(code === "CONFIGURATION_UNAVAILABLE" ? "Admission configuration is unavailable." : `Run admission failed: ${code}.`);
  }
}
