import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { usesDatabaseBackupStorage } from "../src/lib/backup-storage.js";
import { listGridBackups, writeGridBackup, readGridBackup } from "../src/lib/backup-gridfs.js";

test("Vercel uses durable database storage even with a saved filesystem override", () => {
  assert.equal(usesDatabaseBackupStorage({ VERCEL: "1", BACKUP_DIR: "/var/task/backups" }), true);
  assert.equal(usesDatabaseBackupStorage({}), false);
  assert.equal(usesDatabaseBackupStorage({ VERCEL: "0" }), false);
});

test("encrypted archives survive separate storage clients and download byte for byte", async () => {
  const files = [];
  const stored = new Map();
  const bucket = () => ({
    openUploadStream(filename) {
      const chunks = [];
      return new Writable({
        write(chunk, encoding, callback) { chunks.push(chunk); callback(); },
        final(callback) {
          const data = Buffer.concat(chunks);
          stored.set(filename, data);
          files.push({ _id: filename, filename, uploadDate: new Date("2026-09-05T12:00:00Z"), length: data.length });
          callback();
        },
      });
    },
    find(filter) {
      const rows = files.filter((file) => typeof filter.filename === "string" ? file.filename === filter.filename : filter.filename.$regex.test(file.filename));
      return { sort() { return this; }, limit() { return this; }, async toArray() { return rows; } };
    },
    openDownloadStream(id) { return Readable.from([stored.get(id)]); },
  });
  const name = "oushadi-auto-2026-09-05T12-00-00.000Z.obak";
  const archive = JSON.stringify({ encryption: "AES-256-GCM", data: "encrypted payload" });
  assert.deepEqual(await listGridBackups(bucket(), /^oushadi-/), []);
  assert.equal((await writeGridBackup(bucket(), name, archive)).size, Buffer.byteLength(archive));
  assert.deepEqual(await readGridBackup(bucket(), name), Buffer.from(archive));
  assert.deepEqual(await listGridBackups(bucket(), /^oushadi-/), [{ name, type: "AUTOMATIC", createdAt: "2026-09-05T12:00:00.000Z", size: Buffer.byteLength(archive) }]);
  await assert.rejects(readGridBackup(bucket(), "missing"), { status: 404 });
});

test("failed uploads reject and clean up their partial chunks", async () => {
  let aborted = false;
  const upload = new Writable({ write(chunk, encoding, callback) { callback(new Error("Storage unavailable")); } });
  upload.abort = async () => { aborted = true; };
  await assert.rejects(writeGridBackup({ openUploadStream: () => upload }, "archive.obak", "encrypted"), /Storage unavailable/);
  assert.equal(aborted, true);
});
