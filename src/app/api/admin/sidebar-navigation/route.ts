import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { ensureBootstrapAdmin, isAdminRole } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";
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

		const saved = await getSidebarNavConfig();
		return NextResponse.json({
			config: saved ?? defaultSidebarNavConfig(),
			catalog: getSidebarNavCatalog(),
			isCustomized: saved !== null,
		});
	} catch (error) {
		logger.error("Failed to read sidebar navigation config", {}, error as Error);
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

		const config = normalizeSidebarNavConfig(parsed.data);
		const visibleCount = config.items.filter((item) => item.visible).length;
		if (visibleCount === 0) {
			return NextResponse.json(
				{ error: "At least one navigation item must remain visible." },
				{ status: 400 },
			);
		}

		const saved = await setSidebarNavConfig(config, auth.session.user.id);
		return NextResponse.json({
			config: saved,
			catalog: getSidebarNavCatalog(),
			isCustomized: true,
		});
	} catch (error) {
		logger.error("Failed to update sidebar navigation config", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function DELETE() {
	try {
		const auth = await requireAdmin();
		if (!auth.ok) return auth.response;

		await deleteSidebarNavConfig();

		return NextResponse.json({
			config: defaultSidebarNavConfig(),
			catalog: getSidebarNavCatalog(),
			isCustomized: false,
		});
	} catch (error) {
		logger.error("Failed to reset sidebar navigation config", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
