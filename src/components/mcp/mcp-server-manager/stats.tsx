import { MetricCell } from "@/components/ui/metric-cell";

import type { McpServer, McpTool } from "./types";

export function SystemStrip({
  servers,
  toolsByServer,
}: {
  servers: McpServer[];
  toolsByServer: Record<string, McpTool[]>;
}) {
  const totalTools = Object.values(toolsByServer).reduce(
    (sum, t) => sum + t.length,
    0,
  );
  const enabledServers = servers.filter((s) => s.enabled).length;
  const enabledTools = Object.values(toolsByServer).reduce(
    (sum, t) => sum + t.filter((t) => t.enabled).length,
    0,
  );

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      <MetricCell label="Servers" value={servers.length} />
      <MetricCell label="Tools" value={totalTools} />
      <MetricCell label="Enabled servers" value={enabledServers} accent />
      <MetricCell label="Enabled tools" value={enabledTools} />
    </div>
  );
}
