import { AdmissionError } from "./errors";

// Version-one submission days follow the documented Asia/Kolkata calendar.
export function getAttemptWindows(now: Date) {
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
  const minute = Math.floor(time / 60_000) * 60_000;
  const indiaOffset = 330 * 60_000;
  const day = Math.floor((time + indiaOffset) / 86_400_000) * 86_400_000 - indiaOffset;
  return [
    { kind: "MINUTE" as const, startsAt: new Date(minute), endsAt: new Date(minute + 60_000) },
    { kind: "DAY" as const, startsAt: new Date(day), endsAt: new Date(day + 86_400_000) },
  ];
}
