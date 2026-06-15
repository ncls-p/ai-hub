import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { requireAdminApiSession } from "@/modules/admin/auth";
import { testChatAutomationConnection } from "@/modules/chat/automation";

export async function POST() {
	try {
		const auth = await requireAdminApiSession();
		if (!auth.ok) return auth.response;

		const result = await testChatAutomationConnection();
		if (!result.ok) {
			return NextResponse.json(result, { status: 400 });
		}
		return NextResponse.json(result);
	} catch (error) {
		logger.error("Failed to test chat automation", {}, error as Error);
		return NextResponse.json(
			{ ok: false, error: "Internal server error" },
			{ status: 500 },
		);
	}
}
