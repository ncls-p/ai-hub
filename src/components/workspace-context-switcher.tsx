"use client";
import { useState } from "react";
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  FolderIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function WorkspaceContextSwitcher({
  name,
  context,
}: {
  name: string;
  context?: string | null;
}) {
  const t = useTranslations("shell.workspaceSwitcher");
  const { workspaceId, workspaces, setWorkspaceId, isLoading } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [query, setQuery] = useState("");
  const groups = new Map<string, typeof workspaces>();
  for (const project of workspaces)
    groups.set(project.organizationId, [
      ...(groups.get(project.organizationId) ?? []),
      project,
    ]);
  return (
    <div className="mt-auto shrink-0 border-t border-sidebar-border/55 p-2.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            aria-label={t("switch")}
            aria-expanded={open}
            disabled={isLoading || switching}
            className="h-auto min-h-14 w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-left"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
              <Building2Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {context ?? t("choose")}
              </span>
            </span>
            <ChevronsUpDownIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[min(24rem,calc(100vw-2rem))] p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("search")}
              aria-label={t("search")}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[min(26rem,60dvh)]">
              <CommandEmpty>{t("empty")}</CommandEmpty>
              {[...groups].map(([id, projects]) => {
                const visible = projects.filter((project) =>
                  `${project.organizationName} ${project.name}`
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()),
                );
                return visible.length ? (
                  <CommandGroup key={id} heading={projects[0].organizationName}>
                    {visible.map((project) => (
                      <CommandItem
                        key={project.id}
                        value={project.id}
                        disabled={switching}
                        onSelect={() => {
                          if (switching) return;
                          setSwitching(true);
                          void Promise.resolve(setWorkspaceId(project.id))
                            .then((saved) => {
                              if (saved !== false) {
                                setOpen(false);
                                setQuery("");
                              }
                            })
                            .finally(() => setSwitching(false));
                        }}
                      >
                        <FolderIcon aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">
                          {project.name}
                        </span>
                        {project.id === workspaceId ? (
                          <CheckIcon
                            aria-label={t("active")}
                            className="size-4"
                          />
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null;
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
