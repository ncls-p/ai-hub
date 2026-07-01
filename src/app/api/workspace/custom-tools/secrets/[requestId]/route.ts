import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { submitSecretRequest } from "@/modules/custom-tools/use-cases";

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
  return handleRoute(
    req,
    async ({ session }) => {
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
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.configure",
      );
      if (forbidden) return forbidden;
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
    },
    {
      logLabel: "Custom tool secret submission failed",
      expectedError: (error) => {
        const message =
          error instanceof Error ? error.message : "Unable to submit secrets";
        return NextResponse.json({ error: message }, { status: 500 });
      },
    },
  );
}
