import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	codeWorkspaceArtifact,
	createCodeWorkspaceFromZip,
} from "@/modules/code-workspace/storage";
import { authorization } from "@/server/domain/services/authorization";

const uploadSchema = z.object({
	workspaceId: z.uuid(),
});

function uploadPrompt(input: {
	projectId: string;
	title: string;
	rootFile: string | null;
	files: Array<{ path: string; binary: boolean; size: number }>;
}) {
	const fileList = input.files
		.slice(0, 80)
		.map(
			(file) =>
				`- ${file.path}${file.binary ? " (asset)" : ""} — ${file.size} bytes`,
		)
		.join("\n");
	return [
		"J'ai uploadé un projet de code compressé. Tout doit rester dans ce chat.",
		`Code workspace ID: ${input.projectId}`,
		`Nom: ${input.title}`,
		`Fichier de preview: ${input.rootFile ?? "aucun fichier HTML détecté"}`,
		"Fichiers:",
		fileList,
		"",
		"Utilise les tools code_workspace_* disponibles pour lire/modifier les fichiers. Après modification, renvoie le workspace mis à jour avec preview et téléchargement ZIP. Si les tools code_workspace_* ne sont pas disponibles, dis-moi de les activer sur cet assistant.",
	].join("\n");
}

export async function POST(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const formData = await req.formData();
		const parsed = uploadSchema.safeParse({
			workspaceId: formData.get("workspaceId"),
		});
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

		const uploadedFile = formData.get("file");
		if (!(uploadedFile instanceof File)) {
			return NextResponse.json(
				{ error: "ZIP file is required" },
				{ status: 400 },
			);
		}
		if (!uploadedFile.name.toLowerCase().endsWith(".zip")) {
			return NextResponse.json(
				{ error: "Only .zip uploads are supported" },
				{ status: 400 },
			);
		}
		if (uploadedFile.size > 20 * 1024 * 1024) {
			return NextResponse.json(
				{ error: "ZIP file is too large. Maximum size is 20 MB." },
				{ status: 400 },
			);
		}

		const metadata = await createCodeWorkspaceFromZip({
			workspaceId: parsed.data.workspaceId,
			userId: session.user.id,
			fileName: uploadedFile.name,
			buffer: new Uint8Array(await uploadedFile.arrayBuffer()),
		});
		const artifact = codeWorkspaceArtifact(metadata, "Uploaded ZIP workspace.");

		return NextResponse.json({
			artifact,
			prompt: uploadPrompt({
				projectId: metadata.id,
				title: metadata.title,
				rootFile: metadata.rootFile,
				files: metadata.files,
			}),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (
			/zip|file|path|too large|unsupported|symlink|workspace/i.test(message)
		) {
			return NextResponse.json({ error: message }, { status: 400 });
		}
		logger.error("Failed to upload code workspace", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
