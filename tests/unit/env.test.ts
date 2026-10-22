import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env-schema";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://user:password@ep-test-pooler.ap-southeast-1.aws.neon.tech/perplex?sslmode=verify-full",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a".repeat(40),
  GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-secret",
};

describe("server configuration", () => {
  it("accepts complete local development configuration", () => {
    expect(parseServerEnv(valid).BETTER_AUTH_URL).toBe(valid.BETTER_AUTH_URL);
  });
  it("reports missing field names without leaking supplied secrets", () => {
    expect(() => parseServerEnv({ ...valid, GOOGLE_CLIENT_ID: "" }))
      .toThrow("GOOGLE_CLIENT_ID");
    try { parseServerEnv({ ...valid, DATABASE_URL: "secret-database-value" }); }
    catch (error) { expect(String(error)).not.toContain("secret-database-value"); }
  });
  it("rejects insecure public auth origins", () => {
    expect(() => parseServerEnv({ ...valid, BETTER_AUTH_URL: "http://example.com" })).toThrow();
    expect(() => parseServerEnv({ ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "http://example.com" })).toThrow();
  });
  it("allows a production build to be smoke-tested over loopback HTTP", () => {
    expect(parseServerEnv({ ...valid, NODE_ENV: "production" }).BETTER_AUTH_URL).toBe("http://localhost:3000");
  });
  it("requires verified TLS for remote database connections", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: valid.DATABASE_URL.split("?")[0] })).toThrow();
  });
});
