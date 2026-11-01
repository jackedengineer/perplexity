The pinned Trigger.dev CLI is isolated here with TypeScript 5.9.3, satisfying
`tsconfck`'s declared peer dependency without downgrading the Next.js application's
TypeScript 6 or disabling strict peer checks. Run `pnpm jobs:dev` from the repo root.

Root overrides select patched tar, deepmerge-ts and Zod releases for the CLI's
transitive dependencies. Verify `pnpm install --frozen-lockfile`, `pnpm audit
--audit-level high`, the CLI registration/build and application checks when updating.
The CLI's Prisma helpers are not used by our Drizzle worker.
