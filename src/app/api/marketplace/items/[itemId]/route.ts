import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import { getSession } from "@/modules/auth/session";
import {
	getMarketplaceItemDetail,
	updateMarketplaceItem,
	deleteMarketplaceItem,
} from "@/modules/marketplace/use-cases";

const updateSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().max(2048).optional(),
	tags: z.array(z.string()).optional(),
});

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ itemId: string }> },
) {
	try {
		const session = await getSession();
		const { itemId } = await params;
		const item = await getMarketplaceItemDetail(itemId, session?.user.id);
		if (!item)
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		return NextResponse.json(item);
	} catch {
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function PUT(
	req: NextRequest,
	{ params }: { params: Promise<{ itemId: string }> },
) {
	return handleRoute(
		req,
		async ({ session }) => {
			const { itemId } = await params;
			const parsed = updateSchema.safeParse(await req.json());
			if (!parsed.success)
				return NextResponse.json(
					{ error: "Invalid input", details: parsed.error.issues },
					{ status: 400 },
				);
			const updated = await updateMarketplaceItem({
				itemId,
				userId: session.user.id,
				...parsed.data,
			});
			return NextResponse.json(updated);
		},
		{
			logLabel: "Failed to update marketplace item",
			expectedError: (error) => {
				const message =
					error instanceof Error ? error.message : "Internal server error";
				const status =
					error instanceof Error && error.message.includes("not found")
						? 404
						: error instanceof Error && error.message.includes("Not authorized")
							? 403
							: 500;
				return NextResponse.json({ error: message }, { status });
			},
		},
	);
}

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ itemId: string }> },
) {
	return handleRoute(
		req,
		async ({ session }) => {
			const { itemId } = await params;
			const deleted = await deleteMarketplaceItem(itemId, session.user.id);
			return NextResponse.json(deleted);
		},
		{
			logLabel: "Failed to delete marketplace item",
			expectedError: (error) => {
				const message =
					error instanceof Error ? error.message : "Internal server error";
				const status =
					error instanceof Error && error.message.includes("not found")
						? 404
						: error instanceof Error && error.message.includes("Not authorized")
							? 403
							: 500;
				return NextResponse.json({ error: message }, { status });
			},
		},
	);
}
