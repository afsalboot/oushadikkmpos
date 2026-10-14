import mongoose from 'mongoose';
import { Category, Customer, Product, StockTransaction } from '@/models';
import { getProducts } from '@/services/product.service';
import { creditSaleStock, saleStockReturns } from '@/lib/sale-edit';
import { inventoryTracked, isExternalPurchase } from '@/lib/external-purchase';
import { productStockFilterPipeline } from '@/lib/product-stock-query';

const measure = (timing, name, work) => timing ? timing.measure(name, work) : work();

export function billedProductIds(sale) {
  return [...new Set(sale.items.filter(item => !isExternalPurchase(item)).flatMap(item => item.kind === 'MIX'
    ? (item.ingredients || []).map(ingredient => String(ingredient.productId)) : [String(item.productId)]))];
}

async function allocationsForSale(sale, timing) {
  // Modern sales already contain their exact allocations. Query the ledger only
  // for legacy bills; neither path changes inventory during a GET.
  const rows = sale.stockAllocations?.length || !sale.items.some(inventoryTracked) ? []
    : await measure(timing, 'stock_history', () => StockTransaction.find({ referenceType: 'SALE', referenceId: sale._id })
      .select('productId batchId direction type packageQuantity looseQuantity baseQuantity').lean());
  return saleStockReturns(sale, rows);
}

export async function getSaleEditData(sale, timing) {
  const [products, allocations, customer] = await Promise.all([
    getProducts({ active: true, _id: { $in: billedProductIds(sale) } }, { salesOnly: true, timing }),
    allocationsForSale(sale, timing),
    sale.customerId ? measure(timing, 'customer', () => Customer.findById(sale.customerId).lean()) : null,
  ]);
  return { sale, products: creditSaleStock(products, allocations), customer };
}

export async function getSaleEditProductPage(sale, parameters, timing) {
  const search = (parameters.get('search') || '').trim();
  if (search.length > 100) throw Object.assign(new Error('Search is too long'), { status: 422 });
  const filter = { active: true, $or: [{ visibleInSales: { $ne: false } }, { _id: { $in: billedProductIds(sale) } }] };
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: escaped, $options: 'i' };
    const categories = await Category.find({ name: regex }).select('_id').lean();
    filter.$and = [{ $or: ['name', 'sku', 'barcode', 'manufacturer'].map(field => ({ [field]: regex })) }];
    if (categories.length) filter.$and[0].$or.push({ categoryId: { $in: categories.map(row => row._id) } });
  }
  if (parameters.get('mode') === 'mix') filter.allowMixture = true;
  if (parameters.get('loose') === 'true') filter.allowLooseSale = true;
  if (parameters.has('category')) {
    if (!mongoose.isValidObjectId(parameters.get('category'))) throw Object.assign(new Error('Invalid category'), { status: 422 });
    filter.categoryId = new mongoose.Types.ObjectId(parameters.get('category'));
  }
  const allocations = await allocationsForSale(sale, timing);
  if (['low', 'opened'].includes(parameters.get('stock'))) {
    // Preserve low-stock membership from physical stock, as in the existing
    // editor. Opened-stock membership also includes the sale's returned loose units.
    const stock = parameters.get('stock');
    const rows = await measure(timing, 'stock_filter', () => Product.aggregate(productStockFilterPipeline(filter, stock)));
    const ids = rows.map(row => String(row._id));
    if (stock === 'opened') ids.push(...allocations.filter(row => Number(row.openQuantity) > 0).map(row => String(row.productId)));
    filter._id = { $in: [...new Set(ids)] };
  }
  const requestedPage = Number(parameters.get('page'));
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage) || 1) : 1;
  const limit = 50;
  const [products, total] = await Promise.all([
    getProducts(filter, { salesOnly: true, page, limit, timing }),
    measure(timing, 'count', () => Product.countDocuments(filter)),
  ]);
  return { rows: creditSaleStock(products, allocations), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}
