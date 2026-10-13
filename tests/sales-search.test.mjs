import test from 'node:test';
import assert from 'node:assert/strict';
import { salesIndexRow, searchSalesIndex, buildBarcodeMap, normalizeSalesSearch } from '../src/lib/sales-search.js';

const rows = Array.from({ length: 2099 }, (_, index) => salesIndexRow({
  _id: String(index), name: `Product ${String(index).padStart(4, '0')}`, sku: `SKU-${index}`, barcode: `0000${index}`,
  manufacturer: 'Example Brand', categoryId: index % 2 ? 'herb' : 'oil', allowLooseSale: index % 3 === 0,
  allowMixture: index % 5 === 0, packageSellingPrice: 10, batches: [{ secret: true }], description: 'large',
}, index % 2 ? 'Herbal Powders' : 'Oils'));

test('lightweight rows omit inventory/history/tax and normalize once without changing names', () => {
  assert.equal(rows[0].name, 'Product 0000');
  assert.equal(rows[0].batches, undefined);
  assert.equal(rows[0].description, undefined);
  assert.equal(rows[0].stock, undefined);
  assert.equal(normalizeSalesSearch('  AB  C '), 'ab c');
  assert.equal(searchSalesIndex(rows, { search: '0000 sku-0' }).pagination.total, 0, 'matches must not span separate fields');
});
test('local search reaches first/middle/last products, preserves case/spacing, SKU/barcode/brand/category matching', () => {
  for (const index of [0, 1000, 2098]) assert.equal(searchSalesIndex(rows, { search: `PrOdUcT  ${String(index).padStart(4, '0')}` }).rows[0]._id, String(index));
  assert.equal(searchSalesIndex(rows, { search: 'sku-2098' }).rows[0]._id, '2098');
  assert.equal(searchSalesIndex(rows, { search: '00002098' }).rows[0]._id, '2098');
  assert.equal(searchSalesIndex(rows, { search: 'Example Brand' }).pagination.total, 2099);
  assert.equal(searchSalesIndex(rows, { search: 'herbal powders' }).pagination.total, 1049);
  assert.equal(searchSalesIndex(rows, { search: '[missing].*' }).pagination.total, 0);
});
test('category, mixture, loose filters and pagination stay bounded', () => {
  assert.equal(searchSalesIndex(rows, { filter: 'Herbal Powders' }).pagination.total, 1049);
  assert.equal(searchSalesIndex(rows, { filter: 'Loose Sale' }).pagination.total, 700);
  assert.equal(searchSalesIndex(rows, { mode: 'MIX', filter: 'Oils' }).pagination.total, 420);
  assert.equal(searchSalesIndex(rows, { page: 42 }).rows.length, 49);
  assert.equal(searchSalesIndex(rows, { page: 100 }).pagination.page, 42);
});
test('barcode map uses exact equality, preserves leading zeros and rejects fuzzy matches', () => {
  const map = buildBarcodeMap(rows);
  assert.equal(map.get('00001000')._id, '1000');
  assert.equal(map.get('1000'), undefined);
  assert.equal(map.get('0000100X'), undefined);
});
test('exact barcode and SKU precede prefix, contained name and category matches while preserving ties', () => {
  const ranked = [
    salesIndexRow({ _id: 'category', name: 'Other' }, '123'),
    salesIndexRow({ _id: 'contained', name: 'Herb 123' }),
    salesIndexRow({ _id: 'prefix', name: '123 Herb' }),
    salesIndexRow({ _id: 'sku', name: 'Other', sku: '123' }),
    salesIndexRow({ _id: 'barcode', name: 'Other', barcode: '123' }),
  ];
  assert.deepEqual(searchSalesIndex(ranked, { search: '123' }).rows.map(row => row._id), ['barcode', 'sku', 'prefix', 'contained', 'category']);
});
test('stock filter membership intersects local search without changing mixture behavior', () => {
  const stockIds = new Set(['0', '1000', '2098']);
  assert.deepEqual(searchSalesIndex(rows, { filter: 'Low Stock', stockIds }).rows.map(row => row._id), ['0', '1000', '2098']);
  assert.equal(searchSalesIndex(rows, { filter: 'Opened Stock', stockIds, search: 'SKU-2098' }).rows[0]._id, '2098');
  assert.equal(searchSalesIndex(rows, { filter: 'Opened Stock', stockIds, search: 'SKU-99' }).rows.length, 0);
  assert.equal(searchSalesIndex(rows, { mode: 'MIX', stockIds }).pagination.total, 420);
});
