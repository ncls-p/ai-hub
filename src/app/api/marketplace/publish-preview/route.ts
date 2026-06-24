import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { getPublishPreview } from "@/modules/marketplace/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const schema = z
  .object({
    workspaceId: z.uuid(),
    agentId: z.uuid().optional(),
    skillId: z.uuid().optional(),
    customToolId: z.uuid().optional(),
    mcpServerId: z.uuid().optional(),
    mcpToolId: z.uuid().optional(),
    itemId: z.uuid().optional(),
    includeSecrets: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
  })
  .refine(
    (data) => {
      const ids = [
        data.agentId,
        data.skillId,
        data.customToolId,
        data.mcpServerId,
        data.mcpToolId,
        data.itemId,
      ].filter(Boolean);
      return ids.length === 1;
    },
    { message: "Exactly one resource id is required" },
  );

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const parsed = schema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      agentId: searchParams.get("agentId") ?? undefined,
      skillId: searchParams.get("skillId") ?? undefined,
      customToolId: searchParams.get("customToolId") ?? undefined,
      mcpServerId: searchParams.get("mcpServerId") ?? undefined,
      mcpToolId: searchParams.get("mcpToolId") ?? undefined,
      itemId: searchParams.get("itemId") ?? undefined,
      includeSecrets: searchParams.get("includeSecrets") ?? undefined,
    });
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "marketplaceItems.publish",
      "workspace",
      parsed.data.workspaceId,
    );
    if (!permission.granted)
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );

    return NextResponse.json(
      await getPublishPreview({
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        agentId: parsed.data.agentId,
        skillId: parsed.data.skillId,
        customToolId: parsed.data.customToolId,
        mcpServerId: parsed.data.mcpServerId,
        mcpToolId: parsed.data.mcpToolId,
        itemId: parsed.data.itemId,
        includeSecrets: parsed.data.includeSecrets,
      }),
    );
  } catch (error) {
    logHandledError("Failed to get publish preview", {}, error as Error);
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
