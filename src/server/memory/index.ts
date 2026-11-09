import "server-only";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/current-session";
import { getServerEnv } from "@/lib/env";
import { createRequestLimiter } from "@/server/runs/rate-limit";
import { createMemoryHttp } from "./http";
import { deleteAllMemories, getSettings, updateSettings } from "./store";

export const memoryHttp = createMemoryHttp({
  identity: getCurrentSession,
  origin: () => getServerEnv().BETTER_AUTH_URL,
  consumeRequest: subject => createRequestLimiter(getDb(), "memory-settings-v1", { userMinute: 20, userDay: 200, anonymousMinute: 1, anonymousDay: 1 }).consume("memory:" + subject),
  backend: () => ({
    settings: subject => getSettings(getDb(), subject),
    update: (subject, patch) => updateSettings(getDb(), subject, patch),
    deleteAll: subject => deleteAllMemories(getDb(), subject),
  }),
  log: event => console.info(JSON.stringify(event)),
});
