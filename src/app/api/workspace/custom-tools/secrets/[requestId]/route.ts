import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { submitSecretRequest } from "@/modules/custom-tools/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const submitSchema = z.object({
  workspaceId: z.uuid(),
  values: z.record(z.string(), z.string().max(20_000)),
  provider: z.string().trim().max(128).optional(),
  label: z.string().trim().max(255).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { requestId } = await params;
    const idParse = z.uuid().safeParse(requestId);
    if (!idParse.success)
      return NextResponse.json(
        { error: "Invalid request id" },
        { status: 400 },
      );

    const parsed = submitSchema.safeParse(await req.json());
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
      await submitSecretRequest({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        requestId,
        values: parsed.data.values,
        provider: parsed.data.provider,
        label: parsed.data.label,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to submit secrets";
    logHandledError(
      "Custom tool secret submission failed",
      { message },
      error as Error,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
