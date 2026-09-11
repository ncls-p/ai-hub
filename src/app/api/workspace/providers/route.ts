import {
  DEFAULT_OPENAI_COMPATIBLE_API_ROUTE,
  OPENAI_COMPATIBLE_API_ROUTES,
} from "@/lib/openai-compatible-api";
import {
  DEFAULT_OPENAI_COMPATIBILITY_PROFILE,
  OPENAI_COMPATIBILITY_PROFILES,
} from "@/lib/openai-compatibility-profile";
import {
  handleRoute,
  requireRequestPermissionScopeAsync,
  requireWorkspaceMemberAsync,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  hasResourcePermissionForRequest,
  hasWorkspacePermissionForRequest,
} from "@/modules/auth/workspace-access";
import {
  createProvider,
  listModels,
  listProviders,
  toSafeProvider,
} from "@/modules/provider/use-cases";
import type { aiModels, aiProviders } from "@/server/infrastructure/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const providerKindSchema = z.enum([
  "openai-compatible",
  "anthropic-compatible",
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
  openaiCompatibleApiRoute: z
    .enum(OPENAI_COMPATIBLE_API_ROUTES)
    .default(DEFAULT_OPENAI_COMPATIBLE_API_ROUTE),
  openaiCompatibilityProfile: z
    .enum(OPENAI_COMPATIBILITY_PROFILES)
    .default(DEFAULT_OPENAI_COMPATIBILITY_PROFILE),
  workspaceId: z.uuid(),
});

const listProvidersSchema = z.object({
  workspaceId: z.uuid(),
  includeModels: z.enum(["true", "false"]).optional(),
});

type ProviderModelRow = typeof aiModels.$inferSelect;
type ProviderCatalogItem = {
  provider: ReturnType<typeof toSafeProvider> | null;
  models: ProviderModelRow[];
};

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { searchParams } = req.nextUrl;
      const parsed = listProvidersSchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
        includeModels: searchParams.get("includeModels") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      }
      const scopeForbidden = await requireRequestPermissionScopeAsync(
        session.user.id,
        parsed.data.workspaceId,
        "providers.viewMetadata",
      );
      if (scopeForbidden) return scopeForbidden;
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (forbidden) return forbidden;
      const workspaceId = parsed.data.workspaceId;
      const includeModels = parsed.data.includeModels === "true";
      const [providers, canViewAllProviders, canViewAllModels] =
        await Promise.all([
          listProviders(workspaceId),
          hasWorkspacePermissionForRequest(
            session.user.id,
            workspaceId,
            "providers.viewMetadata",
          ),
          hasWorkspacePermissionForRequest(
            session.user.id,
            workspaceId,
            "models.view",
          ),
        ]);

      const catalog: ProviderCatalogItem[] = await Promise.all(
        providers.map(async (provider: typeof aiProviders.$inferSelect) => {
          const models = (await listModels(provider.id)) as ProviderModelRow[];
          const [canViewProvider, visibleModels] = await Promise.all([
            canViewAllProviders && provider.workspaceId === workspaceId
              ? Promise.resolve(true)
              : hasResourcePermissionForRequest(
                  session.user.id,
                  workspaceId,
                  "providers.viewMetadata",
                  "provider",
                  provider.id,
                ),
            canViewAllModels && provider.workspaceId === workspaceId
              ? Promise.resolve(models)
              : Promise.all(
                  models.map(async (model) =>
                    (await hasResourcePermissionForRequest(
                      session.user.id,
                      workspaceId,
                      "models.view",
                      "model",
                      model.id,
                    ))
                      ? model
                      : null,
                  ),
                ).then((rows) => rows.filter((model) => model !== null)),
          ]);

          return {
            provider:
              canViewProvider || visibleModels.length > 0
                ? toSafeProvider(
                    provider,
                    await hasResourcePermissionForRequest(
                      session.user.id,
                      workspaceId,
                      "providers.update",
                      "provider",
                      provider.id,
                    ),
                  )
                : null,
            models: visibleModels,
          };
        }),
      );
      const visibleProviders = catalog
        .map(({ provider }) => provider)
        .filter((provider) => provider !== null);

      return NextResponse.json(
        includeModels
          ? {
              providers: visibleProviders,
              models: catalog.flatMap(({ models }) => models),
            }
          : visibleProviders,
      );
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
