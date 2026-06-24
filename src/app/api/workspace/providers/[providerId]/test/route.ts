import { NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { testProviderConnection } from "@/modules/provider/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const paramsSchema = z.object({ providerId: z.uuid() });
const bodySchema = z.object({ workspaceId: z.uuid() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ providerId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedParams = paramsSchema.safeParse(await params);
    const parsedBody = bodySchema.safeParse(await req.json());
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { providerId } = parsedParams.data;
    const { workspaceId } = parsedBody.data;

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "providers.test",
      "workspace",
      workspaceId,
    );

    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const health = await testProviderConnection(providerId, workspaceId);
    return NextResponse.json(health);
  } catch (error) {
    if ((error as Error).message === "Provider not found") {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }

    logHandledError("Failed to test provider", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
