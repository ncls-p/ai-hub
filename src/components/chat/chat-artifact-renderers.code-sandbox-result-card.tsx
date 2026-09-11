"use client";

import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
  partitionCodeSandboxFiles,
  type CodeSandboxInputPreview,
  type CodeSandboxOutput,
} from "@/components/chat/chat-message-rendering-utils";
import { formatBytes } from "@/components/chat/code-workspace-artifact-card";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  BUTTON_TYPE,
  COMPACT_ICON_CLASS,
  GHOST_VARIANT,
} from "./chat-artifact-renderers.max-live-tool-input-chars";
import { SandboxOutputFileCard } from "./chat-artifact-renderers.sandbox-output-file-card";

export function CodeSandboxResultCard({
  result,
  input,
  embedded = false,
}: {
  result: CodeSandboxOutput;
  input?: CodeSandboxInputPreview | null;
  embedded?: boolean;
}) {
  const t = useTranslations("chat.artifacts");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [inputFilesOpen, setInputFilesOpen] = useState(false);
  const language = input?.language ?? result.language;
  const { inputFiles, outputFiles } = useMemo(
    () => partitionCodeSandboxFiles(result.files),
    [result.files],
  );
  return (
    <Collapsible
      open={sourceOpen}
      onOpenChange={setSourceOpen}
      data-open={String(sourceOpen)}
      className={cn(
        "t-acc overflow-hidden rounded-2xl text-xs transition-[background-color,box-shadow] duration-200 ease-out",
        embedded
          ? "rounded-xl border border-border/55 bg-background/45"
          : "bg-card shadow-[var(--surface-shadow)]",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {!embedded ? <ToolStateIcon state="completed" /> : null}
          <div className="min-w-0">
            <p className="font-medium text-foreground">{t("codeSandbox")}</p>
            <p className="truncate text-[11px] text-muted-foreground tabular-nums">
              {language} · {result.durationMs}ms ·{" "}
              {result.timedOut
                ? t("timedOut")
                : result.exitCode === null
                  ? t("noExitCode")
                  : t("exitCode", { count: result.exitCode })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {input?.code ? (
            <CollapsibleTrigger asChild>
              <Button
                type={BUTTON_TYPE}
                variant={GHOST_VARIANT}
                size="sm"
                className="h-10 rounded-xl px-3 text-[11px]"
              >
                {t("sourceCode")}
                <span className="t-acc-chevron">
                  <ChevronDownIcon
                    className={COMPACT_ICON_CLASS}
                    aria-hidden="true"
                  />
                </span>
              </Button>
            </CollapsibleTrigger>
          ) : null}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              result.ok
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {result.ok ? t("done") : t("failed")}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-3">
        {input?.code ? (
          <CollapsibleContent>
            <div>
              <div className="flex flex-col gap-2 rounded-xl bg-muted/20 p-2.5 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>{t("executedCode", { language })}</span>
                  {input.files.length > 0 ? (
                    <span>
                      · {t("inputFiles", { count: input.files.length })}
                    </span>
                  ) : null}
                  {input.attachments.length > 0 ? (
                    <span>
                      · {t("attachments", { count: input.attachments.length })}
                    </span>
                  ) : null}
                </div>
                <pre className="max-h-72 overflow-auto rounded-md bg-background/70 p-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-foreground">
                  {input.code}
                </pre>
              </div>
            </div>
          </CollapsibleContent>
        ) : null}
        {result.stdout ? (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              stdout
            </p>
            <pre className="max-h-40 overflow-auto rounded-md bg-muted/25 p-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-foreground">
              {result.stdout}
            </pre>
          </div>
        ) : null}
        {result.stderr ? (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              stderr
            </p>
            <pre className="max-h-40 overflow-auto rounded-md bg-destructive/5 p-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-destructive">
              {result.stderr}
            </pre>
          </div>
        ) : null}
        {outputFiles.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("generatedFiles", { count: outputFiles.length })}
            </p>
            {outputFiles.map((file) => (
              <SandboxOutputFileCard key={file.path} file={file} />
            ))}
          </div>
        ) : null}
        {inputFiles.length > 0 ? (
          <Collapsible
            open={inputFilesOpen}
            onOpenChange={setInputFilesOpen}
            className="overflow-hidden rounded-xl bg-muted/20 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)]"
          >
            <CollapsibleTrigger asChild>
              <Button
                type={BUTTON_TYPE}
                variant={GHOST_VARIANT}
                className="h-auto min-h-12 w-full justify-between rounded-xl px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">
                    {t("sandboxInputFiles", { count: inputFiles.length })}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">
                    {t("sandboxInputFilesHint")}
                  </span>
                </span>
                <ChevronDownIcon
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    inputFilesOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="max-h-64 overflow-auto border-t border-border/40 px-3 py-2">
                {inputFiles.map((file) => (
                  <li
                    key={file.path}
                    className="flex min-h-8 items-center justify-between gap-3 border-b border-border/30 py-1.5 last:border-b-0"
                  >
                    <code className="min-w-0 truncate text-[10px] text-foreground">
                      {file.path}
                    </code>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatBytes(file.size)}
                    </span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </Collapsible>
  );
}
