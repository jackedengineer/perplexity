CREATE TYPE "public"."message_kind" AS ENUM('QUESTION', 'ANSWER', 'CLARIFICATION');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('USER', 'ASSISTANT');--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_auth_subject_unique" UNIQUE("auth_subject")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"creation_request_id" uuid NOT NULL,
	"creation_fingerprint" text NOT NULL,
	"title" varchar(160) NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_title_nonempty" CHECK (length(trim("conversations"."title")) > 0),
	CONSTRAINT "conversations_revision_nonnegative" CHECK ("conversations"."revision" >= 0),
	CONSTRAINT "conversations_sequence_positive" CHECK ("conversations"."next_sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"kind" "message_kind" NOT NULL,
	"parts" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"sequence" integer NOT NULL,
	"policy_version" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sequence_positive" CHECK ("messages"."sequence" > 0),
	CONSTRAINT "messages_parts_array" CHECK (jsonb_typeof("messages"."parts") = 'array'),
	CONSTRAINT "messages_approval_policy" CHECK ("messages"."approved_at" IS NULL OR "messages"."policy_version" IS NOT NULL),
	CONSTRAINT "messages_schema_version_positive" CHECK ("messages"."schema_version" > 0),
	CONSTRAINT "messages_role_kind" CHECK (("messages"."role" = 'USER' AND "messages"."kind" = 'QUESTION') OR ("messages"."role" = 'ASSISTANT' AND "messages"."kind" IN ('ANSWER', 'CLARIFICATION')))
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_auth_subject_user_id_fk" FOREIGN KEY ("auth_subject") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_owner_creation_unique" ON "conversations" USING btree ("user_id","creation_request_id");--> statement-breakpoint
CREATE INDEX "conversations_owner_updated_idx" ON "conversations" USING btree ("user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_sequence_unique" ON "messages" USING btree ("conversation_id","sequence");
--> statement-breakpoint
-- Development/runtime role is provisioned separately; isolated test databases need no role.
DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'perplex_web') THEN
    GRANT SELECT, INSERT ON app_users TO perplex_web;
    GRANT SELECT, INSERT, UPDATE ON conversations TO perplex_web;
    GRANT SELECT ON messages TO perplex_web;
  END IF;
END $permissions$;
