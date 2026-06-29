import { DevToolsTelemetry } from "@ai-sdk/devtools";
import { registerTelemetry } from "ai";

import { logHandledWarning } from "@/lib/logger";

const globalForAiSdkDevTools = globalThis as typeof globalThis & {
	__aiHubAiSdkDevToolsRegistered?: boolean;
};

/**
 * Register AI SDK DevTools telemetry for local debugging only.
 *
 * DevTools captures generateText/streamText/ToolLoopAgent calls globally once
 * registered. Keep it opt-in outside development so production requests do not
 * emit local-only telemetry payloads.
 */
export function registerAiSdkDevTools() {
	if (globalForAiSdkDevTools.__aiHubAiSdkDevToolsRegistered) return;
	const explicitlyEnabled = process.env.AI_SDK_DEVTOOLS === "true";
	const explicitlyDisabled = process.env.AI_SDK_DEVTOOLS === "false";
	if (explicitlyDisabled) return;
	if (process.env.NODE_ENV === "production" && !explicitlyEnabled) return;

	try {
		registerTelemetry(DevToolsTelemetry());
		globalForAiSdkDevTools.__aiHubAiSdkDevToolsRegistered = true;
	} catch (error) {
		logHandledWarning("Failed to register AI SDK DevTools telemetry", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
