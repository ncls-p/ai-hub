import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import {
	createAdminManagedUser,
	ensureBootstrapAdmin,
	isAdminRole,
	listAdminUsers,
} from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";
import { addWorkspaceMember } from "@/modules/workspace/use-cases";

const createUserSchema = z.object({
	name: z.string().min(1).max(255),
	email: z.email(),
	password: z.string().min(8).max(128),
	role: z.enum(["user", "admin"]).default("user"),
	workspaceId: z.uuid().optional(),
});

async function requireAdminSession() {
	const session = await getSession();
	if (!session) return { error: "Unauthorized", status: 401 as const };
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	const isAdmin =
		isAdminRole(session.user.role) || bootstrappedAdminId === session.user.id;
	if (!isAdmin) {
		return { error: "Forbidden", status: 403 as const };
	}
	return { session };
}

export async function GET() {
	try {
		const auth = await requireAdminSession();
		if ("error" in auth) {
			return NextResponse.json({ error: auth.error }, { status: auth.status });
		}

		return NextResponse.json({ users: await listAdminUsers() });
	} catch (error) {
		logger.error("Failed to list users", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	try {
		const auth = await requireAdminSession();
		if ("error" in auth) {
			return NextResponse.json({ error: auth.error }, { status: auth.status });
		}

		const parsed = createUserSchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const user = await createAdminManagedUser({
			name: parsed.data.name,
			email: parsed.data.email,
			password: parsed.data.password,
			role: parsed.data.role,
			headers: req.headers,
		});

		if (parsed.data.workspaceId) {
			await addWorkspaceMember({
				workspaceId: parsed.data.workspaceId,
				userId: user.id,
				invitedBy: auth.session.user.id,
			});
		}

		return NextResponse.json({ user }, { status: 201 });
	} catch (error) {
		logger.error("Failed to create user", {}, error as Error);
		const message =
			error instanceof Error ? error.message : "Internal server error";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
