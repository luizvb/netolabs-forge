CREATE TABLE "qualification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"question_key" text NOT NULL,
	"answer" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" text DEFAULT 'collecting' NOT NULL,
	"current_question_key" text DEFAULT 'name' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"outcome" text,
	"consent_accepted_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"time_zone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"contact_name" text NOT NULL,
	"contact" text NOT NULL,
	"company" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "template_key" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "template_version" integer;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "template_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "qualification_events" ADD CONSTRAINT "qualification_events_session_id_qualification_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."qualification_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_sessions" ADD CONSTRAINT "qualification_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_sessions" ADD CONSTRAINT "qualification_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_bookings" ADD CONSTRAINT "scheduled_bookings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_bookings" ADD CONSTRAINT "scheduled_bookings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_bookings" ADD CONSTRAINT "scheduled_bookings_session_id_qualification_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."qualification_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_events_session_request_uq" ON "qualification_events" USING btree ("session_id","request_id");--> statement-breakpoint
CREATE INDEX "qualification_events_session_idx" ON "qualification_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_sessions_public_id_uq" ON "qualification_sessions" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "qualification_sessions_agent_idx" ON "qualification_sessions" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "qualification_sessions_workspace_idx" ON "qualification_sessions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_bookings_agent_start_uq" ON "scheduled_bookings" USING btree ("agent_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_bookings_session_uq" ON "scheduled_bookings" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_bookings_workspace_idempotency_uq" ON "scheduled_bookings" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "scheduled_bookings_workspace_idx" ON "scheduled_bookings" USING btree ("workspace_id","created_at");