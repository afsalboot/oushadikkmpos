import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeUsername, validPassword } from "../src/lib/password-policy.js";

const source = (await readFile(new URL("../src/services/staff.service.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace(/export \{normalizePermissions\};/, "").replaceAll("export async function", "async function");
function harness() {
  const created = [];
  const user = { _id: "id", username: "old.user", authVersion: 2, save: async () => {}, markModified: () => {} };
  const role = { _id: "role", name: "Cashier", slug: "cashier" };
  const deps = { bcrypt: { hash: async () => "hashed-password" }, passwordValid: validPassword, normalizeUsername,
    PASSWORD_POLICY_MESSAGE: "Strong password required", ensureDefaultRoles: async () => [role],
    User: { init: async () => {}, create: async (data) => { created.push(data); return { _id: "id" }; }, findOne: async () => user },
    StaffRole: { findOne: async () => role }, AuditLog: { create: async () => {} } };
  const methods = new Function(...Object.keys(deps), `${source}; getStaffDetails = async (id) => id; return {createStaff, updateStaff, resetStaffPassword};`)(...Object.values(deps));
  return { ...methods, user, created };
}
const actor = { sub: "owner", role: "ADMIN" };
const body = { name: "Cashier", username: " New.User ", email: "staff@example.com", roleId: "role", password: "PrivatePassword123", confirmPassword: "PrivatePassword123" };
test("staff creation persists normalized username and hashed strong password", async () => {
  const h = harness();
  await h.createStaff(body, actor);
  assert.equal(h.created[0].username, "new.user");
  assert.equal(h.created[0].passwordHash, "hashed-password");
  assert.equal(h.created[0].password, undefined);
});
test("staff creation rejects missing usernames and weak passwords", async () => {
  await assert.rejects(harness().createStaff({ ...body, username: "" }, actor), /Username/);
  await assert.rejects(harness().createStaff({ ...body, password: "ShortPass1" }, actor), /Strong password/);
});
test("staff username changes invalidate existing sessions", async () => {
  const h = harness();
  await h.updateStaff("id", body, actor);
  assert.equal(h.user.username, "new.user");
  assert.equal(h.user.authVersion, 3);
});
test("staff password reset applies strong policy and invalidates existing credentials", async () => {
  const h = harness();
  await assert.rejects(h.resetStaffPassword("id", { password: "ShortPass1" }, actor), /Strong password/);
  await h.resetStaffPassword("id", body, actor);
  assert.equal(h.user.passwordHash, "hashed-password");
  assert.equal(h.user.authVersion, 3);
  assert.equal(h.user.pinHash, undefined);
});
