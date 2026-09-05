import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { backupDirectoryError, resolveBackupDirectory, verifyBackupDirectory } from "../src/lib/backup-storage.js";
import { SETTINGS_DEFAULTS, validateSettings } from "../src/services/settings.service.js";

test("saved backup folder overrides the environment and blank restores the fallback", () => {
  const saved = path.resolve("chosen-backups"), fallback = path.resolve("default-backups");
  assert.equal(resolveBackupDirectory(saved, { BACKUP_DIR: fallback }), saved);
  assert.equal(resolveBackupDirectory("", { BACKUP_DIR: fallback }), fallback);
  assert.equal(resolveBackupDirectory("", {}, process.cwd()), path.join(process.cwd(), "backups"));
});

test("backup directory validation rejects relative paths, control characters and non-strings", () => {
  for (const input of ["../backups", "https://storage.example/backups", "folder\u0000", {}, null]) {
    assert.ok(backupDirectoryError(input));
  }
  assert.equal(backupDirectoryError(""), "");
  assert.equal(backupDirectoryError(path.resolve("backup folder")), "");
  const settings = structuredClone(SETTINGS_DEFAULTS);
  settings.backup.directory = "../backups";
  assert.ok(validateSettings(settings)["backup.directory"]);
});

test("storage check writes and removes only its unique probe file", async () => {
  const target = path.resolve("backup-target"), calls = [];
  const io = Object.fromEntries(["mkdir", "readdir", "writeFile", "unlink"].map((name) => [name, async (...args) => calls.push([name, ...args])]));
  assert.equal(await verifyBackupDirectory(target, io), target);
  assert.deepEqual(calls.map(([name]) => name), ["mkdir", "readdir", "writeFile", "unlink"]);
  assert.equal(path.dirname(calls[2][1]), target);
  assert.match(path.basename(calls[2][1]), /^\.oushadi-storage-check-/);
  assert.equal(calls[2][3].flag, "wx");
  assert.equal(calls[3][1], calls[2][1]);
});

test("storage check rejects inaccessible directories without deleting existing files", async () => {
  let deleted = false;
  await assert.rejects(verifyBackupDirectory(path.resolve("unavailable"), {
    mkdir: async () => {}, readdir: async () => {},
    writeFile: async () => { throw new Error("Permission denied"); },
    unlink: async () => { deleted = true; },
  }), /Permission denied/);
  assert.equal(deleted, false);
});
