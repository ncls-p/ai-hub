import { beforeAll, describe, expect, it, vi } from "vitest";

// ─── lib/copy-defaults.ts ──────────────────────────────────────────────

import {
  DEFAULT_SYSTEM_PROMPT,
  FALLBACK_SYSTEM_PROMPT_EN,
  FALLBACK_SYSTEM_PROMPT_FR,
  fallbackSystemPrompt,
} from "@/lib/copy-defaults";

describe("copy-defaults", () => {
  it("DEFAULT_SYSTEM_PROMPT is empty string", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBe("");
  });

  it("FALLBACK_SYSTEM_PROMPT_EN is non-empty", () => {
    expect(FALLBACK_SYSTEM_PROMPT_EN.length).toBeGreaterThan(0);
  });

  it("FALLBACK_SYSTEM_PROMPT_FR is non-empty", () => {
    expect(FALLBACK_SYSTEM_PROMPT_FR.length).toBeGreaterThan(0);
  });

  it("fallbackSystemPrompt returns FR prompt for fr locale", () => {
    expect(fallbackSystemPrompt("fr")).toBe(FALLBACK_SYSTEM_PROMPT_FR);
  });

  it("fallbackSystemPrompt returns EN prompt for en locale", () => {
    expect(fallbackSystemPrompt("en")).toBe(FALLBACK_SYSTEM_PROMPT_EN);
  });

  it("fallbackSystemPrompt returns EN prompt for unknown locale", () => {
    expect(fallbackSystemPrompt("de")).toBe(FALLBACK_SYSTEM_PROMPT_EN);
  });
});

// ─── lib/markdown-to-html.ts ──────────────────────────────────────────

import { markdownToHtml } from "@/lib/markdown-to-html";

describe("markdownToHtml", () => {
  it("converts bold markdown", () => {
    expect(markdownToHtml("**bold**")).toContain("<strong>bold</strong>");
  });

  it("converts headings", () => {
    expect(markdownToHtml("# Title")).toContain("<h1");
  });

  it("returns empty string for empty input", () => {
    expect(markdownToHtml("")).toBe("");
  });

  it("converts links", () => {
    const html = markdownToHtml("[text](https://example.com)");
    expect(html).toContain("<a");
    expect(html).toContain("https://example.com");
  });

  it("wraps paragraphs", () => {
    const html = markdownToHtml("Hello world");
    expect(html).toContain("<p>");
  });
});

// ─── lib/logger.ts ─────────────────────────────────────────────────────

describe("logger", () => {
  let logger: typeof import("@/lib/logger").logger;

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY =
      "0000000000000000000000000000000000000000000000000000000000000000";
    process.env.APP_ENCRYPTION_KEY_ID = "default";
    process.env.BETTER_AUTH_SECRET = "test-secret-min-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/test";
    process.env.OBJECT_STORAGE_BUCKET = "test";
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "test";
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test";
    ({ logger } = await import("@/lib/logger"));
  });

  it("info writes to stdout", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logger.info("test info message");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("warn writes to stderr", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    logger.warn("test warn message");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("error writes to stderr", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    logger.error("test error message", { key: "value" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("debug writes to stdout in test env", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logger.debug("test debug message", { data: 1 });
    // NODE_ENV=test so debug should log
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("info includes the message in output", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logger.info("unique message 12345");
    const callArg = spy.mock.calls[0][0] as string;
    expect(callArg).toContain("unique message 12345");
    spy.mockRestore();
  });
});

// ─── lib/workspace-nav.ts (pure parts) ────────────────────────────────

import {
  getRouteBreadcrumbs,
  getRouteTitleKey,
  isNavItemActive,
  primaryNavItems,
  capabilitiesNavItems,
  advancedCapabilityNavItems,
  configNavItems,
  adminNavItems,
} from "@/lib/workspace-nav";

describe("workspace-nav pure functions", () => {
  describe("getRouteTitleKey", () => {
    it("returns the exact key for known routes", () => {
      expect(getRouteTitleKey("/chat")).toBe("chat");
      expect(getRouteTitleKey("/agents")).toBe("assistants");
      expect(getRouteTitleKey("/providers")).toBe("aiConnections");
      expect(getRouteTitleKey("/usage")).toBe("usage");
    });

    it("returns assistantConfig for agent config routes", () => {
      expect(getRouteTitleKey("/agents/some-id")).toBe("assistantConfig");
    });

    it("returns workspace for unknown routes", () => {
      expect(getRouteTitleKey("/unknown")).toBe("workspace");
    });

    it("handles sub-paths of known routes", () => {
      expect(getRouteTitleKey("/settings/profile")).toBe("settings");
    });
  });

  describe("isNavItemActive", () => {
    it("returns true for exact match", () => {
      expect(isNavItemActive("/chat", "/chat")).toBe(true);
    });

    it("returns true for sub-path", () => {
      expect(isNavItemActive("/agents/some-id", "/agents")).toBe(true);
    });

    it("returns false for different route", () => {
      expect(isNavItemActive("/chat", "/agents")).toBe(false);
    });

    it("handles /tools route matching /mcp paths", () => {
      expect(isNavItemActive("/mcp/some-server", "/tools")).toBe(true);
      expect(isNavItemActive("/mcp", "/tools")).toBe(true);
    });

    it("returns false for partial prefix without separator", () => {
      expect(isNavItemActive("/settings-extra", "/settings")).toBe(false);
    });
  });

  describe("getRouteBreadcrumbs", () => {
    it("returns breadcrumbs for agent config route", () => {
      const crumbs = getRouteBreadcrumbs("/agents/abc-123");
      expect(crumbs).toHaveLength(2);
      expect(crumbs![0].labelKey).toBe("assistants");
      expect(crumbs![0].href).toBe("/agents");
    });

    it("returns undefined for other routes", () => {
      expect(getRouteBreadcrumbs("/chat")).toBeUndefined();
      expect(getRouteBreadcrumbs("/agents")).toBeUndefined();
    });
  });

  describe("nav item arrays", () => {
    it("all primary nav items have required fields", () => {
      for (const item of primaryNavItems) {
        expect(item.href).toBeTruthy();
        expect(item.labelKey).toBeTruthy();
        expect(item.icon).toBeDefined();
      }
    });

    it("all admin nav items have required fields", () => {
      for (const item of adminNavItems) {
        expect(item.href).toBeTruthy();
        expect(item.labelKey).toBeTruthy();
      }
    });

    it("all config nav items include settings and api-keys", () => {
      const hrefs = configNavItems.map((i) => i.href);
      expect(hrefs).toContain("/settings");
      expect(hrefs).toContain("/api-keys");
    });

    it("capabilities nav items include tools", () => {
      const hrefs = capabilitiesNavItems.map((i) => i.href);
      expect(hrefs).toContain("/tools");
    });

    it("advanced capability nav items include marketplace", () => {
      const hrefs = advancedCapabilityNavItems.map((i) => i.href);
      expect(hrefs).toContain("/marketplace");
    });
  });
});
