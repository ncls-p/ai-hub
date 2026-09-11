import {
  handleRoute,
  requireRequestPermissionScopeAsync,
  requireResourcePermissionAsync,
  requireWorkspaceMemberAsync,
} from "@/lib/route-handler";
import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import {
  imageGenerationConfigSchema,
  sustainabilityConfigSchema,
} from "@/modules/provider/model-runtime-config";
import {
  createModel,
  discoverModels,
  getProviderById,
  listModels,
} from "@/modules/provider/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ providerId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });
const modelLogoUrlSchema = z
  .string()
  .max(350_000)
  .regex(
    /^data:image\/(?!svg\+xml)[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/,
  )
  .nullable();

const createModelSchema = z.object({
  workspaceId: z.uuid(),
  modelId: z.string().min(1).max(255),
  displayName: z.string().min(1).max(255).optional(),
  logoUrl: modelLogoUrlSchema.optional(),
  capabilitiesJson: z.record(z.string(), z.boolean()).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  inputTokenCost: z.string().optional(),
  outputTokenCost: z.string().optional(),
  imageGenerationConfigJson: imageGenerationConfigSchema.optional(),
  sustainabilityConfigJson: sustainabilityConfigSchema.optional(),
});
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const { searchParams } = req.nextUrl;
      const parsedQuery = workspaceQuerySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { providerId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const action = searchParams.get("action");
      if (action === "discover") {
        const forbidden = await requireResourcePermissionAsync(
          session.user.id,
          workspaceId,
          "models.sync",
          "provider",
          providerId,
        );
        if (forbidden) return forbidden;
        const provider = await getProviderById(providerId, workspaceId);
        if (!provider) {
          return NextResponse.json(
            { error: "Provider not found" },
            { status: 404 },
          );
        }
        return NextResponse.json(await discoverModels(providerId, workspaceId));
      }
      const scopeForbidden = await requireRequestPermissionScopeAsync(
        session.user.id,
        workspaceId,
        "models.view",
      );
      if (scopeForbidden) return scopeForbidden;
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        workspaceId,
      );
      if (forbidden) return forbidden;
      const provider = await getProviderById(providerId, workspaceId, true);
      if (!provider) {
        return NextResponse.json(
          { error: "Provider not found" },
          { status: 404 },
        );
      }
      const models = await listModels(providerId);
      const visibleModels = await Promise.all(
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
      );
      return NextResponse.json(visibleModels.filter((model) => model !== null));
    },
    { logLabel: "Failed to list provider models" },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = createModelSchema.safeParse(await req.json());
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
        "models.create",
        "provider",
        providerId,
      );
      if (forbidden) return forbidden;
      const provider = await getProviderById(providerId, workspaceId);
      if (!provider) {
        return NextResponse.json(
          { error: "Provider not found" },
          { status: 404 },
        );
      }
      const model = await createModel(providerId, { providerId, ...input });
      return NextResponse.json(model, { status: 201 });
    },
    { logLabel: "Failed to create model" },
  );
}
