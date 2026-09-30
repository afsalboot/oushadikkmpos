import test from "node:test";
import assert from "node:assert/strict";
import { importProductsWithProgress } from "../src/lib/product-import-progress.js";

test("progress reflects completed batches and reports original sheet row numbers", async () => {
  const rows = Array.from({ length: 23 }, (_, index) => ({ name: `Product ${index}` }));
  const progress = [];
  const result = await importProductsWithProgress(rows, async batch => ({
    imported: batch.length - 1, skipped: 0, failed: 1,
    results: batch.map((row, index) => ({ row: index + 2, name: row.name, status: index ? "IMPORTED" : "ERROR", errors: index ? [] : ["Invalid product"] })),
  }), value => progress.push(value));
  assert.deepEqual(progress.map(value => value.percent), [0, 43, 86, 100]);
  assert.deepEqual(progress.map(value => value.completed), [0, 10, 20, 23]);
  assert.equal(result.imported, 20);
  assert.equal(result.failed, 3);
  assert.deepEqual(result.results.filter(row => row.status === "ERROR").map(row => row.row), [2, 12, 22]);
});

test("interrupted imports preserve successes and never show false completion or retry", async () => {
  let calls = 0;
  const progress = [];
  const result = await importProductsWithProgress(Array.from({ length: 25 }, () => ({ name: "Product" })), async batch => {
    if (++calls === 2) throw new Error("Connection lost");
    return { imported: batch.length, failed: 0, skipped: 0, results: batch.map((row, index) => ({ row: index + 2, name: row.name, status: "IMPORTED" })) };
  }, value => progress.push(value));
  assert.equal(calls, 2);
  assert.equal(result.interrupted, true);
  assert.equal(result.imported, 10);
  assert.equal(progress.at(-1).percent, 40);
  assert.equal(result.results.filter(row => row.status === "UNCONFIRMED").length, 10);
  assert.equal(result.results.filter(row => row.status === "NOT_ATTEMPTED").length, 5);
  assert.equal(result.results.at(-1).row, 26);
});
