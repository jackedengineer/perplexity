CREATE TABLE "request_rate_buckets" (
	"bucket_key" varchar(69) NOT NULL,
	"kind" "attempt_kind" NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"attempts" integer NOT NULL,
	CONSTRAINT "request_rate_buckets_bucket_key_kind_starts_at_pk" PRIMARY KEY("bucket_key","kind","starts_at"),
	CONSTRAINT "request_rate_key_valid" CHECK ("request_rate_buckets"."bucket_key" ~ '^(user|anon):[a-f0-9]{64}$'),
	CONSTRAINT "request_rate_count_valid" CHECK ("request_rate_buckets"."attempts" BETWEEN 1 AND 10000),
	CONSTRAINT "request_rate_window_valid" CHECK (("request_rate_buckets"."kind"='MINUTE' AND "request_rate_buckets"."ends_at"="request_rate_buckets"."starts_at"+interval '1 minute') OR ("request_rate_buckets"."kind"='DAY' AND "request_rate_buckets"."ends_at"="request_rate_buckets"."starts_at"+interval '1 day'))
);

--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='perplex_web') THEN
  GRANT SELECT, INSERT ON request_rate_buckets TO perplex_web;
  GRANT UPDATE (attempts) ON request_rate_buckets TO perplex_web;
 END IF;
END $$;
