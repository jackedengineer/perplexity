import { betterAuth } from "better-auth/minimal";

// Offline schema generation only. Never imported by the app.
export const auth = betterAuth({
  secret: "schema-generation-only-not-a-runtime-secret",
  rateLimit: { enabled: true, storage: "database" },
});
