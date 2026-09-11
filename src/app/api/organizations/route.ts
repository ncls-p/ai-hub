import { addOrganizationUser } from "@/modules/organization/add-organization-user";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { getRequestAuthContext } from "@/modules/auth/request-auth-context";
import {
  createOrganizationOnly,
  createOrganizationProject,
  listManagedOrganizations,
} from "@/modules/organization/organization-management";
import { IamOperationError } from "@/modules/iam/use-cases.iam-operation-error";
const mutation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("addMember"),
    organizationId: z.uuid(),
    email: z.email(),
  }),
  z.object({
    action: z.literal("createOrganization"),
    name: z.string().trim().min(2).max(255),
  }),
  z.object({
    action: z.literal("createProject"),
    name: z.string().trim().min(2).max(255),
    organizationId: z.uuid(),
  }),
]);
export async function GET(req: NextRequest) {
  return handleRoute(req, async ({ session }) => {
    if (getRequestAuthContext()?.type === "api_key")
      return NextResponse.json(
        { error: "User session required" },
        { status: 403 },
      );
    return NextResponse.json({
      organizations: await listManagedOrganizations(
        session.user.id,
        await isPlatformAdminSession(session),
      ),
    });
  });
}
export async function POST(req: NextRequest) {
  return handleRoute(req, async ({ session }) => {
    if (getRequestAuthContext()?.type === "api_key")
      return NextResponse.json(
        { error: "User session required" },
        { status: 403 },
      );
    const parsed = mutation.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    try {
      if (parsed.data.action === "addMember")
        return NextResponse.json(
          await addOrganizationUser({
            ...parsed.data,
            actorUserId: session.user.id,
          }),
        );
      if (parsed.data.action === "createOrganization")
        return NextResponse.json(
          {
            organization: await createOrganizationOnly(
              session.user.id,
              parsed.data.name,
            ),
            project: null,
          },
          { status: 201 },
        );
      return NextResponse.json(
        {
          project: await createOrganizationProject({
            ...parsed.data,
            userId: session.user.id,
            platformAdmin: await isPlatformAdminSession(session),
          }),
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof IamOperationError)
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      throw error;
    }
  });
}
