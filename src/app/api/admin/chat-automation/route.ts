import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { ensureBootstrapAdmin, isAdminRole } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";
import {
	getChatAutomationAdminState,
	setChatAutomationConfig,
} from "@/modules/chat/automation";

const updateSchema = z.object({
	enabled: z.boolean(),
	providerId: z.uuid().optional(),
	modelId: z.uuid().optional(),
	generateTitles: z.boolean().default(true),
	generateSuggestions: z.boolean().default(true),
});

async function requireAdmin() {
	const session = await getSession();
	if (!session) {
		return {
			ok: false as const,
			response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
		};
	}
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	const isAdmin =
		isAdminRole(session.user.role) || bootstrappedAdminId === session.user.id;
	if (!isAdmin) {
		return {
			ok: false as const,
			response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
		};
	}
	return { ok: true as const, session };
}

export async function GET() {
	try {
		const auth = await requireAdmin();
		if (!auth.ok) return auth.response;
		return NextResponse.json(await getChatAutomationAdminState());
	} catch (error) {
		logger.error("Failed to read chat automation config", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function PATCH(req: NextRequest) {
	try {
		const auth = await requireAdmin();
		if (!auth.ok) return auth.response;
		const parsed = updateSchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}
		const config = await setChatAutomationConfig(
			parsed.data,
			auth.session.user.id,
		);
		return NextResponse.json(config);
	} catch (error) {
		logger.error("Failed to update chat automation config", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
