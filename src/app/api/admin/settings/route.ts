import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requireAdminApiSession } from "@/modules/admin/auth";
import {
	getRegistrationSetting,
	setRegistrationEnabled,
} from "@/modules/admin/use-cases";

const updateSettingsSchema = z.object({
	registrationEnabled: z.boolean(),
});

export async function GET() {
	try {
		return NextResponse.json(await getRegistrationSetting());
	} catch (error) {
		logger.error("Failed to read admin settings", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function PATCH(req: NextRequest) {
	try {
		const auth = await requireAdminApiSession();
		if (!auth.ok) return auth.response;

		const parsed = updateSettingsSchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const setting = await setRegistrationEnabled(
			parsed.data.registrationEnabled,
			auth.session.user.id,
		);
		return NextResponse.json(setting);
	} catch (error) {
		logger.error("Failed to update admin settings", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
