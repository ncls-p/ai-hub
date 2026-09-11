import { and, eq } from "drizzle-orm";

import type {
  OrganizationTheme,
  OrganizationThemeConfig,
} from "@/modules/organization/themes";
import type { OrganizationHeroConfig } from "@/modules/organization/hero-branding";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { organizations, workspaces } from "@/server/infrastructure/db/schema";
export {
  ORGANIZATION_THEMES,
  type OrganizationTheme,
  type OrganizationThemeConfig,
} from "@/modules/organization/themes";

async function organizationForWorkspace(workspaceId: string) {
  const [row] = await db
    .select({ organization: organizations })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(and(eq(workspaces.id, workspaceId)))
    .limit(1);
  return row?.organization ?? null;
}

export async function getOrganizationBranding(input: {
  workspaceId?: string;
  organizationId?: string;
  userId: string;
}) {
  const organization = input.organizationId
    ? (
        await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, input.organizationId))
          .limit(1)
      )[0]
    : input.workspaceId
      ? await organizationForWorkspace(input.workspaceId)
      : null;
  if (!organization) return null;
  const principal = {
    principalType: "user" as const,
    principalId: input.userId,
  };
  const [readPermission, managePermission] = await Promise.all([
    authorization.checkPermission(
      principal,
      "organization.get",
      "organization",
      organization.id,
    ),
    authorization.checkPermission(
      principal,
      "organization.update",
      "organization",
      organization.id,
    ),
  ]);
  if (!readPermission.granted) return null;
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    logoUrl: organization.logoUrl,
    theme: organization.theme as OrganizationTheme,
    themeConfig: organization.themeConfigJson,
    heroConfig: organization.heroConfigJson,
    canManage: managePermission.granted,
  };
}

export async function updateOrganizationBranding(input: {
  workspaceId?: string;
  organizationId?: string;
  userId: string;
  logoUrl: string | null;
  theme: OrganizationTheme;
  themeConfig: OrganizationThemeConfig | null;
  heroConfig: OrganizationHeroConfig | null;
}) {
  const current = await getOrganizationBranding(input);
  if (!current) return { status: "not_found" as const };
  if (!current.canManage) return { status: "forbidden" as const };
  const [organization] = await db
    .update(organizations)
    .set({
      logoUrl: input.logoUrl,
      theme: input.theme,
      themeConfigJson: input.themeConfig,
      heroConfigJson: input.heroConfig,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, current.organizationId))
    .returning();
  return { status: "updated" as const, organization };
}
