-- Repair production databases where Drizzle skipped migrations whose journal
-- timestamps were lower than 0011_message_part_suggestions.

ALTER TABLE "agent_skills" ALTER COLUMN "source_package" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_skills" ALTER COLUMN "install_command" DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_user_workspace_updated" ON "conversations" USING btree ("user_id","workspace_id","status","archived_at","updated_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public'
			AND t.typname = 'scheduled_task_frequency'
	) THEN
		CREATE TYPE "public"."scheduled_task_frequency" AS ENUM('daily', 'interval');
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public'
			AND t.typname = 'scheduled_task_status'
	) THEN
		CREATE TYPE "public"."scheduled_task_status" AS ENUM('idle', 'running', 'success', 'failed');
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"conversation_id" uuid,
	"title" varchar(255) NOT NULL,
	"prompt" text NOT NULL,
	"frequency" "scheduled_task_frequency" NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"time_of_day" varchar(5),
	"interval_minutes" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" "scheduled_task_status" DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.scheduled_tasks'::regclass
			AND conname = 'scheduled_tasks_workspace_id_workspaces_id_fk'
	) THEN
		ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.scheduled_tasks'::regclass
			AND conname = 'scheduled_tasks_user_id_user_id_fk'
	) THEN
		ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.scheduled_tasks'::regclass
			AND conname = 'scheduled_tasks_agent_id_agents_id_fk'
	) THEN
		ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.scheduled_tasks'::regclass
			AND conname = 'scheduled_tasks_conversation_id_conversations_id_fk'
	) THEN
		ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_tasks_due" ON "scheduled_tasks" USING btree ("enabled","next_run_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_tasks_workspace_user" ON "scheduled_tasks" USING btree ("workspace_id","user_id");
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		JOIN pg_enum e ON e.enumtypid = t.oid
		WHERE n.nspname = 'public'
			AND t.typname = 'marketplace_item_visibility'
			AND e.enumlabel IN ('unlisted', 'organization')
	) THEN
		UPDATE "marketplace_items"
		SET "visibility" = 'private'
		WHERE "visibility"::text IN ('unlisted', 'organization');

		ALTER TABLE "marketplace_items" ALTER COLUMN "visibility" DROP DEFAULT;
		ALTER TYPE "marketplace_item_visibility" RENAME TO "marketplace_item_visibility_old";
		CREATE TYPE "public"."marketplace_item_visibility" AS ENUM('public', 'private');
		ALTER TABLE "marketplace_items" ALTER COLUMN "visibility" TYPE "public"."marketplace_item_visibility" USING "visibility"::text::"public"."marketplace_item_visibility";
		ALTER TABLE "marketplace_items" ALTER COLUMN "visibility" SET DEFAULT 'private';
		DROP TYPE "public"."marketplace_item_visibility_old";
	END IF;
END $$;
