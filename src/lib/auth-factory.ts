import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "@/db/schema";
import type { parseServerEnv } from "./env-schema";

export function createAuth(
  database: Parameters<typeof drizzleAdapter>[0],
  env: ReturnType<typeof parseServerEnv>,
) {
  return betterAuth({
    appName: "Perplex",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    plugins: [{
      id: "same-origin-mutations",
      onRequest: async (request) => {
        if (!["GET", "HEAD"].includes(request.method) &&
            request.headers.get("origin") !== new URL(env.BETTER_AUTH_URL).origin) {
          return { response: Response.json({ error: "Untrusted request origin." }, { status: 403 }) };
        }
      },
    }],
    database: drizzleAdapter(database, { provider: "pg", schema, transaction: true }),
    socialProviders: {
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, accessType: "online" },
    },
    account: { encryptOAuthTokens: true, storeStateStrategy: "database", storeAccountCookie: false },
    session: {
      expiresIn: 7 * 86_400,
      updateAge: 86_400,
      freshAge: 600,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true, storage: "database", window: 60, max: 60,
      customRules: { "/sign-in/social": { window: 60, max: 10 } },
    },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: "perplex",
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https:"),
      // Vercel overwrites this header. Reconfigure the trust boundary on other hosts.
      ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    logger: {
      level: "error",
      log: (level) => console.error(JSON.stringify({ event: "auth.library_error", level })),
    },
  });
}
