import "server-only";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/current-session";
import { getServerEnv } from "@/lib/env";
import { createRunAdmission } from "./admit";
import { parseAdmissionEnvironment } from "./env";
import { createRunIntake } from "./intake";

export const admitRequest = createRunIntake({
  identity: getCurrentSession,
  origin: () => getServerEnv().BETTER_AUTH_URL,
  admit: (subject, input) => createRunAdmission(getDb(), parseAdmissionEnvironment(process.env)).admit(subject, input),
  log: (event) => console.info(JSON.stringify(event)),
});
