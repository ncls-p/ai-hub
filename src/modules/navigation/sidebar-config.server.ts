import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import { appSettings } from "@/server/infrastructure/db/schema";

import {
  defaultSidebarNavConfig,
  type SidebarNavConfig,
  sidebarNavConfigSchema,
} from "./sidebar-config";

const SIDEBAR_NAV_SETTING_KEY = "sidebarNavigation";

function parseSidebarNavConfig(value: unknown): SidebarNavConfig {
  const parsed = sidebarNavConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultSidebarNavConfig();
}

export async function getSidebarNavConfig(): Promise<SidebarNavConfig | null> {
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(eq(appSettings.key, SIDEBAR_NAV_SETTING_KEY))
    .limit(1);
  if (!row) return null;
  return parseSidebarNavConfig(row.valueJson);
}

export async function setSidebarNavConfig(
  input: SidebarNavConfig,
  updatedById: string,
) {
  const value = sidebarNavConfigSchema.parse(input);
  await db
    .insert(appSettings)
    .values({
      key: SIDEBAR_NAV_SETTING_KEY,
      valueJson: value,
      updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: value, updatedById, updatedAt: new Date() },
    });
  return getSidebarNavConfig();
}

export async function deleteSidebarNavConfig() {
  await db
    .delete(appSettings)
    .where(eq(appSettings.key, SIDEBAR_NAV_SETTING_KEY));
}
