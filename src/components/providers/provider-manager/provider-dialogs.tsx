import { Loader2Icon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AdvancedSection } from "@/components/ui/advanced-section";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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

import { AUTH_TYPE_LABELS, KIND_LABELS } from "./constants";
import type { ProviderAuthType, ProviderKind, SafeProvider } from "./types";
import { defaultAuthType } from "./utils";

const FIELD_STACK_CLASS = "grid gap-2";

type AddProviderDialogProps = {
  open: boolean;
  busy: boolean;
  addKind: ProviderKind;
  addAuthType: ProviderAuthType;
  addName: string;
  addBaseUrl: string;
  addApiKey: string;
  addCustomHeaders: string;
  addQueryParams: string;
  addAdvanced: boolean;
  onOpenChange: (open: boolean) => void;
  onKindChange: (kind: ProviderKind) => void;
  onAuthTypeChange: (authType: ProviderAuthType) => void;
  onNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onCustomHeadersChange: (value: string) => void;
  onQueryParamsChange: (value: string) => void;
  onAdvancedChange: (value: boolean) => void;
  onCreateProvider: () => void;
};

export function AddProviderDialog(props: AddProviderDialogProps) {
  const t = useTranslations("providers");
  const tm = useTranslations("providers.manager");
  const tCommon = useTranslations("common");
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
          <DialogDescription>{tm("addDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <AddProviderBasicFields {...props} />
          <AdvancedSection
            label={tCommon("advanced")}
            hint={t("advancedHint")}
            storageKey="advanced:provider-add"
            defaultOpen={props.addAdvanced}
          >
            <AddProviderAdvancedFields {...props} />
          </AdvancedSection>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            disabled={props.busy || !props.addName.trim()}
            onClick={props.onCreateProvider}
          >
            {props.busy ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <PlusIcon className="size-4" aria-hidden="true" />
            )}
            {tm("connectProvider")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddProviderBasicFields(props: AddProviderDialogProps) {
  const t = useTranslations("providers.manager");
  return (
    <>
      <div className={FIELD_STACK_CLASS}>
        <Label htmlFor="add-provider-name">{t("providerName")}</Label>
        <Input
          id="add-provider-name"
          name="add-provider-name"
          autoComplete="off"
          value={props.addName}
          onChange={(e) => props.onNameChange(e.target.value)}
          placeholder={t("providerNamePlaceholder")}
        />
      </div>
      <div className={FIELD_STACK_CLASS}>
        <Label htmlFor="add-provider-url">{t("serviceUrl")}</Label>
        <Input
          id="add-provider-url"
          name="add-provider-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          value={props.addBaseUrl}
          onChange={(e) => props.onBaseUrlChange(e.target.value)}
          placeholder={t("serviceUrlPlaceholder")}
        />
      </div>
      <div className={FIELD_STACK_CLASS}>
        <Label htmlFor="add-provider-key">{t("apiKey")}</Label>
        <Input
          id="add-provider-key"
          name="add-provider-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={props.addApiKey}
          onChange={(e) => props.onApiKeyChange(e.target.value)}
          placeholder="sk-…"
        />
      </div>
    </>
  );
}

function AddProviderAdvancedFields(props: AddProviderDialogProps) {
  const t = useTranslations("providers.manager");
  return (
    <div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-provider-kind">{t("providerType")}</Label>
          <Select
            value={props.addKind}
            onValueChange={(value) => {
              const kind = value as ProviderKind;
              props.onKindChange(kind);
              props.onAuthTypeChange(defaultAuthType(kind));
            }}
          >
            <SelectTrigger id="add-provider-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-provider-auth">{t("authentication")}</Label>
          <Select
            value={props.addAuthType}
            onValueChange={(value) =>
              props.onAuthTypeChange(value as ProviderAuthType)
            }
          >
            <SelectTrigger id="add-provider-auth">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(AUTH_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-headers">{t("customHeaders")}</Label>
          <Textarea
            id="add-headers"
            name="add-headers"
            autoComplete="off"
            value={props.addCustomHeaders}
            onChange={(e) => props.onCustomHeadersChange(e.target.value)}
            placeholder="X-Team=ai-platform…"
            className="min-h-20 font-mono text-xs"
          />
        </div>
        <div className={FIELD_STACK_CLASS}>
          <Label htmlFor="add-query">{t("queryParams")}</Label>
          <Textarea
            id="add-query"
            name="add-query"
            autoComplete="off"
            value={props.addQueryParams}
            onChange={(e) => props.onQueryParamsChange(e.target.value)}
            placeholder="api-version=2024-10-21…"
            className="min-h-20 font-mono text-xs"
          />
        </div>
      </div>
    </div>
  );
}

type EditProviderDialogProps = {
  editingProvider: SafeProvider | null;
  busy: boolean;
  editName: string;
  editBaseUrl: string;
  editApiKey: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
};

export function EditProviderDialog({
  editingProvider,
  busy,
  editName,
  editBaseUrl,
  editApiKey,
  onClose,
  onNameChange,
  onBaseUrlChange,
  onApiKeyChange,
  onSave,
}: EditProviderDialogProps) {
  const t = useTranslations("providers.manager");
  const tCommon = useTranslations("common");
  return (
    <Dialog open={Boolean(editingProvider)} onOpenChange={onClose}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("editDialogDescription", { name: editingProvider?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor="edit-provider-name">{t("providerName")}</Label>
            <Input
              id="edit-provider-name"
              name="edit-provider-name"
              autoComplete="off"
              value={editName}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor="edit-provider-url">{t("serviceUrl")}</Label>
            <Input
              id="edit-provider-url"
              name="edit-provider-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={editBaseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
            />
          </div>
          <div className={FIELD_STACK_CLASS}>
            <Label htmlFor="edit-provider-key">
              {t("newApiKey")}{" "}
              <span className="text-muted-foreground">({t("optional")})</span>
            </Label>
            <Input
              id="edit-provider-key"
              name="edit-provider-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={editApiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={t("keepCurrentKey")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button disabled={busy} onClick={onSave}>
            {t("saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProviderDialog({
  deleteProviderId,
  busy,
  onClose,
  onDelete,
}: {
  deleteProviderId: string | null;
  busy: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("providers.manager");
  const tCommon = useTranslations("common");
  return (
    <AlertDialog open={Boolean(deleteProviderId)} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("archiveTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("archiveDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => deleteProviderId && onDelete(deleteProviderId)}
          >
            {t("archive")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteModelDialog({
  deleteModelId,
  busy,
  onClose,
  onDelete,
}: {
  deleteModelId: string | null;
  busy: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("providers.manager");
  const tCommon = useTranslations("common");
  return (
    <AlertDialog open={Boolean(deleteModelId)} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeModelTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("removeModelDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => deleteModelId && onDelete(deleteModelId)}
          >
            {t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
