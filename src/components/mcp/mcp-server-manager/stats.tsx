import { cn } from "@/lib/utils";

import type { McpServer, McpTool } from "./types";

function MetricCell({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          "text-2xl font-bold leading-none",
          accent ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

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
