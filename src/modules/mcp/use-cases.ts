import { and, eq, isNull, sql } from "drizzle-orm";
import { encryptValue } from "@/lib/crypto";
import { listRemoteMcpTools } from "@/modules/mcp/client";
import { logger } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { mcpServers, mcpTools } from "@/server/infrastructure/db/schema";

export type McpTransport = "stdio" | "sse" | "streamable-http";

export interface CreateMcpServerInput {
	workspaceId: string;
	userId: string;
	name: string;
	transport: McpTransport;
	command?: string;
	args?: string[];
	url?: string;
	headers?: Record<string, string>;
	env?: Record<string, string>;
}

export function toSafeMcpServer(server: typeof mcpServers.$inferSelect) {
	return {
		id: server.id,
		workspaceId: server.workspaceId,
		name: server.name,
		transport: server.transport,
		command: server.command,
		argsJson: server.argsJson,
		url: server.url,
		enabled: server.enabled,
		healthStatus: server.healthStatus,
		lastCheckedAt: server.lastCheckedAt,
		createdAt: server.createdAt,
		updatedAt: server.updatedAt,
		hasHeaders: Boolean(server.encryptedHeadersJson),
		hasEnv: Boolean(server.encryptedEnvJson),
	};
}

async function encryptRecord(record?: Record<string, string>) {
	if (!record || Object.keys(record).length === 0) return null;
	const encrypted: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		encrypted[key] = await encryptValue(value);
	}
	return encrypted;
}

export async function createMcpServer(input: CreateMcpServerInput) {
	const [server] = await db
		.insert(mcpServers)
		.values({
			workspaceId: input.workspaceId,
			name: input.name,
			transport: input.transport,
			command: input.command || null,
			argsJson: input.args ?? null,
			url: input.url || null,
			encryptedHeadersJson: await encryptRecord(input.headers),
			encryptedEnvJson: await encryptRecord(input.env),
			enabled: true,
			healthStatus: "unknown",
			createdById: input.userId,
		})
		.returning();

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "mcpServer.created",
		resourceType: "mcp_server",
		resourceId: server.id,
		outcome: "success",
		metadata: { name: input.name, transport: input.transport },
	});

	logger.info("MCP server created", {
		serverId: server.id,
		userId: input.userId,
	});
	return server;
}

export async function listMcpServers(workspaceId: string) {
	const rows = await db
		.select()
		.from(mcpServers)
		.where(
			and(
				eq(mcpServers.workspaceId, workspaceId),
				isNull(mcpServers.archivedAt),
			),
		)
		.orderBy(sql`${mcpServers.createdAt} DESC`);
	return rows.map(toSafeMcpServer);
}

export async function getMcpServer(serverId: string, workspaceId: string) {
	const [server] = await db
		.select()
		.from(mcpServers)
		.where(
			and(
				eq(mcpServers.id, serverId),
				eq(mcpServers.workspaceId, workspaceId),
				isNull(mcpServers.archivedAt),
			),
		)
		.limit(1);
	return server ?? null;
}

export async function updateMcpServer(input: {
	serverId: string;
	workspaceId: string;
	userId: string;
	name?: string;
	url?: string;
	command?: string;
	args?: string[];
	enabled?: boolean;
	headers?: Record<string, string>;
	env?: Record<string, string>;
}) {
	const existing = await getMcpServer(input.serverId, input.workspaceId);
	if (!existing) throw new Error("MCP server not found");

	const updates: Record<string, unknown> = { updatedAt: new Date() };
	if (input.name !== undefined) updates.name = input.name;
	if (input.url !== undefined) updates.url = input.url || null;
	if (input.command !== undefined) updates.command = input.command || null;
	if (input.args !== undefined) updates.argsJson = input.args;
	if (input.enabled !== undefined) updates.enabled = input.enabled;
	if (input.headers !== undefined)
		updates.encryptedHeadersJson = await encryptRecord(input.headers);
	if (input.env !== undefined)
		updates.encryptedEnvJson = await encryptRecord(input.env);

	const [server] = await db
		.update(mcpServers)
		.set(updates)
		.where(eq(mcpServers.id, input.serverId))
		.returning();

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "mcpServer.updated",
		resourceType: "mcp_server",
		resourceId: input.serverId,
		outcome: "success",
	});

	return server;
}

export async function archiveMcpServer(
	serverId: string,
	workspaceId: string,
	userId: string,
) {
	const existing = await getMcpServer(serverId, workspaceId);
	if (!existing) throw new Error("MCP server not found");

	await db
		.update(mcpServers)
		.set({ archivedAt: new Date(), updatedAt: new Date(), enabled: false })
		.where(eq(mcpServers.id, serverId));

	await audit.emit({
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "mcpServer.archived",
		resourceType: "mcp_server",
		resourceId: serverId,
		outcome: "success",
	});
}

