import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";

// ─── Auth helpers ────────────────────────────────────────────────────────

export async function requireAuthSession() {
  const session = await getSession();
  if (!session) {
    return unauthorizedResponse();
  }
  return { session, ok: true };
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbiddenResponse(reason?: string) {
  return NextResponse.json({ error: "Forbidden", reason }, { status: 403 });
}

export function notFoundResponse(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function badRequestResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function conflictResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

// ─── Error handling ──────────────────────────────────────────────────────

export function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

export function handleRouteError(
  context: string,
  error: unknown,
): NextResponse {
  if (isUniqueConstraintError(error)) {
    return conflictResponse("A record with this value already exists");
  }
  if (error instanceof Error) {
    logHandledError(context, {}, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
  logHandledError(context, { error: String(error) });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// ─── Query / Body parsing ────────────────────────────────────────────────

export function parseSearchParams(
  req: NextRequest,
  schema: z.ZodType<Record<string, unknown>>,
) {
  const { searchParams } = new URL(req.url);
  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of searchParams.entries()) {
    raw[key] = value;
  }
  return schema.safeParse(raw);
}

export async function parseJsonBody<T>(
  req: NextRequest,
  schema: z.ZodType<T>,
): Promise<{ success: true; data: T } | { success: false; error: z.ZodError }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      success: false,
      error: new z.ZodError([
        { code: "custom", path: [], message: "Invalid JSON body" },
      ]),
    };
  }
  return schema.safeParse(body);
}
