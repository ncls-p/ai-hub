CREATE TABLE IF NOT EXISTS "conversation_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.conversation_folders'::regclass
			AND conname = 'conversation_folders_workspace_id_workspaces_id_fk'
	) THEN
		ALTER TABLE "conversation_folders" ADD CONSTRAINT "conversation_folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.conversation_folders'::regclass
			AND conname = 'conversation_folders_user_id_user_id_fk'
	) THEN
		ALTER TABLE "conversation_folders" ADD CONSTRAINT "conversation_folders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "folder_id" uuid;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "sidebar_order" integer;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.conversations'::regclass
			AND conname = 'conversations_folder_id_conversation_folders_id_fk'
	) THEN
		ALTER TABLE "conversations" ADD CONSTRAINT "conversations_folder_id_conversation_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."conversation_folders"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_folders_user_workspace_order" ON "conversation_folders" USING btree ("user_id","workspace_id","archived_at","sort_order","created_at","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_sidebar_order" ON "conversations" USING btree ("user_id","workspace_id","folder_id","pinned_at","sidebar_order","updated_at","id");
