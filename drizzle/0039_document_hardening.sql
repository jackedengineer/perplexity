CREATE TABLE "document_usage" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"characters" bigint NOT NULL,
	CONSTRAINT "document_usage_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "document_usage_valid" CHECK ("document_usage"."characters" > 0)
);
--> statement-breakpoint
ALTER TABLE "document_usage" ADD CONSTRAINT "document_usage_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The runtime role may only change the columns the app itself updates. Chunks are removed
-- by the cascade from documents, which runs with the table owner's privileges.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
    REVOKE UPDATE, DELETE ON document_chunks FROM perplex_web;
    REVOKE UPDATE ON documents FROM perplex_web;
    GRANT UPDATE (status, failure_code, embedded_count, cost_micro_usd, updated_at) ON documents TO perplex_web;
    GRANT UPDATE (embedding, embedding_model, lease_until, attempts) ON document_chunks TO perplex_web;
    GRANT SELECT, INSERT, UPDATE ON document_usage TO perplex_web;
  END IF;
END $$;
