import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { safeEnv, safeTestGroups } from "../vitest.safe.config.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packageManagerCli = process.env.npm_execpath;

if (!packageManagerCli) {
  throw new Error("Safe tests must be launched through pnpm.");
}

const environment = {
  ...process.env,
  ...safeEnv,
  CI: process.env.CI ?? "true",
};

for (const group of safeTestGroups) {
  console.log(`\n=== Safe tests: ${group.name} (${group.tests.length} files) ===`);
  const result = spawnSync(
    process.execPath,
    [packageManagerCli, "exec", "vitest", "run", ...(group.extraArgs ?? []), ...group.tests],
    {
      cwd: path.resolve(repoRoot, group.cwd),
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}