import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const chain = vi.hoisted(() => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockReturnThis(),
}));

vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: chain.select,
    insert: chain.insert,
    delete: chain.delete,
  },
}));

import { defaultSidebarNavConfig } from "@/modules/navigation/sidebar-config";
import {
  deleteSidebarNavConfig,
  getSidebarNavConfig,
  setSidebarNavConfig,
} from "@/modules/navigation/sidebar-config.server";

describe("sidebar config server persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.select.mockReturnValue(chain);
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.insert.mockReturnValue(chain);
    chain.values.mockReturnValue(chain);
    chain.delete.mockReturnValue(chain);
    chain.onConflictDoUpdate.mockResolvedValue(undefined);
  });

  it("returns null without settings and falls back to defaults for invalid values", async () => {
    chain.limit.mockResolvedValueOnce([]);
    await expect(getSidebarNavConfig("org-1")).resolves.toBeNull();

    chain.limit.mockResolvedValueOnce([{ valueJson: { bad: true } }]);
    await expect(getSidebarNavConfig("org-1")).resolves.toEqual(
      defaultSidebarNavConfig(),
    );
  });

  it("upserts and deletes sidebar navigation settings", async () => {
    const value = defaultSidebarNavConfig();
    chain.limit.mockResolvedValueOnce([{ valueJson: value }]);
    await expect(
      setSidebarNavConfig(value, "user-1", "org-1"),
    ).resolves.toEqual(value);
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "sidebarNavigation:organization:org-1",
        valueJson: value,
        updatedById: "user-1",
      }),
    );
    expect(chain.onConflictDoUpdate).toHaveBeenCalled();

    await deleteSidebarNavConfig("org-1");
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalled();
  });
});
