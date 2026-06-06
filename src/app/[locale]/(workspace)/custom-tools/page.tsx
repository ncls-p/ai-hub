import type { Metadata } from "next";

import { CustomToolBuilder } from "@/components/custom-tools/custom-tool-builder";
import { WorkspacePage } from "@/components/workspace-page";

export const metadata: Metadata = {
	title: "Custom tools",
};

export default function CustomToolsPage() {
	return (
		<WorkspacePage
			title="Custom tools"
			description="Crée des tools custom avec un assistant, visualise le workflow en construction, et connecte les secrets sans les exposer."
			width="wide"
		>
			<CustomToolBuilder />
		</WorkspacePage>
	);
}
