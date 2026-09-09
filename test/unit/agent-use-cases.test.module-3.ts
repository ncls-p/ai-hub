import { describe, expect, it, vi } from "vitest";

import { insertDelegationBindingsForVersion } from "@/modules/agent/delegation-use-cases";
import { createAgent } from "@/modules/agent/use-cases";
import { insertToolBindingsForVersion } from "@/modules/tool/use-cases";
import { dbModule, fakeAgent, fakeVersion } from "./agent-use-cases.test.chain";
import { fakeProvider } from "./agent-use-cases.test.fake-provider";

// ─── createAgent ──────────────────────────────────────────────────────

describe("createAgent", () => {
  it("throws when providerId given but provider not found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([]); // provider lookup

    await expect(
      createAgent({
        workspaceId: "ws-1",
        userId: "user-1",
        name: "Test",
        slug: "test",
        providerId: "prov-1",
      }),
    ).rejects.toThrow("Provider not found");
  });

  it("throws when modelId given but provider not specified", async () => {
    await expect(
      createAgent({
        workspaceId: "ws-1",
        userId: "user-1",
        name: "Test",
        slug: "test",
        modelId: "model-1",
      }),
    ).rejects.toThrow("Model requires a provider");
  });

  it("throws when model not found", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([fakeProvider]) // provider found
      .mockResolvedValueOnce([]); // model not found

    await expect(
      createAgent({
        workspaceId: "ws-1",
        userId: "user-1",
        name: "Test",
        slug: "test",
        providerId: "prov-1",
        modelId: "model-1",
      }),
    ).rejects.toThrow("Model not found");
  });

  it("creates agent and version via transaction", async () => {
    const insertedAgent = { ...fakeAgent, activeVersionId: null };
    const version = { ...fakeVersion };
    dbModule._tx.returning
      .mockResolvedValueOnce([insertedAgent]) // insert agent
      .mockResolvedValueOnce([version]); // insert version

    const result = await createAgent({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Test",
      slug: "test",
    });

    expect(result.agent).toEqual({
      ...insertedAgent,
      activeVersionId: version.id,
    });
    expect(result.version).toEqual(version);
    expect(dbModule._tx.values).toHaveBeenCalledWith(
      expect.objectContaining({ maxToolCalls: 20 }),
    );
    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
    expect(vi.mocked(insertToolBindingsForVersion)).toHaveBeenCalledWith(
      version.id,
      [],
      "ws-1",
      { userId: "user-1" },
      dbModule._tx,
    );
  });

  it("generates different UUID slugs for assistants with the same name", async () => {
    const slugs: string[] = [];
    for (let index = 0; index < 2; index++) {
      dbModule._tx.returning
        .mockResolvedValueOnce([fakeAgent])
        .mockResolvedValueOnce([fakeVersion]);
      await createAgent({
        workspaceId: "ws-1",
        userId: "user-1",
        name: "助手 🤖",
      });
      const values = dbModule._tx.values.mock.calls.at(-2)?.[0];
      expect(values.name).toBe("助手 🤖");
      expect(values.slug).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      slugs.push(values.slug);
    }
    expect(slugs[0]).not.toBe(slugs[1]);
  });

  it("applies the exact approval-free onboarding tool preset", async () => {
    const insertedAgent = { ...fakeAgent, activeVersionId: null };
    const version = { ...fakeVersion };
    dbModule._tx.returning
      .mockResolvedValueOnce([insertedAgent])
      .mockResolvedValueOnce([version]);

    await createAgent({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "First assistant",
      slug: "first-assistant",
      toolPreset: "onboarding",
    });

    expect(vi.mocked(insertToolBindingsForVersion)).toHaveBeenCalledWith(
      version.id,
      [
        {
          toolSource: "builtin",
          toolId: "00000000-0000-4000-8000-000000000001",
          requireApproval: false,
        },
        {
          toolSource: "builtin",
          toolId: "00000000-0000-4000-8000-000000000002",
          requireApproval: false,
        },
        {
          toolSource: "builtin",
          toolId: "00000000-0000-4000-8000-000000000006",
          requireApproval: false,
        },
        {
          toolSource: "builtin",
          toolId: "00000000-0000-4000-8000-000000000007",
          requireApproval: false,
        },
        {
          toolSource: "builtin",
          toolId: "00000000-0000-4000-8000-000000000008",
          requireApproval: false,
        },
        {
          toolSource: "builtin",
          toolId: "00000000-0000-4000-8000-000000000004",
          requireApproval: false,
        },
      ],
      "ws-1",
      { userId: "user-1" },
      dbModule._tx,
    );
  });

  it("keeps manual creation empty and rejects mixing a preset with bindings", async () => {
    await expect(
      createAgent({
        workspaceId: "ws-1",
        userId: "user-1",
        name: "Ambiguous assistant",
        slug: "ambiguous-assistant",
        toolPreset: "onboarding",
        toolBindings: [],
      }),
    ).rejects.toThrow("toolPreset cannot be combined with toolBindings");

    expect(dbModule.db.transaction).not.toHaveBeenCalled();
  });

  it("creates an orchestrator with versioned policy and bindings", async () => {
    const agent = { ...fakeAgent, kind: "orchestrator" as const };
    const version = { ...fakeVersion };
    dbModule._tx.returning
      .mockResolvedValueOnce([agent])
      .mockResolvedValueOnce([version]);

    await createAgent({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Coordinator",
      slug: "coordinator",
      kind: "orchestrator",
      delegationBindings: [
        {
          childAgentId: "11111111-1111-4111-8111-111111111111",
          childAgentVersionId: "22222222-2222-4222-8222-222222222222",
        },
      ],
    });

    expect(dbModule._tx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "orchestrator",
      }),
    );
    expect(dbModule._tx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orchestrationPolicyJson: expect.objectContaining({ maxDepth: 2 }),
      }),
    );
    expect(vi.mocked(insertDelegationBindingsForVersion)).toHaveBeenCalledWith(
      expect.objectContaining({
        parentAgentId: agent.id,
        agentVersionId: version.id,
      }),
    );
  });

  it("rejects delegation configuration for assistants", async () => {
    await expect(
      createAgent({
        workspaceId: "ws-1",
        userId: "user-1",
        name: "Assistant",
        slug: "assistant",
        delegationBindings: [
          {
            childAgentId: "11111111-1111-4111-8111-111111111111",
            childAgentVersionId: "22222222-2222-4222-8222-222222222222",
          },
        ],
      }),
    ).rejects.toThrow("Only orchestrators can configure delegation");
    expect(dbModule.db.transaction).not.toHaveBeenCalled();
  });
});
