import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getAuth } from "./auth";
import { loadApplicationSession } from "./application-session";

export const getCurrentSession = cache(async () => {
  const requestHeaders = new Headers(await headers());
  const auth = getAuth();
  return loadApplicationSession({
    // Server Components cannot renew cookies. The client refreshes through the auth route.
    getSession: (headers) => auth.api.getSession({ headers, query: { disableRefresh: true } }),
    revokeSession: async (token) => { await (await auth.$context).internalAdapter.deleteSession(token); },
  }, requestHeaders);
});
