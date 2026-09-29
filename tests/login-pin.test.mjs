import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isLoginPin, PIN_ATTEMPT_LIMIT } from "../src/lib/login-pin.js";
import { User } from "../src/models/index.js";

const source = (await readFile(new URL("../src/app/api/auth/pin-login/route.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace("export async function POST", "async function POST");
function harness({ user = { _id: "user", pinHash: "hash", authVersion: 0 }, matches = true, changed = false, allowed = true } = {}) {
  const calls = [], audits = [], cookies = [];
  let compares = 0;
  const deps = {
    bcrypt: { compare: async () => { compares++; return matches; } }, connectDb: async () => {},
    createToken: async () => "token", sessionCookie: (token) => token,
    apiError: (error) => { throw error; }, fail: (error, status) => ({ error, status }),
    ok: (data) => ({ data, status: 200, cookies: { set: (value) => cookies.push(value) } }),
    consumeRateLimit: () => ({ allowed }), requestClientKey: () => "test", isLoginPin, PIN_ATTEMPT_LIMIT,
    AuditLog: { create: async (entry) => audits.push(entry) },
    User: { findOneAndUpdate: (filter, update) => {
      calls.push({ filter, update });
      const result = calls.length === 1 ? user : changed ? null : user;
      return { select() { return this; }, populate: async () => result };
    } },
  };
  const POST = new Function(...Object.keys(deps), `${source}; return POST;`)(...Object.values(deps));
  return { login: (pin = "0123") => POST({ json: async () => ({ email: " USER@EXAMPLE.COM ", pin }) }), calls, audits, cookies, compares: () => compares };
}

test("PIN validation preserves leading zeros and rejects non-four-digit values", () => {
  for (const value of ["0123", "0000", "9876"]) assert.equal(isLoginPin(value), true);
  for (const value of [1234, "123", "12345", "12a4", " 1234", "１２３４", null]) assert.equal(isLoginPin(value), false);
});
test("PIN login reserves a bounded attempt and signs in using the existing session", async () => {
  const h = harness();
  assert.equal((await h.login()).status, 200);
  assert.equal(h.calls[0].filter.email, "user@example.com");
  assert.equal(h.calls[0].filter.active, true);
  assert.deepEqual(h.calls[0].filter.mustChangePassword, { $ne: true });
  assert.equal(h.calls[0].filter.$or[0].pinAttempts.$lt, 5);
  assert.equal(h.calls[0].update.$inc.pinAttempts, 1);
  assert.equal(h.calls[1].update.$set.pinAttempts, 0);
  assert.equal(h.calls[1].filter.pinHash, "hash");
  assert.equal(h.cookies.length, 1);
});
test("incorrect PIN retains its attempt and creates no session", async () => {
  const h = harness({ matches: false });
  assert.equal((await h.login()).status, 401);
  assert.equal(h.calls.length, 1);
  assert.equal(h.cookies.length, 0);
  assert.equal(h.audits[0].action, "LOGIN_FAILED");
});
test("locked, disabled, missing PIN or password-change accounts cannot sign in", async () => {
  const h = harness({ user: null });
  assert.equal((await h.login()).status, 401);
  assert.equal(h.compares(), 0);
  assert.equal(h.cookies.length, 0);
});
test("concurrent account changes prevent PIN session issuance", async () => {
  const h = harness({ changed: true });
  assert.equal((await h.login()).status, 401);
  assert.equal(h.cookies.length, 0);
});
test("rate limits and malformed PINs stop before querying the account", async () => {
  const limited = harness({ allowed: false });
  assert.equal((await limited.login()).status, 429);
  assert.equal(limited.calls.length, 0);
  const malformed = harness();
  assert.equal((await malformed.login("12345")).status, 400);
  assert.equal(malformed.calls.length, 0);
});

const setupSource = (await readFile(new URL("../src/app/api/auth/pin/route.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace("export async function POST", "async function POST");
function setupHarness({ authenticated = true, passwordMatches = true } = {}) {
  const updates = [], cookies = [];
  const deps = {
    bcrypt: { compare: async () => passwordMatches, hash: async () => "hashed-pin" },
    requireSession: async () => { if (!authenticated) throw new Error("UNAUTHORIZED"); return { sub: "owner" }; },
    createToken: async () => "token", sessionCookie: (token) => token,
    apiError: (error) => ({ status: error.message === "UNAUTHORIZED" ? 401 : 500 }),
    fail: (error, status) => ({ error, status }),
    ok: (data) => ({ data, status: 200, cookies: { set: (value) => cookies.push(value) } }),
    consumeRateLimit: () => ({ allowed: true }), isLoginPin,
    AuditLog: { create: async () => {} },
    User: { findById: async () => ({ _id: "owner", passwordHash: "password-hash", authVersion: 2 }),
      findOneAndUpdate: async (filter, update) => { updates.push({ filter, update }); return { _id: "owner" }; } },
  };
  const POST = new Function(...Object.keys(deps), `${setupSource}; return POST;`)(...Object.values(deps));
  return { save: (body = { pin: "0123", confirmPin: "0123", currentPassword: "password" }) => POST({ json: async () => body }), updates, cookies };
}
test("PIN setup requires a session and the current password", async () => {
  for (const options of [{ authenticated: false }, { passwordMatches: false }]) {
    const h = setupHarness(options);
    assert.notEqual((await h.save()).status, 200);
    assert.equal(h.updates.length, 0);
    assert.equal(h.cookies.length, 0);
  }
});
test("PIN setup stores only a hash for the signed-in account and revokes old sessions", async () => {
  const h = setupHarness();
  assert.equal((await h.save()).status, 200);
  assert.equal(h.updates[0].filter._id, "owner");
  assert.equal(h.updates[0].update.$set.pinHash, "hashed-pin");
  assert.equal(h.updates[0].update.$inc.authVersion, 1);
  assert.equal(h.cookies.length, 1);
});
test("PIN removal unsets the credential and mismatched PINs do not write", async () => {
  const h = setupHarness();
  assert.equal((await h.save({ remove: true, currentPassword: "password" })).status, 200);
  assert.equal(h.updates[0].update.$unset.pinHash, 1);
  const mismatch = setupHarness();
  assert.equal((await mismatch.save({ pin: "0123", confirmPin: "1234" })).status, 400);
  assert.equal(mismatch.updates.length, 0);
});
test("PIN hashes are excluded by default and removal persists even when unselected", () => {
  assert.equal(User.schema.path("pinHash").options.select, false);
  const user = User.hydrate({ _id: "507f1f77bcf86cd799439011", passwordHash: "hash" }, { pinHash: 0, pinAttempts: 0 });
  user.pinHash = undefined;
  user.markModified("pinHash");
  user.pinAttempts = 0;
  assert.equal(user.getChanges().$unset.pinHash, 1);
  assert.equal(user.getChanges().$set.pinAttempts, 0);
});
