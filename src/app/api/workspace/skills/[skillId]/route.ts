import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import {
  archiveAgentSkill,
  updateSkillManually,
} from "@/modules/skills/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { logHandledError } from "@/lib/logger";

const routeParamsSchema = z.object({ skillId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });
const updateSkillSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(1024).nullable(),
  markdownFiles: z
    .array(
      z.object({
        path: z.string().trim().min(1),
        content: z.string(),
      }),
    )
    .min(1),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ skillId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedParams = routeParamsSchema.safeParse(await params);
    const parsedBody = updateSkillSchema.safeParse(await req.json());
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "tools.configure",
      "workspace",
      parsedBody.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const skill = await updateSkillManually({
      workspaceId: parsedBody.data.workspaceId,
      userId: session.user.id,
      skillId: parsedParams.data.skillId,
      name: parsedBody.data.name,
      description: parsedBody.data.description,
      markdownFiles: parsedBody.data.markdownFiles,
    });

    return NextResponse.json({ skill });
  } catch (error) {
    if (error instanceof Error) {
      const expectedMessages = [
        "Skill not found",
        "At least one Markdown file is required",
        "All files must be .md files",
        "Total Markdown content exceeds size limit",
        "Skill name must be 1-64 chars and contain only lowercase letters, numbers, and hyphens",
        "Skill name cannot contain reserved words",
        "Skill description is required",
        "Skill description must be 1024 characters or less",
        "Skill metadata cannot contain XML or HTML tags",
      ];
      if (expectedMessages.includes(error.message)) {
        return NextResponse.json(
          { error: error.message },
          { status: error.message === "Skill not found" ? 404 : 400 },
        );
      }
    }
    logHandledError("Failed to update skill", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ skillId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedParams = routeParamsSchema.safeParse(await params);
    const { searchParams } = new URL(req.url);
    const parsedQuery = workspaceQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
    });

    if (!parsedParams.success || !parsedQuery.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "tools.configure",
      "workspace",
      parsedQuery.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    await archiveAgentSkill({
      workspaceId: parsedQuery.data.workspaceId,
      skillId: parsedParams.data.skillId,
      userId: session.user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Skill not found") {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    logHandledError("Failed to delete skill", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
