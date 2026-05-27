import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { revokeWorkspaceApiKey } from "@/modules/api-keys/use-cases";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ keyId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { keyId } = await params;
		const parsed = querySchema.safeParse({
			workspaceId: req.nextUrl.searchParams.get("workspaceId"),
		});
		if (!parsed.success) {
			return NextResponse.json({ error: "Invalid input" }, { status: 400 });
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"apiKeys.manage",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted) {
			const fallback = await authorization.hasPermission(
				{ principalType: "user", principalId: session.user.id },
				"workspace.manage",
				"workspace",
				parsed.data.workspaceId,
			);
			if (!fallback) {
				return NextResponse.json({ error: "Forbidden" }, { status: 403 });
			}
		}

		await revokeWorkspaceApiKey({
			keyId,
			workspaceId: parsed.data.workspaceId,
			userId: session.user.id,
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("Failed to revoke API key", {}, error as Error);
		const message =
			error instanceof Error ? error.message : "Internal server error";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
