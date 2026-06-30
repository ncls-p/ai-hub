import { RequireWorkspaceAccess } from "@/components/require-workspace-access";

import { ToolsHub } from "./tools-hub";

export default function ToolsPage() {
  return (
    <RequireWorkspaceAccess
      required={["canConfigureTools", "canViewTools", "canGetMcpServers"]}
      mode="any"
    >
      <ToolsHub />
    </RequireWorkspaceAccess>
  );
}
