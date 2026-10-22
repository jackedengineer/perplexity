import "server-only";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/current-session";
import { getServerEnv } from "@/lib/env";
import { createConversationHttp } from "./http";
import { createConversationRepository } from "./repository";

export function getConversationRepository() { return createConversationRepository(getDb()); }
export async function requireConversationIdentity() {
  const identity = await getCurrentSession();
  if (!identity) redirect("/sign-in");
  return identity;
}
export const conversationHttp = createConversationHttp({
  repository: getConversationRepository,
  identity: () => getCurrentSession(),
  origin: () => getServerEnv().BETTER_AUTH_URL,
  log: (event) => console.info(JSON.stringify(event)),
});
