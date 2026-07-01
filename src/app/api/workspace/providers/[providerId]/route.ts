import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  archiveProvider,
  getProviderById,
  toSafeProvider,
  updateProvider,
} from "@/modules/provider/use-cases";

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
  return requireWorkspacePermissionAsync(userId, workspaceId, permissionName);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
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
      const forbidden = await requireProviderPermission(
        session.user.id,
        workspaceId,
        "providers.viewMetadata",
      );
      if (forbidden) return forbidden;
      const provider = await getProviderById(providerId, workspaceId);
      if (!provider) {
        return NextResponse.json(
          { error: "Provider not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(toSafeProvider(provider));
    },
    { logLabel: "Failed to get provider" },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
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
      const forbidden = await requireProviderPermission(
        session.user.id,
        workspaceId,
        "providers.update",
      );
      if (forbidden) return forbidden;
      await updateProvider({
        providerId,
        workspaceId,
        userId: session.user.id,
        ...input,
      });
      const provider = await getProviderById(providerId, workspaceId);
      return NextResponse.json(provider ? toSafeProvider(provider) : null);
    },
    {
      logLabel: "Failed to update provider",
      expectedError: (error) => {
        if (error instanceof Error && error.message === "Provider not found") {
          return NextResponse.json(
            { error: "Provider not found" },
            { status: 404 },
          );
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
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
      const forbidden = await requireProviderPermission(
        session.user.id,
        workspaceId,
        "providers.delete",
      );
      if (forbidden) return forbidden;
      await archiveProvider(providerId, workspaceId, session.user.id);
      return NextResponse.json({ ok: true });
    },
    {
      logLabel: "Failed to delete provider",
      expectedError: (error) => {
        if (error instanceof Error && error.message === "Provider not found") {
          return NextResponse.json(
            { error: "Provider not found" },
            { status: 404 },
          );
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
