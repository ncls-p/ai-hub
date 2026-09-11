import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireAdminApiSession } from "@/modules/admin/auth";
import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  aiProviders,
  organizations,
  teams,
  users,
  usageLimits,
} from "@/server/infrastructure/db/schema";
import { audit } from "@/server/domain/services/audit";
const limit = z
  .object({
    id: z.uuid().optional(),
    subjectType: z.enum(["user", "team", "organization"]),
    subjectId: z.uuid(),
    providerId: z.uuid().nullable(),
    modelId: z.uuid().nullable(),
    period: z.enum(["day", "month"]),
    tokenLimit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    requestLimit: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    costLimitUsd: z.number().min(0).max(1e9).nullable(),
  })
  .refine(
    (value) =>
      value.tokenLimit !== null ||
      value.requestLimit !== null ||
      value.costLimitUsd !== null,
  );
export async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;
  const [limits, userRows, teamRows, organizationRows, providers, models] =
    await Promise.all([
      db.select().from(usageLimits).orderBy(usageLimits.createdAt),
      db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users),
      db
        .select({
          id: teams.id,
          name: teams.name,
          organizationId: teams.organizationId,
        })
        .from(teams),
      db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations),
      db
        .select({ id: aiProviders.id, name: aiProviders.name })
        .from(aiProviders),
      db
        .select({
          id: aiModels.id,
          name: aiModels.modelId,
          providerId: aiModels.providerId,
        })
        .from(aiModels),
    ]);
  return NextResponse.json({
    limits,
    users: userRows,
    teams: teamRows,
    organizations: organizationRows,
    providers,
    models,
  });
}
export async function PUT(req: NextRequest) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;
  const parsed = limit.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  const input = parsed.data;
  const subjectTable =
    input.subjectType === "user"
      ? users
      : input.subjectType === "team"
        ? teams
        : organizations;
  const [subject] = await db
    .select({ id: subjectTable.id })
    .from(subjectTable)
    .where(eq(subjectTable.id, input.subjectId))
    .limit(1);
  if (!subject)
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  if (input.providerId) {
    const [provider] = await db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(eq(aiProviders.id, input.providerId))
      .limit(1);
    if (!provider)
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 },
      );
  }
  if (input.modelId) {
    const [model] = await db
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(
        and(
          eq(aiModels.id, input.modelId),
          input.providerId
            ? eq(aiModels.providerId, input.providerId)
            : undefined,
        ),
      )
      .limit(1);
    if (!model)
      return NextResponse.json(
        { error: "Model does not match provider" },
        { status: 400 },
      );
  }
  if (input.id) {
    const [existing] = await db
      .select()
      .from(usageLimits)
      .where(eq(usageLimits.id, input.id))
      .limit(1);
    if (!existing)
      return NextResponse.json({ error: "Limit not found" }, { status: 404 });
    if (
      existing.subjectType !== input.subjectType ||
      existing.subjectId !== input.subjectId ||
      existing.providerId !== input.providerId ||
      existing.modelId !== input.modelId ||
      existing.period !== input.period
    )
      return NextResponse.json(
        {
          error:
            "Create a new limit to change its scope or period; existing consumption is retained.",
        },
        { status: 409 },
      );
  }
  const { id, ...fields } = input;
  const values = {
    ...fields,
    costLimitUsd:
      input.costLimitUsd === null ? null : String(input.costLimitUsd),
    updatedAt: new Date(),
  };
  const [saved] = id
    ? await db
        .update(usageLimits)
        .set(values)
        .where(eq(usageLimits.id, id))
        .returning()
    : await db
        .insert(usageLimits)
        .values({ ...values, createdById: auth.session.user.id })
        .returning();
  if (!saved)
    return NextResponse.json({ error: "Limit not found" }, { status: 404 });
  await audit.emit({
    actorPrincipalType: "user",
    actorPrincipalId: auth.session.user.id,
    action: "usage.limit.saved",
    resourceType: "usage_limit",
    resourceId: saved.id,
    outcome: "success",
    metadata: fields,
  });
  return NextResponse.json({ limit: saved });
}
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;
  const parsed = z.object({ id: z.uuid() }).safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await db.delete(usageLimits).where(eq(usageLimits.id, parsed.data.id));
  await audit.emit({
    actorPrincipalType: "user",
    actorPrincipalId: auth.session.user.id,
    action: "usage.limit.deleted",
    resourceType: "usage_limit",
    resourceId: parsed.data.id,
    outcome: "success",
  });
  return NextResponse.json({ ok: true });
}
