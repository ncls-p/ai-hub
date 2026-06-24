import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { runCustomToolBuilder } from "@/modules/custom-tools/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const messageSchema = z.object({
  workspaceId: z.uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(32_000),
      }),
    )
    .min(1)
    .max(40),
  credentialRefs: z
    .array(
      z.object({
        requestId: z.uuid(),
        credentialRef: z.uuid(),
      }),
    )
    .max(20)
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = messageSchema.safeParse(await req.json());
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

    return NextResponse.json(
      await runCustomToolBuilder({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        messages: parsed.data.messages,
        credentialRefs: parsed.data.credentialRefs,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to run builder";
    logHandledError("Custom tool builder failed", { message }, error as Error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
