import type { ProviderAuthType, ProviderKind } from "./types";

export function defaultAuthType(kind: ProviderKind): ProviderAuthType {
  if (kind === "dragonfly") return "x-api-key";
  if (kind === "vercel-ai-gateway") return "gateway";
  return "bearer";
}

export function parsePairs(input: string): Record<string, string> | undefined {
  const rows = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) return undefined;
  const result: Record<string, string> = {};
  for (const row of rows) {
    const separator = row.indexOf("=");
    if (separator === -1) continue;
    const key = row.slice(0, separator).trim();
    const value = row.slice(separator + 1).trim();
    if (key) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && value > 0
    ? new Intl.NumberFormat().format(value)
    : null;
}

export function timeAgo(dateStr: string | null) {
  if (!dateStr) return null;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
