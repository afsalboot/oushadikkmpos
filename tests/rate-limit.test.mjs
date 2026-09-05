import test from "node:test";
import assert from "node:assert/strict";
import { clearRateLimits, consumeRateLimit, requestClientKey } from "../src/lib/rate-limit.js";

test("client headers cannot bypass limits unless proxy trust is explicitly enabled", () => {
  const previous = process.env.TRUST_PROXY_HEADERS;
  try {
    delete process.env.TRUST_PROXY_HEADERS;
    const request = new Request("https://example.test", { headers: { "x-forwarded-for": "spoofed" } });
    assert.equal(requestClientKey(request), "shared");
    process.env.TRUST_PROXY_HEADERS = "true";
    assert.equal(requestClientKey(request), "spoofed");
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previous;
  }
});

test("rate limiter bounds memory without evicting active limits", () => {
  clearRateLimits();
  const options = { limit: 1, windowMs: 1000 };
  for (let i = 0; i < 10000; i++) assert.equal(consumeRateLimit(`key:${i}`, options, 0).allowed, true);
  assert.equal(consumeRateLimit("overflow", options, 1).allowed, false);
  assert.equal(consumeRateLimit("key:0", options, 1).allowed, false);
  assert.equal(consumeRateLimit("overflow", options, 1000).allowed, true);
  clearRateLimits();
});

test("rate limiter blocks attempts beyond the configured window limit", () => {
  clearRateLimits();
  const options = { limit: 2, windowMs: 60_000 };
  assert.equal(consumeRateLimit("login:test", options, 1_000).allowed, true);
  assert.equal(consumeRateLimit("login:test", options, 1_001).allowed, true);
  const blocked = consumeRateLimit("login:test", options, 1_002);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 60);
});

test("rate limiter opens a fresh bucket after the window expires", () => {
  clearRateLimits();
  const options = { limit: 1, windowMs: 1_000 };
  consumeRateLimit("bootstrap:test", options, 2_000);
  assert.equal(consumeRateLimit("bootstrap:test", options, 2_500).allowed, false);
  assert.equal(consumeRateLimit("bootstrap:test", options, 3_000).allowed, true);
});
