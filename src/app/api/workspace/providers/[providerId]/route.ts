import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
  archiveProvider,
  getProviderById,
  toSafeProvider,
  updateProvider,
} from "@/modules/provider/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const routeParamsSchema = z.object({
  providerId: z.uuid(),
});

const workspaceQuerySchema = z.object({
  workspaceId: z.uuid(),
});

const updateProviderSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255).optional(),
  baseUrl: z.url().optional().or(z.literal("")),
  apiKey: z.string().min(1).optional().or(z.literal("")),
  headersJson: z.record(z.string(), z.string()).optional(),
  queryParamsJson: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

async function requireProviderPermission(
  userId: string,
  workspaceId: string,
  permissionName: string,
) {
  return authorization.requirePermission(
    { principalType: "user", principalId: userId },
    permissionName,
    "workspace",
    workspaceId,
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
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

    const { providerId } = parsedParams.data;
    const { workspaceId } = parsedQuery.data;

    const permission = await requireProviderPermission(
      session.user.id,
      workspaceId,
      "providers.viewMetadata",
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const provider = await getProviderById(providerId, workspaceId);
    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(toSafeProvider(provider));
  } catch (error) {
    logHandledError("Failed to get provider", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedParams = routeParamsSchema.safeParse(await params);
    const body = await req.json();
    const parsedBody = updateProviderSchema.safeParse(body);

    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: parsedBody.success ? undefined : parsedBody.error.issues,
        },
        { status: 400 },
      );
    }

    const { providerId } = parsedParams.data;
    const { workspaceId, ...input } = parsedBody.data;

    const permission = await requireProviderPermission(
      session.user.id,
      workspaceId,
      "providers.update",
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    await updateProvider({
      providerId,
      workspaceId,
      userId: session.user.id,
      ...input,
    });

    const provider = await getProviderById(providerId, workspaceId);
    return NextResponse.json(provider ? toSafeProvider(provider) : null);
  } catch (error) {
    if ((error as Error).message === "Provider not found") {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }

    logHandledError("Failed to update provider", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
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

    const { providerId } = parsedParams.data;
    const { workspaceId } = parsedQuery.data;

    const permission = await requireProviderPermission(
      session.user.id,
      workspaceId,
      "providers.delete",
    );
    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    await archiveProvider(providerId, workspaceId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Provider not found") {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }

    logHandledError("Failed to delete provider", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
