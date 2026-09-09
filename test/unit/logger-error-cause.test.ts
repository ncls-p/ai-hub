import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/env", () => ({ env: { NODE_ENV: "production" } }));
import { logger } from "@/lib/logger";

afterEach(() => vi.restoreAllMocks());

it("includes the database cause in server error logs", () => {
  const write = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  const cause = Object.assign(new Error("duplicate key"), {
    code: "23505",
    constraint: "agents_workspace_slug_unique",
  });
  logger.error(
    "Failed to create agent",
    {},
    new Error("Failed query", { cause }),
  );
  expect(JSON.parse(String(write.mock.calls[0][0]))).toMatchObject({
    lvl: "error",
    error: "Failed query",
    cause: {
      message: "duplicate key",
      code: "23505",
      constraint: "agents_workspace_slug_unique",
    },
  });
});
