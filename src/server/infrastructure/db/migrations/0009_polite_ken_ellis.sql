ALTER TYPE "public"."marketplace_item_type" ADD VALUE 'skill';--> statement-breakpoint
ALTER TYPE "public"."marketplace_item_type" ADD VALUE 'custom_tool';--> statement-breakpoint
CREATE TABLE "marketplace_item_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"shared_with_user_id" uuid NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_skills" ALTER COLUMN "source_package" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_skills" ALTER COLUMN "install_command" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD COLUMN "featured_order" integer;--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD COLUMN "featured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD COLUMN "total_downloads" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD COLUMN "tags_json" jsonb;--> statement-breakpoint
ALTER TABLE "marketplace_item_shares" ADD CONSTRAINT "marketplace_item_shares_item_id_marketplace_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."marketplace_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_item_shares" ADD CONSTRAINT "marketplace_item_shares_shared_with_user_id_user_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_item_shares_item_user_unique" ON "marketplace_item_shares" USING btree ("item_id","shared_with_user_id");--> statement-breakpoint
CREATE INDEX "marketplace_items_featured" ON "marketplace_items" USING btree ("is_featured","featured_order");--> statement-breakpoint
CREATE INDEX "marketplace_items_type" ON "marketplace_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "marketplace_items_published" ON "marketplace_items" USING btree ("status","visibility","published_at");