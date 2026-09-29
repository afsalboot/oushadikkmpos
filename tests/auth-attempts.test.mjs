import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = (await readFile(new URL("../src/lib/server/auth-attempts.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "");
function evaluate(value, row) {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.startsWith("$")) return row[value.slice(1)];
  if (Array.isArray(value)) return value.map((item) => evaluate(item, row));
  if (!value || typeof value !== "object") return value;
  if (value.$ifNull) { const [a, b] = evaluate(value.$ifNull, row); return a ?? b; }
  if (value.$lte) { const [a, b] = evaluate(value.$lte, row); return a <= b; }
  if (value.$add) return evaluate(value.$add, row).reduce((a, b) => a + b, 0);
  if (value.$cond) return evaluate(value.$cond[evaluate(value.$cond[0], row) ? 1 : 2], row);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, evaluate(item, row)]));
}
test("persistent attempt pipeline increments an active window and resets an expired one", () => {
  const { authAttemptUpdate } = new Function("createHash", "AuthAttempt", `${source}; return {authAttemptUpdate};`)(createHash, {});
  const now = new Date("2026-09-30T12:00:00Z");
  const update = authAttemptUpdate(now, 900000)[0].$set;
  const first = evaluate(update, {});
  assert.equal(first.count, 1);
  assert.equal(first.expiresAt.toISOString(), "2026-09-30T12:15:00.000Z");
  assert.equal(evaluate(update, { count: 4, expiresAt: first.expiresAt }).count, 5);
  assert.equal(evaluate(update, { count: 10, expiresAt: new Date(now - 1) }).count, 1);
});
test("attempt budgets share database state across service instances and simultaneous requests", async () => {
  const rows = new Map();
  const AuthAttempt = { findOneAndUpdate: (filter, update, options) => {
    assert.match(filter._id, /^[a-f0-9]{64}$/);
    assert.equal(options.updatePipeline, true);
    const row = evaluate(update[0].$set, rows.get(filter._id) || {});
    rows.set(filter._id, row);
    return { lean: async () => row };
  } };
  const load = () => new Function("createHash", "AuthAttempt", `${source}; return consumeAuthAttempt;`)(createHash, AuthAttempt);
  const attempts = await Promise.all(Array.from({ length: 10 }, () => load()("account:private-name")));
  assert.equal(attempts.filter((attempt) => attempt.allowed).length, 5);
  assert.equal((await load()("account:private-name")).allowed, false);
  assert.equal(rows.size, 1);
});
test("database throttle errors fail closed", async () => {
  const AuthAttempt = { findOneAndUpdate() { throw new Error("database offline"); } };
  const consume = new Function("createHash", "AuthAttempt", `${source}; return consumeAuthAttempt;`)(createHash, AuthAttempt);
  await assert.rejects(consume("account:test"), /database offline/);
});
