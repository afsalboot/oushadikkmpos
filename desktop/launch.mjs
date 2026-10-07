import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const env = { ...process.env };
// Editor terminals may inherit this flag, which turns Electron into plain Node.
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [".", ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  env,
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
