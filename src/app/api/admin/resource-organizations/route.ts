import { listAccessResources } from "@/server/infrastructure/db/access-resource-repository";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireAdminApiSession } from "@/modules/admin/auth";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  resourceOrganizationShares,
} from "@/server/infrastructure/db/schema";
import { setResourceOrganizations } from "@/modules/iam/organization-resource-sharing";
import { IamOperationError } from "@/modules/iam/use-cases.iam-operation-error";
const resource = z.object({
  resourceType: z.enum([
    "agent",
    "provider",
    "model",
    "knowledge_base",
    "mcp_server",
    "skill",
    "workflow",
    "custom_tool",
  ]),
  resourceId: z.uuid(),
});
export async function GET(req: NextRequest) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;
  if (!req.nextUrl.searchParams.has("resourceId")) {
    const query = resource
      .pick({ resourceType: true })
      .extend({
        workspaceId: z.uuid(),
        search: z.string().max(255).optional(),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!query.success)
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json(
      await listAccessResources({
        ...query.data,
        type: query.data.resourceType,
        limit: 100,
      }),
    );
  }
  const input = resource.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!input.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const [available, shares] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .orderBy(organizations.name),
    db
      .selectDistinct({ id: resourceOrganizationShares.organizationId })
      .from(resourceOrganizationShares)
      .where(
        and(
          eq(
            resourceOrganizationShares.rootResourceType,
            input.data.resourceType,
          ),
          eq(resourceOrganizationShares.rootResourceId, input.data.resourceId),
        ),
      ),
  ]);
  return NextResponse.json({
    organizations: available,
    organizationIds: shares.map((row) => row.id),
  });
}
export async function PUT(req: NextRequest) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;
  const input = resource
    .extend({
      organizationIds: z.array(z.uuid()).max(200),
      includeDependencies: z.boolean().default(false),
    })
    .safeParse(await req.json());
  if (!input.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    return NextResponse.json(
      await setResourceOrganizations({
        ...input.data,
        actorUserId: auth.session.user.id,
      }),
    );
  } catch (error) {
    if (error instanceof IamOperationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
}
