CREATE TABLE "job_checkpoints" (
	"job_id" uuid NOT NULL,
	"step" varchar(64) NOT NULL,
	"value" jsonb NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_checkpoints_job_id_step_pk" PRIMARY KEY("job_id","step"),
	CONSTRAINT "checkpoint_bound" CHECK (octet_length("job_checkpoints"."value"::text)<=200000 AND "job_checkpoints"."hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "job_research_inputs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "research_input_bound" CHECK (octet_length("job_research_inputs"."snapshot"::text)<=12000)
);
--> statement-breakpoint
ALTER TABLE "durable_jobs" DROP CONSTRAINT "job_snapshot_valid";--> statement-breakpoint
ALTER TABLE "job_checkpoints" ADD CONSTRAINT "checkpoint_step" FOREIGN KEY ("job_id","step") REFERENCES "public"."job_steps"("job_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_research_inputs" ADD CONSTRAINT "job_research_inputs_job_id_durable_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."durable_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "durable_jobs" ADD CONSTRAINT "job_snapshot_valid" CHECK ("durable_jobs"."workflow" IN ('execution-check-v1','deep-research-v1') AND "durable_jobs"."fingerprint" ~ '^[a-f0-9]{64}$' AND "durable_jobs"."generation">=0 AND "durable_jobs"."next_event">0 AND "durable_jobs"."deadline_at">"durable_jobs"."created_at" AND "durable_jobs"."state" IN ('QUEUED','RUNNING','COMPLETED','CANCELLED','FAILED','EXPIRED'));