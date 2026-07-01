import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
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
				session.user.id,
			);
			return NextResponse.json(setting);
		},
		{ logLabel: "Failed to update admin settings" },
	);
}
