import { and, count, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
	organizations,
	roleBindings,
	roles,
	users,
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
			organization: organizations,
		})
		.from(workspaceMembers)
		.innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
		.innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
		.where(
			and(
				eq(workspaceMembers.userId, userId),
				eq(workspaceMembers.status, "active"),
				isNull(workspaces.archivedAt),
			),
		);
}

export async function countWorkspaces() {
	const [{ value }] = await db.select({ value: count() }).from(workspaces);
	return value;
}

async function getSystemWorkspaceRole(roleName: string) {
	const [role] = await db
		.select()
		.from(roles)
		.where(
			and(
				eq(roles.scopeType, "workspace"),
				eq(roles.name, roleName),
				eq(roles.isSystem, true),
			),
		)
		.limit(1);

	return role ?? null;
}

export async function findUserByEmail(email: string) {
	const [user] = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
		})
		.from(users)
		.where(eq(users.email, email.toLowerCase().trim()))
		.limit(1);

	return user ?? null;
}

export async function listWorkspaceMembers(workspaceId: string) {
	const members = await db
		.select({
			id: workspaceMembers.id,
			userId: workspaceMembers.userId,
			status: workspaceMembers.status,
			createdAt: workspaceMembers.createdAt,
			name: users.name,
			email: users.email,
		})
		.from(workspaceMembers)
		.innerJoin(users, eq(workspaceMembers.userId, users.id))
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				eq(workspaceMembers.status, "active"),
			),
		);

	const bindings = await db
		.select({
			principalId: roleBindings.principalId,
			roleName: roles.name,
		})
		.from(roleBindings)
		.innerJoin(roles, eq(roleBindings.roleId, roles.id))
		.where(
			and(
				eq(roleBindings.resourceType, "workspace"),
				eq(roleBindings.resourceId, workspaceId),
				eq(roleBindings.principalType, "user"),
			),
		);

	const roleByUserId = new Map(
		bindings.map((binding) => [binding.principalId, binding.roleName]),
	);

	return members.map((member) => ({
		...member,
		roleName: roleByUserId.get(member.userId) ?? "workspace.member",
	}));
}

export async function addWorkspaceMember(input: {
	workspaceId: string;
	userId: string;
	roleName?: string;
	invitedBy: string;
}) {
	const { workspaceId, userId, invitedBy } = input;
	const roleName = input.roleName ?? "workspace.member";

	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
		.limit(1);

	if (!workspace) {
		throw new Error("Workspace not found");
	}

	const [existingMember] = await db
		.select()
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				eq(workspaceMembers.userId, userId),
			),
		)
		.limit(1);

	if (existingMember?.status === "active") {
		throw new Error("User is already a workspace member");
	}

	const role = await getSystemWorkspaceRole(roleName);
	if (!role) {
		throw new Error(`Role not found: ${roleName}`);
	}

	await db.transaction(async (tx) => {
		if (existingMember) {
			await tx
				.update(workspaceMembers)
				.set({ status: "active", updatedAt: new Date() })
				.where(eq(workspaceMembers.id, existingMember.id));
		} else {
			await tx.insert(workspaceMembers).values({
				workspaceId,
				userId,
				status: "active",
			});
		}

		const [existingBinding] = await tx
			.select()
			.from(roleBindings)
			.where(
				and(
					eq(roleBindings.principalType, "user"),
					eq(roleBindings.principalId, userId),
					eq(roleBindings.resourceType, "workspace"),
					eq(roleBindings.resourceId, workspaceId),
				),
			)
			.limit(1);

		if (!existingBinding) {
			await tx.insert(roleBindings).values({
				principalType: "user",
				principalId: userId,
				roleId: role.id,
				resourceType: "workspace",
				resourceId: workspaceId,
				createdById: invitedBy,
			});
		}
	});

	await authorization.invalidatePermissionCache(
		userId,
		"workspace",
		workspaceId,
	);

	await audit.emit({
		organizationId: workspace.organizationId,
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: invitedBy,
		action: "workspace.member.added",
		resourceType: "workspace",
		resourceId: workspaceId,
		outcome: "success",
		metadata: { userId, roleName },
	});

	logger.info("Workspace member added", { workspaceId, userId, invitedBy });
}

export async function removeWorkspaceMember(input: {
	workspaceId: string;
	userId: string;
	removedBy: string;
}) {
	const { workspaceId, userId, removedBy } = input;

	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.limit(1);

	if (!workspace) {
		throw new Error("Workspace not found");
	}

	const [member] = await db
		.select()
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				eq(workspaceMembers.userId, userId),
				eq(workspaceMembers.status, "active"),
			),
		)
		.limit(1);

	if (!member) {
		throw new Error("Member not found");
	}

	await db
		.update(workspaceMembers)
		.set({ status: "removed", updatedAt: new Date() })
		.where(eq(workspaceMembers.id, member.id));

	await authorization.invalidatePermissionCache(
		userId,
		"workspace",
		workspaceId,
	);

	await audit.emit({
		organizationId: workspace.organizationId,
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: removedBy,
		action: "workspace.member.removed",
		resourceType: "workspace",
		resourceId: workspaceId,
		outcome: "success",
		metadata: { userId },
	});

	logger.info("Workspace member removed", { workspaceId, userId, removedBy });
}

export async function updateWorkspaceMemberRole(input: {
	workspaceId: string;
	userId: string;
	roleName: "workspace.member" | "workspace.owner" | "workspace.admin";
	updatedBy: string;
}) {
	const { workspaceId, userId, roleName, updatedBy } = input;

	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.limit(1);
	if (!workspace) throw new Error("Workspace not found");

	const role = await getSystemWorkspaceRole(roleName);
	if (!role) throw new Error(`Role not found: ${roleName}`);

	const [member] = await db
		.select()
		.from(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, workspaceId),
				eq(workspaceMembers.userId, userId),
				eq(workspaceMembers.status, "active"),
			),
		)
		.limit(1);
	if (!member) throw new Error("Member not found");

	await db.transaction(async (tx) => {
		await tx
			.delete(roleBindings)
			.where(
				and(
					eq(roleBindings.principalType, "user"),
					eq(roleBindings.principalId, userId),
					eq(roleBindings.resourceType, "workspace"),
					eq(roleBindings.resourceId, workspaceId),
				),
			);

		await tx.insert(roleBindings).values({
			principalType: "user",
			principalId: userId,
			roleId: role.id,
			resourceType: "workspace",
			resourceId: workspaceId,
			createdById: updatedBy,
		});
	});

	await authorization.invalidatePermissionCache(userId, "workspace", workspaceId);

	await audit.emit({
		organizationId: workspace.organizationId,
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: updatedBy,
		action: "workspace.member.roleUpdated",
		resourceType: "workspace",
		resourceId: workspaceId,
		outcome: "success",
		metadata: { userId, roleName },
	});
}
