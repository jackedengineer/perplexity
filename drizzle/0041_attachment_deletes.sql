-- A deleted file leaves its attachment row with document_id NULL (user_id stays), so retrieval
-- can see that a run lost a file. Only document_id is nulled; nulling user_id would violate NOT NULL.
ALTER TABLE "run_documents" DROP CONSTRAINT "run_document_same_owner_fk";
--> statement-breakpoint
DROP INDEX "run_document_position_unique";--> statement-breakpoint
ALTER TABLE "run_documents" DROP CONSTRAINT "run_documents_run_id_document_id_pk";--> statement-breakpoint
ALTER TABLE "run_documents" ALTER COLUMN "document_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run_documents" ADD CONSTRAINT "run_documents_run_id_position_pk" PRIMARY KEY("run_id","position");--> statement-breakpoint
ALTER TABLE "run_documents" ADD CONSTRAINT "run_document_same_owner_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE SET NULL ("document_id") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_document_file_unique" ON "run_documents" USING btree ("run_id","document_id");