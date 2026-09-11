import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { organizations } from "@/server/infrastructure/db/schema";

export async function requireOrganizationSettingsScope(request: NextRequest) {
  const session = await getSession();
  if (!session?.user)
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  const parsed = z
    .uuid()
    .safeParse(request.nextUrl.searchParams.get("organizationId"));
  if (!parsed.success)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "An organizationId is required" },
        { status: 400 },
      ),
    };
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, parsed.data))
    .limit(1);
  const permission =
    organization &&
    (await authorization.checkPermission(
      { principalType: "user", principalId: session.user.id },
      "organization.update",
      "organization",
      organization.id,
    ));
  if (!permission?.granted)
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  return { ok: true as const, organizationId: parsed.data, session };
}
