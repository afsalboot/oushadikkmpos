import path from "node:path";
import { mkdir, readdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export function resolveBackupDirectory(directory, env = process.env, cwd = process.cwd()) {
  return path.resolve(/* turbopackIgnore: true */ directory || env.BACKUP_DIR || path.join(cwd, "backups"));
}

export function backupDirectoryError(directory) {
  if (typeof directory !== "string") return "Enter a folder path.";
  if (!directory) return "";
  if (directory.length > 1024 || /[\x00-\x1f]/.test(directory) || !path.isAbsolute(directory)) {
    return "Enter an absolute folder path on the POS server.";
  }
  return "";
}

export async function verifyBackupDirectory(directory, io = { mkdir, readdir, writeFile, unlink }) {
  const target = resolveBackupDirectory(directory);
  await io.mkdir(target, { recursive: true });
  await io.readdir(target);
  const probe = path.join(target, `.oushadi-storage-check-${randomUUID()}`);
  await io.writeFile(probe, "Backup storage check", { flag: "wx", mode: 0o600 });
  await io.unlink(probe);
  return target;
}
