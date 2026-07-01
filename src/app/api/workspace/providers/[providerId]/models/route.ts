import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  createModel,
  discoverModels,
  getProviderById,
  listModels,
} from "@/modules/provider/use-cases";

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
});

async function requirePermission(
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
      const parsedParams = paramsSchema.safeParse(await params);
      const { searchParams } = new URL(req.url);
      const parsedQuery = workspaceQuerySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { providerId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const action = searchParams.get("action");
      const forbidden = await requirePermission(
        session.user.id,
        workspaceId,
        action === "discover" ? "models.sync" : "models.view",
      );
      if (forbidden) return forbidden;
      const provider = await getProviderById(providerId, workspaceId);
      if (!provider) {
        return NextResponse.json(
          { error: "Provider not found" },
          { status: 404 },
        );
      }
      if (action === "discover") {
        const discovered = await discoverModels(providerId, workspaceId);
        return NextResponse.json(discovered);
      }
      const models = await listModels(providerId);
      return NextResponse.json(models);
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
      const forbidden = await requirePermission(
        session.user.id,
        workspaceId,
        "models.create",
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
