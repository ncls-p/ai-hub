import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  createProvider,
  listProviders,
  toSafeProvider,
} from "@/modules/provider/use-cases";

const providerKindSchema = z.enum([
  "openai-compatible",
  "dragonfly",
  "vercel-ai-gateway",
  "native",
]);

const providerAuthTypeSchema = z.enum([
  "bearer",
  "x-api-key",
  "custom-header",
  "gateway",
]);

const createProviderSchema = z.object({
  kind: providerKindSchema,
  name: z.string().min(1).max(255),
  baseUrl: z.url().optional().or(z.literal("")),
  authType: providerAuthTypeSchema,
  apiKey: z.string().min(1).optional().or(z.literal("")),
  headersJson: z.record(z.string(), z.string()).optional(),
  queryParamsJson: z.record(z.string(), z.string()).optional(),
  workspaceId: z.uuid(),
});

const listProvidersSchema = z.object({
  workspaceId: z.uuid(),
});

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { searchParams } = new URL(req.url);
      const parsed = listProvidersSchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "providers.viewMetadata",
      );
      if (forbidden) return forbidden;
      const providers = await listProviders(parsed.data.workspaceId);
      return NextResponse.json(providers.map(toSafeProvider));
    },
    { logLabel: "Failed to list providers" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createProviderSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const { workspaceId, ...input } = parsed.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "providers.create",
      );
      if (forbidden) return forbidden;
      const provider = await createProvider({
        workspaceId,
        userId: session.user.id,
        ...input,
      });
      return NextResponse.json(toSafeProvider(provider), { status: 201 });
    },
    { logLabel: "Failed to create provider" },
  );
}
