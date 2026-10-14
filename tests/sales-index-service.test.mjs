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
const { Product, Category, InventoryBatch } = await import('../src/models/index.js');
const { getSalesIndex, getSalesRevision } = await import('../src/services/sales-index.service.js');

function query(rows) {
  return { select() { return this; }, sort() { return this; }, limit() { return this; }, batchSize() { return this; }, async lean() { return rows; } };
}
test('index excludes hidden/inactive products and includes compact authoritative stock without batch or selling detail payloads', async t => {
  t.mock.method(Product, 'find', filter => {
    assert.deepEqual(filter, { active: true, visibleInSales: { $ne: false } });
    return query([{ _id: 'a', name: 'Name', categoryId: 'c', packageType: 'Jar', baseUnit: 'g', packageSellingPrice: 2, batches: [{ secret: true }] }]);
  });
  t.mock.method(Category, 'find', () => query([{ _id: 'c', name: 'Category' }]));
  t.mock.method(InventoryBatch, 'aggregate', async pipeline => {
    assert.deepEqual(pipeline[0].$match.productId, {$in:['a']});
    assert.deepEqual(pipeline[1].$group.sealedPackages, {$sum:'$sealedPackages'});
    return [{_id:'a',sealedPackages:2,openQuantity:25}];
  });
  const index = await getSalesIndex();
  assert.equal(index.complete, true);
  assert.equal(index.rows[0].categoryName, 'Category');
  assert.equal(index.rows[0].batches, undefined);
  assert.equal(index.rows[0].stock, undefined);
  assert.equal(index.rows[0].stockLabel, '2 Jars + 25 g Open');
});
test('oversized catalogues return an explicit server-search fallback instead of a partial index', async t => {
  t.mock.method(Product, 'find', () => query(Array(10001).fill({ _id: 'a' })));
  t.mock.method(Category, 'find', () => query([]));
  t.mock.method(InventoryBatch, 'aggregate', () => {throw new Error('Oversized index must not query stock');});
  assert.deepEqual(await getSalesIndex(), { rows: [], complete: false, limit: 10000 });
});
test('index revision changes for product, category and inventory edits or deletions', async t => {
  let count = 2099, updatedAt = new Date('2026-10-01'), categoryUpdatedAt = updatedAt, stockUpdatedAt = updatedAt, batchCount = 1590;
  t.mock.method(Product, 'aggregate', async pipeline => {
    assert.equal(pipeline.length, 1);
    return [{ _id: null, count, updatedAt }];
  });
  t.mock.method(Category, 'aggregate', async () => [{ _id: null, count: 2, updatedAt: categoryUpdatedAt }]);
  t.mock.method(InventoryBatch, 'aggregate', async () => [{_id:null,count:batchCount,updatedAt:stockUpdatedAt}]);
  const initial = await getSalesRevision();
  assert.equal(await getSalesRevision(), initial);
  count--; assert.notEqual(await getSalesRevision(), initial);
  count++; updatedAt = new Date('2026-10-02'); assert.notEqual(await getSalesRevision(), initial);
  updatedAt = new Date('2026-10-01'); categoryUpdatedAt = new Date('2026-10-02'); assert.notEqual(await getSalesRevision(), initial);
  categoryUpdatedAt = updatedAt; stockUpdatedAt = new Date('2026-10-02'); assert.notEqual(await getSalesRevision(), initial);
  stockUpdatedAt = updatedAt; batchCount--; assert.notEqual(await getSalesRevision(), initial);
});
test('targeted index query uses bounded requested IDs with the same active/visibility rules', async t => {
  t.mock.method(Product, 'find', filter => {
    assert.deepEqual(filter, { active: true, visibleInSales: { $ne: false }, _id: { $in: ['a'] } });
    return query([{ _id: 'a', name: 'Name' }]);
  });
  t.mock.method(Category, 'find', () => query([]));
  t.mock.method(InventoryBatch, 'aggregate', async pipeline => {
    assert.deepEqual(pipeline[0].$match.productId, {$in:['a']});
    return [];
  });
  assert.equal((await getSalesIndex(undefined, ['a'])).rows[0]._id, 'a');
});

test('stock labels preserve box/package counts and count-based units, including zero stock', async t => {
  t.mock.method(Product,'find',()=>query([
    {_id:'a',name:'Tablets',packageType:'Bottle',stockPackType:'Box',unitsPerStockPack:6,baseUnit:'g',looseUnit:'tablet',loosePricingMethod:'count_based'},
    {_id:'b',name:'Powder',packageType:'Jar',baseUnit:'g'},
  ]));
  t.mock.method(Category,'find',()=>query([]));
  t.mock.method(InventoryBatch,'aggregate',async()=>[{_id:'a',sealedPackages:13,openQuantity:7}]);
  const index=await getSalesIndex();
  assert.equal(index.rows[0].stockLabel,'2 Boxes + 1 Bottle + 7 tablets');
  assert.equal(index.rows[1].stockLabel,'0 Jars');
});
