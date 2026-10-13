// Uses in-memory MongoDB $documents fixtures and read-only live comparisons.
// No collections, indexes, or user records are created or updated.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { dashboardInventoryPipeline, dashboardBatchPipeline, dashboardProductIdsPipeline } from '../src/lib/dashboard-inventory-pipeline.js';
import { dashboardSalesPipeline, applyDashboardCostRounding } from '../src/lib/dashboard-sales-pipeline.js';
import { dashboardRange, dashboardChartWindows } from '../src/lib/dashboard-dates.js';
import { dashboardStock, dashboardWholesale } from '../src/lib/dashboard-summary.js';
import { inventoryValue } from '../src/lib/inventory-value.js';
import { notificationIdUpdate } from '../src/lib/notification-state.js';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = path.resolve('src', specifier.slice(2));
    const file = [base + '.js', path.join(base, 'index.js')].find(existsSync);
    if (file) return next(pathToFileURL(file).href, context);
  }
  return next(specifier, context);
} });
process.loadEnvFile('.env.local');
mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
const money = value => Number(Number(value || 0).toFixed(2));
function staticLookup(pipeline, from, documents) {
  return pipeline.map(stage => {
    if (stage.$lookup?.from !== from) return stage;
    const lookup = stage.$lookup;
    return { $lookup: { let: { ...lookup.let, fixtureId: '$' + lookup.localField }, pipeline: [{ $documents: documents }, { $match: { $expr: { $eq: ['$' + lookup.foreignField, '$$fixtureId'] } } }, ...(lookup.pipeline || [])], as: lookup.as } };
  });
}
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  for (const field of ['readNotificationIds', 'dismissedNotificationIds']) {
    const [state] = await db.aggregate([{ $documents: [{ readNotificationIds: ['expired', 'a'], dismissedNotificationIds: ['old', 'b'] }] }, ...notificationIdUpdate(['a', 'b', 'c'], field, ['c'])]).toArray();
    assert.deepEqual(new Set(state.readNotificationIds), new Set(field === 'readNotificationIds' ? ['a', 'c'] : ['a']));
    assert.deepEqual(new Set(state.dismissedNotificationIds), new Set(field === 'dismissedNotificationIds' ? ['b', 'c'] : ['b']));
  }
  const id = () => new mongoose.Types.ObjectId();
  const products = [
    { _id: id(), name: 'Oil', active: true, baseUnit: 'ml', packageType: 'Bottle', packageSize: 100, packageSellingPrice: 50, reorderLevel: 5, allowLooseSale: true },
    { _id: id(), name: 'Tablets', active: true, baseUnit: 'g', packageType: 'Jar', packageSize: 500, packageSellingPrice: 100, reorderLevel: 2, loosePricingMethod: 'count_based', looseUnit: 'tablet', looseConversionType: 'fixed', unitsPerPackage: 20, loosePricePerUnit: 6 },
    { _id: id(), name: 'Count on open', active: true, baseUnit: 'g', packageType: 'Jar', packageSize: 250, packageSellingPrice: 60, reorderLevel: 2, loosePricingMethod: 'count_based', looseUnit: 'capsule', looseConversionType: 'count_on_open', loosePricePerUnit: 4 },
    { _id: id(), name: 'Empty', active: true, baseUnit: 'pcs', packageType: 'Piece', packageSize: 1, packageSellingPrice: 10, reorderLevel: 1 },
    { _id: id(), name: 'Inactive', active: false, baseUnit: 'pcs', packageType: 'Piece', packageSize: 1, packageSellingPrice: 10, reorderLevel: 1 },
  ];
  const now = new Date('2026-10-13T10:00:00+05:30'), dates = dashboardRange('today', undefined, undefined, now);
  const batches = [
    { _id: id(), productId: products[0]._id, batchNumber: 'O1', packageSize: 100, sealedPackages: 3, openQuantity: 40, purchasePrice: 20, expiryDate: new Date('2026-10-20'), updatedAt: now },
    { _id: id(), productId: products[0]._id, batchNumber: 'ZERO', packageSize: 100, sealedPackages: 0, openQuantity: 0, purchasePrice: 0, expiryDate: new Date('2026-10-01'), updatedAt: now },
    { _id: id(), productId: products[1]._id, batchNumber: 'T1', packageSize: 500, sealedPackages: 1, openQuantity: 8, purchasePrice: 80, expiryDate: new Date('2026-10-01'), updatedAt: now },
    { _id: id(), productId: products[2]._id, batchNumber: 'C1', packageSize: 250, sealedPackages: 1, openQuantity: 15, purchasePrice: 0, expiryDate: new Date('2026-12-01'), updatedAt: now },
    { _id: id(), productId: products[4]._id, batchNumber: 'I1', packageSize: 1, sealedPackages: 50, openQuantity: 0, purchasePrice: 4, expiryDate: new Date('2026-10-01'), updatedAt: now },
  ];
  const active = products.filter(product => product.active);
  const pipeline = staticLookup(dashboardInventoryPipeline(active.map(product => product._id)), 'inventorybatches', batches);
  const [inventory] = await db.aggregate([{ $documents: products }, ...pipeline]).toArray();
  const legacyStock = dashboardStock(active, batches);
  assert.equal(inventory.lowCount[0].count, legacyStock.lowStock.length);
  assert.deepEqual(Object.fromEntries(inventory.groups.map(row => [row._id, money(row.quantity)])), legacyStock.groups);
  const values = active.map(product => inventoryValue(batches.filter(batch => String(batch.productId) === String(product._id)), product));
  assert.equal(money(inventory.totals[0].value), money(values.reduce((sum, row) => sum + row.knownCost, 0)));
  assert.equal(money(inventory.totals[0].sellingValue), money(values.reduce((sum, row) => sum + row.sellingValue, 0)));
  assert.equal(inventory.totals[0].missingCostBatches, values.reduce((sum, row) => sum + row.missingCostBatches, 0));
  const centProduct = { ...products[0], _id: id(), packageSellingPrice: 0.005 };
  const centBatch = { productId: centProduct._id, packageSize: 100, sealedPackages: 1, openQuantity: 0, purchasePrice: 0.005 };
  const [centInventory] = await db.aggregate([{ $documents: [centProduct] }, ...staticLookup(dashboardInventoryPipeline([centProduct._id]), 'inventorybatches', [centBatch])]).toArray();
  assert.equal(centInventory.totals[0].value, inventoryValue([centBatch], centProduct).knownCost);
  assert.equal(centInventory.totals[0].sellingValue, inventoryValue([centBatch], centProduct).sellingValue);
  const batchPipeline = staticLookup(dashboardBatchPipeline(now, 90), 'products', products);
  const [batchSummary] = await db.aggregate([{ $documents: batches }, ...batchPipeline]).toArray();
  assert.equal(batchSummary.expiredCount[0].count, 1);
  assert.equal(batchSummary.expiringSoon[0].count, 1);
  assert.equal(batchSummary.opened.length, 3);
  const sales = [
    { _id: id(), createdAt: now, total: 70, payments: [{ method: 'CASH', amount: 50 }, { method: 'UPI', amount: 20 }], items: [{ kind: 'PRODUCT', productId: products[0]._id, name: 'Oil', saleMode: 'LOOSE', quantity: 1, baseQuantity: 30, total: 30, looseUnit: 'ml' }, { kind: 'MIX', name: 'Mix', quantity: 1, total: 40, ingredients: [{ productId: products[0]._id, baseQuantity: 20 }] }] },
    { _id: id(), createdAt: now, total: 100, customerId: id(), saleType: 'WHOLESALE', discountSummary: { totalDiscount: 10 }, payments: [], items: [{ kind: 'PRODUCT', productId: products[1]._id, name: 'Tablets', saleMode: 'WHOLESALE', quantity: 1, baseQuantity: 500, total: 100, freeQuantity: 1, freeProductId: products[0]._id }] },
    { _id: id(), createdAt: new Date(dates.previousStart.getTime() + 1000), total: 20, payments: [{ method: 'CASH', amount: 20 }], items: [{ kind: 'PRODUCT', productId: products[0]._id, name: 'Oil', quantity: 1, baseQuantity: 10, total: 20 }] },
  ];
  const costProducts = inventory.costProducts;
  const costMap = new Map(costProducts.map(product => [String(product._id), product.unitCost]));
  const [summary] = await db.aggregate([{ $documents: sales }, ...dashboardSalesPipeline(dates, dashboardChartWindows(dates), costProducts, costMap)]).toArray();
  applyDashboardCostRounding(summary);
  const current = summary.summary.find(row => row._id === 'current');
  assert.equal(current.revenue, 170); assert.equal(current.orders, 2); assert.equal(current.transactions, 2);
  const expectedCost = money(50 * costMap.get(String(products[0]._id))) + money(500 * costMap.get(String(products[1]._id)) + 100 * costMap.get(String(products[0]._id)));
  assert.equal(money(current.profit), money(170 - expectedCost));
  assert.equal(summary.loose[0].quantity, 30); assert.equal(summary.mixtures[0].sales, 1);
  assert.equal(summary.wholesale[0].revenue, dashboardWholesale(sales.slice(0, 2)).revenue);
  const needed = await db.aggregate([{ $documents: sales }, ...dashboardProductIdsPipeline(dates)]).toArray();
  assert.equal(needed.length, 2);
  for (const rawCost of [0.005, 0.015]) {
    const tieSale = { createdAt: now, total: 10, payments: [], items: [{ kind: 'PRODUCT', productId: products[0]._id, baseQuantity: 1, quantity: 1, total: 10 }] };
    const [ties] = await db.aggregate([{ $documents: [tieSale] }, ...dashboardSalesPipeline(dates, dashboardChartWindows(dates), [products[0]], new Map([[String(products[0]._id), rawCost]]))]).toArray();
    applyDashboardCostRounding(ties);
    assert.equal(money(ties.summary[0].profit), money(10 - money(rawCost)));
    assert.equal(money(ties.chart[0].profit), money(10 - money(rawCost)));
  }
  console.log(JSON.stringify({ fixtures: 'PASS', checks: 26, writes: 0 }));

  // Compare new live calculations with the checked-in implementation, without logging values.
  const before = execFileSync('git', ['show', 'HEAD:src/lib/server/dashboard-data.js'], { encoding: 'utf8' });
  const baseline = await import('data:text/javascript;base64,' + Buffer.from(before).toString('base64'));
  const { getDashboardData } = await import('../src/lib/server/dashboard-data.js');
  const old = await baseline.getDashboardData('today');
  const updated = await getDashboardData('today');
  for (const field of ['kpis', 'inventory', 'financial', 'totals', 'wholesale', 'loose', 'consultation', 'features', 'notifications']) assert.deepEqual(updated[field], old[field], field);
  assert.deepEqual(updated.salesOverview, old.salesOverview);
  console.log(JSON.stringify({ liveDashboardParity: 'PASS', fields: 10, purchaseFilterCorrected: true, writes: 0 }));
} catch (error) {
  // Do not print assertion data: it may contain live customer/invoice information.
  console.error(JSON.stringify({ verification: 'FAIL', error: error.name, code: error.code, check: error.operator }));
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
