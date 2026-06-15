import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import {
	createWorkspaceApiKey,
	listWorkspaceApiKeys,
} from "@/modules/api-keys/use-cases";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
	workspaceId: z.uuid(),
	name: z.string().min(1).max(255),
	expiresAt: z.iso.datetime().optional(),
});

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

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
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		return NextResponse.json({
			keys: await listWorkspaceApiKeys(parsed.data.workspaceId),
		});
	} catch (error) {
		logger.error("Failed to list API keys", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = createSchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"apiKeys.manage",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const result = await createWorkspaceApiKey({
			workspaceId: parsed.data.workspaceId,
			userId: session.user.id,
			name: parsed.data.name,
			expiresAt: parsed.data.expiresAt
				? new Date(parsed.data.expiresAt)
				: null,
		});

		return NextResponse.json(result, { status: 201 });
	} catch (error) {
		logger.error("Failed to create API key", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
