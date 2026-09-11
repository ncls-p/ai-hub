CREATE TABLE "resource_organization_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"root_resource_type" varchar(32) NOT NULL,
	"root_resource_id" uuid NOT NULL,
	"resource_type" varchar(32) NOT NULL,
	"resource_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_limit_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"limit_id" uuid NOT NULL,
	"invocation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tokens" bigint NOT NULL,
	"cost_usd" numeric(20, 8) NOT NULL,
	"status" varchar(12) DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" varchar(20) NOT NULL,
	"subject_id" uuid NOT NULL,
	"provider_id" uuid,
	"model_id" uuid,
	"period" varchar(10) NOT NULL,
	"token_limit" bigint,
	"request_limit" bigint,
	"cost_limit_usd" numeric(20, 8),
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_folders" DROP CONSTRAINT "conversation_folders_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_agent_version_id_agent_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "resource_organization_shares" ADD CONSTRAINT "resource_organization_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_organization_shares" ADD CONSTRAINT "resource_organization_shares_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_limit_charges" ADD CONSTRAINT "usage_limit_charges_limit_id_usage_limits_id_fk" FOREIGN KEY ("limit_id") REFERENCES "public"."usage_limits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_limits" ADD CONSTRAINT "usage_limits_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_org_share_unique" ON "resource_organization_shares" USING btree ("resource_type","resource_id","organization_id","root_resource_type","root_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_limit_invocation" ON "usage_limit_charges" USING btree ("limit_id","invocation_id");--> statement-breakpoint
CREATE INDEX "usage_limit_period_charges" ON "usage_limit_charges" USING btree ("limit_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_limits_subject" ON "usage_limits" USING btree ("subject_type","subject_id");