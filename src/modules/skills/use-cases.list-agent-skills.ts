import { resourceAvailabilityCondition } from "@/modules/iam/resource-availability";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agentSkillBindings,
  agentSkills,
} from "@/server/infrastructure/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  assertCanManageSkill,
  canManageSkill,
  canViewSkill,
} from "./use-cases.exec-file-async";

export async function listAgentSkills(
  workspaceId: string,
  userId?: string,
  canManageGlobal = false,
) {
  const rows = await db
    .select()
    .from(agentSkills)
    .where(
      and(
        resourceAvailabilityCondition({
          type: "skill",
          id: agentSkills.id,
          workspaceId: agentSkills.workspaceId,
          activeWorkspaceId: workspaceId,
        }),
        isNull(agentSkills.archivedAt),
      ),
    )
    .orderBy(
      sql`${agentSkills.isGlobal} DESC`,
      sql`${agentSkills.createdAt} DESC`,
    );
  if (!userId) {
    return rows.map((skill) => ({ ...skill, canEdit: true }));
  }
  return (
    await Promise.all(
      rows.map(async (skill) => {
        const visible = await canViewSkill(skill, userId);
        if (!visible) return null;
        return {
          ...skill,
          canEdit:
            canManageSkill(
              skill,
              userId,
              canManageGlobal && skill.workspaceId === workspaceId,
            ) ||
            (await authorization.hasDirectPermission(
              { principalType: "user", principalId: userId },
              "tools.configure",
              "skill",
              skill.id,
              workspaceId,
            )),
        };
      }),
    )
  ).filter((skill) => skill !== null);
}

export async function archiveAgentSkill(input: {
  workspaceId: string;
  skillId: string;
  userId: string;
  canManageGlobal?: boolean;
}) {
  const [existing] = await db
    .select()
    .from(agentSkills)
    .where(
      and(
        eq(agentSkills.id, input.skillId),
        eq(agentSkills.workspaceId, input.workspaceId),
        isNull(agentSkills.archivedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Skill not found");
  await assertCanManageSkill(existing, input.userId, input.canManageGlobal);

  const [skill] = await db
    .update(agentSkills)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(agentSkills.id, input.skillId))
    .returning();

  if (!skill) throw new Error("Skill not found");

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "skill.archived",
    resourceType: "workspace",
    resourceId: input.workspaceId,
    outcome: "success",
    metadata: { skillId: input.skillId },
  });
}

export async function getSkillBindingsForVersion(
  agentVersionId: string,
  visibility?: { workspaceId: string; userId: string },
) {
  const rows = await db
    .select({
      id: agentSkillBindings.id,
      skillId: agentSkillBindings.skillId,
      name: agentSkills.name,
      description: agentSkills.description,
      createdById: agentSkills.createdById,
      isGlobal: agentSkills.isGlobal,
    })
    .from(agentSkillBindings)
    .innerJoin(agentSkills, eq(agentSkillBindings.skillId, agentSkills.id))
    .where(
      visibility
        ? and(
            eq(agentSkillBindings.agentVersionId, agentVersionId),
            eq(agentSkills.workspaceId, visibility.workspaceId),
            isNull(agentSkills.archivedAt),
          )
        : and(
            eq(agentSkillBindings.agentVersionId, agentVersionId),
            isNull(agentSkills.archivedAt),
          ),
    );
  const visibleRows = visibility
    ? (
        await Promise.all(
          rows.map(async (row) =>
            (await canViewSkill(row, visibility.userId)) ? row : null,
          ),
        )
      ).filter((row) => row !== null)
    : rows;
  return visibleRows.map(({ id, skillId, name, description }) => ({
    id,
    skillId,
    name,
    description,
  }));
}

export type BindingDb = Pick<typeof db, "select" | "insert" | "delete">;

export async function replaceSkillBindingsForVersion(
  agentVersionId: string,
  workspaceId: string,
  skillIds: string[],
  options?: { userId?: string },
  executor: BindingDb = db,
) {
  const uniqueSkillIds = [...new Set(skillIds)];
  if (uniqueSkillIds.length === 0) {
    await executor
      .delete(agentSkillBindings)
      .where(eq(agentSkillBindings.agentVersionId, agentVersionId));
    return;
  }

  const availableSkills = await executor
    .select({
      id: agentSkills.id,
      createdById: agentSkills.createdById,
      isGlobal: agentSkills.isGlobal,
    })
    .from(agentSkills)
    .where(
      and(
        eq(agentSkills.workspaceId, workspaceId),
        inArray(agentSkills.id, uniqueSkillIds),
        isNull(agentSkills.archivedAt),
      ),
    );
  const visibleSkills = options?.userId
    ? (
        await Promise.all(
          availableSkills.map(async (skill) =>
            (await canViewSkill(skill, options.userId!)) ? skill : null,
          ),
        )
      ).filter((skill) => skill !== null)
    : availableSkills;
  const availableIds = new Set(visibleSkills.map((skill) => skill.id));
  const invalidSkillId = uniqueSkillIds.find(
    (skillId) => !availableIds.has(skillId),
  );
  if (invalidSkillId) throw new Error("Skill not found");

  await executor
    .delete(agentSkillBindings)
    .where(eq(agentSkillBindings.agentVersionId, agentVersionId));

  await executor.insert(agentSkillBindings).values(
    uniqueSkillIds.map((skillId) => ({
      agentVersionId,
      skillId,
    })),
  );
}
