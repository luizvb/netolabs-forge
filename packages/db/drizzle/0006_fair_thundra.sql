ALTER TABLE "agents" ADD COLUMN "reasoning_effort" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_public_id_uq" ON "agents" USING btree ("public_id");