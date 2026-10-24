ALTER TABLE "conversations" ADD COLUMN "deleted_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE POLICY "messages_deleted_conversation_delete" ON "messages" AS PERMISSIVE FOR DELETE TO public USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.deleted_at IS NOT NULL));--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
  GRANT DELETE ON messages, input_safety_reviews, output_safety_reviews, run_plans, run_retrievals TO perplex_web;
 END IF;
END $$;
