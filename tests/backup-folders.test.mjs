import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { browseBackupFolders } from "../src/lib/backup-folders.js";

test("drive picker lists only accessible Windows drives", async () => {
  const result = await browseBackupFolders("", { stat: async (drive) => {
    if (drive !== "D:\\") throw new Error("Unavailable");
    return { isDirectory: () => true };
  } }, "win32");
  assert.deepEqual(result.folders, [{ name: "D:\\", path: "D:\\" }]);
  assert.equal(result.directory, "");
});

test("folder browser excludes files and returns sorted navigable folders", async () => {
  const target = path.resolve("backups");
  const result = await browseBackupFolders(target, { readdir: async () => [
    { name: "Archive10", isDirectory: () => true },
    { name: "secret.env", isDirectory: () => false },
    { name: "Archive2", isDirectory: () => true },
  ] });
  assert.deepEqual(result.folders.map((item) => item.name), ["Archive2", "Archive10"]);
  assert.equal(result.folders[0].path, path.join(target, "Archive2"));
  assert.equal(result.parent, path.dirname(target));
});

test("invalid paths never reach the filesystem and access errors are readable", async () => {
  await assert.rejects(browseBackupFolders("../invalid", { readdir: () => { throw new Error("must not execute"); } }), { status: 400 });
  await assert.rejects(browseBackupFolders(path.resolve("missing"), { readdir: async () => { throw Object.assign(new Error("internal details"), { code: "ENOENT" }); } }), /no longer exists/);
});
