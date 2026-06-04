/** Empty by default — assistants should define their own instructions. */
export const DEFAULT_SYSTEM_PROMPT = "";

/** Neutral runtime fallback when no system prompt is set (EN). */
export const FALLBACK_SYSTEM_PROMPT_EN =
	"Respond clearly and concisely. Follow the user's instructions.";

/** Neutral runtime fallback when no system prompt is set (FR). */
export const FALLBACK_SYSTEM_PROMPT_FR =
	"Réponds de façon claire et concise. Suis les instructions de l'utilisateur.";

export function fallbackSystemPrompt(locale: string): string {
	return locale === "fr" ? FALLBACK_SYSTEM_PROMPT_FR : FALLBACK_SYSTEM_PROMPT_EN;
}
