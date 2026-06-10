ALTER TABLE "marketplace_items" ADD COLUMN "source_resource_type" varchar(32);--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD COLUMN "source_resource_id" uuid;--> statement-breakpoint
CREATE INDEX "marketplace_items_source_resource" ON "marketplace_items" USING btree ("source_resource_type","source_resource_id");
