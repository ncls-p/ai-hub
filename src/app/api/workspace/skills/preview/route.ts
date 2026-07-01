import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/lib/route-handler";
import { previewSkillInstall } from "@/modules/skills/use-cases";

export async function POST(req: NextRequest) {
	return handleRoute(
		req,
		async () => {
			const body = await req.json();
			const { installCommand } = body as { installCommand?: string };
			if (!installCommand?.trim()) {
				return NextResponse.json(
					{ error: "Install command is required" },
					{ status: 400 },
				);
			}
			const results = await previewSkillInstall(installCommand);
			return NextResponse.json({ skills: results });
		},
		{
			logLabel: "Failed to preview skill",
			expectedError: (error) => {
				if (error instanceof Error) {
					const expectedMessages = [
						"Install command is required",
						"Install command is too long",
						"Install command contains an unterminated quote",
						"Only `npx skills add ...` commands are supported",
						"Only `skills add` install commands are supported",
						"Install command must include a skill package",
						"Only GitHub owner/repository skill packages are supported",
						"Choose a specific skill with `--skill <name>` or `owner/repo@skill`",
						"Skill names must be explicit and contain only letters, numbers, dot, dash or underscore",
						"The install command did not produce any skill directory",
						"No Markdown files were found in the installed skill",
					];
					if (
						expectedMessages.includes(error.message) ||
						error.message.startsWith("Unsupported install option") ||
						error.message.startsWith("Missing skill name")
					) {
						return NextResponse.json({ error: error.message }, { status: 400 });
					}
				}
				return NextResponse.json(
					{ error: "Skill preview failed" },
					{ status: 500 },
				);
			},
		},
	);
}