export async function listMcpTools(serverId: string, workspaceId: string) {
	const server = await getMcpServer(serverId, workspaceId);
	if (!server) throw new Error("MCP server not found");
	return db
		.select()
		.from(mcpTools)
		.where(eq(mcpTools.mcpServerId, serverId))
		.orderBy(mcpTools.name);
}

export async function syncMcpTools(
	serverId: string,
	workspaceId: string,
	userId: string,
) {
	const server = await getMcpServer(serverId, workspaceId);
	if (!server) throw new Error("MCP server not found");
	if (server.transport === "stdio" || !server.url) {
		await db
			.update(mcpServers)
			.set({ healthStatus: "manual", lastCheckedAt: new Date() })
			.where(eq(mcpServers.id, serverId));
		return { status: "manual", discovered: 0 };
	}

	let discovered: Array<{
		name: string;
		description: string | null;
		inputSchemaJson: Record<string, unknown> | null;
		outputSchemaJson: Record<string, unknown> | null;
	}> = [];
	let healthStatus = "healthy";

	try {
		const remoteTools = await listRemoteMcpTools(server);
		discovered = remoteTools.map((tool) => ({
			name: tool.name,
			description:
				typeof tool.description === "string" ? tool.description : null,
			inputSchemaJson:
				(tool.inputSchema as Record<string, unknown> | undefined) ?? null,
			outputSchemaJson:
				(tool.outputSchema as Record<string, unknown> | undefined) ?? null,
		}));
	} catch (error) {
		healthStatus = "unhealthy";
		logger.warn("MCP tool sync failed", {
			serverId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	await db.transaction(async (tx) => {
		if (discovered.length > 0) {
			await tx.delete(mcpTools).where(eq(mcpTools.mcpServerId, serverId));
			await tx.insert(mcpTools).values(
				discovered.map((tool) => ({
					mcpServerId: serverId,
					name: tool.name,
					description: tool.description,
					inputSchemaJson: tool.inputSchemaJson,
					outputSchemaJson: tool.outputSchemaJson,
					enabled: true,
				})),
			);
		}
		await tx
			.update(mcpServers)
			.set({
				healthStatus,
				lastCheckedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(mcpServers.id, serverId));
	});

	await audit.emit({
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "mcpServer.toolsSynced",
		resourceType: "mcp_server",
		resourceId: serverId,
		outcome: healthStatus === "healthy" ? "success" : "failed",
		metadata: { discovered: discovered.length },
	});

	return { status: healthStatus, discovered: discovered.length };
}

export async function testMcpConnection(
	serverId: string,
	workspaceId: string,
	userId: string,
) {
	const server = await getMcpServer(serverId, workspaceId);
	if (!server) throw new Error("MCP server not found");

	if (server.transport === "stdio" || !server.url) {
		await db
			.update(mcpServers)
			.set({ healthStatus: "manual", lastCheckedAt: new Date() })
			.where(eq(mcpServers.id, serverId));
		return { status: "manual", message: "stdio servers require manual tool registration" };
	}

	let healthStatus = "healthy";
	let message = "Connection successful";

	try {
		const tools = await listRemoteMcpTools(server);
		message =
			tools.length > 0
				? `Connected — ${tools.length} tools available`
				: "Connected — no tools returned";
	} catch (error) {
		healthStatus = "unhealthy";
		message =
			error instanceof Error
				? error.message
				: "Unable to reach MCP server";
	}

	await db
		.update(mcpServers)
		.set({
			healthStatus,
			lastCheckedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(mcpServers.id, serverId));

	await audit.emit({
		workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: userId,
		action: "mcpServer.tested",
		resourceType: "mcp_server",
		resourceId: serverId,
		outcome: healthStatus === "healthy" ? "success" : "failed",
	});

	return { status: healthStatus, message };
}

export async function updateMcpTool(input: {
	toolId: string;
	serverId: string;
	workspaceId: string;
	userId: string;
	enabled?: boolean;
}) {
	const server = await getMcpServer(input.serverId, input.workspaceId);
	if (!server) throw new Error("MCP server not found");

	const updates: Record<string, unknown> = {};
	if (input.enabled !== undefined) updates.enabled = input.enabled;
	if (Object.keys(updates).length === 0) {
		throw new Error("No updates provided");
	}

	const [tool] = await db
		.update(mcpTools)
		.set(updates)
		.where(
			and(
				eq(mcpTools.id, input.toolId),
				eq(mcpTools.mcpServerId, input.serverId),
			),
		)
		.returning();

	if (!tool) throw new Error("MCP tool not found");

	await audit.emit({
		workspaceId: input.workspaceId,
		actorPrincipalType: "user",
		actorPrincipalId: input.userId,
		action: "mcpTool.updated",
		resourceType: "mcp_server",
		resourceId: input.serverId,
		outcome: "success",
		metadata: { toolId: input.toolId, enabled: input.enabled },
	});

	return tool;
}
