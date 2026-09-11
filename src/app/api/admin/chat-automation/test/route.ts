import { handleRoute } from "@/lib/route-handler";
import { requireOrganizationSettingsScope } from "@/modules/organization/settings-scope";
import { testChatAutomationConnection } from "@/modules/chat/automation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const auth = await requireOrganizationSettingsScope(req);
      if (!auth.ok) return auth.response;
      const result = await testChatAutomationConnection(auth.organizationId);
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
