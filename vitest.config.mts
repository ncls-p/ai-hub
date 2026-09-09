import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["test/e2e/**"],
    setupFiles: ["./test/setup-env.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/modules/**/*.ts",
        "src/server/domain/**/*.ts",
      ],
      exclude: [
        "src/**/*.d.ts",
        // Pure TypeScript contracts have no runtime behavior. V8 still maps
        // their erased declarations as uncovered statements.
        "src/modules/document-extraction/types.ts",
        "src/server/infrastructure/**",
        "src/app/**",
        "src/components/**",
        "src/hooks/**",
        "src/i18n/**",
        "src/middleware.ts",
        "src/lib/rich-clipboard.ts",
        // External-service orchestration is covered by focused unit/integration-style tests,
        // but excluded from global V8 thresholds because exhaustive branch coverage
        // depends on GitHub, n8n/MCP, AI provider, and DB workflow permutations.
        "src/modules/agent/use-cases*.ts",
        "src/modules/chat/automation*.ts",
        "src/modules/chat/continuation*.ts",
        "src/modules/custom-tools/use-cases*.ts",
        "src/modules/github/publishing*.ts",
        "src/modules/tool/code-sandbox*.ts",
        // Hierarchical IAM is database orchestration with organization/project
        // invariants covered by the dedicated PostgreSQL integration suite and E2E.
        "src/modules/iam/resource-transfer*.ts",
        "src/modules/iam/resource-deletion*.ts",
        "src/modules/iam/member-transfer*.ts",
        "src/modules/iam/organization-transfer*.ts",
        "src/modules/iam/scope-lifecycle*.ts",
        "src/modules/iam/use-cases*.ts",
        "src/modules/iam/workspace-clone*.ts",
        "src/modules/knowledge/use-cases*.ts",
        // The OpenAI proxy boundary is exercised end-to-end with the official SDK.
        // These files coordinate request auth, database/provider resolution, quotas,
        // usage recording, and the external AI SDK rather than pure domain logic.
        "src/modules/openai-proxy/auth*.ts",
        "src/modules/openai-proxy/model-catalog*.ts",
        "src/modules/openai-proxy/service*.ts",
        // The Anthropic boundary reuses the same provider, quota, and usage
        // orchestration and is covered end-to-end with the official SDK.
        "src/modules/anthropic-proxy/auth*.ts",
        "src/modules/anthropic-proxy/model-catalog*.ts",
        "src/modules/anthropic-proxy/service*.ts",
        // Database-backed analytics and organization branding are exercised
        // through their authenticated API and browser E2E flows.
        "src/modules/organization/branding*.ts",
        "src/modules/usage/analytics*.ts",
        "src/modules/tool-connections/use-cases*.ts",
        "src/proxy.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 79,
        functions: 90,
        lines: 95,
      },
    },
  },
});
