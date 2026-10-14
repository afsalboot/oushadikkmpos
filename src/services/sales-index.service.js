import { Product, Category, InventoryBatch } from '@/models';
import { SALES_INDEX_FIELDS, SALES_INDEX_LIMIT, salesIndexRow } from '@/lib/sales-search';
import { formatPhysicalStock } from './inventory.service.js';
import { createHash } from 'node:crypto';

// Revisions include inventory so stock changes cannot return metadata-only 304s.
export async function getSalesRevision(timing) {
  const work = async () => {
    const revision = await Promise.all([Product, Category, InventoryBatch].map(model => model.aggregate([
      { $group: { _id: null, count: { $sum: 1 }, updatedAt: { $max: '$updatedAt' } } },
    ])));
    return createHash('sha256').update(JSON.stringify([2, revision])).digest('hex');
  };
  return timing ? timing.measure('index_revision', work) : work();
}

export async function getSalesIndex(timing, ids) {
  const measure = (name, work) => timing ? timing.measure(name, work) : work();
  const work = async () => Promise.all([
    measure('index_products', () => Product.find({ active: true, visibleInSales: { $ne: false }, ...(ids ? { _id: { $in: ids } } : {}) }).select(SALES_INDEX_FIELDS).sort({ name: 1, _id: 1 }).limit(SALES_INDEX_LIMIT + 1).batchSize(SALES_INDEX_LIMIT + 1).lean()),
    measure('index_categories', () => Category.find().select('name').lean()),
  ]);
  const [products, categories] = await (timing ? timing.measure('index_query', work) : work());
  if (products.length > SALES_INDEX_LIMIT) return { rows: [], complete: false, limit: SALES_INDEX_LIMIT };
  // Group in MongoDB: only two stock totals per product, never full batch rows.
  const stockRows = products.length ? await measure('index_stock', () => InventoryBatch.aggregate([
    { $match: { productId: { $in: products.map(product => product._id) }, $or: [{ sealedPackages: { $gt: 0 } }, { openQuantity: { $gt: 0 } }] } },
    { $group: { _id: '$productId', sealedPackages: { $sum: '$sealedPackages' }, openQuantity: { $sum: '$openQuantity' } } },
  ])) : [];
  const stocks = new Map(stockRows.map(row => [String(row._id), row]));
  const names = new Map(categories.map(row => [String(row._id), row.name]));
  return measure('index_processing', () => ({ rows: products.map(row => salesIndexRow({ ...row,
    stockLabel: formatPhysicalStock(stocks.get(String(row._id)) || { sealedPackages: 0, openQuantity: 0 }, row),
  }, names.get(String(row.categoryId)) || '')), complete: true }));
}
