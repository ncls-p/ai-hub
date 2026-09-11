import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import { OPENAI_COMPATIBLE_API_ROUTES } from "@/lib/openai-compatible-api";
import { OPENAI_COMPATIBILITY_PROFILES } from "@/lib/openai-compatibility-profile";
import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import {
  archiveProvider,
  getProviderById,
  toSafeProvider,
  updateProvider,
} from "@/modules/provider/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
  openaiCompatibleApiRoute: z.enum(OPENAI_COMPATIBLE_API_ROUTES).optional(),
  openaiCompatibilityProfile: z.enum(OPENAI_COMPATIBILITY_PROFILES).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const { searchParams } = req.nextUrl;
      const parsedQuery = workspaceQuerySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { providerId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "providers.viewMetadata",
        "provider",
        providerId,
      );
      if (forbidden) return forbidden;
      const provider = await getProviderById(providerId, workspaceId, true);
      if (!provider) {
        return NextResponse.json(
          { error: "Provider not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        toSafeProvider(
          provider,
          await hasResourcePermissionForRequest(
            session.user.id,
            workspaceId,
            "providers.update",
            "provider",
            provider.id,
          ),
        ),
      );
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
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "providers.update",
        "provider",
        providerId,
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
      const { searchParams } = req.nextUrl;
      const parsedQuery = workspaceQuerySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { providerId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "providers.delete",
        "provider",
        providerId,
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
