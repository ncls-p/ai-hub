import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  createScheduledTask,
  listScheduledTasks,
} from "@/modules/scheduled-tasks/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });

const createSchema = z.object({
  workspaceId: z.uuid(),
  agentId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  prompt: z.string().trim().min(1).max(8_000),
  frequency: z.enum(["daily", "interval"]),
  timezone: z.string().trim().min(1).max(64).optional(),
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  intervalMinutes: z.number().int().min(5).max(43_200).nullable().optional(),
  enabled: z.boolean().optional(),
});

async function requireChatPermission(userId: string, workspaceId: string) {
  const isMember = await authorization.requireWorkspaceMember(
    userId,
    workspaceId,
  );
  if (!isMember) return false;
  return authorization.hasPermission(
    { principalType: "user", principalId: userId },
    "agents.chat",
    "workspace",
    workspaceId,
  );
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = querySchema.safeParse({
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const allowed = await requireChatPermission(
      session.user.id,
      parsed.data.workspaceId,
    );
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      tasks: await listScheduledTasks(parsed.data.workspaceId, session.user.id),
    });
  } catch (error) {
    logHandledError("Failed to list scheduled tasks", {}, error as Error);
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

    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const allowed = await requireChatPermission(
      session.user.id,
      parsed.data.workspaceId,
    );
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const task = await createScheduledTask({
      ...parsed.data,
      userId: session.user.id,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    logHandledError("Failed to create scheduled task", {}, error as Error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 400 },
    );
  }
}
