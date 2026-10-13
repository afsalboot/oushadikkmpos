import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@/models') return next(pathToFileURL(path.resolve('src/models/index.js')).href, context);
  if (specifier.startsWith('@/')) return next(pathToFileURL(path.resolve('src', specifier.slice(2) + '.js')).href, context);
  return next(specifier, context);
} });
const { Product, Category } = await import('../src/models/index.js');
const { getSalesIndex, getSalesRevision } = await import('../src/services/sales-index.service.js');

function query(rows) {
  return { select() { return this; }, sort() { return this; }, limit() { return this; }, batchSize() { return this; }, async lean() { return rows; } };
}
test('index excludes hidden/inactive products, returns only metadata and never reads InventoryBatch', async t => {
  t.mock.method(Product, 'find', filter => {
    assert.deepEqual(filter, { active: true, visibleInSales: { $ne: false } });
    return query([{ _id: 'a', name: 'Name', categoryId: 'c', packageSellingPrice: 2, batches: [{ secret: true }] }]);
  });
  t.mock.method(Category, 'find', () => query([{ _id: 'c', name: 'Category' }]));
  const index = await getSalesIndex();
  assert.equal(index.complete, true);
  assert.equal(index.rows[0].categoryName, 'Category');
  assert.equal(index.rows[0].batches, undefined);
});
test('oversized catalogues return an explicit server-search fallback instead of a partial index', async t => {
  t.mock.method(Product, 'find', () => query(Array(10001).fill({ _id: 'a' })));
  t.mock.method(Category, 'find', () => query([]));
  assert.deepEqual(await getSalesIndex(), { rows: [], complete: false, limit: 10000 });
});
test('metadata revision changes for edits, deletes and category edits without loading inventory', async t => {
  let count = 2099, updatedAt = new Date('2026-10-01'), categoryUpdatedAt = updatedAt;
  t.mock.method(Product, 'aggregate', async pipeline => {
    assert.equal(pipeline.length, 1);
    return [{ _id: null, count, updatedAt }];
  });
  t.mock.method(Category, 'aggregate', async () => [{ _id: null, count: 2, updatedAt: categoryUpdatedAt }]);
  const initial = await getSalesRevision();
  assert.equal(await getSalesRevision(), initial);
  count--; assert.notEqual(await getSalesRevision(), initial);
  count++; updatedAt = new Date('2026-10-02'); assert.notEqual(await getSalesRevision(), initial);
  updatedAt = new Date('2026-10-01'); categoryUpdatedAt = new Date('2026-10-02'); assert.notEqual(await getSalesRevision(), initial);
});
test('targeted index query uses bounded requested IDs with the same active/visibility rules', async t => {
  t.mock.method(Product, 'find', filter => {
    assert.deepEqual(filter, { active: true, visibleInSales: { $ne: false }, _id: { $in: ['a'] } });
    return query([{ _id: 'a', name: 'Name' }]);
  });
  t.mock.method(Category, 'find', () => query([]));
  assert.equal((await getSalesIndex(undefined, ['a'])).rows[0]._id, 'a');
});
