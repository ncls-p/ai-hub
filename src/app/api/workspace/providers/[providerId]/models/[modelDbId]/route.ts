import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  deleteModel,
  getModelById,
  getProviderById,
  updateModel,
} from "@/modules/provider/use-cases";

const paramsSchema = z.object({
  providerId: z.uuid(),
  modelDbId: z.uuid(),
});

const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });
const modelLogoUrlSchema = z
  .string()
  .max(350_000)
  .regex(
    /^data:image\/(?!svg\+xml)[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/,
  )
  .nullable();

const updateModelSchema = z.object({
  workspaceId: z.uuid(),
  displayName: z.string().min(1).max(255).optional(),
  logoUrl: modelLogoUrlSchema.optional(),
  capabilitiesJson: z.record(z.string(), z.boolean()).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  inputTokenCost: z.string().optional(),
  outputTokenCost: z.string().optional(),
  enabled: z.boolean().optional(),
});

async function requirePermission(
  userId: string,
  workspaceId: string,
  permissionName: string,
) {
  return requireWorkspacePermissionAsync(userId, workspaceId, permissionName);
}

async function assertModelBelongsToProvider(
  modelDbId: string,
  providerId: string,
) {
  const model = await getModelById(modelDbId);
  return model?.providerId === providerId ? model : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string; modelDbId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = updateModelSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json(
          {
            error: "Invalid input",
            details: parsedBody.success ? undefined : parsedBody.error.issues,
          },
          { status: 400 },
        );
      }
      const { providerId, modelDbId } = parsedParams.data;
      const { workspaceId, ...input } = parsedBody.data;
      const forbidden = await requirePermission(
        session.user.id,
        workspaceId,
        "models.update",
      );
      if (forbidden) return forbidden;
      const provider = await getProviderById(providerId, workspaceId);
      const model = await assertModelBelongsToProvider(modelDbId, providerId);
      if (!provider || !model) {
        return NextResponse.json({ error: "Model not found" }, { status: 404 });
      }
      await updateModel(modelDbId, input);
      return NextResponse.json(await getModelById(modelDbId));
    },
    { logLabel: "Failed to update model" },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string; modelDbId: string }> },
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
      const { providerId, modelDbId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const forbidden = await requirePermission(
        session.user.id,
        workspaceId,
        "models.delete",
      );
      if (forbidden) return forbidden;
      const provider = await getProviderById(providerId, workspaceId);
      const model = await assertModelBelongsToProvider(modelDbId, providerId);
      if (!provider || !model) {
        return NextResponse.json({ error: "Model not found" }, { status: 404 });
      }
      await deleteModel(modelDbId);
      return NextResponse.json({ ok: true });
    },
    { logLabel: "Failed to delete model" },
  );
}
