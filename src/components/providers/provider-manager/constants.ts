import type { ElementType } from "react";
import { CloudIcon, CpuIcon, NetworkIcon, PlugIcon } from "lucide-react";

import type { ProviderAuthType, ProviderKind } from "./types";

export const KIND_LABELS: Record<ProviderKind, string> = {
  "openai-compatible": "OpenAI-compatible",
  dragonfly: "Dragonfly",
  "vercel-ai-gateway": "Vercel AI Gateway",
  native: "Native",
};

export const AUTH_TYPE_LABELS: Record<ProviderAuthType, string> = {
  bearer: "Bearer token",
  "x-api-key": "X-API-KEY header",
  "custom-header": "Custom headers only",
  gateway: "Gateway bearer token",
};

export const KIND_ICONS: Record<ProviderKind, ElementType> = {
  "openai-compatible": PlugIcon,
  dragonfly: CloudIcon,
  "vercel-ai-gateway": NetworkIcon,
  native: CpuIcon,
};

export function kindAccent(kind: ProviderKind) {
  void kind;
  return {
    bar: "bg-primary",
    bg: "bg-primary/5",
    text: "text-primary",
    ring: "ring-primary/20",
    badge: "bg-primary/10 text-primary",
    iconBg: "bg-primary/10",
  };
}
