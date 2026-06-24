import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  ingestTextDocument,
  listDocuments,
} from "@/modules/knowledge/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
  workspaceId: z.uuid(),
  title: z.string().min(1).max(512),
  content: z.string().min(1).max(2_000_000),
  sourceType: z.enum(["text", "url"]).optional(),
});
async function ensure(
  userId: string,
  workspaceId: string,
  permissionName: string,
) {
  return authorization.requirePermission(
    { principalType: "user", principalId: userId },
    permissionName,
    "workspace",
    workspaceId,
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = querySchema.safeParse({
      workspaceId: new URL(req.url).searchParams.get("workspaceId"),
    });
    if (!parsed.success)
      return NextResponse.json(
        { error: "workspaceId must be a valid UUID" },
        { status: 400 },
      );
    const permission = await ensure(
      session.user.id,
      parsed.data.workspaceId,
      "knowledgeBases.viewAllowed",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { knowledgeBaseId } = await params;
    return NextResponse.json(
      await listDocuments(knowledgeBaseId, parsed.data.workspaceId),
    );
  } catch (error) {
    logHandledError("Failed to list documents", {}, error as Error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500,
      },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    const permission = await ensure(
      session.user.id,
      parsed.data.workspaceId,
      "knowledgeBases.manage",
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    const { knowledgeBaseId } = await params;
    const document = await ingestTextDocument({
      knowledgeBaseId,
      userId: session.user.id,
      ...parsed.data,
    });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    logHandledError("Failed to ingest document", {}, error as Error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500,
      },
    );
  }
}
