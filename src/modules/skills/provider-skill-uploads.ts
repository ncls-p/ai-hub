import { createHash } from "node:crypto";
import { uploadSkill, type ProviderReference } from "ai";

import type { SkillMarkdownFile } from "./use-cases";

type UploadSkillOptions = Parameters<typeof uploadSkill>[0];
type SkillUploadApi = UploadSkillOptions["api"];
type UploadSkillInputFile = UploadSkillOptions["files"][number];

export type ProviderSkillUpload = {
	providerReference: ProviderReference;
	cacheKey: string;
	warnings: string[];
};

const inMemoryUploadCache = new Map<string, ProviderSkillUpload>();

function normalizeSkillDirectoryName(name: string) {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9._-]/g, "-")
			.replace(/^-+|-+$/g, "") || "skill"
	);
}

function skillCacheKey(input: {
	skillName: string;
	files: SkillMarkdownFile[];
}) {
	const hash = createHash("sha256");
	hash.update(input.skillName);
	for (const file of [...input.files].sort((a, b) =>
		a.path.localeCompare(b.path),
	)) {
		hash.update("\0");
		hash.update(file.path);
		hash.update("\0");
		hash.update(file.content);
	}
	return hash.digest("hex");
}

function toUploadSkillFiles(input: {
	skillName: string;
	files: SkillMarkdownFile[];
}): UploadSkillInputFile[] {
	const directory = normalizeSkillDirectoryName(input.skillName);
	return input.files.map((file) => ({
		path: `${directory}/${file.path}`,
		data: file.content,
	}));
}

/**
 * AI SDK 7 provider skill upload helper. Providers that expose a Skills API can
 * upload a skill once and then receive only a ProviderReference on subsequent
 * calls, avoiding repeated Markdown injection in the model prompt.
 */
export async function uploadAgentSkillToProvider(input: {
	api: SkillUploadApi;
	skillName: string;
	displayTitle?: string;
	files: SkillMarkdownFile[];
	force?: boolean;
}): Promise<ProviderSkillUpload> {
	const cacheKey = skillCacheKey({
		skillName: input.skillName,
		files: input.files,
	});
	const cached = inMemoryUploadCache.get(cacheKey);
	if (cached && !input.force) return cached;

	const result = await uploadSkill({
		api: input.api,
		displayTitle: input.displayTitle ?? input.skillName,
		files: toUploadSkillFiles(input),
	});
	const upload = {
		providerReference: result.providerReference,
		cacheKey,
		warnings: result.warnings.map((warning) => {
			if ("details" in warning && typeof warning.details === "string") {
				return `${warning.type}: ${warning.details}`;
			}
			if ("feature" in warning && typeof warning.feature === "string") {
				return `${warning.type}: ${warning.feature}`;
			}
			return warning.type;
		}),
	};
	inMemoryUploadCache.set(cacheKey, upload);
	return upload;
}

export function clearProviderSkillUploadCache() {
	inMemoryUploadCache.clear();
}
