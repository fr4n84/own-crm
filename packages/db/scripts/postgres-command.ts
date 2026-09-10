import { spawn } from "node:child_process";

import type { CommandRunner } from "../src/operations/postgres-backup";

export const runPostgresCommand: CommandRunner = ({ command, args, env }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
