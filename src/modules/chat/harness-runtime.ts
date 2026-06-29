import { createPi, type PiHarnessSettings } from "@ai-sdk/harness-pi";
import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";
import type { HarnessV1PermissionMode, HarnessV1Skill } from "@ai-sdk/harness";

export type AiHubHarnessRuntimeOptions = {
	model?: string;
	thinkingLevel?: PiHarnessSettings["thinkingLevel"];
	permissionMode?: HarnessV1PermissionMode;
	skills?: HarnessV1Skill[];
};

/**
 * Harness runtime preset for AI SDK 7 coding agents. Pi is host-runtime based,
 * so it can run with just-bash instead of a network sandbox. Bridge-backed
 * harnesses (Claude Code/Codex/OpenCode) can use the same shape with
 * `@ai-sdk/sandbox-vercel` when we enable remote workspaces.
 */
export function createAiHubPiHarnessRuntime(
	options: AiHubHarnessRuntimeOptions = {},
) {
	return {
		harness: createPi({
			model: options.model,
			thinkingLevel: options.thinkingLevel,
		}),
		sandbox: createJustBashSandbox(),
		permissionMode: options.permissionMode ?? "allow-reads",
		skills: options.skills ?? [],
	};
}
