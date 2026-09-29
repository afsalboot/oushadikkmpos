import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeUsername } from "../src/lib/password-policy.js";
import { isLoginPin, PIN_ATTEMPT_LIMIT } from "../src/lib/login-pin.js";
const load = async (path) => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace("export async function POST", "async function POST");
const loginSource = await load("../src/app/api/auth/pin-login/route.js");
const setupSource = await load("../src/app/api/auth/pin/route.js");
function harness({ setup = false, user = { _id: "id", username: "cashier", active: true, pinHash: "pin-hash", passwordHash: "password-hash", authVersion: 1 }, matched = true, allowed = true, changed = false, authenticated = true } = {}) {
  const calls = [], cookies = [], audits = [];
  const deps = {
    bcrypt: { compare: async () => matched, hash: async () => "new-pin-hash" },
    connectDb: async () => {}, createToken: async () => "token", sessionCookie: (token) => token,
    requireSession: async () => { if (!authenticated) throw new Error("UNAUTHORIZED"); return { sub: "id" }; },
    apiError: (error) => ({ status: error.message === "UNAUTHORIZED" ? 401 : 500 }),
    fail: (error, status) => ({ error, status }),
    ok: (data) => ({ data, status: 200, cookies: { set: (value) => cookies.push(value) } }),
    requestClientKey: () => "client", consumeAuthAttempt: async () => ({ allowed }),
    normalizeUsername, isLoginPin, PIN_ATTEMPT_LIMIT,
    AuditLog: { create: async (data) => audits.push(data) },
    User: { findById: async () => user, findOneAndUpdate: (filter, update) => {
      calls.push({ filter, update });
      const result = changed && (setup || calls.length > 1) ? null : user;
      return { select: async () => result, populate: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    } },
  };
  const POST = new Function(...Object.keys(deps), `${setup ? setupSource : loginSource}; return POST;`)(...Object.values(deps));
  return { run: (body = { username: " Cashier ", pin: "0123", confirmPin: "0123", currentPassword: "password" }) => POST({ json: async () => body }), calls, cookies, audits };
}
test("PIN validation accepts leading zeroes and rejects malformed credentials", () => {
  assert.equal(isLoginPin("0123"), true);
  for (const value of [1234, "123", "12345", "12a4", null]) assert.equal(isLoginPin(value), false);
});
test("username PIN login reserves a persistent bounded attempt and issues the normal session", async () => {
  const h = harness();
  assert.equal((await h.run()).status, 200);
  assert.equal(h.calls[0].filter.username, "cashier");
  assert.equal(h.calls[0].filter.active, true);
  assert.deepEqual(h.calls[0].filter.mustChangePassword, { $ne: true });
  assert.equal(h.calls[0].filter.$or[0].pinAttempts.$lt, 5);
  assert.equal(h.calls[0].update.$inc.pinAttempts, 1);
  assert.equal(h.calls[1].filter.pinHash, "pin-hash");
  assert.equal(h.calls[1].update.$set.pinAttempts, 0);
  assert.equal(h.cookies.length, 1);
});
test("email and user ID cannot replace username in PIN login", async () => {
  for (const body of [{ email: "staff@example.com", pin: "0123" }, { userId: "id", pin: "0123" }]) {
    const h = harness();
    assert.equal((await h.run(body)).status, 400);
    assert.equal(h.calls.length, 0);
  }
});
test("wrong PIN, locked or unavailable accounts and account changes cannot issue sessions", async () => {
  for (const options of [{ matched: false }, { user: null }, { changed: true }]) {
    const h = harness(options);
    assert.equal((await h.run()).status, 401);
    assert.equal(h.cookies.length, 0);
  }
});
test("persistent IP throttling blocks PIN attempts before the user update", async () => {
  const h = harness({ allowed: false });
  assert.equal((await h.run()).status, 429);
  assert.equal(h.calls.length, 0);
});
test("PIN setup requires authentication, current password and an existing username", async () => {
  for (const options of [{ authenticated: false }, { matched: false }, { user: { _id: "id" } }]) {
    const h = harness({ setup: true, ...options });
    assert.notEqual((await h.run()).status, 200);
    assert.equal(h.calls.length, 0);
  }
});
test("PIN setup hashes the PIN and invalidates old sessions", async () => {
  const h = harness({ setup: true });
  assert.equal((await h.run()).status, 200);
  assert.equal(h.calls[0].filter._id, "id");
  assert.equal(h.calls[0].filter.passwordHash, "password-hash");
  assert.equal(h.calls[0].update.$set.pinHash, "new-pin-hash");
  assert.equal(h.calls[0].update.$inc.authVersion, 1);
});
test("PIN removal clears the hash and concurrent password resets block setup", async () => {
  const h = harness({ setup: true });
  assert.equal((await h.run({ remove: true, currentPassword: "password" })).status, 200);
  assert.equal(h.calls[0].update.$unset.pinHash, 1);
  const changed = harness({ setup: true, changed: true });
  assert.equal((await changed.run()).status, 409);
  assert.equal(changed.cookies.length, 0);
});
