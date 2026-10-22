-- Create composite unique targets before their referencing constraints.
CREATE TYPE "public"."input_safety_decision" AS ENUM('ALLOW', 'BLOCK', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."input_safety_reason" AS ENUM('DETERMINISTIC_SECRET', 'DETERMINISTIC_ABUSE', 'CLASSIFIER', 'INVALID_INPUT', 'CONFIGURATION_UNAVAILABLE', 'PROVIDER_UNAVAILABLE', 'MALFORMED_OUTPUT', 'CLASSIFIER_UNAVAILABLE', 'TIMEOUT', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "input_safety_reviews" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"attempt_version" integer NOT NULL,
	"decision" "input_safety_decision" NOT NULL,
	"category_codes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"reason" "input_safety_reason" NOT NULL,
	"detector_version" varchar(64) NOT NULL,
	"policy_version" varchar(32) NOT NULL,
	"model_id" varchar(128),
	"duration_ms" integer NOT NULL,
	"accepted_message_id" uuid,
	"accepted_message_role" "message_role" DEFAULT 'USER' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "input_review_metadata_valid" CHECK ("input_safety_reviews"."attempt_version" > 0 AND "input_safety_reviews"."duration_ms" >= 0 AND length(trim("input_safety_reviews"."detector_version")) > 0 AND length(trim("input_safety_reviews"."policy_version")) > 0 AND ("input_safety_reviews"."model_id" IS NULL OR length(trim("input_safety_reviews"."model_id")) > 0)),
	CONSTRAINT "input_review_message_valid" CHECK ("input_safety_reviews"."accepted_message_role" = 'USER' AND (("input_safety_reviews"."decision" = 'ALLOW' AND "input_safety_reviews"."accepted_message_id" IS NOT NULL) OR ("input_safety_reviews"."decision" <> 'ALLOW' AND "input_safety_reviews"."accepted_message_id" IS NULL))),
	CONSTRAINT "input_review_categories_valid" CHECK (array_position("input_safety_reviews"."category_codes",NULL) IS NULL AND "input_safety_reviews"."category_codes" <@ ARRAY['CREDENTIAL_THEFT','FRAUD','UNAUTHORIZED_INTRUSION','MALWARE','VIOLENCE','SEXUAL_EXPLOITATION','SELF_HARM_INSTRUCTIONS','SELF_HARM_DISTRESS','PRIVATE_DATA','ACCIDENTAL_SECRET','PROMPT_INJECTION']::text[] AND (("input_safety_reviews"."decision" = 'BLOCK' AND cardinality("input_safety_reviews"."category_codes") BETWEEN 1 AND 11) OR ("input_safety_reviews"."decision" <> 'BLOCK' AND cardinality("input_safety_reviews"."category_codes") = 0)))
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "input_review_message_unique" ON "input_safety_reviews" USING btree ("accepted_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_id_conversation_role_unique" ON "messages" USING btree ("id","conversation_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_id_conversation_unique" ON "runs" USING btree ("id","conversation_id");--> statement-breakpoint
ALTER TABLE "input_safety_reviews" ADD CONSTRAINT "input_review_owned_run_fk" FOREIGN KEY ("run_id","conversation_id") REFERENCES "public"."runs"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_safety_reviews" ADD CONSTRAINT "input_review_accepted_message_fk" FOREIGN KEY ("accepted_message_id","conversation_id","accepted_message_role") REFERENCES "public"."messages"("id","conversation_id","role") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "messages_runtime_read" ON "messages" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "messages_reviewed_question_insert" ON "messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
    role = 'USER' AND kind = 'QUESTION' AND approved_at IS NOT NULL AND policy_version IS NOT NULL
    AND EXISTS (SELECT 1 FROM input_safety_reviews review WHERE review.accepted_message_id = messages.id
      AND review.conversation_id = messages.conversation_id AND review.decision = 'ALLOW'
      AND review.policy_version = messages.policy_version));
--> statement-breakpoint
-- Defer the accepted-message FK so the persisted ALLOW can authorize the RLS insert.
ALTER TABLE "input_safety_reviews" ALTER CONSTRAINT "input_review_accepted_message_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'perplex_web') THEN
    GRANT SELECT, INSERT ON input_safety_reviews TO perplex_web;
    GRANT INSERT ON messages TO perplex_web;
  END IF;
END $$;
