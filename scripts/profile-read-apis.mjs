// Read-only diagnostics: never initializes models, creates indexes, or writes data.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = path.resolve('src', specifier.slice(2));
    const target = [base + '.js', path.join(base, 'index.js')].find(existsSync);
    if (target) return next(pathToFileURL(target).href, context);
  }
  return next(specifier, context);
} });
process.loadEnvFile('.env.local');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const marks = [];
async function measure(name, fn) {
  const start = performance.now();
  const result = await fn();
  marks.push({ name, ms: Math.round(performance.now() - start), bytes: Buffer.byteLength(JSON.stringify(result)), rows: Array.isArray(result) ? result.length : undefined });
  return result;
}
try {
  const compressed = process.argv.includes('--compressed');
  await measure('connection', () => mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000, compressors: compressed ? ['zlib'] : [], zlibCompressionLevel: 6 }).then(() => true));
  const { Product, InventoryBatch, Sale, Category } = await import('../src/models/index.js');
  const { getProducts } = await import('../src/services/product.service.js');
  const { getDashboardData } = await import('../src/lib/server/dashboard-data.js');
  const { getNotifications } = await import('../src/services/notification.service.js');
  const { getSettings, invalidateSettingsCache } = await import('../src/services/settings.service.js');
  let started;
  mongoose.set('debug', (collection, method) => {
    if (started) console.log(JSON.stringify({ query: `${collection}.${method}`, atMs: Math.round(performance.now() - started) }));
  });
  for (let run = 1; run <= 2; run++) {
    started = performance.now();
    if (!process.argv.includes('--pages-only')) await measure(`products-${run}`, () => getProducts({ active: true, visibleInSales: { $ne: false } }, { salesOnly: true, timing: { async measure(stage, fn) { const start = performance.now(); const value = await fn(); console.log(JSON.stringify({ stage, ms: Math.round(performance.now() - start) })); return value; } } }));
    await measure(`products-page-${run}`, async () => {
      const filter = { active: true, visibleInSales: { $ne: false } };
      const [rows, total] = await Promise.all([getProducts(filter, { salesOnly: true, page: 1, limit: 50 }), Product.countDocuments(filter)]);
      return { rows, pagination: { page: 1, limit: 50, total, pages: Math.max(1, Math.ceil(total / 50)) } };
    });
    started = performance.now();
    await measure(`dashboard-${run}`, () => getDashboardData('today', undefined, undefined, { timing: { async measure(stage, fn) { const start = performance.now(); const value = await fn(); console.log(JSON.stringify({ stage, ms: Math.round(performance.now() - start) })); return value; } } }));
    started = performance.now();
    await measure(`notifications-${run}`, () => getNotifications({ role: 'ADMIN', permissions: [] }));
    started = null;
    await measure(`categories-${run}`, async () => {
      const [categories, counts] = await Promise.all([Category.find().select('name slug description isSystem active').sort({ name: 1 }).lean(), Product.aggregate([{ $group: { _id: '$categoryId', count: { $sum: 1 } } }])]);
      const byCategory = new Map(counts.map(row => [String(row._id), row.count]));
      return categories.map(row => ({ ...row, productCount: byCategory.get(String(row._id)) || 0 }));
    });
    invalidateSettingsCache();
    await measure(`settings-cold-${run}`, () => getSettings());
    await measure(`settings-cached-${run}`, () => getSettings());
  }
  started = null;
  for (const Model of [Product, InventoryBatch, Sale]) {
    const indexes = await Model.collection.indexes();
    console.log(JSON.stringify({ collection: Model.collection.name, indexes: indexes.map(index => ({ key: index.key, unique: index.unique })) }));
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const [name, query] of [
    ['products', Product.find({ active: true, visibleInSales: { $ne: false } }).sort({ name: 1 })],
    ['sales', Sale.find({ createdAt: { $gte: today } })],
  ]) {
    const stats = await query.explain('executionStats');
    const statsSummary = stats.executionStats;
    console.log(JSON.stringify({ explain: name, ms: statsSummary.executionTimeMillis, returned: statsSummary.nReturned, documents: statsSummary.totalDocsExamined, keys: statsSummary.totalKeysExamined, plan: stats.queryPlanner.winningPlan }));
  }
  const sizes = await Product.aggregate([{ $project: { fields: { $objectToArray: '$$ROOT' } } }, { $unwind: '$fields' }, { $group: { _id: '$fields.k', bytes: { $sum: { $bsonSize: { value: '$fields.v' } } } } }, { $sort: { bytes: -1 } }, { $limit: 8 }]);
  console.log(JSON.stringify({ largestProductFields: sizes }));
  console.log(JSON.stringify({ measurements: marks, compressed, script: path.basename(fileURLToPath(import.meta.url)) }));
} catch (error) {
  // Connection errors can contain credentials/hosts: deliberately omit messages.
  console.error(JSON.stringify({ error: error.name, code: error.code, measurements: marks }));
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
