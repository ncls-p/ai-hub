import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, requireWorkspaceMemberAsync } from "@/lib/route-handler";
import { organizationIdForWorkspace } from "@/modules/organization/workspace-organization";
import { getSidebarNavConfig } from "@/modules/navigation/sidebar-config.server";

export async function GET(request: NextRequest) {
  return handleRoute(
    request,
    async ({ session }) => {
      const parsed = z
        .uuid()
        .safeParse(request.nextUrl.searchParams.get("workspaceId"));
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid workspaceId" },
          { status: 400 },
        );
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data,
      );
      if (forbidden) return forbidden;
      const organizationId = await organizationIdForWorkspace(parsed.data);
      if (!organizationId)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({
        organizationId,
        config: await getSidebarNavConfig(organizationId),
      });
    },
    { allowApiKey: false, logLabel: "Failed to load organization navigation" },
  );
}
