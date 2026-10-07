import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBackup, backupDue } from "./local-backup.mjs";

const name = "oushadi-manual-2026-09-28T12-00-00.000Z.obak";
const archive = JSON.stringify({
  format: "oushadi-pos-backup",
  version: 1,
  encryption: "AES-256-GCM",
  data: "test-encrypted-payload",
  tag: "test-tag",
});
async function fixture(t, request) {
  const folder = await mkdtemp(join(tmpdir(), "oushadhi-backup-test-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const backup = new LocalBackup({
    configPath: join(folder, "settings.json"),
    request,
  });
  await backup.configure({ directory: folder });
  return { backup, folder };
}
test("schedule stays off by default and throttles retries", () => {
  assert.equal(backupDue({}), false);
  const state = { enabled: true, directory: "D:/Backups", frequency: "DAILY" };
  assert.equal(backupDue(state, 1000000), true);
  assert.equal(backupDue({ ...state, lastAttempt: 999999 }, 1000000), false);
  assert.equal(backupDue({ ...state, lastSuccess: 999999 }, 1000000), false);
});
test("saves exact encrypted bytes, persists success, and leaves no partial files", async (t) => {
  const { backup, folder } = await fixture(t, async (_path, options) =>
    options.method === "POST"
      ? Response.json({ data: { name } })
      : new Response(archive),
  );
  const result = await backup.run();
  assert.equal(await readFile(result, "utf8"), archive);
  assert.equal(
    JSON.parse(await readFile(join(folder, "settings.json"))).lastFile,
    result,
  );
  assert.equal(
    (await readdir(folder)).some((file) => file.endsWith(".partial")),
    false,
  );
});
test("failed download retries the same server archive without creating another", async (t) => {
  let creates = 0,
    downloads = 0;
  const { backup } = await fixture(t, async (_path, options) => {
    if (options.method === "POST") {
      creates++;
      return Response.json({ data: { name } });
    }
    if (++downloads === 1) throw new Error("Offline");
    return new Response(archive);
  });
  await assert.rejects(backup.run(), /Offline/);
  assert.equal(backup.state.pending, name);
  await backup.run();
  assert.equal(creates, 1);
  assert.equal(backup.state.lastError, "");
});
test("rejects unauthorized responses and unsafe names without writing archives", async (t) => {
  const { backup, folder } = await fixture(
    t,
    async () => new Response("Denied", { status: 403 }),
  );
  await assert.rejects(backup.run(), /owner/);
  backup.request = async () =>
    Response.json({ data: { name: "../outside.obak" } });
  await assert.rejects(backup.run(), /invalid backup name/);
  assert.deepEqual(await readdir(folder), ["settings.json"]);
});
test("rejects HTML downloads and concurrent runs", async (t) => {
  const { backup } = await fixture(t, async (_path, options) =>
    options.method === "POST"
      ? Response.json({ data: { name } })
      : new Response("<html>Login</html>"),
  );
  const first = backup.run();
  await assert.rejects(backup.run(), /already running/);
  await assert.rejects(first);
  assert.equal(backup.state.lastSuccess, 0);
});
