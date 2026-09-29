import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("public user enumeration is disabled", async () => {
  const source = (await readFile(new URL("../src/app/api/auth/users/route.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace("export async function GET", "async function GET");
  const GET = new Function("fail", `${source}; return GET;`)((error, status) => ({ error, status }));
  const result = await GET();
  assert.equal(result.status, 410);
  assert.equal(result.users, undefined);
});
test("legacy login URL only delegates to username authentication", async () => {
  const source = await readFile(new URL("../src/app/api/auth/login/route.js", import.meta.url), "utf8");
  assert.equal(source.trim(), 'export { POST } from "../username-login/route";');
});
