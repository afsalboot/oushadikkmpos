import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { creditSaleStock, saleStockReturns, saleEditCart, saleEditProblem } from '../src/lib/sale-edit.js';
import { inventoryTracked, isExternalPurchase } from '../src/lib/external-purchase.js';
import { productStockFilterPipeline } from '../src/lib/product-stock-query.js';
const source = readFileSync(new URL('../src/services/sale-edit-read.service.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const productId = '6acf7732f9711956440254da';
const ingredientId = '6acf7732f9711956440254dc';
const sale = { _id: 'sale', paymentStatus: 'PAID', items: [{ kind: 'PRODUCT', productId, saleMode: 'PACKAGE', quantity: 2, unitPrice: 100 }],
  stockAllocations: [{ productId, batchId: 'batch', sealedPackages: 2, openQuantity: 3 }] };
function harness(bill = sale) {
  const calls = [], products = [{ _id: productId, name: 'Oil', active: true, packageSize: 100, packageSellingPrice: 120,
    stock: { sealedPackages: 1, openQuantity: 0, totalBaseQuantity: 100 } }];
  const query = value => ({ select() { return this; }, lean: async () => value });
  const deps = { mongoose, creditSaleStock, saleStockReturns, inventoryTracked, isExternalPurchase, productStockFilterPipeline,
    Category: { find: () => query([{ _id: 'category' }]) }, Customer: { findById: () => query({ name: 'Customer' }) },
    Product: { countDocuments: async filter => { calls.push({ count: filter }); return 111; }, aggregate: async () => [] },
    StockTransaction: { find: () => { calls.push({ ledger: true }); return query([{ productId, batchId: 'batch', direction: 'OUT', type: 'PACKAGE_SALE', packageQuantity: -2 }]); } },
    getProducts: async (filter, options) => { calls.push({ filter, options }); return products; } };
  const service = new Function(...Object.keys(deps), source + ';return {getSaleEditData,getSaleEditProductPage,billedProductIds};')(...Object.values(deps));
  return { ...service, bill, products, calls };
}
test('initial edit reads only billed IDs, reuses allocations and preserves original cart price', async () => {
  const h = harness(); const data = await h.getSaleEditData(sale);
  assert.deepEqual(h.calls[0].filter, { active: true, _id: { $in: [productId] } });
  assert.equal(h.calls[0].options.salesOnly, true);
  assert.equal(h.calls.some(call => call.ledger), false);
  assert.equal(data.products[0].stock.sealedPackages, 3);
  assert.equal(data.products[0].stock.openQuantity, 3);
  assert.equal(h.products[0].stock.sealedPackages, 1);
  assert.equal(saleEditCart(sale, data.products)[0].packageSellingPrice, 100);
});
test('mixtures load all unique ingredients and external-only sales skip stock history', async () => {
  const h = harness();
  assert.deepEqual(h.billedProductIds({ items: [...sale.items, { kind: 'MIX', ingredients: [{ productId }, { productId: ingredientId }] },
    { itemSource: 'external_purchase', inventoryTracked: false }] }), [productId, ingredientId]);
  await h.getSaleEditData({ items: [{ itemSource: 'external_purchase' }] });
  assert.deepEqual(h.calls[0].filter._id.$in, []);
  assert.equal(h.calls.some(call => call.ledger), false);
});
test('legacy bills fall back to stock transactions and customer selection remains available', async () => {
  const h = harness(); const data = await h.getSaleEditData({ ...sale, stockAllocations: [], customerId: 'customer' });
  assert.equal(h.calls.filter(call => call.ledger).length, 1);
  assert.equal(data.products[0].stock.sealedPackages, 3);
  assert.equal(data.customer.name, 'Customer');
});
test('browse pages stay bounded, include hidden billed products and credit stock on every page', async () => {
  const h = harness(); const result = await h.getSaleEditProductPage(sale, new URLSearchParams('page=2&limit=99999'));
  const { filter, options } = h.calls.find(call => call.filter);
  assert.deepEqual(filter.$or, [{ visibleInSales: { $ne: false } }, { _id: { $in: [productId] } }]);
  assert.equal(options.page, 2); assert.equal(options.limit, 50); assert.equal(options.salesOnly, true);
  assert.deepEqual(result.pagination, { page: 2, limit: 50, total: 111, pages: 3 });
  assert.equal(result.rows[0].stock.sealedPackages, 3);
});
test('browse search escapes regex, retains visibility conditions, and applies mix/category filters', async () => {
  const h = harness(); await h.getSaleEditProductPage(sale, new URLSearchParams('search=a%2B&mode=mix&category=' + ingredientId));
  const { filter } = h.calls.find(call => call.filter);
  assert.equal(filter.$or.length, 2); assert.equal(filter.$and[0].$or[0].name.$regex, 'a\\+');
  assert.equal(filter.$and[0].$or.at(-1).categoryId.$in[0], 'category');
  assert.equal(filter.allowMixture, true); assert.equal(String(filter.categoryId), ingredientId);
  await assert.rejects(h.getSaleEditProductPage(sale, new URLSearchParams('category=invalid')), { status: 422 });
  await assert.rejects(h.getSaleEditProductPage(sale, new URLSearchParams({ search: 'a'.repeat(101) })), { status: 422 });
});
test('opened filter includes stock returned from this bill', async () => {
  const h = harness(); await h.getSaleEditProductPage(sale, new URLSearchParams('stock=opened'));
  assert.deepEqual(h.calls.find(call => call.filter).filter._id.$in, [productId]);
});
const routeSource = readFileSync(new URL('../src/app/api/sales/[id]/route.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
test('both edit views require admin and reject locked bills before product reads', async () => {
  for (const view of ['', '&view=products']) {
    for (const locked of [false, true]) {
      let reads = 0;
      const deps = { mongoose, requireSession: async permission => {
        if (permission === 'ADMIN' && !locked) throw Object.assign(new Error('Forbidden'), { status: 403 });
        return { role: 'ADMIN' };
      }, connectDb: async () => {}, Sale: { findById: () => ({ populate() { return this; }, lean: async () => ({ ...sale, paymentStatus: 'CREDIT' }) }) },
      saleEditProblem, requestTiming: () => ({ measure: (_name, work) => work(), finish: response => response }),
      getSaleEditData: async () => { reads++; }, getSaleEditProductPage: async () => { reads++; },
      fail: (error, status) => ({ error, status }), apiError: error => ({ status: error.status }), ok: data => ({ data }) };
      const GET = new Function(...Object.keys(deps), routeSource + ';return GET;')(...Object.values(deps));
      const result = await GET({ url: 'http://localhost/api/sales/' + productId + '?edit=true' + view }, { params: { id: productId } });
      assert.equal(result.status, locked ? 422 : 403); assert.equal(reads, 0);
    }
  }
});
