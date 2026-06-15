UPDATE "marketplace_items"
SET "visibility" = 'private'
WHERE "visibility" IN ('unlisted', 'organization');--> statement-breakpoint
ALTER TABLE "marketplace_items" ALTER COLUMN "visibility" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "marketplace_item_visibility" RENAME TO "marketplace_item_visibility_old";--> statement-breakpoint
CREATE TYPE "public"."marketplace_item_visibility" AS ENUM('public', 'private');--> statement-breakpoint
ALTER TABLE "marketplace_items" ALTER COLUMN "visibility" TYPE "public"."marketplace_item_visibility" USING "visibility"::text::"public"."marketplace_item_visibility";--> statement-breakpoint
ALTER TABLE "marketplace_items" ALTER COLUMN "visibility" SET DEFAULT 'private';--> statement-breakpoint
DROP TYPE "public"."marketplace_item_visibility_old";