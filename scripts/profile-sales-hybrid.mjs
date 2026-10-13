// Read-only service benchmarks. No authentication bypass in the app, data writes,
// model initialization, index creation, customer data, or product names in output.
import { registerHooks } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import { searchSalesIndex, buildBarcodeMap } from '../src/lib/sales-search.js';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = path.resolve('src', specifier.slice(2));
    const target = [base + '.js', path.join(base, 'index.js')].find(existsSync);
    if (target) return next(pathToFileURL(target).href, context);
  }
  return next(specifier, context);
} });
process.loadEnvFile('.env.local');
mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
const measurements = [], stages = {};
const timing = { async measure(name, work) { const start = performance.now(); const result = await work(); stages[name] = +(performance.now() - start).toFixed(2); return result; } };
const measure = async (name, work) => { const start = performance.now(); const result = await work(); measurements.push({ name, ms: +(performance.now() - start).toFixed(2), bytes: Buffer.byteLength(JSON.stringify({ data: result })), count: result.rows?.length }); return result; };
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  const { Product, Category, InventoryBatch } = await import('../src/models/index.js');
  const { getProducts } = await import('../src/services/product.service.js');
  const { getSalesIndex, getSalesRevision } = await import('../src/services/sales-index.service.js');
  const databaseIndexes = await Promise.all([Product, InventoryBatch].map(async model => ({ collection: model.collection.name, indexes: (await model.collection.indexes()).map(({ name, key, unique, sparse }) => ({ name, key, unique, sparse })) })));
  await measure('catalogue-revision-check', () => getSalesRevision());
  const filter = { active: true, visibleInSales: { $ne: false } };
  for (let run = 1; run <= 2; run++) {
    await measure('paginated-first-page-' + run, async () => {
      const [rows, total] = await Promise.all([getProducts(filter, { salesOnly: true, page: 1, limit: 50 }), Product.countDocuments(filter)]);
      return { rows, pagination: { page: 1, limit: 50, total, pages: Math.max(1, Math.ceil(total / 50)) } };
    });
  }
  const index = await measure('lightweight-index', () => getSalesIndex(timing));
  const explained = await Product.find(filter).select('name sku barcode manufacturer categoryId packageSellingPrice baseUnit packageType allowPackageSale allowLooseSale allowMixture loosePricingMethod').sort({ name: 1, _id: 1 }).limit(10001).explain('executionStats');
  measurements.push({ name: 'index-database-execution', ms: explained.executionStats.executionTimeMillis, examined: explained.executionStats.totalDocsExamined, returned: explained.executionStats.nReturned });
  await timing.measure('serialization', () => JSON.stringify({ data: index }));
  let assertions = 0;
  if (index.complete && index.rows.length) {
    for (const position of [0, Math.floor(index.rows.length / 2), index.rows.length - 1]) {
      const row = index.rows[position];
      for (const query of [row.name, row.name.toUpperCase(), row.sku, row.barcode].filter(Boolean)) {
        const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = { $regex: escaped, $options: 'i' };
        const cats = await Category.find({ name: regex }).select('_id').lean();
        const server = await Product.find({ ...filter, $or: [{ name: regex }, { sku: regex }, { barcode: regex }, { manufacturer: regex }, { categoryId: { $in: cats.map(c => c._id) } }] }).select('_id').lean();
        const local = searchSalesIndex(index.rows, { search: query, limit: 10000 });
        assert.deepEqual(local.rows.map(r => r._id).sort(), server.map(r => String(r._id)).sort()); assertions++;
      }
    }
    const query = index.rows[Math.floor(index.rows.length / 2)].name.slice(0, 3);
    const searches = [];
    for (let run = 0; run < 1000; run++) { const start = performance.now(); searchSalesIndex(index.rows, { search: query }); searches.push(performance.now() - start); }
    searches.sort((a, b) => a - b);
    measurements.push({ name: 'local-search-1000-runs', medianMs: +searches[500].toFixed(4), p95Ms: +searches[950].toFixed(4) });
    const map = buildBarcodeMap(index.rows), barcode = map.keys().next().value;
    const start = performance.now();
    for (let run = 0; run < 10000; run++) map.get(barcode);
    measurements.push({ name: 'barcode-map', averageMs: +((performance.now() - start) / 10000).toFixed(6), entries: map.size, scope: map.size ? 'populated catalogue map' : 'missing barcode lookup; catalogue has no barcodes' });
    await measure('one-product-sale-detail', async () => getProducts({ ...filter, _id: index.rows[Math.floor(index.rows.length / 2)]._id }, { salesOnly: true }));
  }
  const report = { measuredAt: new Date().toISOString(), measurements, stages, databaseIndexes, searchParityAssertions: assertions, databaseWrites: 0, browserTimings: 'see Electron and browser native UI reports', scope: 'service only; excludes HTTP auth, React render and network to browser' };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--output')) writeFileSync('docs/sales-hybrid-measurements.json', JSON.stringify(report, null, 2) + '\n');
  if (process.argv.includes('--cache-output')) writeFileSync('docs/sales-cache-service-measurements.json', JSON.stringify(report, null, 2) + '\n');
} catch (error) { console.error(JSON.stringify({ error: error.name, code: error.code })); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
