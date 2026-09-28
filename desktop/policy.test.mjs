import test from "node:test";
import assert from "node:assert/strict";
import { getStartUrl, isTrustedUrl, PRODUCTION_URL } from "./policy.mjs";

test("packaged builds always use the production server", () => {
  assert.equal(getStartUrl(true, ["--local"]), PRODUCTION_URL);
  assert.equal(getStartUrl(false, []), PRODUCTION_URL);
  assert.equal(getStartUrl(false, ["--local"]), "http://localhost:3000");
});
test("navigation accepts application routes and rejects foreign or privileged URLs", () => {
  assert.equal(isTrustedUrl(`${PRODUCTION_URL}/login?next=/sales`, PRODUCTION_URL), true);
  for (const url of ["file:///C:/Windows/test", "javascript:alert(1)", "data:text/html,test",
    "https://oushadikkmpos.vercel.app.evil.test", "https://evil.test", "not a url",
    "https://user:pass@oushadikkmpos.vercel.app", "http://oushadikkmpos.vercel.app"]) {
    assert.equal(isTrustedUrl(url, PRODUCTION_URL), false, url);
  }
  assert.equal(isTrustedUrl("http://localhost:3000/sales", "http://localhost:3000"), true);
  assert.equal(isTrustedUrl("http://localhost:3001", "http://localhost:3000"), false);
});
