import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import {
  createSkillManually,
  installSkillsFromCommand,
  listAgentSkills,
} from "@/modules/skills/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { logHandledError } from "@/lib/logger";

const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });
const installSkillSchema = z.object({
  workspaceId: z.uuid(),
  installCommand: z.string().trim().min(1).max(700),
});
const createSkillSchema = z.object({
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

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = workspaceQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "workspaceId must be a valid UUID" },
        { status: 400 },
      );
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "agents.get",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    return NextResponse.json(await listAgentSkills(parsed.data.workspaceId));
  } catch (error) {
    logHandledError("Failed to list skills", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = installSkillSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "tools.configure",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const skills = await installSkillsFromCommand({
      workspaceId: parsed.data.workspaceId,
      userId: session.user.id,
      installCommand: parsed.data.installCommand,
    });

    return NextResponse.json({ skills }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      const expectedMessages = [
        "Install command is required",
        "Install command is too long",
        "Install command contains an unterminated quote",
        "Only `npx skills add ...` commands are supported",
        "Only `skills add` install commands are supported",
        "Install command must include a skill package",
        "Only GitHub owner/repository skill packages are supported",
        "Choose a specific skill with `--skill <name>` or `owner/repo@skill`",
        "Skill names must be explicit and contain only letters, numbers, dot, dash or underscore",
        "The install command did not produce any skill directory",
        "No Markdown files were found in the installed skill",
      ];
      if (
        expectedMessages.includes(error.message) ||
        error.message.startsWith("Unsupported install option") ||
        error.message.startsWith("Missing skill name")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    logHandledError("Failed to install skill", {}, error as Error);
    return NextResponse.json(
      { error: "Skill install failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = createSkillSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "tools.configure",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const skill = await createSkillManually({
      workspaceId: parsed.data.workspaceId,
      userId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      markdownFiles: parsed.data.markdownFiles,
    });

    return NextResponse.json({ skill }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      const expectedMessages = [
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
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    logHandledError("Failed to create skill", {}, error as Error);
    return NextResponse.json(
      { error: "Skill creation failed" },
      { status: 500 },
    );
  }
}
