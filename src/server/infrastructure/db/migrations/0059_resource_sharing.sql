DROP INDEX "role_bindings_unique_assignment";--> statement-breakpoint
ALTER TABLE "role_bindings" ADD COLUMN "grant_source" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
UPDATE role_bindings
SET grant_source = 'agent:' || (condition_json->>'rootAgentId')
WHERE condition_json->>'source' = 'agent_direct_share'
  AND condition_json->>'rootAgentId' IS NOT NULL
  AND NOT (resource_type = 'agent' AND resource_id::text = condition_json->>'rootAgentId');
--> statement-breakpoint
CREATE UNIQUE INDEX "role_bindings_unique_assignment" ON "role_bindings" USING btree ("principal_type","principal_id","role_id","resource_type","resource_id","grant_source");
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "public_share_includes_files" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX "message_parts_attachment_reference" ON "message_parts" USING btree (("metadata_json"->>'id')) WHERE "message_parts"."type" = 'file';--> statement-breakpoint
CREATE INDEX "message_parts_code_reference" ON "message_parts" USING btree (("metadata_json"->>'projectId')) WHERE "message_parts"."type" = 'file';
