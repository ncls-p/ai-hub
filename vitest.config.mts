import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		globals: true,
		environment: "node",
		include: ["test/**/*.test.ts"],
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
				"src/server/infrastructure/**",
				"src/app/**",
				"src/components/**",
				"src/hooks/**",
				"src/i18n/**",
				"src/middleware.ts",
				"src/lib/rich-clipboard.ts",
				"src/proxy.ts",
			],
			thresholds: {
				statements: 55,
				branches: 77,
				functions: 60,
				lines: 55,
			},
		},
	},
});
