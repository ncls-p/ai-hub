import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { getBuiltInTool } from "@/modules/tool/builtin-tools";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { toolInvocations } from "@/server/infrastructure/db/schema";

const paramsSchema = z.object({ invocationId: z.uuid() });

export async function POST(
	_req: Request,
	{ params }: { params: Promise<{ invocationId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = paramsSchema.safeParse(await params);
		if (!parsed.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const [invocation] = await db
			.select()
			.from(toolInvocations)
			.where(eq(toolInvocations.id, parsed.data.invocationId))
			.limit(1);

		if (!invocation) {
			return NextResponse.json(
				{ error: "Invocation not found" },
				{ status: 404 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"tools.executeRestricted",
			"workspace",
			invocation.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}

		if (invocation.status !== "awaiting_approval") {
			return NextResponse.json(
				{ error: "Invocation is not awaiting approval" },
				{ status: 409 },
			);
		}

		if (invocation.toolSource !== "builtin") {
			return NextResponse.json(
				{ error: "Unsupported tool source" },
				{ status: 400 },
			);
		}

		const tool = getBuiltInTool(invocation.toolId);
		if (!tool) {
			return NextResponse.json({ error: "Tool not found" }, { status: 404 });
		}

		const startedAt = Date.now();
		const input = invocation.inputJsonEncrypted
			? JSON.parse(await decryptValue(invocation.inputJsonEncrypted))
			: undefined;

		try {
			const output = await tool.execute(input as never);
			await db
				.update(toolInvocations)
				.set({
					outputJsonEncrypted: await encryptValue(JSON.stringify(output)),
					status: "success",
					latencyMs: Date.now() - startedAt,
					approvedByUserId: session.user.id,
					completedAt: new Date(),
				})
				.where(eq(toolInvocations.id, invocation.id));

			return NextResponse.json({ ok: true, output });
		} catch (error) {
			await db
				.update(toolInvocations)
				.set({
					status: "failed",
					latencyMs: Date.now() - startedAt,
					approvedByUserId: session.user.id,
					errorMessage: error instanceof Error ? error.message : String(error),
					completedAt: new Date(),
				})
				.where(eq(toolInvocations.id, invocation.id));
			throw error;
		}
	} catch (error) {
		logger.error("Failed to approve tool invocation", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
