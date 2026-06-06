CREATE TYPE "public"."custom_tool_status" AS ENUM('draft', 'awaiting_secrets', 'workflow_created', 'active', 'failed', 'disabled');--> statement-breakpoint
CREATE TABLE "custom_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"n8n_workflow_id" varchar(255),
	"n8n_workflow_url" text,
	"status" "custom_tool_status" DEFAULT 'draft' NOT NULL,
	"input_schema_json" jsonb,
	"output_schema_json" jsonb,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_tool_secret_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"custom_tool_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"fields_json" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"credential_ref_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_tool_credential_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(128) NOT NULL,
	"label" varchar(255) NOT NULL,
	"n8n_credential_id" varchar(255),
	"encrypted_payload" text NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_tools" ADD CONSTRAINT "custom_tools_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tools" ADD CONSTRAINT "custom_tools_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tool_secret_requests" ADD CONSTRAINT "custom_tool_secret_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tool_secret_requests" ADD CONSTRAINT "custom_tool_secret_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tool_secret_requests" ADD CONSTRAINT "custom_tool_secret_requests_custom_tool_id_custom_tools_id_fk" FOREIGN KEY ("custom_tool_id") REFERENCES "public"."custom_tools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tool_credential_refs" ADD CONSTRAINT "custom_tool_credential_refs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tool_credential_refs" ADD CONSTRAINT "custom_tool_credential_refs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_tools_workspace" ON "custom_tools" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "custom_tool_secret_requests_workspace" ON "custom_tool_secret_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "custom_tool_secret_requests_user" ON "custom_tool_secret_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "custom_tool_credential_refs_workspace" ON "custom_tool_credential_refs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "custom_tool_credential_refs_user" ON "custom_tool_credential_refs" USING btree ("user_id");
