import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { and, eq, isNull, sql } from "drizzle-orm";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  agentSkillBindings,
  agentSkills,
} from "@/server/infrastructure/db/schema";

const execFileAsync = promisify(execFile);
const maxInstallCommandLength = 700;
const maxMarkdownFileBytes = 128_000;
const maxSkillMarkdownBytes = 320_000;
const maxPromptBytes = 48_000;
const skillDescriptionMaxLength = 1024;
const skillNamePattern = /^[a-z0-9-]{1,64}$/;

export type SkillMarkdownFile = {
  path: string;
  content: string;
};

type ParsedInstallCommand = {
  sourcePackage: string;
  skillNames: string[];
};

type SkillFrontmatter = {
  name?: string;
  description?: string;
};

export type AgentSkillRow = typeof agentSkills.$inferSelect;

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function tokenizeInstallCommand(command: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error("Install command contains an unterminated quote");
  if (current) tokens.push(current);
  return tokens;
}

function normalizePackageAndSkill(value: string): ParsedInstallCommand {
  const atIndex = value.lastIndexOf("@");
  if (atIndex > value.indexOf("/") && atIndex < value.length - 1) {
    return {
      sourcePackage: value.slice(0, atIndex),
      skillNames: [value.slice(atIndex + 1)],
    };
  }
  return { sourcePackage: value, skillNames: [] };
}

function parseSkillsInstallCommand(command: string): ParsedInstallCommand {
  if (!command.trim()) throw new Error("Install command is required");
  if (command.length > maxInstallCommandLength) {
    throw new Error("Install command is too long");
  }

  const tokens = tokenizeInstallCommand(command.replace(/^\$\s*/, ""));
  let index = 0;
  if (tokens[index] === "npx") {
    index += 1;
    while (["--yes", "-y"].includes(tokens[index])) index += 1;
  }
  if (tokens[index] === "skills") index += 1;
  else if (tokens[index] === "skillsadd") {
    throw new Error(
      "Use `npx skills add ...` with a space between skills and add",
    );
  } else {
    throw new Error("Only `npx skills add ...` commands are supported");
  }

  if (!tokens[index] || !["add", "a"].includes(tokens[index])) {
    throw new Error("Only `skills add` install commands are supported");
  }
  index += 1;

  const packageToken = tokens[index];
  if (!packageToken || packageToken.startsWith("-")) {
    throw new Error("Install command must include a skill package");
  }
  index += 1;

  const parsed = normalizePackageAndSkill(packageToken);
  const skillNames = new Set(parsed.skillNames);
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "--skill" || token === "-s") {
      const skillName = tokens[index + 1];
      if (!skillName || skillName.startsWith("-")) {
        throw new Error("Missing skill name after --skill");
      }
      skillNames.add(skillName);
      index += 2;
      continue;
    }
    if (
      ["--copy", "-y", "--yes", "--full-depth", "-g", "--global"].includes(
        token,
      )
    ) {
      index += 1;
      continue;
    }
    if (token === "--agent" || token === "-a") {
      index += 2;
      continue;
    }
    throw new Error(`Unsupported install option: ${token}`);
  }

  const sourcePackage = parsed.sourcePackage.replace(
    /^https:\/\/github.com\//,
    "",
  );
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(sourcePackage)) {
    throw new Error(
      "Only GitHub owner/repository skill packages are supported",
    );
  }

  const normalizedSkills = [...skillNames]
    .map((name) => name.trim())
    .filter(Boolean);
  if (normalizedSkills.length === 0) {
    throw new Error(
      "Choose a specific skill with `--skill <name>` or `owner/repo@skill`",
    );
  }
  for (const skillName of normalizedSkills) {
    if (!/^[A-Za-z0-9_.-]+$/.test(skillName) || skillName === "*") {
      throw new Error(
        "Skill names must be explicit and contain only letters, numbers, dot, dash or underscore",
      );
    }
  }

  return { sourcePackage, skillNames: normalizedSkills };
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function parseFrontmatter(markdown: string): SkillFrontmatter {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const frontmatter: SkillFrontmatter = {};
  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (key === "name") frontmatter.name = value;
    if (key === "description") frontmatter.description = value;
  }
  return frontmatter;
}

