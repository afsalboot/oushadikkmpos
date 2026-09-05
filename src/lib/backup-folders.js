import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { backupDirectoryError } from "./backup-storage.js";

export async function browseBackupFolders(directory, io = { readdir, stat }, platform = process.platform) {
  if (!directory) {
    const candidates = platform === "win32"
      ? Array.from({ length: 26 }, (_, index) => `${String.fromCharCode(65 + index)}:\\`)
      : ["/"];
    const roots = await Promise.all(candidates.map(async (root) => {
      try { return (await io.stat(root)).isDirectory() ? { name: root, path: root } : null; }
      catch { return null; }
    }));
    return { directory: "", parent: null, folders: roots.filter(Boolean) };
  }
  const invalid = backupDirectoryError(directory);
  if (invalid) throw Object.assign(new Error(invalid), { status: 400 });
  const target = path.resolve(/* turbopackIgnore: true */ directory);
  try {
    const entries = await io.readdir(target, { withFileTypes: true });
    return {
      directory: target,
      parent: path.dirname(target) === target ? "" : path.dirname(target),
      folders: entries.filter((entry) => entry.isDirectory()).map((entry) => ({ name: entry.name, path: path.join(target, entry.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })),
    };
  } catch (error) {
    throw Object.assign(new Error(error.code === "ENOENT" ? "This folder no longer exists. Choose another folder." : "Cannot open this folder. Choose a folder the POS server can access."), { status: 400 });
  }
}
