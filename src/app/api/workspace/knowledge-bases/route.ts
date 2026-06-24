import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  createKnowledgeBase,
  listKnowledgeBases,
} from "@/modules/knowledge/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2048).optional(),
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

export async function GET(req: NextRequest) {
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
    return NextResponse.json(await listKnowledgeBases(parsed.data.workspaceId));
  } catch (error) {
    logHandledError("Failed to list knowledge bases", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
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
    const knowledgeBase = await createKnowledgeBase({
      ...parsed.data,
      userId: session.user.id,
    });
    return NextResponse.json(knowledgeBase, { status: 201 });
  } catch (error) {
    logHandledError("Failed to create knowledge base", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