async function extractMarkdownFiles(
  skillDir: string,
): Promise<SkillMarkdownFile[]> {
  const allFiles = await walkFiles(skillDir);
  const markdownFiles: SkillMarkdownFile[] = [];
  let totalBytes = 0;

  for (const file of allFiles) {
    if (!file.toLowerCase().endsWith(".md")) continue;
    const fileStat = await stat(file);
    if (fileStat.size > maxMarkdownFileBytes) continue;
    if (totalBytes + fileStat.size > maxSkillMarkdownBytes) break;
    const content = await readFile(file, "utf8");
    totalBytes += Buffer.byteLength(content);
    markdownFiles.push({
      path: path.relative(skillDir, file).split(path.sep).join("/"),
      content,
    });
  }

  markdownFiles.sort((a, b) => {
    if (a.path === "SKILL.md") return -1;
    if (b.path === "SKILL.md") return 1;
    return a.path.localeCompare(b.path);
  });
  return markdownFiles;
}

export async function installSkillsFromCommand(input: {
  workspaceId: string;
  userId: string;
  installCommand: string;
}) {
  const parsed = parseSkillsInstallCommand(input.installCommand);
  const tempDir = await mkdtemp(path.join(tmpdir(), "ai-hub-skills-"));
  const tempHome = path.join(tempDir, "home");
  await mkdir(tempHome, { recursive: true });

  try {
    const args = [
      "--yes",
      "skills",
      "add",
      parsed.sourcePackage,
      "--copy",
      "-y",
      "--agent",
      "claude-code",
    ];
    for (const skillName of parsed.skillNames) {
      args.push("--skill", skillName);
    }

    const { stdout, stderr } = await execFileAsync("npx", args, {
      cwd: tempDir,
      env: {
        ...process.env,
        HOME: tempHome,
        npm_config_yes: "true",
      },
      timeout: 120_000,
      maxBuffer: 2_000_000,
    });

    const installedRoot = path.join(tempDir, ".claude", "skills");
    const rootEntries = await readdir(installedRoot, {
      withFileTypes: true,
    }).catch(() => []);
    const skillDirs = rootEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(installedRoot, entry.name));

    if (skillDirs.length === 0) {
      throw new Error(
        "The install command did not produce any skill directory",
      );
    }

    const created: AgentSkillRow[] = [];
    for (const skillDir of skillDirs) {
      const markdownFiles = await extractMarkdownFiles(skillDir);
      if (markdownFiles.length === 0) continue;
      const skillFile = markdownFiles.find((file) => file.path === "SKILL.md");
      const frontmatter = skillFile ? parseFrontmatter(skillFile.content) : {};
      const fallbackName = path.basename(skillDir);
      const [row] = await db
        .insert(agentSkills)
        .values({
          workspaceId: input.workspaceId,
          createdById: input.userId,
          name: frontmatter.name || fallbackName,
          description: frontmatter.description ?? null,
          sourcePackage: parsed.sourcePackage,
          sourceSkillName: frontmatter.name || fallbackName,
          installCommand: input.installCommand,
          markdownFilesJson: markdownFiles,
          metadataJson: {
            importedMarkdownFiles: markdownFiles.length,
            omittedNonMarkdownFiles: true,
            installOutput: stripAnsi(`${stdout}\n${stderr}`).slice(0, 4_000),
          },
        })
        .returning();
      created.push(row);
    }

    if (created.length === 0) {
      throw new Error("No Markdown files were found in the installed skill");
    }

    await audit.emit({
      workspaceId: input.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.userId,
      action: "skill.installed",
      resourceType: "workspace",
      resourceId: input.workspaceId,
      outcome: "success",
      metadata: {
        sourcePackage: parsed.sourcePackage,
        skillNames: parsed.skillNames,
        installedSkillIds: created.map((skill) => skill.id),
        onlyMarkdownImported: true,
      },
    });

    return created;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function listAgentSkills(workspaceId: string) {
  return db
    .select()
    .from(agentSkills)
    .where(
      and(
        eq(agentSkills.workspaceId, workspaceId),
        isNull(agentSkills.archivedAt),
      ),
    )
    .orderBy(sql`${agentSkills.createdAt} DESC`);
}

export async function archiveAgentSkill(input: {
  workspaceId: string;
  skillId: string;
  userId: string;
}) {
  const [skill] = await db
    .update(agentSkills)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(agentSkills.id, input.skillId),
        eq(agentSkills.workspaceId, input.workspaceId),
      ),
    )
    .returning();

  if (!skill) throw new Error("Skill not found");

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "skill.archived",
    resourceType: "workspace",
    resourceId: input.workspaceId,
    outcome: "success",
    metadata: { skillId: input.skillId },
  });
}

