import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/lib/route-handler";
import { requireAdminApiSession } from "@/modules/admin/auth";
import { testChatAutomationConnection } from "@/modules/chat/automation";

export async function POST(req: NextRequest) {
	return handleRoute(
		req,
		async () => {
			const auth = await requireAdminApiSession();
			if (!auth.ok) return auth.response;
			const result = await testChatAutomationConnection();
			if (!result.ok) {
				return NextResponse.json(result, { status: 400 });
			}
			return NextResponse.json(result);
		},
		{
			logLabel: "Failed to test chat automation",
			expectedError: () =>
				NextResponse.json(
					{ ok: false, error: "Internal server error" },
					{ status: 500 },
				),
		},
	);
}
