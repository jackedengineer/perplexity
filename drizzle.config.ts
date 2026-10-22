import { databaseEnvironment } from "./scripts/database-environment";
import { defineConfig } from "drizzle-kit";

const maintenance = databaseEnvironment();
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: maintenance.DATABASE_URL_DIRECT ?? "" },
  strict: true,
  verbose: false,
});
