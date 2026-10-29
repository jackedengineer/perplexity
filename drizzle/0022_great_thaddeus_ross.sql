CREATE TABLE "maintenance_status" (
	"name" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"outcome" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'perplex_web') THEN
  GRANT SELECT, INSERT, UPDATE ON maintenance_status TO perplex_web;
 END IF;
END $$;