export async function getSkillBindingsForVersion(agentVersionId: string) {
  return db
    .select({
      id: agentSkillBindings.id,
      skillId: agentSkillBindings.skillId,
      name: agentSkills.name,
      description: agentSkills.description,
    })
    .from(agentSkillBindings)
    .innerJoin(agentSkills, eq(agentSkillBindings.skillId, agentSkills.id))
    .where(
      and(
        eq(agentSkillBindings.agentVersionId, agentVersionId),
        isNull(agentSkills.archivedAt),
      ),
    );
}

export async function replaceSkillBindingsForVersion(
  agentVersionId: string,
  workspaceId: string,
  skillIds: string[],
) {
  const uniqueSkillIds = [...new Set(skillIds)];
  if (uniqueSkillIds.length === 0) {
    await db
      .delete(agentSkillBindings)
      .where(eq(agentSkillBindings.agentVersionId, agentVersionId));
    return;
  }

  const availableSkills = await db
    .select({ id: agentSkills.id })
    .from(agentSkills)
    .where(
      and(
        eq(agentSkills.workspaceId, workspaceId),
        isNull(agentSkills.archivedAt),
      ),
    );
  const availableIds = new Set(availableSkills.map((skill) => skill.id));
  const invalidSkillId = uniqueSkillIds.find(
    (skillId) => !availableIds.has(skillId),
  );
  if (invalidSkillId) throw new Error("Skill not found");

  await db
    .delete(agentSkillBindings)
    .where(eq(agentSkillBindings.agentVersionId, agentVersionId));

  await db.insert(agentSkillBindings).values(
    uniqueSkillIds.map((skillId) => ({
      agentVersionId,
      skillId,
    })),
  );
}

export async function cloneSkillBindings(
  fromAgentVersionId: string | null,
  toAgentVersionId: string,
) {
  if (!fromAgentVersionId) return;
  const existing = await db
    .select({ skillId: agentSkillBindings.skillId })
    .from(agentSkillBindings)
    .where(eq(agentSkillBindings.agentVersionId, fromAgentVersionId));

  if (existing.length === 0) return;

  await db.insert(agentSkillBindings).values(
    existing.map((row) => ({
      agentVersionId: toAgentVersionId,
      skillId: row.skillId,
    })),
  );
}

function toMarkdownFiles(value: unknown): SkillMarkdownFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((file) => {
    if (
      typeof file === "object" &&
      file !== null &&
      "path" in file &&
      "content" in file &&
      typeof file.path === "string" &&
      typeof file.content === "string" &&
      file.path.toLowerCase().endsWith(".md")
    ) {
      return [{ path: file.path, content: file.content }];
    }
    return [];
  });
}

export type SkillPreviewResult = {
  name: string;
  description: string | null;
  markdownFiles: SkillMarkdownFile[];
  sourcePackage: string;
};

