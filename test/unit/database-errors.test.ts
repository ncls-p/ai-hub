import { describe, expect, it } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import { isUniqueConstraintError } from "@/lib/database-errors";

describe("database unique constraint errors", () => {
  it("recognizes PostgreSQL errors through nested Drizzle causes", () => {
    const error = Object.assign(new Error("duplicate"), { code: "23505" });
    expect(isUniqueConstraintError(error)).toBe(true);
    expect(
      isUniqueConstraintError(
        new Error("transaction", {
          cause: new DrizzleQueryError("insert ...", [], error),
        }),
      ),
    ).toBe(true);
  });
  it.each([
    null,
    undefined,
    "23505",
    {},
    { code: "23503" },
    new Error("23505"),
    new Error("query", { cause: { code: "23503" } }),
  ])("rejects unrelated errors: %s", (error) => {
    expect(isUniqueConstraintError(error)).toBe(false);
  });
  it("terminates on circular causes", () => {
    const error = new Error("cycle");
    error.cause = error;
    expect(isUniqueConstraintError(error)).toBe(false);
  });
});
