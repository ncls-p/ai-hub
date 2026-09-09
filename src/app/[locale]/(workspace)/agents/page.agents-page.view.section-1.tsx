import { AdvancedSection } from "@/components/ui/advanced-section";
import { AgentAccessScopePicker } from "@/components/agent-access-scope-picker";
import { BotIcon, Loader2, NetworkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AgentsPageViewModel } from "./page.agents-page.view";
import { AGENT_TEMPLATES } from "./page.icon-size-class";
export function AgentsPageSection1({ model }: { model: AgentsPageViewModel }) {
  const {
    accessOptions,
    applyTemplate,
    canAdminCurate,
    canCreateAgent,
    creating,
    form,
    handleCreate,
    setForm,
    setShowCreateDialog,
    showCreateDialog,
    t,
    tCommon,
    tList,
  } = model;
  return (
    <Dialog
      open={canCreateAgent && showCreateDialog}
      onOpenChange={setShowCreateDialog}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-md overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{tList("guideDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{tList("kindLabel")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    kind: "assistant" as const,
                    icon: BotIcon,
                    title: tList("kindAssistant"),
                    description: tList("kindAssistantDescription"),
                  },
                  {
                    kind: "orchestrator" as const,
                    icon: NetworkIcon,
                    title: tList("kindOrchestrator"),
                    description: tList("kindOrchestratorDescription"),
                  },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const selected = form.kind === option.kind;
                return (
                  <button
                    key={option.kind}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-24 items-start gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      selected && "border-primary/50 bg-primary/5 shadow-sm",
                    )}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        kind: option.kind,
                        sharingMode:
                          option.kind === "orchestrator"
                            ? "personal"
                            : current.sharingMode,
                      }))
                    }
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{tList("templateLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {AGENT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    form.templateId === template.id &&
                      "border-primary/50 bg-primary/5",
                  )}
                  disabled={form.kind === "orchestrator"}
                  onClick={() => applyTemplate(template)}
                >
                  <span className="block font-medium">
                    {tList(template.nameKey)}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                    {tList(template.descriptionKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-name">{t("name")}</Label>
            <Input
              id="agent-name"
              name="agent-name"
              autoComplete="off"
              placeholder={t("namePlaceholder")}
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="agent-description"
              name="agent-description"
              placeholder={t("descriptionPlaceholder")}
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
            />
          </div>
          <AgentAccessScopePicker
            value={form.accessScope}
            teamId={form.accessTeamId}
            options={accessOptions}
            disabled={creating}
            onChangeAction={(accessScope, accessTeamId) =>
              setForm((current) => ({
                ...current,
                accessScope,
                accessTeamId: accessTeamId ?? "",
              }))
            }
          />
          <AdvancedSection
            label={tCommon("advanced")}
            hint={t("advancedHint")}
            storageKey="advanced:agent-create"
          >
            <div className="flex flex-col gap-4">
              {canAdminCurate ? (
                <div className="rounded-xl border border-border/70 p-3">
                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="agent-global"
                        checked={form.isGlobal}
                        onCheckedChange={(checked) =>
                          setForm({ ...form, isGlobal: checked === true })
                        }
                      />
                      <label htmlFor="agent-global">{tList("global")}</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="agent-recommended"
                        checked={form.isRecommended}
                        onCheckedChange={(checked) =>
                          setForm({
                            ...form,
                            isRecommended: checked === true,
                          })
                        }
                      />
                      <label htmlFor="agent-recommended">
                        {t("configurePage.recommended")}
                      </label>
                    </div>
                    <Select
                      value={form.curationLabel}
                      onValueChange={(value) =>
                        setForm({ ...form, curationLabel: value })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={tList("curationLabel")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {tList("curationNone")}
                        </SelectItem>
                        <SelectItem value="recommended">
                          {tList("badgeRecommended")}
                        </SelectItem>
                        <SelectItem value="organization_created">
                          {tList("curationOrgCreated")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          </AdvancedSection>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{tList("createNextTitle")}</p>
            <p className="mt-1 text-muted-foreground">
              {tList("createNextDescription")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              creating ||
              !form.name.trim() ||
              (form.accessScope === "team" && !form.accessTeamId)
            }
          >
            {creating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {tList("creating")}
              </>
            ) : (
              tList("createAndConfigure")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
