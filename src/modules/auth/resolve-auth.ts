import { headers } from "next/headers";

import { verifyWorkspaceApiKey } from "@/modules/api-keys/use-cases";
import { getSession } from "@/modules/auth/session";

export type AuthContext =
	| {
			type: "user";
			userId: string;
			email: string;
			name: string;
			role?: string | null;
	  }
	| {
			type: "api_key";
			apiKeyId: string;
			workspaceId: string;
			userId: string;
	  };

export async function resolveAuthContext(): Promise<AuthContext | null> {
	const session = await getSession();
	if (session?.user) {
		return {
			type: "user",
			userId: session.user.id,
			email: session.user.email,
			name: session.user.name,
			role: session.user.role,
		};
	}

	const headerList = await headers();
	const authorization = headerList.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return null;

	const rawKey = authorization.slice("Bearer ".length).trim();
	if (!rawKey) return null;

	const verified = await verifyWorkspaceApiKey(rawKey);
	if (!verified) return null;

	return {
		type: "api_key",
		apiKeyId: verified.id,
		workspaceId: verified.workspaceId,
		userId: verified.createdById,
	};
}

export function getPrincipalId(context: AuthContext) {
	return context.type === "user" ? context.userId : context.apiKeyId;
}

export function getActorUserId(context: AuthContext) {
	return context.type === "user" ? context.userId : context.userId;
}