export async function previewSkillInstall(
  installCommand: string,
): Promise<SkillPreviewResult[]> {
  const parsed = parseSkillsInstallCommand(installCommand);
  const tempDir = await mkdtemp(path.join(tmpdir(), "ai-hub-skills-preview-"));
  const tempHome = path.join(tempDir, "home");
  await mkdir(tempHome, { recursive: true });

  try {
    const args = [
      "--yes",
      "skills",
      "add",
      parsed.sourcePackage,
      "--copy",
      "-y",
      "--agent",
      "claude-code",
    ];
    for (const skillName of parsed.skillNames) {
      args.push("--skill", skillName);
    }

    await execFileAsync("npx", args, {
      cwd: tempDir,
      env: {
        ...process.env,
        HOME: tempHome,
        npm_config_yes: "true",
      },
      timeout: 120_000,
      maxBuffer: 2_000_000,
    });

    const installedRoot = path.join(tempDir, ".claude", "skills");
    const rootEntries = await readdir(installedRoot, {
      withFileTypes: true,
    }).catch(() => []);
    const skillDirs = rootEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(installedRoot, entry.name));

    if (skillDirs.length === 0) {
      throw new Error(
        "The install command did not produce any skill directory",
      );
    }

    const results: SkillPreviewResult[] = [];
    for (const skillDir of skillDirs) {
      const markdownFiles = await extractMarkdownFiles(skillDir);
      if (markdownFiles.length === 0) continue;
      const skillFile = markdownFiles.find((file) => file.path === "SKILL.md");
      const frontmatter = skillFile ? parseFrontmatter(skillFile.content) : {};
      const fallbackName = path.basename(skillDir);
      results.push({
        name: frontmatter.name || fallbackName,
        description: frontmatter.description ?? null,
        markdownFiles,
        sourcePackage: parsed.sourcePackage,
      });
    }

    if (results.length === 0) {
      throw new Error("No Markdown files were found in the installed skill");
    }

    return results;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function createSkillManually(input: {
  workspaceId: string;
  userId: string;
  name: string;
  description: string | null;
  markdownFiles: { path: string; content: string }[];
}): Promise<AgentSkillRow> {
  if (input.markdownFiles.length === 0) {
    throw new Error("At least one Markdown file is required");
  }
  assertSkillMetadata(input.name, input.description);

  const normalizedFiles = normalizeSkillMarkdownFiles({
    name: input.name,
    description: input.description,
    files: input.markdownFiles,
  });
  if (normalizedFiles.length === 0) {
    throw new Error("All files must be .md files");
  }

  const [row] = await db
    .insert(agentSkills)
    .values({
      workspaceId: input.workspaceId,
      createdById: input.userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      sourcePackage: null,
      sourceSkillName: input.name.trim(),
      installCommand: null,
      markdownFilesJson: normalizedFiles,
      metadataJson: {
        createdManually: true,
        importedMarkdownFiles: normalizedFiles.length,
      },
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "skill.created",
    resourceType: "workspace",
    resourceId: input.workspaceId,
    outcome: "success",
    metadata: {
      skillId: row.id,
      createdManually: true,
    },
  });

  return row;
}

export async function updateSkillManually(input: {
  workspaceId: string;
  userId: string;
  skillId: string;
  name: string;
  description: string | null;
  markdownFiles: { path: string; content: string }[];
}): Promise<AgentSkillRow> {
  if (input.markdownFiles.length === 0) {
    throw new Error("At least one Markdown file is required");
  }
  assertSkillMetadata(input.name, input.description);

  const normalizedFiles = normalizeSkillMarkdownFiles({
    name: input.name,
    description: input.description,
    files: input.markdownFiles,
  });
  if (normalizedFiles.length === 0) {
    throw new Error("All files must be .md files");
  }

  const [row] = await db
    .update(agentSkills)
    .set({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      markdownFilesJson: normalizedFiles,
      metadataJson: {
        ...(input.markdownFiles.length > 0 ? { lastEditedManually: true } : {}),
        importedMarkdownFiles: normalizedFiles.length,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentSkills.id, input.skillId),
        eq(agentSkills.workspaceId, input.workspaceId),
      ),
    )
    .returning();

  if (!row) throw new Error("Skill not found");

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "skill.updated",
    resourceType: "workspace",
    resourceId: input.workspaceId,
    outcome: "success",
    metadata: { skillId: input.skillId },
  });

  return row;
}

function assertSkillMetadata(name: string, description: string | null) {
  const trimmedName = name.trim();
  if (!skillNamePattern.test(trimmedName)) {
    throw new Error(
      "Skill name must be 1-64 chars and contain only lowercase letters, numbers, and hyphens",
    );
  }
  if (/anthropic|claude/.test(trimmedName)) {
    throw new Error("Skill name cannot contain reserved words");
  }
  if (!description?.trim()) {
    throw new Error("Skill description is required");
  }
  if (description.trim().length > skillDescriptionMaxLength) {
    throw new Error("Skill description must be 1024 characters or less");
  }
  if (/[<>]/.test(trimmedName) || /<[^>]+>/.test(description)) {
    throw new Error("Skill metadata cannot contain XML or HTML tags");
  }
}

