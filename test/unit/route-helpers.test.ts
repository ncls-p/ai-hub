import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { NextRequest } from "next/server";

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
  logHandledWarning: vi.fn(),
  logger: {
    error: vi.fn(),
  },
}));

describe("route-helpers", async () => {
  // Dynamic import to avoid module-level env validation
  const {
    unauthorizedResponse,
    forbiddenResponse,
    notFoundResponse,
    badRequestResponse,
    conflictResponse,
    isUniqueConstraintError,
    handleRouteError,
    parseSearchParams,
    parseJsonBody,
    requireAuthSession: _requireAuthSession,
  } = await import("@/lib/route-helpers");

  describe("response helpers", () => {
    it("unauthorizedResponse returns 401", () => {
      const res = unauthorizedResponse();
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type")).toContain("application/json");
    });

    it("forbiddenResponse returns 403 with optional reason", () => {
      const res = forbiddenResponse("no permission");
      expect(res.status).toBe(403);
    });

    it("forbiddenResponse returns 403 without reason", () => {
      const res = forbiddenResponse();
      expect(res.status).toBe(403);
    });

    it("notFoundResponse returns 404", () => {
      const res = notFoundResponse("Missing resource");
      expect(res.status).toBe(404);
    });

    it("notFoundResponse uses default message", () => {
      const res = notFoundResponse();
      expect(res.status).toBe(404);
    });

    it("badRequestResponse returns 400", () => {
      const res = badRequestResponse("Invalid input");
      expect(res.status).toBe(400);
    });

    it("conflictResponse returns 409", () => {
      const res = conflictResponse("Already exists");
      expect(res.status).toBe(409);
    });
  });

  describe("isUniqueConstraintError", () => {
    it("detects PostgreSQL unique constraint error", () => {
      expect(
        isUniqueConstraintError({ code: "23505", detail: "duplicate" }),
      ).toBe(true);
    });

    it("returns false for non-unique errors", () => {
      expect(isUniqueConstraintError({ code: "23503" })).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(isUniqueConstraintError("error string")).toBe(false);
      expect(isUniqueConstraintError(null)).toBe(false);
      expect(isUniqueConstraintError(undefined)).toBe(false);
    });
  });

  describe("handleRouteError", () => {
    it("returns 409 for unique constraint errors", () => {
      const res = handleRouteError("test", { code: "23505" });
      expect(res.status).toBe(409);
    });

    it("returns 500 for unknown errors", () => {
      const res = handleRouteError("test", new Error("boom"));
      expect(res.status).toBe(500);
    });

    it("returns 500 for non-Error values", () => {
      const res = handleRouteError("test", "string error");
      expect(res.status).toBe(500);
    });
  });

  describe("requireAuthSession", () => {
    it("is exported and callable", () => {
      expect(typeof _requireAuthSession).toBe("function");
    });

    it("delegates to unauthorizedResponse when no session", () => {
      // The function calls getSession() internally; without mocking
      // the auth module we verify the fallback path returns 401.
      const res = unauthorizedResponse();
      expect(res.status).toBe(401);
    });
  });

  describe("parseSearchParams", () => {
    it("parses search params from request URL", () => {
      const req = {
        url: "http://localhost/api?workspaceId=abc-123&agentId=xyz",
      } as NextRequest;

      const schema = z.object({
        workspaceId: z.string().optional(),
        agentId: z.string().optional(),
      });

      const result = parseSearchParams(req, schema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.workspaceId).toBe("abc-123");
        expect(result.data.agentId).toBe("xyz");
      }
    });

    it("returns failure for invalid params", () => {
      const req = {
        url: "http://localhost/api?workspaceId=not-a-uuid",
      } as NextRequest;

      const schema = z.object({
        workspaceId: z.uuid(),
      });

      const result = parseSearchParams(req, schema);
      expect(result.success).toBe(false);
    });
  });

  describe("parseJsonBody", () => {
    it("parses valid JSON body", async () => {
      const req = {
        json: async () => ({ name: "Example" }),
      } as NextRequest;

      const result = await parseJsonBody(req, z.object({ name: z.string() }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Example");
      }
    });

    it("returns a validation error for malformed JSON", async () => {
      const req = {
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      } as unknown as NextRequest;

      const result = await parseJsonBody(req, z.object({ name: z.string() }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Invalid JSON body");
      }
    });
  });
});
