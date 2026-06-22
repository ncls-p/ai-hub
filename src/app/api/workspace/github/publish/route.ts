import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/modules/auth/session";
import { publishCodeWorkspaceToGitHub } from "@/modules/github/publishing";
import { authorization } from "@/server/domain/services/authorization";

const publishSchema = z.object({
	workspaceId: z.uuid(),
	projectId: z.uuid(),
	repositoryId: z.uuid(),
	mode: z.enum(["pull_request", "direct_push"]),
	targetBranch: z.string().trim().min(1).max(255),
	sourceBranch: z.string().trim().min(1).max(255).optional(),
	targetDirectory: z.string().trim().max(260).optional(),
	commitMessage: z.string().trim().min(1).max(240),
	pullRequestTitle: z.string().trim().min(1).max(240).optional(),
	pullRequestBody: z.string().trim().max(4000).optional(),
	conversationId: z.uuid().optional(),
	agentId: z.uuid().optional(),
	confirmDirectPush: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const body = (await req.json().catch(() => null)) as unknown;
		const parsed = publishSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}
		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"agents.chat",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted) {
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		}
		const result = await publishCodeWorkspaceToGitHub({
			...parsed.data,
			userId: session.user.id,
		});
		return NextResponse.json({ result });
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "GitHub publish failed",
			},
			{ status: 400 },
		);
	}
}
