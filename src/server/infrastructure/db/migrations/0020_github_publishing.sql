CREATE TABLE IF NOT EXISTS "user_github_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"installation_id" varchar(64) NOT NULL,
	"account_login" varchar(255) NOT NULL,
	"account_id" varchar(64),
	"account_type" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"github_repository_id" varchar(64) NOT NULL,
	"owner" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"full_name" varchar(512) NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"default_branch" varchar(255) NOT NULL,
	"permissions_json" jsonb,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_publish_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid,
	"repository_id" uuid,
	"code_workspace_id" uuid NOT NULL,
	"conversation_id" uuid,
	"agent_id" uuid,
	"mode" varchar(24) NOT NULL,
	"target_branch" varchar(255) NOT NULL,
	"source_branch" varchar(255),
	"commit_sha" varchar(64),
	"pull_request_url" text,
	"status" varchar(24) NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_github_connections" ADD CONSTRAINT "user_github_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_github_repositories" ADD CONSTRAINT "user_github_repositories_connection_id_user_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."user_github_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_github_repositories" ADD CONSTRAINT "user_github_repositories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "github_publish_events" ADD CONSTRAINT "github_publish_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "github_publish_events" ADD CONSTRAINT "github_publish_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "github_publish_events" ADD CONSTRAINT "github_publish_events_connection_id_user_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."user_github_connections"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "github_publish_events" ADD CONSTRAINT "github_publish_events_repository_id_user_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."user_github_repositories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "github_publish_events" ADD CONSTRAINT "github_publish_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "github_publish_events" ADD CONSTRAINT "github_publish_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_github_connections_user" ON "user_github_connections" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_github_connections_user_installation_unique" ON "user_github_connections" USING btree ("user_id","installation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_github_repositories_user" ON "user_github_repositories" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_github_repositories_connection" ON "user_github_repositories" USING btree ("connection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_github_repositories_user_repo_unique" ON "user_github_repositories" USING btree ("user_id","owner","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_github_repositories_github_repo" ON "user_github_repositories" USING btree ("github_repository_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_publish_events_workspace" ON "github_publish_events" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_publish_events_user" ON "github_publish_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_publish_events_repository" ON "github_publish_events" USING btree ("repository_id");
