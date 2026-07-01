import { describe, expect, it } from "vitest";
import {
	tokenizeInstallCommand,
	normalizePackageAndSkill,
	parseSkillsInstallCommand,
	parseFrontmatter,
	assertSkillMetadata,
} from "@/modules/skills/use-cases";

describe("skills – install command parsing", () => {
	describe("tokenizeInstallCommand", () => {
		it("splits space-separated tokens", () => {
			const tokens = tokenizeInstallCommand(
				"npx skills add owner/repo --skill my-skill",
			);
			expect(tokens).toEqual([
				"npx",
				"skills",
				"add",
				"owner/repo",
				"--skill",
				"my-skill",
			]);
		});

		it("handles quoted strings", () => {
			const tokens = tokenizeInstallCommand(
				'npx skills add owner/repo --skill "my-skill"',
			);
			expect(tokens).toEqual([
				"npx",
				"skills",
				"add",
				"owner/repo",
				"--skill",
				"my-skill",
			]);
		});

		it("handles single-quoted strings", () => {
			const tokens = tokenizeInstallCommand(
				"npx skills add owner/repo --skill 'my-skill'",
			);
			expect(tokens).toEqual([
				"npx",
				"skills",
				"add",
				"owner/repo",
				"--skill",
				"my-skill",
			]);
		});

		it("consumes backslash escape for next character", () => {
			const tokens = tokenizeInstallCommand(
				'npx skills add owner/repo --skill "my\\-skill"',
			);
			expect(tokens).toContain("my-skill");
		});

		it("throws on unterminated quote", () => {
			expect(() =>
				tokenizeInstallCommand(
					'npx skills add owner/repo --skill "unterminated',
				),
			).toThrow("unterminated quote");
		});

		it("strips leading/trailing whitespace", () => {
			const tokens = tokenizeInstallCommand("  npx skills add owner/repo  ");
			expect(tokens).toEqual(["npx", "skills", "add", "owner/repo"]);
		});
	});

	describe("normalizePackageAndSkill", () => {
		it("extracts skill name from owner/repo@skill", () => {
			const result = normalizePackageAndSkill("owner/repo@skill-name");
			expect(result.sourcePackage).toBe("owner/repo");
			expect(result.skillNames).toEqual(["skill-name"]);
		});

		it("returns empty skill names when no @", () => {
			const result = normalizePackageAndSkill("owner/repo");
			expect(result.sourcePackage).toBe("owner/repo");
			expect(result.skillNames).toEqual([]);
		});

		it("treats @ after last slash as skill separator", () => {
			const result = normalizePackageAndSkill("pkg@1.0.0");
			expect(result.sourcePackage).toBe("pkg");
			expect(result.skillNames).toEqual(["1.0.0"]);
		});
	});

	describe("parseSkillsInstallCommand", () => {
		it("parses a full command", () => {
			const result = parseSkillsInstallCommand(
				"npx skills add owner/repo --skill my-skill",
			);
			expect(result.sourcePackage).toBe("owner/repo");
			expect(result.skillNames).toEqual(["my-skill"]);
		});

		it("parses with @skill syntax", () => {
			const result = parseSkillsInstallCommand(
				"npx skills add owner/repo@my-skill",
			);
			expect(result.sourcePackage).toBe("owner/repo");
			expect(result.skillNames).toEqual(["my-skill"]);
		});

		it("strips GitHub URL prefix", () => {
			const result = parseSkillsInstallCommand(
				"npx skills add https://github.com/owner/repo --skill my-skill",
			);
			expect(result.sourcePackage).toBe("owner/repo");
		});

		it("accepts --copy flag", () => {
			const result = parseSkillsInstallCommand(
				"npx skills add owner/repo --skill my-skill --copy",
			);
			expect(result.skillNames).toEqual(["my-skill"]);
		});

		it("accepts --yes flag", () => {
			const result = parseSkillsInstallCommand(
				"npx skills add owner/repo --skill my-skill -y",
			);
			expect(result.skillNames).toEqual(["my-skill"]);
		});

		it("accepts --agent flag", () => {
			const result = parseSkillsInstallCommand(
				"npx skills add owner/repo --skill my-skill --agent claude-code",
			);
			expect(result.skillNames).toEqual(["my-skill"]);
		});

		it("throws on empty command", () => {
			expect(() => parseSkillsInstallCommand("   ")).toThrow();
		});

		it("throws on command that is too long", () => {
			const long = "npx skills add " + "a".repeat(800);
			expect(() => parseSkillsInstallCommand(long)).toThrow("too long");
		});

		it("throws on non-skills command", () => {
			expect(() =>
				parseSkillsInstallCommand("npm install something"),
			).toThrow();
		});

		it("throws on skillsadd (no space)", () => {
			expect(() =>
				parseSkillsInstallCommand("npx skillsadd owner/repo"),
			).toThrow();
		});

		it("throws on missing package", () => {
			expect(() => parseSkillsInstallCommand("npx skills add")).toThrow();
		});

		it("throws on non-GitHub package", () => {
			expect(() =>
				parseSkillsInstallCommand("npx skills add not-a-valid-package"),
			).toThrow();
		});

		it("throws on wildcard skill name", () => {
			expect(() =>
				parseSkillsInstallCommand("npx skills add owner/repo@*"),
			).toThrow();
		});

		it("throws on unsupported option", () => {
			expect(() =>
				parseSkillsInstallCommand(
					"npx skills add owner/repo --skill my-skill --unknown",
				),
			).toThrow();
		});

		it("strips leading dollar sign", () => {
			const result = parseSkillsInstallCommand(
				"$ npx skills add owner/repo --skill my-skill",
			);
			expect(result.sourcePackage).toBe("owner/repo");
		});
	});
});

