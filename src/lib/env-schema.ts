import { z } from "zod";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const databaseUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ["postgres:", "postgresql:"].includes(url.protocol) &&
    (localHosts.has(url.hostname) || url.searchParams.get("sslmode") === "verify-full");
});
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEPLOYMENT_PLATFORM:z.enum(['node','vercel','cloudflare']).optional(),
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_URL: z.url().refine((value) => {
    const url = new URL(value);
    return url.pathname === "/" && !url.search && !url.hash && !url.username &&
      !url.password && (url.protocol === "https:" ||
        (url.protocol === "http:" && localHosts.has(url.hostname)));
  }),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  REVIEWER_LOGIN_CONFIG:z.string().max(2048).optional(),
});

export function parseServerEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server configuration: ${fields.join(", ")}`);
  }
  return result.data;
}
