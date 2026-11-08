CREATE TABLE "run_documents" (
	"run_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "run_documents_run_id_document_id_pk" PRIMARY KEY("run_id","document_id"),
	CONSTRAINT "run_document_valid" CHECK ("run_documents"."position" BETWEEN 0 AND 4)
);
--> statement-breakpoint
ALTER TABLE "run_documents" ADD CONSTRAINT "run_documents_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_documents" ADD CONSTRAINT "run_document_same_owner_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_document_position_unique" ON "run_documents" USING btree ("run_id","position");--> statement-breakpoint
CREATE INDEX "run_documents_document_idx" ON "run_documents" USING btree ("document_id");--> statement-breakpoint
-- Attachments are written once at admission and only read afterwards.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
    GRANT SELECT, INSERT ON run_documents TO perplex_web;
  END IF;
END $$;