describe("skills – frontmatter parsing", () => {
	it("parses simple frontmatter", () => {
		const md =
			"---\nname: my-skill\ndescription: A test skill\n---\nContent here";
		const result = parseFrontmatter(md);
		expect(result.name).toBe("my-skill");
		expect(result.description).toBe("A test skill");
	});

	it("returns empty when no frontmatter", () => {
		const result = parseFrontmatter("# No frontmatter\nContent");
		expect(result).toEqual({});
	});

	it("handles quoted values", () => {
		const md =
			"---\nname: 'my-skill'\ndescription: \"A test skill\"\n---\nContent";
		const result = parseFrontmatter(md);
		expect(result.name).toBe("my-skill");
		expect(result.description).toBe("A test skill");
	});

	it("ignores unknown keys", () => {
		const md = "---\nname: my-skill\nother: value\n---\nContent";
		const result = parseFrontmatter(md);
		expect(result.name).toBe("my-skill");
		expect(result.description).toBeUndefined();
	});
});

describe("skills – metadata validation", () => {
	it("accepts valid name", () => {
		assertSkillMetadata("my-skill", "A description");
	});

	it("rejects empty name", () => {
		expect(() => assertSkillMetadata("", "desc")).toThrow();
	});

	it("rejects name with reserved words – anthropic", () => {
		expect(() => assertSkillMetadata("anthropic-skill", "desc")).toThrow(
			"reserved words",
		);
	});

	it("rejects name with reserved words – claude", () => {
		expect(() => assertSkillMetadata("claude-skill", "desc")).toThrow(
			"reserved words",
		);
	});

	it("rejects invalid characters in name", () => {
		expect(() => assertSkillMetadata("My Skill!", "desc")).toThrow();
	});

	it("rejects missing description", () => {
		expect(() => assertSkillMetadata("skill", null)).toThrow();
	});

	it("rejects description with HTML tags", () => {
		expect(() => assertSkillMetadata("skill", "desc with <script>")).toThrow();
	});

	it("rejects name with HTML tags", () => {
		expect(() => assertSkillMetadata("<skill>", "desc")).toThrow();
	});

	it("rejects description too long", () => {
		expect(() => assertSkillMetadata("skill", "a".repeat(1025))).toThrow(
			"1024 characters",
		);
	});

	it("rejects name too long", () => {
		expect(() => assertSkillMetadata("a".repeat(65), "desc")).toThrow();
	});
});
