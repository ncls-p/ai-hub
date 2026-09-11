import { handleRoute } from "@/lib/route-handler";
import { requireOrganizationSettingsScope } from "@/modules/organization/settings-scope";
import {
  defaultSidebarNavConfig,
  getSidebarNavCatalog,
  normalizeSidebarNavConfig,
} from "@/modules/navigation/sidebar-config";
import {
  deleteSidebarNavConfig,
  getSidebarNavConfig,
  setSidebarNavConfig,
} from "@/modules/navigation/sidebar-config.server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        visible: z.boolean(),
        section: z.enum(["primary", "advanced"]).optional(),
      }),
    )
    .min(1),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireOrganizationSettingsScope(req);
    if (!auth.ok) return auth.response;

    const saved = await getSidebarNavConfig(auth.organizationId);
    return NextResponse.json({
      config: saved ?? defaultSidebarNavConfig(),
      catalog: getSidebarNavCatalog(),
      isCustomized: saved !== null,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const auth = await requireOrganizationSettingsScope(req);
      if (!auth.ok) return auth.response;

      const parsed = updateSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const config = normalizeSidebarNavConfig(parsed.data);
      const visibleCount = config.items.filter((item) => item.visible).length;
      if (visibleCount === 0) {
        return NextResponse.json(
          { error: "At least one navigation item must remain visible." },
          { status: 400 },
        );
      }

      const saved = await setSidebarNavConfig(
        config,
        session.user.id,
        auth.organizationId,
      );
      return NextResponse.json({
        config: saved,
        catalog: getSidebarNavCatalog(),
        isCustomized: true,
      });
    },
    {
      allowApiKey: false,
      logLabel: "Failed to update sidebar navigation config",
    },
  );
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireOrganizationSettingsScope(req);
    if (!auth.ok) return auth.response;

    await deleteSidebarNavConfig(auth.organizationId);

    return NextResponse.json({
      config: defaultSidebarNavConfig(),
      catalog: getSidebarNavCatalog(),
      isCustomized: false,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
