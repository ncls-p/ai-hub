import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  createSkillManually,
  installSkillsFromCommand,
  listAgentSkills,
} from "@/modules/skills/use-cases";

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

const installErrorMessages = [
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

function isExpectedInstallError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      installErrorMessages.includes(error.message) ||
      error.message.startsWith("Unsupported install option") ||
      error.message.startsWith("Missing skill name")
    );
  }
  return false;
}

const createErrorMessages = [
  "At least one Markdown file is required",
  "All files must be .md files",
  "Total Markdown content exceeds size limit",
  "Skill name must be 1-64 chars and contain only lowercase letters, numbers, and hyphens",
  "Skill name cannot contain reserved words",
  "Skill description is required",
  "Skill description must be 1024 characters or less",
  "Skill metadata cannot contain XML or HTML tags",
];

function isExpectedCreateError(error: unknown): boolean {
  return error instanceof Error && createErrorMessages.includes(error.message);
}

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
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
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "agents.get",
      );
      if (forbidden) return forbidden;
      return NextResponse.json(await listAgentSkills(parsed.data.workspaceId));
    },
    { logLabel: "Failed to list skills" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = installSkillSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.configure",
      );
      if (forbidden) return forbidden;
      const skills = await installSkillsFromCommand({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        installCommand: parsed.data.installCommand,
      });
      return NextResponse.json({ skills }, { status: 201 });
    },
    {
      logLabel: "Failed to install skill",
      expectedError: (error) => {
        if (isExpectedInstallError(error)) {
          return NextResponse.json(
            { error: (error as Error).message },
            { status: 400 },
          );
        }
        return null;
      },
    },
  );
}

export async function PUT(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createSkillSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.configure",
      );
      if (forbidden) return forbidden;
      const skill = await createSkillManually({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description,
        markdownFiles: parsed.data.markdownFiles,
      });
      return NextResponse.json({ skill }, { status: 201 });
    },
    {
      logLabel: "Failed to create skill",
      expectedError: (error) => {
        if (isExpectedCreateError(error)) {
          return NextResponse.json(
            { error: (error as Error).message },
            { status: 400 },
          );
        }
        return null;
      },
    },
  );
}
