CREATE TABLE "message_feedback" (
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"message_role" "message_role" DEFAULT 'ASSISTANT' NOT NULL,
	"rating" varchar(16) NOT NULL,
	"reason" varchar(32),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_feedback_user_id_message_id_pk" PRIMARY KEY("user_id","message_id"),
	CONSTRAINT "feedback_value_valid" CHECK ("message_feedback"."message_role"='ASSISTANT' AND "message_feedback"."version">0 AND "message_feedback"."rating" IN ('HELPFUL','NOT_HELPFUL') AND ("message_feedback"."reason" IS NULL OR "message_feedback"."rating"='NOT_HELPFUL' AND "message_feedback"."reason" IN ('MISSING_EVIDENCE','WRONG_INTERPRETATION','FALSE_REFUSAL')) AND "message_feedback"."updated_at">="message_feedback"."created_at")
);
--> statement-breakpoint
ALTER TABLE "message_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "feedback_owned_conversation_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "feedback_owned_assistant_fk" FOREIGN KEY ("message_id","conversation_id","message_role") REFERENCES "public"."messages"("id","conversation_id","role") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "feedback_approved_message_fk" FOREIGN KEY ("run_id","message_id") REFERENCES "public"."output_safety_reviews"("run_id","message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "feedback_same_run_fk" FOREIGN KEY ("run_id","conversation_id") REFERENCES "public"."runs"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "feedback_runtime_read" ON "message_feedback" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "feedback_reviewed_insert" ON "message_feedback" AS PERMISSIVE FOR INSERT TO public WITH CHECK (EXISTS(SELECT 1 FROM output_safety_reviews o JOIN runs r ON r.id=o.run_id WHERE o.run_id=message_feedback.run_id AND o.message_id=message_feedback.message_id AND o.conversation_id=message_feedback.conversation_id AND o.decision='ALLOW' AND r.status IN ('COMPLETED','NEEDS_CLARIFICATION')));--> statement-breakpoint
CREATE POLICY "feedback_reviewed_update" ON "message_feedback" AS PERMISSIVE FOR UPDATE TO public USING (EXISTS(SELECT 1 FROM output_safety_reviews o JOIN runs r ON r.id=o.run_id WHERE o.run_id=message_feedback.run_id AND o.message_id=message_feedback.message_id AND o.conversation_id=message_feedback.conversation_id AND o.decision='ALLOW' AND r.status IN ('COMPLETED','NEEDS_CLARIFICATION'))) WITH CHECK (EXISTS(SELECT 1 FROM output_safety_reviews o JOIN runs r ON r.id=o.run_id WHERE o.run_id=message_feedback.run_id AND o.message_id=message_feedback.message_id AND o.conversation_id=message_feedback.conversation_id AND o.decision='ALLOW' AND r.status IN ('COMPLETED','NEEDS_CLARIFICATION')));--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
  GRANT SELECT,INSERT ON message_feedback TO perplex_web;
  GRANT UPDATE(rating,reason,version,updated_at) ON message_feedback TO perplex_web;
 END IF;
END $$;
