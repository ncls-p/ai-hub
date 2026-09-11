import { beforeEach, describe, expect, it, vi } from "vitest";

import { toSafeProvider } from "@/modules/provider/use-cases";
import * as _dbModule from "@/server/infrastructure/db";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
  logHandledWarning: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn().mockResolvedValue("enc:value"),
  decryptValue: vi.fn().mockResolvedValue("decrypted-secret"),
}));

const mockAdapter = vi.hoisted(() => ({
  validateConnection: vi
    .fn()
    .mockResolvedValue({ status: "healthy", latencyMs: 50 }),
  listModels: vi.fn().mockResolvedValue([
    {
      modelId: "model-1",
      displayName: "GPT-4",
      capabilities: { text: true },
    },
  ]),
}));

export function getMockAdapter() {
  return mockAdapter;
}

vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: vi.fn().mockReturnValue(mockAdapter),
}));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

type DbMock = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

type DbModule = {
  db: DbMock;
  _c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const c: Chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    _c: c,
  };
});
export const dbModule = _dbModule as unknown as DbModule;

function reset() {
  const c = dbModule._c;
  for (const k of ["from", "where", "orderBy", "values", "set"] as const) {
    c[k].mockReset().mockReturnThis();
  }
  c.limit.mockReset().mockResolvedValue([]);
  c.returning.mockReset().mockResolvedValue([]);
  c.onConflictDoUpdate.mockReset().mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  reset();
  dbModule.db.select.mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReturnValue(dbModule._c);
  dbModule.db.update.mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReturnValue(dbModule._c);
});

// ─── Fixtures ────────────────────────────────────────────────────────

export const fakeProvider = {
  id: "prov-1",
  workspaceId: "ws-1",
  kind: "openai-compatible" as const,
  name: "My Provider",
  baseUrl: null,
  authType: "bearer" as const,
  encryptedApiKey: "enc:key",
  encryptedHeadersJson: null,
  queryParamsJson: null,
  openaiCompatibleApiRoute: "chat-completions",
  openaiCompatibilityProfile: "vllm",
  enabled: true,
  healthStatus: "healthy",
  lastCheckedAt: null,
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};

export const fakeModel = {
  id: "model-1",
  providerId: "prov-1",
  modelId: "gpt-4",
  displayName: "GPT-4",
  enabled: true,
  capabilitiesJson: null,
  contextWindow: null,
  maxOutputTokens: null,
  inputTokenCost: null,
  outputTokenCost: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── toSafeProvider ───────────────────────────────────────────────────

describe("toSafeProvider", () => {
  it("hides connection URLs and query credentials from read-only recipients", () => {
    const safe = toSafeProvider(
      {
        ...fakeProvider,
        baseUrl: "https://token@example.test",
        queryParamsJson: { api_key: "secret" },
      },
      false,
    );
    expect(safe.baseUrl).toBeNull();
    expect(safe.queryParamsJson).toBeNull();
    expect(JSON.stringify(safe)).not.toContain("secret");
  });
  it("returns safe provider without encrypted fields", () => {
    const safe = toSafeProvider(fakeProvider);
    expect(safe).not.toHaveProperty("encryptedApiKey");
    expect(safe).not.toHaveProperty("encryptedHeadersJson");
    expect(safe.hasApiKey).toBe(true);
    expect(safe.hasCustomHeaders).toBe(false);
    expect(safe.openaiCompatibleApiRoute).toBe("chat-completions");
    expect(safe.openaiCompatibilityProfile).toBe("vllm");
  });

  it("hasApiKey is false when no encrypted key", () => {
    const safe = toSafeProvider({ ...fakeProvider, encryptedApiKey: null });
    expect(safe.hasApiKey).toBe(false);
  });

  it("hasCustomHeaders is true when headers present", () => {
    const safe = toSafeProvider({
      ...fakeProvider,
      encryptedHeadersJson: { Authorization: "enc:auth" },
    });
    expect(safe.hasCustomHeaders).toBe(true);
  });
});
