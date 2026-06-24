import { beforeEach, describe, expect, it, vi } from "vitest";

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

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;
import {
  archiveProvider,
  createModel,
  createProvider,
  deleteModel,
  discoverModels,
  getModelById,
  getProviderById,
  listModels,
  listProviders,
  testProviderConnection,
  toSafeProvider,
  updateModel,
  updateProvider,
} from "@/modules/provider/use-cases";

function reset() {
  const c = dbModule._c;
  for (const k of ["from", "where", "orderBy", "values", "set"] as const) {
    c[k].mockReset().mockReturnThis();
  }
  c.limit.mockReset().mockResolvedValue([]);
  c.returning.mockReset().mockResolvedValue([]);
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

const fakeProvider = {
  id: "prov-1",
  workspaceId: "ws-1",
  kind: "openai-compatible" as const,
  name: "My Provider",
  baseUrl: null,
  authType: "bearer" as const,
  encryptedApiKey: "enc:key",
  encryptedHeadersJson: null,
  queryParamsJson: null,
  enabled: true,
  healthStatus: "healthy",
  lastCheckedAt: null,
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};

const fakeModel = {
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
  it("returns safe provider without encrypted fields", () => {
    const safe = toSafeProvider(fakeProvider);
    expect(safe).not.toHaveProperty("encryptedApiKey");
    expect(safe).not.toHaveProperty("encryptedHeadersJson");
    expect(safe.hasApiKey).toBe(true);
    expect(safe.hasCustomHeaders).toBe(false);
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

// ─── createProvider ───────────────────────────────────────────────────

describe("createProvider", () => {
  it("inserts provider without encryption when no API key", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    const result = await createProvider({
      workspaceId: "ws-1",
      userId: "user-1",
      kind: "openai-compatible",
      name: "Test",
      authType: "bearer",
    });

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(encryptValue).not.toHaveBeenCalled();
    expect(result).toEqual(fakeProvider);
  });

  it("encrypts API key when provided", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    await createProvider({
      workspaceId: "ws-1",
      userId: "user-1",
      kind: "openai-compatible",
      name: "Test",
      authType: "bearer",
      apiKey: "sk-secret",
    });

    expect(encryptValue).toHaveBeenCalledWith("sk-secret");
  });

  it("encrypts each header value", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    await createProvider({
      workspaceId: "ws-1",
      userId: "user-1",
      kind: "openai-compatible",
      name: "Test",
      authType: "bearer",
      headersJson: { "X-Custom": "secret-header" },
    });

    expect(encryptValue).toHaveBeenCalledWith("secret-header");
  });
});

// ─── getProviderById ──────────────────────────────────────────────────

describe("getProviderById", () => {
  it("returns null when not found", async () => {
    const result = await getProviderById("nonexistent", "ws-1");
    expect(result).toBeNull();
  });

  it("returns provider when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);
    const result = await getProviderById("prov-1", "ws-1");
    expect(result).toEqual(fakeProvider);
  });
});

// ─── listProviders ────────────────────────────────────────────────────

describe("listProviders", () => {
  it("returns providers ordered by createdAt desc", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeProvider]);

    const result = await listProviders("ws-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("prov-1");
  });

  it("returns empty array when no providers", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([]);

    const result = await listProviders("ws-1");
    expect(result).toHaveLength(0);
  });
});

// ─── updateProvider ───────────────────────────────────────────────────

describe("updateProvider", () => {
  it("throws when provider not found", async () => {
    await expect(
      updateProvider({
        providerId: "prov-1",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Provider not found");
  });

  it("updates provider fields when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    await updateProvider({
      providerId: "prov-1",
      workspaceId: "ws-1",
      userId: "user-1",
      name: "New Name",
      enabled: false,
    });

    expect(dbModule.db.update).toHaveBeenCalled();
  });

  it("encrypts new API key when provided", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    await updateProvider({
      providerId: "prov-1",
      workspaceId: "ws-1",
      userId: "user-1",
      apiKey: "new-sk-secret",
    });

    expect(encryptValue).toHaveBeenCalledWith("new-sk-secret");
  });

  it("encrypts new headers when provided", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    await updateProvider({
      providerId: "prov-1",
      workspaceId: "ws-1",
      userId: "user-1",
      headersJson: { "X-Header": "header-value" },
    });

    expect(encryptValue).toHaveBeenCalledWith("header-value");
  });
});

// ─── archiveProvider ──────────────────────────────────────────────────

