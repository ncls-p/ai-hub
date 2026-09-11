import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import {
  listProjectTransferDestinations,
  previewProjectTransfer,
} from "@/modules/iam/project-transfer.preview";
import { executeProjectTransfer } from "@/modules/iam/project-transfer.execute";
import { expectedIamError } from "../../transfer-route-support";
const schema = z.object({
  sourceWorkspaceId: z.uuid(),
  targetOrganizationId: z.uuid(),
  action: z.enum(["preview", "execute"]),
  confirmationToken: z.string().length(64).optional(),
});
export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = z
        .uuid()
        .safeParse(req.nextUrl.searchParams.get("sourceWorkspaceId"));
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid source project" },
          { status: 400 },
        );
      return NextResponse.json({
        destinations: await listProjectTransferDestinations({
          actorUserId: session.user.id,
          sourceWorkspaceId: parsed.data,
        }),
      });
    },
    {
      allowApiKey: false,
      expectedError: expectedIamError,
      logLabel: "Failed to list project destinations",
    },
  );
}
export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = schema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid project transfer" },
          { status: 400 },
        );
      const input = { ...parsed.data, actorUserId: session.user.id };
      if (input.action === "preview")
        return NextResponse.json(await previewProjectTransfer(input));
      if (!input.confirmationToken)
        return NextResponse.json(
          { error: "Preview the transfer first" },
          { status: 400 },
        );
      return NextResponse.json(
        await executeProjectTransfer({
          ...input,
          confirmationToken: input.confirmationToken,
        }),
      );
    },
    {
      allowApiKey: false,
      expectedError: expectedIamError,
      logLabel: "Failed to transfer project",
    },
  );
}