function normalizeSkillMarkdownFiles(input: {
  name: string;
  description: string | null;
  files: { path: string; content: string }[];
}): SkillMarkdownFile[] {
  const normalized: SkillMarkdownFile[] = input.files
    .map((file) => ({
      path: file.path.replace(/\\/g, "/").replace(/^\//, ""),
      content: file.content,
    }))
    .filter((file) => file.path.toLowerCase().endsWith(".md"));

  if (!normalized.some((file) => file.path === "SKILL.md")) {
    normalized.unshift({ path: "SKILL.md", content: "" });
  }

  const skillFileIndex = normalized.findIndex(
    (file) => file.path === "SKILL.md",
  );
  const skillFile = normalized[skillFileIndex];
  const body = skillFile.content
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .trimStart();
  const description = input.description?.trim() ?? "";
  normalized[skillFileIndex] = {
    path: "SKILL.md",
    content:
      `---\nname: ${input.name.trim()}\ndescription: ${description}\n---\n\n${body}`.trimEnd(),
  };

  normalized.sort((a, b) => {
    if (a.path === "SKILL.md") return -1;
    if (b.path === "SKILL.md") return 1;
    return a.path.localeCompare(b.path);
  });

  const totalBytes = normalized.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content),
    0,
  );
  if (totalBytes > maxSkillMarkdownBytes) {
    throw new Error("Total Markdown content exceeds size limit");
  }
  return normalized;
}

async function getBoundSkillCatalog(agentVersionId: string) {
  return db
    .select({
      id: agentSkills.id,
      name: agentSkills.name,
      description: agentSkills.description,
    })
    .from(agentSkillBindings)
    .innerJoin(agentSkills, eq(agentSkillBindings.skillId, agentSkills.id))
    .where(
      and(
        eq(agentSkillBindings.agentVersionId, agentVersionId),
        isNull(agentSkills.archivedAt),
      ),
    )
    .orderBy(sql`${agentSkills.name} ASC`);
}

export async function buildSkillsRegistryPrompt(agentVersionId: string) {
  const skills = await getBoundSkillCatalog(agentVersionId);
  if (skills.length === 0) return null;

  const skillList = skills
    .map(
      (skill) =>
        `- ${skill.name}: ${skill.description ?? "No description provided"}`,
    )
    .join("\n");

  return [
    "Agent skills are available via progressive disclosure. Only skill names and descriptions are listed here; full skill instructions are not in this prompt.",
    "When a skill is relevant to the user's request, call the load_skill tool with the exact skill name before applying it.",
    "Do not assume a skill's detailed workflow until load_skill returns its Markdown instructions.",
    "Available skills:",
    skillList,
  ].join("\n");
}

export async function loadBoundSkillContent(input: {
  agentVersionId: string;
  skillName: string;
}) {
  const rows = await db
    .select({ skill: agentSkills })
    .from(agentSkillBindings)
    .innerJoin(agentSkills, eq(agentSkillBindings.skillId, agentSkills.id))
    .where(
      and(
        eq(agentSkillBindings.agentVersionId, input.agentVersionId),
        isNull(agentSkills.archivedAt),
      ),
    );

  const normalizedName = input.skillName.trim().toLowerCase();
  const row = rows.find(
    (item) => item.skill.name.toLowerCase() === normalizedName,
  );
  if (!row) {
    return {
      found: false,
      message:
        "Skill not found or not enabled for this agent version. Use one of the names listed in the skills registry.",
    };
  }

  const files = toMarkdownFiles(row.skill.markdownFilesJson);
  let content = `# Skill: ${row.skill.name}\n\n${row.skill.description ?? ""}\n`;
  for (const file of files) {
    const block = `\n\n## File: ${file.path}\n\n${file.content.trim()}\n`;
    if (Buffer.byteLength(content + block) > maxPromptBytes) break;
    content += block;
  }

  return {
    found: true,
    name: row.skill.name,
    description: row.skill.description,
    content: content.trim(),
  };
}