describe("archiveProvider", () => {
  it("throws when provider not found", async () => {
    await expect(archiveProvider("prov-1", "ws-1", "user-1")).rejects.toThrow(
      "Provider not found",
    );
  });

  it("sets archivedAt when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    await archiveProvider("prov-1", "ws-1", "user-1");

    expect(dbModule.db.update).toHaveBeenCalled();
  });
});

// ─── testProviderConnection ───────────────────────────────────────────

describe("testProviderConnection", () => {
  it("throws when provider not found", async () => {
    await expect(testProviderConnection("prov-1", "ws-1")).rejects.toThrow(
      "Provider not found",
    );
  });

  it("returns health status and updates DB", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    const health = await testProviderConnection("prov-1", "ws-1");

    expect(health.status).toBe("healthy");
    expect(dbModule.db.update).toHaveBeenCalled();
  });

  it("decrypts API key before calling adapter", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      { ...fakeProvider, encryptedApiKey: "enc:key" },
    ]);
    const { decryptValue } = await import("@/lib/crypto");

    await testProviderConnection("prov-1", "ws-1");

    expect(decryptValue).toHaveBeenCalledWith("enc:key");
  });

  it("decrypts headers when encryptedHeadersJson is present", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      { ...fakeProvider, encryptedHeadersJson: { "X-Key": "enc:header" } },
    ]);
    const { decryptValue } = await import("@/lib/crypto");

    await testProviderConnection("prov-1", "ws-1");

    expect(decryptValue).toHaveBeenCalledWith("enc:header");
  });
});

// ─── createModel ──────────────────────────────────────────────────────

describe("createModel", () => {
  it("inserts model and returns it", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeModel]);

    const result = await createModel("prov-1", {
      providerId: "prov-1",
      modelId: "gpt-4",
    });

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(result).toEqual(fakeModel);
  });

  it("uses modelId as displayName when not provided", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeModel]);

    await createModel("prov-1", { providerId: "prov-1", modelId: "gpt-4" });

    const insertValues = dbModule._c.values.mock.calls[0][0];
    expect(insertValues.displayName).toBe("gpt-4");
  });

  it("uses explicit displayName when provided", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeModel]);

    await createModel("prov-1", {
      providerId: "prov-1",
      modelId: "gpt-4",
      displayName: "GPT-4 Turbo",
    });

    const insertValues = dbModule._c.values.mock.calls[0][0];
    expect(insertValues.displayName).toBe("GPT-4 Turbo");
  });
});

// ─── getModelById ─────────────────────────────────────────────────────

describe("getModelById", () => {
  it("returns null when not found", async () => {
    const result = await getModelById("nonexistent");
    expect(result).toBeNull();
  });

  it("returns model when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeModel]);
    const result = await getModelById("model-1");
    expect(result).toEqual(fakeModel);
  });
});

// ─── listModels ───────────────────────────────────────────────────────

describe("listModels", () => {
  it("returns models ordered by createdAt desc", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeModel]);

    const result = await listModels("prov-1");
    expect(result).toHaveLength(1);
  });

  it("returns empty when no models", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([]);

    const result = await listModels("prov-1");
    expect(result).toHaveLength(0);
  });
});

// ─── updateModel ──────────────────────────────────────────────────────

describe("updateModel", () => {
  it("calls db.update with provided fields", async () => {
    await updateModel("model-1", {
      displayName: "GPT-4 Updated",
      enabled: false,
    });

    expect(dbModule.db.update).toHaveBeenCalled();
    expect(dbModule._c.set).toHaveBeenCalled();
  });

  it("is a no-op for empty input", async () => {
    await updateModel("model-1", {});

    expect(dbModule.db.update).toHaveBeenCalled();
  });
});

// ─── deleteModel ──────────────────────────────────────────────────────

describe("deleteModel", () => {
  it("calls db.delete", async () => {
    await deleteModel("model-1");

    expect(dbModule.db.delete).toHaveBeenCalled();
  });
});

// ─── discoverModels ───────────────────────────────────────────────────

describe("discoverModels", () => {
  it("throws when provider not found", async () => {
    await expect(discoverModels("prov-1", "ws-1")).rejects.toThrow(
      "Provider not found",
    );
  });

  it("returns list of discovered models", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    const models = await discoverModels("prov-1", "ws-1");

    expect(models).toHaveLength(1);
    expect(models[0].modelId).toBe("model-1");
  });

  it("throws when adapter does not support listModels", async () => {
    const { getAdapter } = await import("@/server/infrastructure/providers");
    vi.mocked(getAdapter).mockReturnValueOnce({
      validateConnection: vi.fn(),
    } as never);
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    await expect(discoverModels("prov-1", "ws-1")).rejects.toThrow(
      "Model discovery not supported",
    );
  });
});
