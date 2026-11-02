import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { loadApplicationSession } from "./application-session";

export const getCurrentSession = cache(async () => {
  const requestHeaders = new Headers(await headers());
  // Better Auth session cookies are the only application identity transport.
  // Absence is a fast denial, never evidence of authentication. Defer the heavy
  // auth/database module until a request actually needs cookie verification.
  if (!requestHeaders.get("cookie")) return null;
  const { getAuth } = await import("./auth");
  const auth = getAuth();
  return loadApplicationSession({
    // Server Components cannot renew cookies. The client refreshes through the auth route.
    getSession: (headers) => auth.api.getSession({ headers, query: { disableRefresh: true } }),
    revokeSession: async (token) => { await (await auth.$context).internalAdapter.deleteSession(token); },
  }, requestHeaders);
});
