import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		passWithNoTests: true,
		setupFiles: ["src/vitest-setup.ts"],
		fileParallelism: false,
	},
});
