import { and, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
	organizations,
	roleBindings,
	roles,
	workspaceMembers,
	workspaces,
} from "@/server/infrastructure/db/schema";

export interface CreateWorkspaceInput {
	userId: string;
	organizationName: string;
	organizationSlug: string;
	workspaceName: string;
	workspaceSlug: string;
}

async function seedSystemRoles(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	createdById: string,
) {
	const seededRoles = new Map<string, typeof roles.$inferSelect>();

	for (const systemRole of SYSTEM_ROLES) {
		const [insertedRole] = await tx
			.insert(roles)
			.values({
				scopeType: systemRole.scopeType,
				ownerResourceType: null,
				ownerResourceId: null,
				name: systemRole.name,
				displayName: systemRole.displayName,
				description: systemRole.description,
				permissionsJson: systemRole.permissions,
				isSystem: true,
				createdById,
			})
			.onConflictDoNothing()
			.returning();

		const role =
			insertedRole ??
			(
				await tx
					.select()
					.from(roles)
					.where(
						and(
							eq(roles.scopeType, systemRole.scopeType),
							eq(roles.name, systemRole.name),
							eq(roles.isSystem, true),
						),
					)
					.limit(1)
			)[0];

		if (!role) {
			throw new Error(`Failed to seed system role: ${systemRole.name}`);
		}

		seededRoles.set(systemRole.name, role);
	}

	return seededRoles;
}

export async function createWorkspace(input: CreateWorkspaceInput) {
	const {
		userId,
		organizationName,
		organizationSlug,
		workspaceName,
		workspaceSlug,
	} = input;

	const { workspace, organization } = await db.transaction(async (tx) => {
		let [organization] = await tx
			.select()
			.from(organizations)
			.where(eq(organizations.slug, organizationSlug))
			.limit(1);

		if (!organization) {
			[organization] = await tx
				.insert(organizations)
				.values({
					name: organizationName,
					slug: organizationSlug,
				})
				.returning();
		}

		const [workspace] = await tx
			.insert(workspaces)
			.values({
				organizationId: organization.id,
				name: workspaceName,
				slug: workspaceSlug,
				createdById: userId,
			})
			.returning();

		await tx.insert(workspaceMembers).values({
			workspaceId: workspace.id,
			userId,
			status: "active",
		});

		const seededRoles = await seedSystemRoles(tx, userId);
		const workspaceOwnerRole = seededRoles.get("workspace.owner");

		if (!workspaceOwnerRole) {
			throw new Error("Workspace owner system role is not available");
		}

		await tx.insert(roleBindings).values({
			principalType: "user",
			principalId: userId,
			roleId: workspaceOwnerRole.id,
			resourceType: "workspace",
			resourceId: workspace.id,
			createdById: userId,
		});

		return { workspace, organization };
	});

	await audit.emit({
		organizationId: organization.id,
		workspaceId: workspace.id,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "workspace.created",
		resourceType: "workspace",
		resourceId: workspace.id,
		outcome: "success",
		metadata: { workspaceName, organizationId: organization.id },
	});

	logger.info("Workspace created", { workspaceId: workspace.id, userId });
	return workspace;
}

export async function getWorkspaceBySlug(slug: string) {
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.slug, slug), isNull(workspaces.archivedAt)))
		.limit(1);

	return workspace || null;
}

export async function getWorkspacesByUserId(userId: string) {
	return db
		.select({
			workspace: workspaces,
			member: workspaceMembers,
		})
		.from(workspaceMembers)
		.innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
		.where(
			and(
				eq(workspaceMembers.userId, userId),
				eq(workspaceMembers.status, "active"),
				isNull(workspaces.archivedAt),
			),
		);
}
