vi.mock("@/modules/organization/workspace-organization", () => ({
  organizationIdForWorkspace: vi.fn().mockResolvedValue("org-1"),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptValue } from "@/lib/crypto";
import {
  getChatAutomationAdminState,
  setChatAutomationConfig,
} from "@/modules/chat/automation";
import * as _dbModule from "@/server/infrastructure/db";
import { generateText } from "ai";

vi.mock("@/server/infrastructure/ai-sdk/devtools", () => ({
  registerAiSdkDevTools: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  decryptValue: vi.fn(async (value: string) => `dec:${value}`),
}));

vi.mock("@/lib/logger", () => ({
  logHandledWarning: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi
    .fn()
    .mockResolvedValue({ text: '{"ok":true}', finalStep: { reasoning: [] } }),
}));

vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: vi.fn().mockReturnValue({
    createChatModel: vi.fn().mockReturnValue({ model: "runtime" }),
  }),
}));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const c = {} as Chain;
  for (const key of [
    "select",
    "insert",
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "values",
    "onConflictDoUpdate",
  ] as const) {
    c[key] = vi.fn().mockReturnThis();
  }
  c.limit = vi.fn().mockResolvedValue([]);
  return c;
}

type DbModule = {
  db: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
  _c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  return { db: { select: vi.fn(), insert: vi.fn() }, _c: chain };
});

export const dbModule = _dbModule as unknown as DbModule;

export function resetDb() {
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
  for (const key of [
    "select",
    "insert",
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "values",
    "onConflictDoUpdate",
  ] as const) {
    dbModule._c[key].mockReset().mockReturnThis();
  }
  dbModule._c.limit.mockReset().mockResolvedValue([]);
}

const providerId = "11111111-1111-4111-8111-111111111111";
const modelId = "22222222-2222-4222-8222-222222222222";
export const enabledConfig = {
  enabled: true,
  providerId,
  modelId,
  generateTitles: true,
  generateSuggestions: true,
};
export const provider = {
  id: providerId,
  kind: "openai",
  name: "OpenAI",
  baseUrl: null,
  authType: "bearer",
  encryptedApiKey: "api-key",
  encryptedHeadersJson: { "x-test": "header" },
  queryParamsJson: { beta: "true" },
};
export const model = {
  id: modelId,
  providerId,
  modelId: "gpt-4.1-mini",
  enabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  vi.mocked(decryptValue)
    .mockReset()
    .mockImplementation(async (value: string) => `dec:${value}`);
  vi.mocked(generateText)
    .mockReset()
    .mockResolvedValue({
      text: '{"ok":true}',
      finalStep: { reasoning: [] },
    } as never);
});

describe("chat automation config", () => {
  it("persists config and returns parsed defaults", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      { valueJson: { enabled: false } },
    ]);

    const result = await setChatAutomationConfig(
      { enabled: false, generateTitles: true, generateSuggestions: false },
      "user-1",
      "org-1",
    );

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(dbModule._c.onConflictDoUpdate).toHaveBeenCalled();
    expect(result).toEqual({
      enabled: false,
      generateTitles: true,
      generateSuggestions: true,
    });
  });

  it("returns admin config, providers, and models", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ valueJson: enabledConfig }]);
    dbModule._c.orderBy
      .mockResolvedValueOnce([{ id: providerId, name: "OpenAI" }])
      .mockResolvedValueOnce([{ id: modelId, modelId: "gpt" }]);

    const result = await getChatAutomationAdminState("org-1");

    expect(result.config.enabled).toBe(true);
    expect(result.providers).toHaveLength(1);
    expect(result.models).toHaveLength(1);
  });
});
