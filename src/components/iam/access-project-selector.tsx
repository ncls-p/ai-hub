import { useTranslations } from "next-intl";
import { useWorkspace } from "@/hooks/use-workspace";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AccessProjectSelector() {
  const t = useTranslations("access");
  const { workspaceId, workspaces, setWorkspaceId } = useWorkspace();
  return (
    <div className="w-full max-w-sm">
      <Field>
        <FieldLabel htmlFor="access-project">{t("activeProject")}</FieldLabel>
        <Select value={workspaceId ?? ""} onValueChange={setWorkspaceId}>
          <SelectTrigger id="access-project" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {workspaces.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
