import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { roles } from "@/server/infrastructure/db/schema";

// Custom role slugs cannot contain dots, so users cannot create this reserved name.
export const standardRoleName = (name: string) => `custom.standard.${name}`;
export function standardRoleKey(role: { name: string; isSystem: boolean }) {
  return role.isSystem
    ? role.name
    : role.name.startsWith("custom.standard.")
      ? role.name.slice("custom.standard.".length)
      : null;
}
export function visibleScopedRoles<
  T extends { name: string; isSystem: boolean },
>(rows: T[]) {
  const customized = new Set(
    rows.filter((row) => !row.isSystem).map(standardRoleKey),
  );
  return rows.filter((row) => !row.isSystem || !customized.has(row.name));
}
export async function resolveStandardRole<T extends typeof roles.$inferSelect>(
  role: T,
  scopeType: "organization" | "workspace",
  scopeId: string,
): Promise<T | typeof roles.$inferSelect> {
  if (!role.isSystem || role.name === "organization.owner") return role;
  const [customized] = await db
    .select()
    .from(roles)
    .where(
      and(
        eq(roles.isSystem, false),
        eq(roles.name, standardRoleName(role.name)),
        eq(roles.ownerResourceType, scopeType),
        eq(roles.ownerResourceId, scopeId),
      ),
    )
    .limit(1);
  return customized ?? role;
}
