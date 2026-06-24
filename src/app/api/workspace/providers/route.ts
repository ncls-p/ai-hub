import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import {
  createProvider,
  listProviders,
  toSafeProvider,
} from "@/modules/provider/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { logHandledError } from "@/lib/logger";

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
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const { workspaceId } = parsed.data;

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "providers.viewMetadata",
      "workspace",
      workspaceId,
    );

    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const providers = await listProviders(workspaceId);
    return NextResponse.json(providers.map(toSafeProvider));
  } catch (error) {
    logHandledError("Failed to list providers", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createProviderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { workspaceId, ...input } = parsed.data;

    const permission = await authorization.requirePermission(
      { principalType: "user", principalId: session.user.id },
      "providers.create",
      "workspace",
      workspaceId,
    );

    if (!permission.granted) {
      return NextResponse.json(
        { error: "Forbidden", reason: permission.reason },
        { status: 403 },
      );
    }

    const provider = await createProvider({
      workspaceId,
      userId: session.user.id,
      ...input,
    });

    return NextResponse.json(toSafeProvider(provider), { status: 201 });
  } catch (error) {
    logHandledError("Failed to create provider", {}, error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
