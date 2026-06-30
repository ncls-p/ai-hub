import { and, count, desc, eq, ne } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/server/infrastructure/db";
import { appSettings, users } from "@/server/infrastructure/db/schema";

const REGISTRATION_SETTING_KEY = "registration";

type RegistrationSetting = {
  enabled: boolean;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: Date;
};

function isRegistrationSetting(value: unknown): value is RegistrationSetting {
  return (
    typeof value === "object" &&
    value !== null &&
    "enabled" in value &&
    typeof value.enabled === "boolean"
  );
}

export function isAdminRole(role?: string | null) {
  return role === "admin";
}

export async function ensureBootstrapAdmin() {
  const [{ value: adminCount }] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.role, "admin"));

  if (adminCount > 0) return null;

  const [firstUser] = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(users.createdAt)
    .limit(1);

  if (!firstUser) return null;

  await db
    .update(users)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(users.id, firstUser.id));

  return firstUser.id;
}

export async function getRegistrationSetting() {
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(eq(appSettings.key, REGISTRATION_SETTING_KEY))
    .limit(1);

  const setting = isRegistrationSetting(row?.valueJson)
    ? row.valueJson
    : { enabled: true };
  const [{ value: userCount }] = await db
    .select({ value: count() })
    .from(users);

  return {
    registrationEnabled: setting.enabled,
    userCount,
    canPublicSignUp: setting.enabled || userCount === 0,
  };
}

export async function setRegistrationEnabled(
  enabled: boolean,
  updatedById: string,
) {
  await db
    .insert(appSettings)
    .values({
      key: REGISTRATION_SETTING_KEY,
      valueJson: { enabled },
      updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        valueJson: { enabled },
        updatedById,
        updatedAt: new Date(),
      },
    });

  return getRegistrationSetting();
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      banned: users.banned,
      banReason: users.banReason,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .then((rows) =>
      rows.map((user) => ({
        ...user,
        role: user.role ?? "user",
      })),
    );
}

export async function createAdminManagedUser(input: {
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  headers: Headers;
}) {
  const result = await auth.api.createUser({
    headers: input.headers,
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
      role: input.role,
    },
  });

  return result.user;
}

async function getActiveAdminCount(exceptUserId?: string) {
  const conditions = [eq(users.role, "admin"), eq(users.banned, false)];
  if (exceptUserId) conditions.push(ne(users.id, exceptUserId));

  const [{ value }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(...conditions));

  return value;
}

export async function updateManagedUser(input: {
  actorUserId: string;
  userId: string;
  role?: "user" | "admin";
  banned?: boolean;
  banReason?: string;
}) {
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!target) throw new Error("User not found");
  if (input.actorUserId === input.userId && input.role === "user") {
    throw new Error("You cannot remove your own admin access");
  }
  if (input.actorUserId === input.userId && input.banned) {
    throw new Error("You cannot suspend your own account");
  }

  const wouldRemoveActiveAdmin =
    target.role === "admin" &&
    !target.banned &&
    (input.role === "user" || input.banned === true);

  if (wouldRemoveActiveAdmin) {
    const remainingAdmins = await getActiveAdminCount(input.userId);
    if (remainingAdmins === 0) {
      throw new Error("At least one active admin is required");
    }
  }

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.role) updates.role = input.role;
  if (input.banned !== undefined) {
    updates.banned = input.banned;
    updates.banReason = input.banned
      ? input.banReason || "Suspended by an admin"
      : null;
    updates.banExpires = null;
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, input.userId))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      banned: users.banned,
      banReason: users.banReason,
      createdAt: users.createdAt,
    });

  return { ...updated, role: updated.role ?? "user" };
}
