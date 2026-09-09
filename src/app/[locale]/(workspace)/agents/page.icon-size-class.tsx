"use client";

import { type ResourceProvenance } from "@/components/resource-provenance-badge";
import type {
  AgentAccessOptions,
  AgentAccessScope,
  AgentAccessSelection,
} from "@/modules/agent/access-scope";

export const ICON_SIZE_CLASS = "size-4";

export const AGENT_TEMPLATES = [
  {
    id: "support",
    nameKey: "templates.support.name",
    descriptionKey: "templates.support.description",
    promptKey: "templates.support.prompt",
    suggestionKeys: [
      "templates.support.suggestions.0",
      "templates.support.suggestions.1",
      "templates.support.suggestions.2",
    ],
  },
  {
    id: "hr",
    nameKey: "templates.hr.name",
    descriptionKey: "templates.hr.description",
    promptKey: "templates.hr.prompt",
    suggestionKeys: [
      "templates.hr.suggestions.0",
      "templates.hr.suggestions.1",
      "templates.hr.suggestions.2",
    ],
  },
  {
    id: "documents",
    nameKey: "templates.documents.name",
    descriptionKey: "templates.documents.description",
    promptKey: "templates.documents.prompt",
    suggestionKeys: [
      "templates.documents.suggestions.0",
      "templates.documents.suggestions.1",
      "templates.documents.suggestions.2",
    ],
  },
  {
    id: "sales",
    nameKey: "templates.sales.name",
    descriptionKey: "templates.sales.description",
    promptKey: "templates.sales.prompt",
    suggestionKeys: [
      "templates.sales.suggestions.0",
      "templates.sales.suggestions.1",
      "templates.sales.suggestions.2",
    ],
  },
  {
    id: "project",
    nameKey: "templates.project.name",
    descriptionKey: "templates.project.description",
    promptKey: "templates.project.prompt",
    suggestionKeys: [
      "templates.project.suggestions.0",
      "templates.project.suggestions.1",
      "templates.project.suggestions.2",
    ],
  },
  {
    id: "blank",
    nameKey: "templates.blank.name",
    descriptionKey: "templates.blank.description",
    promptKey: "templates.blank.prompt",
    suggestionKeys: [
      "templates.blank.suggestions.0",
      "templates.blank.suggestions.1",
      "templates.blank.suggestions.2",
    ],
  },
] as const;

export interface Agent {
  id: string;
  kind: "assistant" | "orchestrator";
  name: string;
  slug: string;
  description: string | null;
  logoUrl?: string | null;
  activeVersionId: string | null;
  modelDisplayName?: string | null;
  toolCount?: number;
  promptSuggestions?: string[];
  organizationDisplayOrder?: number;
  isOrganizationDefault?: boolean;
  sharingMode: "personal" | "marketplace" | "specific_user";
  isGlobal: boolean;
  isRecommended: boolean;
  curationLabel: string | null;
  canEdit?: boolean;
  canClone?: boolean;
  hiddenInChat?: boolean;
  access?: AgentAccessSelection;
  createdAt: string;
  updatedAt: string;
  provenance: ResourceProvenance;
}

export type AgentAccessForm = {
  accessScope: AgentAccessScope;
  accessTeamId: string;
};

export type { AgentAccessOptions };
