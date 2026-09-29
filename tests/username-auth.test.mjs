import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeUsername, validPassword } from "../src/lib/password-policy.js";

const source = (await readFile(new URL("../src/services/username-auth.service.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace("export async function authenticateUsername", "async function authenticateUsername");
function harness({ user = { _id: "id", active: true, passwordHash: "hash", username: "cashier", authVersion: 2 }, matched = true, allowed = true, changed = false } = {}) {
  const queries = [], writes = [], keys = [], compared = [];
  const deps = {
    bcrypt: { hash: async () => "new-hash", compare: async (...args) => { compared.push(args); return matched; } },
    User: { findOne: async (query) => { queries.push(query); return user; }, init: async () => {},
      findOneAndUpdate: (filter, update) => { writes.push({ filter, update }); return { populate: async () => changed ? null : { ...user, ...update.$set } }; } },
    AuditLog: { create: async () => {} },
    consumeAuthAttempt: async (key) => { keys.push(key); return { allowed }; },
    normalizeUsername, validPassword, PASSWORD_POLICY_MESSAGE: "Strong password required",
  };
  const authenticate = new Function(...Object.keys(deps), `${source}; return authenticateUsername;`)(...Object.values(deps));
  return { run: (body = { username: " Cashier ", password: "LongPrivatePass123" }) => authenticate(body, "client"), queries, writes, keys, compared };
}
test("username format rejects email, object injection and invalid names", () => {
  assert.equal(normalizeUsername(" Shop.Owner "), "shop.owner");
  for (const value of ["a", "name@example.com", "bad name", "a".repeat(33), { $ne: null }, null]) assert.equal(normalizeUsername(value), null);
});
test("password policy enforces length, character rules and bcrypt byte limit", () => {
  assert.equal(validPassword("PrivatePassphrase123"), true);
  for (const value of ["ShortP1", "a".repeat(20), "A".repeat(20), "PrivatePassphrase", "A1" + "é".repeat(36)]) assert.equal(validPassword(value), false);
});
test("username login reserves persistent IP and account attempts then updates conditionally", async () => {
  const h = harness();
  await h.run();
  assert.deepEqual(h.queries, [{ username: "cashier" }]);
  assert.deepEqual(h.keys, ["username-ip:client", "username-account:id"]);
  assert.equal(h.writes[0].filter.passwordHash, "hash");
  assert.equal(h.writes[0].filter.authVersion, 2);
  assert.equal(h.writes[0].filter.active, true);
  assert.equal(h.writes[0].update.$set.pinAttempts, 0);
});
test("missing, inactive, wrong-password and concurrently changed accounts cannot sign in", async () => {
  for (const options of [{ user: null }, { user: { active: false, passwordHash: "hash" } }, { matched: false }, { changed: true }]) {
    const h = harness(options);
    await assert.rejects(h.run(), /Invalid credentials/);
    assert.equal(h.compared.length, 1);
  }
});
test("persistent throttling stops login before credential verification", async () => {
  const h = harness({ allowed: false });
  await assert.rejects(h.run(), (error) => error.status === 429);
  assert.equal(h.compared.length, 0);
});
test("legacy enrollment verifies old credentials and requires a new strong password", async () => {
  const h = harness({ user: { _id: "legacy", active: true, passwordHash: "old-hash", authVersion: 0 } });
  const body = { setupUsername: true, username: "new.user", email: " OLD@EXAMPLE.COM ", password: "old", newPassword: "NewPrivatePass123", confirmPassword: "NewPrivatePass123" };
  const result = await h.run(body);
  assert.deepEqual(h.queries[0], { email: "old@example.com" });
  assert.deepEqual(h.compared[0], ["old", "old-hash"]);
  assert.equal(result.username, "new.user");
  assert.deepEqual(h.writes[0].filter.username, { $exists: false });
  assert.equal(h.writes[0].update.$set.passwordHash, "new-hash");
  assert.equal(h.writes[0].update.$inc.authVersion, 1);
  assert.equal(h.writes[0].update.$unset.pinHash, 1);
});
test("email cannot sign in normally or reclaim an enrolled username", async () => {
  await assert.rejects(harness().run({ email: "old@example.com", password: "pass" }), /Invalid credentials/);
  await assert.rejects(harness().run({ setupUsername: true, username: "new.user", email: "old@example.com", password: "pass" }), /Invalid credentials/);
});
test("weak enrollment passwords are rejected and weak existing passwords require change", async () => {
  const legacy = harness({ user: { _id: "legacy", active: true, passwordHash: "hash" } });
  await assert.rejects(legacy.run({ setupUsername: true, username: "new.user", email: "old@example.com", password: "old", newPassword: "short", confirmPassword: "short" }), /Strong password/);
  assert.equal(legacy.writes.length, 0);
  const h = harness();
  assert.equal((await h.run({ username: "cashier", password: "old" })).mustChangePassword, true);
});
