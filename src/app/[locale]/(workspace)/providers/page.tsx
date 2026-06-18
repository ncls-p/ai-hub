import { RequireWorkspaceAccess } from "@/components/require-workspace-access";

import { ProvidersPageClient } from "./providers-client";

export default function ProvidersPage() {
	return (
		<RequireWorkspaceAccess required="canManageProviders">
			<ProvidersPageClient />
		</RequireWorkspaceAccess>
	);
}
