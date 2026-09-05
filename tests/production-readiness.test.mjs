import test from "node:test";
import assert from "node:assert/strict";
import { createConnectionManager } from "../src/lib/db-connection.js";
import { bootstrapAllowed } from "../src/lib/bootstrap.js";
import { readBackupSnapshot } from "../src/lib/backup-snapshot.js";
import { validateProductionEnv } from "../src/lib/production-env.mjs";

test("failed database connection can retry and concurrent callers share a connection", async () => {
  const previous = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://test.invalid/test";
  try {
    let calls = 0;
    const connection = {};
    const connect = createConnectionManager({ connect: async () => {
      calls++;
      if (calls === 1) throw new Error("temporary failure");
      return connection;
    } }, {});
    await assert.rejects(Promise.all([connect(), connect()]), /temporary failure/);
    assert.equal(calls, 1);
    assert.deepEqual(await Promise.all([connect(), connect()]), [connection, connection]);
    assert.equal(calls, 2);
    assert.equal(await connect(), connection);
    assert.equal(calls, 2);
  } finally {
    if (previous === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previous;
  }
});

test("production first-owner setup is closed without the deployment token", () => {
  assert.equal(bootstrapAllowed(undefined, { NODE_ENV: "production" }), false);
  const env = { NODE_ENV: "production", BOOTSTRAP_TOKEN: "private-setup-token" };
  assert.equal(bootstrapAllowed("incorrect", env), false);
  assert.equal(bootstrapAllowed({}, env), false);
  assert.equal(bootstrapAllowed(env.BOOTSTRAP_TOKEN, env), true);
  assert.equal(bootstrapAllowed(undefined, { NODE_ENV: "development" }), true);
});

test("backup collections share a snapshot transaction and read sequentially", async () => {
  let reading = false;
  const session = { withTransaction: async (callback, options) => {
    assert.equal(options.readConcern.level, "snapshot");
    await callback();
  } };
  const model = (id) => ({ find: () => ({ session: (actual) => {
    assert.equal(actual, session);
    return { lean: async () => {
      assert.equal(reading, false);
      reading = true;
      await new Promise((resolve) => setImmediate(resolve));
      reading = false;
      return [{ id }];
    } };
  } }) });
  assert.deepEqual(await readBackupSnapshot({ sales: model(1), stock: model(2) }, session), { sales: [{ id: 1 }], stock: [{ id: 2 }] });
});

test("production configuration rejects missing or reused secrets without exposing values", () => {
  assert.equal(validateProductionEnv({}).length, 4);
  const env = { MONGODB_URI: "mongodb://host/db", JWT_SECRET: "a".repeat(32), BACKUP_ENCRYPTION_KEY: "b".repeat(32), BACKUP_DIR: "/data/backups" };
  assert.deepEqual(validateProductionEnv(env), []);
  assert.match(validateProductionEnv({ ...env, BACKUP_ENCRYPTION_KEY: env.JWT_SECRET }).join(), /separate/);
  assert.equal(validateProductionEnv({ JWT_SECRET: "private" }).join().includes("private"), false);
});
