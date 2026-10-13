// Read-only aggregation checks. Fixtures exist only within MongoDB $documents.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { productCataloguePipeline } from '../src/lib/product-catalogue-pipeline.js';
import { reportOverviewPipeline, reportInventoryUnitsPipeline } from '../src/lib/report-overview-pipeline.js';
import { calculatePhysicalStock, isLowStock } from '../src/services/inventory.service.js';
import { inventoryValue } from '../src/lib/inventory-value.js';
import { externalPurchaseSummary } from '../src/lib/external-purchase.js';
import { getBatchExpirySummary } from '../src/lib/batch-expiry.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = path.resolve('src', specifier.slice(2));
    const file = [base + '.js', path.join(base, 'index.js')].find(existsSync);
    if (file) return next(pathToFileURL(file).href, context);
  }
  return next(specifier, context);
} });
process.loadEnvFile('.env.local');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

function fixtureLookup(pipeline, collection, documents) {
  return pipeline.map(stage => {
    if (stage.$lookup?.from !== collection) return stage;
    const lookup = stage.$lookup;
    return { $lookup: {
      let: { ...lookup.let, fixtureId: '$' + lookup.localField },
      pipeline: [{ $documents: documents }, { $match: { $expr: { $eq: ['$' + lookup.foreignField, '$$fixtureId'] } } }, ...(lookup.pipeline || [])],
      as: lookup.as,
    } };
  });
}
const brandKey = product => String(product.manufacturer || '').trim().replace(/\s+/g, ' ').toLowerCase() || '__unbranded__';
function legacyFilter(product, params) {
  const groups = {
    stock: { IN: product.stock.hasStock, OUT: !product.stock.hasStock, LOW: product.lowStock, OPEN: product.stock.openQuantity > 0 },
    capability: { PACKAGE: product.allowPackageSale, LOOSE: product.allowLooseSale, MIX: product.allowMixture },
    visibility: { VISIBLE: product.visibleInSales !== false, HIDDEN: product.visibleInSales === false },
    more: { ACTIVE: product.active !== false, INACTIVE: product.active === false, EXPIRED: product.expired, EXPIRING: product.expiringSoon, MULTI: product.activeBatchCount >= 2 },
  };
  if (params.has('category') && String(product.categoryId) !== params.get('category')) return false;
  if (params.getAll('brand').length && !params.getAll('brand').includes(brandKey(product))) return false;
  return Object.entries(groups).every(([key, map]) => !params.getAll(key).length || params.getAll(key).some(value => map[value]));
}
let checks = 0;
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const id = () => new mongoose.Types.ObjectId();
  const category = id(), now = new Date('2026-10-13T10:00:00+05:30');
  const products = [
    { _id: id(), name: 'A Oil', manufacturer: '  Brand\t One  ', categoryId: category, active: true, visibleInSales: true, allowPackageSale: true, allowLooseSale: true, allowMixture: true, baseUnit: 'ml', packageSize: 100, packageSellingPrice: 50, reorderLevel: 5 },
    { _id: id(), name: 'B Count', manufacturer: 'Brand One', categoryId: id(), active: true, visibleInSales: false, allowLooseSale: true, baseUnit: 'g', packageSize: 500, packageSellingPrice: 100, reorderLevel: 2, loosePricingMethod: 'count_based', looseConversionType: 'fixed', unitsPerPackage: 20, loosePricePerUnit: 6 },
    { _id: id(), name: 'C Empty', active: true, allowPackageSale: true, baseUnit: 'pcs', packageSize: 1, packageSellingPrice: 10, reorderLevel: 1 },
    { _id: id(), name: 'D Inactive', active: false, allowPackageSale: true, baseUnit: 'pcs', packageSize: 1, packageSellingPrice: 10, reorderLevel: 1 },
    { _id: id(), name: 'E Count open', manufacturer: 'Another', allowLooseSale: true, baseUnit: 'tablets', packageSize: 250, packageSellingPrice: 60, reorderLevel: 2, loosePricingMethod: 'count_based', looseConversionType: 'count_on_open', loosePricePerUnit: 4 },
  ];
  const batches = [
    { productId: products[0]._id, sealedPackages: 3, openQuantity: 40, packageSize: 100, expiryDate: new Date('2026-10-20'), purchasePrice: 20 },
    { productId: products[0]._id, sealedPackages: 1, openQuantity: 0, packageSize: 120, expiryDate: new Date('2026-10-01'), purchasePrice: 25 },
    { productId: products[1]._id, sealedPackages: 1, openQuantity: 8, packageSize: 500, expiryDate: new Date('2026-10-01'), purchasePrice: 80 },
    { productId: products[2]._id, sealedPackages: 0, openQuantity: 0, packageSize: 1, expiryDate: new Date('2026-10-01') },
    { productId: products[3]._id, sealedPackages: 50, openQuantity: 0, packageSize: 1, expiryDate: new Date('2026-10-01'), purchasePrice: 4 },
    { productId: products[4]._id, sealedPackages: 1, openQuantity: 15, packageSize: 250, expiryDate: new Date('2026-12-01'), purchasePrice: 0 },
    { productId: id(), sealedPackages: 100, openQuantity: 10, packageSize: 100 },
  ];
  const enriched = products.map(product => {
    const own = batches.filter(batch => String(batch.productId) === String(product._id));
    const active = own.filter(batch => batch.sealedPackages > 0 || batch.openQuantity > 0);
    const stock = calculatePhysicalStock(own, product);
    return { ...product, stock, lowStock: isLowStock(stock, product), activeBatchCount: active.length, ...getBatchExpirySummary(own, now), expiringSoon: active.some(batch => {
      const days = batch.expiryDate ? Math.ceil((batch.expiryDate - now) / 86400000) : null;
      return days !== null && days >= 0 && days <= 90;
    }), valuation: inventoryValue(own, product) };
  });
  const queries = ['', 'stock=IN', 'stock=OUT', 'stock=LOW', 'stock=OPEN', 'stock=IN&stock=OUT', 'capability=PACKAGE', 'capability=LOOSE', 'capability=MIX', 'visibility=VISIBLE', 'visibility=HIDDEN', 'more=ACTIVE', 'more=INACTIVE', 'more=EXPIRING', 'more=EXPIRED', 'more=MULTI', 'brand=brand+one', 'brand=__unbranded__', 'stock=LOW&visibility=HIDDEN', 'category=' + category];
  for (let offset = 0; offset < queries.length; offset += 4) await Promise.all(queries.slice(offset, offset + 4).map(async query => {
    const params = new URLSearchParams(query);
    const pipeline = productCataloguePipeline({ categoryId: category }, params, now);
    pipeline[0].$match = {};
    const [result] = await db.aggregate([{ $documents: products }, ...fixtureLookup(pipeline, 'inventorybatches', batches)]).toArray();
    const expected = enriched.filter(product => legacyFilter(product, params));
    assert.deepEqual(result.ids.map(row => String(row._id)), expected.map(product => String(product._id)));
    assert.equal(result.total[0]?.count || 0, expected.length);
    assert.equal(result.metrics[0].low, enriched.filter(product => product.lowStock).length);
    assert.equal(result.metrics[0].sellingValue, enriched.reduce((sum, product) => sum + product.valuation.sellingValue, 0));
    checks += 4;
  }));
  const [paged] = await db.aggregate([{ $documents: products }, ...fixtureLookup(productCataloguePipeline({}, new URLSearchParams('page=2&limit=2'), now), 'inventorybatches', batches)]).toArray();
  assert.deepEqual(paged.ids.map(row => String(row._id)), products.slice(2, 4).map(product => String(product._id))); checks++;
  assert.throws(() => productCataloguePipeline({}, new URLSearchParams('stock=INVALID'), now), /Invalid product filter/); checks++;
  const many = Array.from({ length: 250 }, (_, index) => ({ ...products[2], _id: id(), name: String(index).padStart(3, '0') }));
  const [bulk] = await db.aggregate([{ $documents: many }, ...fixtureLookup(productCataloguePipeline({}, new URLSearchParams(), now), 'inventorybatches', [])]).toArray();
  assert.equal(bulk.ids.length, 20); assert.equal(bulk.selection.length, 201); assert.equal(bulk.total[0].count, 250); checks += 3;

  const lines = [
    { total: 500, quantity: 1 },
    { itemSource: 'external_purchase', total: 40, quantity: 1.5, purchaseCost: 0.01, externalPurchasePaymentMethod: 'CASH' },
    { itemSource: 'external_purchase', total: 10, quantity: 3, purchaseCost: 12.34, externalPurchasePaymentMethod: 'CREDIT' },
    { itemSource: 'external_purchase', total: 5, quantity: 1, purchaseCost: 0 },
  ];
  const sales = [{ createdAt: now, total: 555, items: lines }, { createdAt: now, total: 20, items: [{ saleMode: 'WHOLESALE', total: 20 }] }, { createdAt: now, total: 100, saleType: 'WHOLESALE', items: [] }, { createdAt: now, documentStatus: 'CANCELLED', total: 999, items: lines }];
  const [overview] = await db.aggregate([{ $documents: sales }, ...reportOverviewPipeline({ documentStatus: { $ne: 'CANCELLED' } })]).toArray();
  const external = externalPurchaseSummary(lines);
  assert.equal(overview.summary[0].revenue, 675); assert.equal(overview.summary[0].wholesaleRevenue, 120);
  assert.equal(overview.items[0].inventoryRevenue, 520); assert.equal(overview.items[0].externalRevenue, external.externalPurchaseRevenue);
  assert.equal(overview.items[0].externalCost, external.externalPurchaseCost); assert.equal(overview.items[0].unknownExternalCost, 1);
  assert.equal(overview.trend[0].orders, 3); assert.equal(overview.trend[0]._id, '2026-10-13'); checks += 8;
  const [known] = await db.aggregate([{ $documents: [{ createdAt: now, items: lines.slice(1, 3) }] }, ...reportOverviewPipeline({})]).toArray();
  assert.equal(known.items[0].unknownExternalCost, 0); checks++;
  const units = await db.aggregate([{ $documents: batches }, ...fixtureLookup(reportInventoryUnitsPipeline(), 'products', products)]).toArray();
  for (const unit of ['ml', 'g', 'tablets', 'pcs']) {
    assert.equal(units.find(row => row._id === unit)?.quantity || 0, enriched.filter(product => product.baseUnit === unit).reduce((sum, product) => sum + product.stock.totalBaseQuantity, 0)); checks++;
  }
  console.log(JSON.stringify({ workspaceFixtures: 'PASS', checks, databaseWrites: 0 }));
} catch (error) {
  // Assertions can contain invoice information; report only error classification.
  console.error(JSON.stringify({ workspaceFixtures: 'FAIL', checks, error: error.name, code: error.code, operator: error.operator }));
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
