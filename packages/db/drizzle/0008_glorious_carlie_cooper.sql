CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"calendar_id" text NOT NULL,
	"calendar_name" text NOT NULL,
	"calendar_time_zone" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_by_user_id" uuid,
	"last_validated_at" timestamp with time zone,
	"token_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_bookings" ADD COLUMN "external_provider" text;--> statement-breakpoint
ALTER TABLE "scheduled_bookings" ADD COLUMN "external_event_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_bookings" ADD COLUMN "external_event_url" text;--> statement-breakpoint
ALTER TABLE "scheduled_bookings" ADD COLUMN "external_conference_url" text;--> statement-breakpoint
ALTER TABLE "scheduled_bookings" ADD COLUMN "external_sync_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_bookings" ADD COLUMN "external_sync_error" text;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connections_agent_provider_uq" ON "calendar_connections" USING btree ("agent_id","provider");--> statement-breakpoint
CREATE INDEX "calendar_connections_workspace_idx" ON "calendar_connections" USING btree ("workspace_id","created_at");