import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: __dirname,
	resolve: {
		alias: {
			"@crm-fran/ui/": path.resolve(__dirname, "../../packages/ui/src/"),
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		include: ["src/**/*.test.{ts,tsx}"],
		passWithNoTests: true,
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
	},
});
