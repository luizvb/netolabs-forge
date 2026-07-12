CREATE TYPE "public"."eval_batch_status" AS ENUM('queued', 'running', 'completed', 'completed_with_errors', 'canceling', 'canceled');--> statement-breakpoint
ALTER TYPE "public"."eval_run_status" ADD VALUE 'canceled';--> statement-breakpoint
CREATE TABLE "eval_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "eval_batch_status" DEFAULT 'queued' NOT NULL,
	"prompt_hash" text NOT NULL,
	"prompt_snapshot" text NOT NULL,
	"candidate_model" text NOT NULL,
	"supervisor_model" text NOT NULL,
	"config" jsonb NOT NULL,
	"summary" jsonb,
	"prompt_review" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "batch_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "dimension_scores" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "deterministic_checks" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "strengths" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "improvements" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "failure_tags" jsonb;--> statement-breakpoint
ALTER TABLE "eval_scenarios" ADD COLUMN "assertions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD CONSTRAINT "eval_batches_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_batches_agent_idx" ON "eval_batches" USING btree ("agent_id");--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_batch_id_eval_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."eval_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_runs_batch_idx" ON "eval_runs" USING btree ("batch_id");