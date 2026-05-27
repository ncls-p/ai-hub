ALTER TABLE "agent_versions"
ADD COLUMN "max_tool_calls" integer NOT NULL DEFAULT 6;
