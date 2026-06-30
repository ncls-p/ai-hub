"use client";

import { useTranslations } from "next-intl";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  BookMarkedIcon,
  EyeIcon,
  FileTextIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Share2,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ResourceShareDialog,
  type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import { useWorkspace } from "@/hooks/use-workspace";

const BUTTON_TYPE = "button";

export type AgentSkill = {
  id: string;
  name: string;
  description: string | null;
  sourcePackage: string | null;
  sourceSkillName: string | null;
  installCommand: string | null;
  markdownFilesJson: SkillMarkdownFile[];
  metadataJson: unknown;
  createdAt: string;
};

type SkillMarkdownFile = {
  path: string;
  content: string;
};

type SkillPreview = {
  name: string;
  description: string | null;
  markdownFiles: SkillMarkdownFile[];
  sourcePackage: string;
};

function fileCount(files: unknown): number {
  return Array.isArray(files) ? files.length : 0;
}

function isManual(skill: AgentSkill): boolean {
  return !skill.sourcePackage && !skill.installCommand;
}

// ─── Skill Detail Dialog ───────────────────────────────────────────────

function SkillDetailDialog({ skill }: { skill: AgentSkill }) {
  const [activeFile, setActiveFile] = useState(0);
  const files = Array.isArray(skill.markdownFilesJson)
    ? (skill.markdownFilesJson as SkillMarkdownFile[])
    : [];
  const currentFile = files[activeFile];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <EyeIcon className="mr-1 size-3" />
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:top-1/2 sm:left-1/2 sm:h-[min(88dvh,760px)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
        <header className="shrink-0 border-b border-border/70 px-4 py-3 pr-14 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <BookMarkedIcon className="size-4 shrink-0 text-muted-foreground" />
            <DialogTitle className="truncate text-base sm:text-lg">
              {skill.name}
            </DialogTitle>
            {isManual(skill) && (
              <Badge variant="secondary" className="shrink-0">
                manual
              </Badge>
            )}
          </div>
          <DialogDescription className="mt-1 line-clamp-2 text-left text-xs sm:text-sm">
            {skill.description || "No description"}
          </DialogDescription>
        </header>

        {/* Mobile file rail */}
        <div className="shrink-0 border-b border-border/70 bg-muted/25 px-3 py-2 md:hidden">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </p>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-2">
              {files.map((file, i) => (
                <button
                  key={file.path}
                  type={BUTTON_TYPE}
                  className={`max-w-56 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                    i === activeFile
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/70 bg-background text-muted-foreground"
                  }`}
                  onClick={() => setActiveFile(i)}
                >
                  <span className="block truncate font-mono">{file.path}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Desktop file list */}
          <aside className="hidden min-h-0 border-r border-border/70 bg-muted/20 md:block">
            <ScrollArea className="h-full">
              <div className="p-3">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {files.length} file{files.length !== 1 ? "s" : ""}
                </p>
                {files.map((file, i) => (
                  <button
                    key={file.path}
                    type={BUTTON_TYPE}
                    className={`w-full rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.96] ${
                      i === activeFile
                        ? "bg-background font-medium shadow-sm ring-1 ring-border/70"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                    }`}
                    onClick={() => setActiveFile(i)}
                  >
                    <span className="block truncate font-mono">
                      {file.path}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            {currentFile ? (
              <>
                <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border/70 px-4 py-2.5 sm:px-5">
                  <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs font-medium">
                    {currentFile.path}
                  </span>
                </div>
                <ScrollArea className="min-h-0 flex-1 bg-muted/20">
                  <div className="p-4 sm:p-5">
                    <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed sm:text-sm">
                      {currentFile.content}
                    </pre>
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                No files
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create/Edit Skill Form ─────────────────────────────────────────────

type FileEntry = { path: string; content: string };

function SkillEditorDialog({
  skill,
  onSaved,
  trigger,
}: {
  skill?: AgentSkill;
  onSaved: () => void;
  trigger: ReactNode;
}) {
  const { workspaceId } = useWorkspace();
  const isEditing = Boolean(skill);
  const initialFiles = skill?.markdownFilesJson?.length
    ? skill.markdownFilesJson.map((file) => ({
        path: file.path,
        content: file.content,
      }))
    : [{ path: "SKILL.md", content: "" }];
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [files, setFiles] = useState<FileEntry[]>(initialFiles);
  const [activeFile, setActiveFile] = useState(0);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const currentFile = files[activeFile];
  const canSave =
    Boolean(name.trim()) &&
    Boolean(description.trim()) &&
    files.some((file) => file.content.trim());

  function resetForm() {
    setName(skill?.name ?? "");
    setDescription(skill?.description ?? "");
    setFiles(
      skill?.markdownFilesJson?.length
        ? skill.markdownFilesJson.map((file) => ({
            path: file.path,
            content: file.content,
          }))
        : [{ path: "SKILL.md", content: "" }],
    );
    setActiveFile(0);
  }

  function addFile() {
    const nextFiles = [
      ...files,
      { path: `extra-${files.length + 1}.md`, content: "" },
    ];
    setFiles(nextFiles);
    setActiveFile(nextFiles.length - 1);
  }

  function removeFile(index: number) {
    if (files.length <= 1) return;
    const nextFiles = files.filter((_, i) => i !== index);
    setFiles(nextFiles);
    setActiveFile(Math.min(activeFile, nextFiles.length - 1));
  }

  function updateFile(index: number, field: "path" | "content", value: string) {
    const next = [...files];
    next[index] = { ...next[index], [field]: value };
    setFiles(next);
  }

  async function handleSave() {
    if (!workspaceId || !canSave) return;
    setSaving(true);
    try {
      const res = await fetch(
        isEditing && skill
          ? `/api/workspace/skills/${skill.id}`
          : "/api/workspace/skills",
        {
          method: isEditing ? "PATCH" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: name.trim(),
            description: description.trim() || null,
            markdownFiles: files,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error ||
            (isEditing ? "Skill update failed" : "Skill creation failed"),
        );
      }
      if (!isEditing) {
        setName("");
        setDescription("");
        setFiles([{ path: "SKILL.md", content: "" }]);
        setActiveFile(0);
      }
      setOpen(false);
      toast.success(isEditing ? "Skill updated" : "Skill created successfully");
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEditing
            ? "Skill update failed"
            : "Skill creation failed",
      );
      return;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:top-1/2 sm:left-1/2 sm:h-[min(90dvh,800px)] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
        <header className="shrink-0 border-b border-border/70 px-4 py-3 pr-14 sm:px-5 sm:py-4">
          <DialogTitle className="truncate text-base sm:text-lg">
            {isEditing ? "Edit skill" : "Create a new skill"}
          </DialogTitle>
          <DialogDescription className="mt-1 line-clamp-2 text-left text-xs sm:text-sm">
            {isEditing
              ? "Update this skill's metadata and Markdown instruction files."
              : "Define a custom skill with Markdown instructions. The main file should be named SKILL.md."}
          </DialogDescription>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-3 border-b border-border/70 bg-background px-4 py-3 sm:px-5">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={
                      isEditing ? `skill-name-${skill?.id}` : "skill-name"
                    }
                  >
                    Name
                  </Label>
                  <Input
                    id={isEditing ? `skill-name-${skill?.id}` : "skill-name"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="processing-pdfs"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={
                      isEditing ? `skill-desc-${skill?.id}` : "skill-desc"
                    }
                  >
                    Description
                  </Label>
                  <Textarea
                    id={isEditing ? `skill-desc-${skill?.id}` : "skill-desc"}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this skill does and when the agent should use it..."
                    className="min-h-16 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[17rem_minmax(0,1fr)]">
              <div className="shrink-0 border-b border-border/70 bg-muted/25 px-3 py-2 md:hidden">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {files.length} file{files.length !== 1 ? "s" : ""}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addFile}
                  >
                    <PlusIcon className="mr-1 size-3" />
                    Add
                  </Button>
                </div>
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex gap-2 pb-2">
                    {files.map((file, i) => (
                      <button
                        key={i}
                        type={BUTTON_TYPE}
                        className={`max-w-56 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                          i === activeFile
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-border/70 bg-background text-muted-foreground"
                        }`}
                        onClick={() => setActiveFile(i)}
                      >
                        <span className="block truncate font-mono">
                          {file.path || "untitled.md"}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <aside className="hidden min-h-0 border-r border-border/70 bg-muted/20 md:block">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {files.length} file{files.length !== 1 ? "s" : ""}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={addFile}
                    >
                      <PlusIcon className="mr-1 size-3" />
                      Add
                    </Button>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-1 p-3">
                      {files.map((file, i) => (
                        <button
                          key={i}
                          type={BUTTON_TYPE}
                          className={`w-full rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.96] ${
                            i === activeFile
                              ? "bg-background font-medium shadow-sm ring-1 ring-border/70"
                              : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                          }`}
                          onClick={() => setActiveFile(i)}
                        >
                          <span className="block truncate font-mono">
                            {file.path || "untitled.md"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </aside>

              <section className="flex min-h-0 min-w-0 flex-col bg-background">
                {currentFile ? (
                  <>
                    <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-4 py-2.5 sm:px-5">
                      <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <Input
                        value={currentFile.path}
                        onChange={(e) =>
                          updateFile(activeFile, "path", e.target.value)
                        }
                        placeholder="filename.md"
                        className="h-8 min-w-0 font-mono text-xs"
                      />
                      {files.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => removeFile(activeFile)}
                        >
                          <XIcon className="size-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 p-3 sm:p-4">
                      <Textarea
                        value={currentFile.content}
                        onChange={(e) =>
                          updateFile(activeFile, "content", e.target.value)
                        }
                        placeholder="Skill instructions..."
                        className="h-full min-h-[42dvh] resize-none font-mono text-xs leading-relaxed md:min-h-0"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                    No files
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 p-3 sm:flex-row sm:justify-end sm:p-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !canSave}
          >
            {saving && <Loader2Icon className="mr-1 size-3 animate-spin" />}
            {isEditing ? "Save changes" : "Create skill"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ─── Preview Panel ─────────────────────────────────────────────────────

function PreviewPanel({
  preview,
  onInstall,
}: {
  preview: SkillPreview[];
  onInstall: () => void;
}) {
  const [expandedSkill, setExpandedSkill] = useState(0);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const skill = preview[expandedSkill];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SearchIcon className="size-4" />
          Preview — {preview.length} skill{preview.length !== 1 ? "s" : ""}{" "}
          found
        </CardTitle>
        <CardDescription>
          These skills will be imported (Markdown files only)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.length > 1 && (
          <Tabs
            value={String(expandedSkill)}
            onValueChange={(v) => {
              setExpandedSkill(Number(v));
              setExpandedFile(null);
            }}
          >
            <TabsList>
              {preview.map((s, i) => (
                <TabsTrigger key={i} value={String(i)}>
                  {s.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {skill && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{skill.sourcePackage}</Badge>
              <Badge variant="secondary">
                {skill.markdownFiles.length} file
                {skill.markdownFiles.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {skill.description && (
              <p className="text-sm text-muted-foreground">
                {skill.description}
              </p>
            )}

            <details
              open
              onToggle={(e) => {
                if (!e.currentTarget.open) setExpandedFile(null);
              }}
            >
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                Files included
              </summary>
              <div className="mt-2 space-y-1">
                {skill.markdownFiles.map((file) => (
                  <div key={file.path} className="group">
                    <button
                      type={BUTTON_TYPE}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      onClick={() =>
                        setExpandedFile(
                          expandedFile === file.path ? null : file.path,
                        )
                      }
                    >
                      <FileTextIcon className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono">{file.path}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Blob([file.content]).size} bytes
                      </span>
                    </button>
                    {expandedFile === file.path && (
                      <div className="mt-1 rounded border bg-muted/30 p-3">
                        <ScrollArea className="max-h-60">
                          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed font-sans">
                            {file.content}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>

            <div className="flex justify-end">
              <Button onClick={() => void onInstall()}>
                <BookMarkedIcon className="mr-1 size-3.5" />
                Install {preview.length > 1 ? "all skills" : "this skill"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Skill Manager ────────────────────────────────────────────────

export function SkillManager() {
  const tShare = useTranslations("marketplace.share");
  const { workspaceId } = useWorkspace();
  const [shareResource, setShareResource] = useState<ShareableResource | null>(
    null,
  );
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [installCommand, setInstallCommand] = useState("");
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<SkillPreview[] | null>(null);

  const loadSkills = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(`/api/workspace/skills?workspaceId=${workspaceId}`);
    if (!res.ok) throw new Error("Unable to load skills");
    setSkills((await res.json()) as AgentSkill[]);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void loadSkills()
        .catch((error) => {
          if (!cancelled) {
            toast.error(
              error instanceof Error ? error.message : "Unable to load skills",
            );
          }
          return;
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [workspaceId, loadSkills]);

  async function installSkill() {
    if (!workspaceId || !installCommand.trim()) return;
    setInstalling(true);
    setPreview(null);
    try {
      const res = await fetch("/api/workspace/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, installCommand }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error || "Skill install failed",
        );
      }
      setInstallCommand("");
      toast.success("Skill installed. Only Markdown files were imported.");
      await loadSkills();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Skill install failed",
      );
      return;
    } finally {
      setInstalling(false);
    }
  }

  async function previewSkill() {
    if (!installCommand.trim()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/workspace/skills/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installCommand }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error || "Preview failed",
        );
      }
      const data = (await res.json()) as { skills: SkillPreview[] };
      setPreview(data.skills);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed");
      return;
    } finally {
      setPreviewing(false);
    }
  }

  async function deleteSkill(skillId: string) {
    if (!workspaceId) return;
    const res = await fetch(
      `/api/workspace/skills/${skillId}?workspaceId=${workspaceId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      toast.error(
        (await res.json().catch(() => null))?.error || "Delete failed",
      );
      return;
    }
    toast.success("Skill removed");
    await loadSkills();
  }

  return (
    <div className="space-y-4">
      {/* Install section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookMarkedIcon className="size-5" aria-hidden="true" />
            Install from skills.sh
          </CardTitle>
          <CardDescription>
            Paste a skills.sh install command. AI Hub imports Markdown
            instructions only: .py files, scripts, HTML, binaries, and other
            resources are ignored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={installCommand}
            onChange={(event) => setInstallCommand(event.target.value)}
            placeholder="npx skills add anthropics/skills --skill skill-creator"
            className="min-h-20 font-mono text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Use an explicit skill: <code>--skill name</code> or{" "}
              <code>owner/repo@skill</code>. Bulk installs are blocked.
            </p>
            <div className="flex gap-2">
              <Button
                type={BUTTON_TYPE}
                variant="outline"
                size="sm"
                onClick={() => void previewSkill()}
                disabled={previewing || !installCommand.trim()}
              >
                {previewing ? (
                  <Loader2Icon
                    className="mr-1 size-3 animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <EyeIcon className="mr-1 size-3.5" />
                )}
                Preview
              </Button>
              <Button
                type={BUTTON_TYPE}
                onClick={() => void installSkill()}
                disabled={installing || !installCommand.trim()}
              >
                {installing ? (
                  <Loader2Icon
                    className="mr-1 size-3 animate-spin"
                    data-icon="inline-start"
                  />
                ) : null}
                Install
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview panel */}
      {preview && <PreviewPanel preview={preview} onInstall={installSkill} />}

      {/* Installed skills */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">
          Installed skills{" "}
          <span className="text-muted-foreground">({skills.length})</span>
        </h3>
        <SkillEditorDialog
          onSaved={loadSkills}
          trigger={
            <Button variant="outline" size="sm" className="shrink-0">
              <PlusIcon className="mr-1 size-3.5" />
              Create from scratch
            </Button>
          }
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2Icon className="animate-spin" />
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
          No skills installed yet. Install from skills.sh or create one from
          scratch.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => (
            <Card key={skill.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {skill.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {skill.description || "No description"}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <SkillDetailDialog skill={skill} />
                    <SkillEditorDialog
                      skill={skill}
                      onSaved={loadSkills}
                      trigger={
                        <Button
                          type={BUTTON_TYPE}
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Edit ${skill.name}`}
                        >
                          <PencilIcon className="size-3.5" aria-hidden="true" />
                        </Button>
                      }
                    />
                    <Button
                      type={BUTTON_TYPE}
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`${tShare("action")} ${skill.name}`}
                      onClick={() =>
                        setShareResource({
                          kind: "skill",
                          id: skill.id,
                          name: skill.name,
                          description: skill.description,
                        })
                      }
                    >
                      <Share2 className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type={BUTTON_TYPE}
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => void deleteSkill(skill.id)}
                    >
                      <Trash2Icon className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {skill.sourcePackage ? (
                  <Badge variant="outline">{skill.sourcePackage}</Badge>
                ) : (
                  <Badge variant="secondary">manual</Badge>
                )}
                <Badge variant="outline">
                  {fileCount(skill.markdownFilesJson)} file
                  {fileCount(skill.markdownFilesJson) !== 1 ? "s" : ""}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ResourceShareDialog
        resource={shareResource}
        workspaceId={workspaceId}
        open={shareResource !== null}
        onCloseAction={() => setShareResource(null)}
      />
    </div>
  );
}
