import {
  automationModelAvailability,
  automationProviderAvailability,
} from "./automation.model-availability";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { registerAiSdkDevTools } from "@/server/infrastructure/ai-sdk/devtools";
import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  aiProviders,
  appSettings,
  workspaces,
} from "@/server/infrastructure/db/schema";
import {
  type ProviderKind,
  type ProviderRuntimeConfig,
} from "@/server/infrastructure/providers";
import { resolveRuntimeModel } from "./automation.resolve-runtime-model";

registerAiSdkDevTools();

const CHAT_AUTOMATION_SETTING_KEY = "chatAutomation";

const chatAutomationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  providerId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  generateTitles: z.boolean().default(true),
  generateSuggestions: z.boolean().default(true),
});

export type ChatAutomationConfig = z.infer<typeof chatAutomationConfigSchema>;

export type ChatAutomationValidationIssue = {
  code: string;
  message: string;
};

export type RuntimeModel = {
  runtimeConfig: ProviderRuntimeConfig;
  providerKind: ProviderKind;
  modelId: string;
};

export type ResolveRuntimeResult =
  | { ok: true; runtime: RuntimeModel }
  | { ok: false; reason: string };

function defaultChatAutomationConfig(): ChatAutomationConfig {
  return {
    enabled: false,
    generateTitles: true,
    generateSuggestions: true,
  };
}

function parseChatAutomationConfig(value: unknown): ChatAutomationConfig {
  const parsed = chatAutomationConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultChatAutomationConfig();
}

export async function getChatAutomationConfig(organizationId: string) {
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(
      eq(
        appSettings.key,
        `${CHAT_AUTOMATION_SETTING_KEY}:organization:${organizationId}`,
      ),
    )
    .limit(1);
  return parseChatAutomationConfig(row?.valueJson);
}

export async function setChatAutomationConfig(
  input: ChatAutomationConfig,
  updatedById: string,
  organizationId: string,
) {
  const value = chatAutomationConfigSchema.parse(input);
  await db
    .insert(appSettings)
    .values({
      key: `${CHAT_AUTOMATION_SETTING_KEY}:organization:${organizationId}`,
      valueJson: value,
      updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: value, updatedById, updatedAt: new Date() },
    });
  return getChatAutomationConfig(organizationId);
}

export async function getChatAutomationAdminState(organizationId: string) {
  const [config, providers] = await Promise.all([
    getChatAutomationConfig(organizationId),
    db
      .select({
        id: aiProviders.id,
        name: aiProviders.name,
        kind: aiProviders.kind,
        enabled: aiProviders.enabled,
      })
      .from(aiProviders)
      .innerJoin(workspaces, eq(workspaces.id, aiProviders.workspaceId))
      .where(
        and(
          automationProviderAvailability(organizationId),
          isNull(workspaces.archivedAt),
          eq(aiProviders.enabled, true),
          isNull(aiProviders.archivedAt),
        ),
      )
      .orderBy(aiProviders.name),
  ]);

  const models = await db
    .select({
      id: aiModels.id,
      providerId: aiModels.providerId,
      modelId: aiModels.modelId,
      displayName: aiModels.displayName,
      enabled: aiModels.enabled,
    })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
    .innerJoin(workspaces, eq(workspaces.id, aiProviders.workspaceId))
    .where(
      and(
        automationModelAvailability(organizationId),
        isNull(workspaces.archivedAt),
        eq(aiModels.enabled, true),
        eq(aiProviders.enabled, true),
        isNull(aiProviders.archivedAt),
      ),
    )
    .orderBy(aiModels.displayName, aiModels.modelId);

  return { config, providers, models };
}

export function validateChatAutomationConfigShape(
  config: ChatAutomationConfig,
): ChatAutomationValidationIssue[] {
  const issues: ChatAutomationValidationIssue[] = [];
  if (config.enabled && !config.providerId) {
    issues.push({
      code: "provider_required",
      message: "A provider is required when automation is enabled.",
    });
  }
  if (config.enabled && !config.modelId) {
    issues.push({
      code: "model_required",
      message: "A model is required when automation is enabled.",
    });
  }
  return issues;
}

export async function validateChatAutomationConfig(
  config: ChatAutomationConfig,
  organizationId: string,
): Promise<{ ok: boolean; issues: ChatAutomationValidationIssue[] }> {
  const issues = validateChatAutomationConfigShape(config);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (!config.enabled) {
    return { ok: true, issues: [] };
  }

  const resolved = await resolveRuntimeModel(config, organizationId);
  if (!resolved.ok) {
    issues.push({
      code: "runtime_unavailable",
      message: resolved.reason,
    });
    return { ok: false, issues };
  }
  return { ok: true, issues: [] };
}
