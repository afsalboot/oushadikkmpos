// Read-only benchmark: no model initialization, index creation or database writes.
import { registerHooks } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
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
const measurements = [];
const timing = { async measure(name, work) {
  const start = performance.now(); const result = await work();
  measurements.push({ name, ms: Math.round(performance.now() - start) }); return result;
} };
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  const { Sale, StockTransaction, Customer } = await import('../src/models/index.js');
  const { getProducts } = await import('../src/services/product.service.js');
  const { creditSaleStock, saleStockReturns } = await import('../src/lib/sale-edit.js');
  const sale = await timing.measure('sale', () => Sale.findById('6acf7732f9711956440254db').populate('actorId', 'name role').lean());
  if (!sale) throw new Error('MissingSale');
  const start = performance.now();
  let result;
  if (process.argv.includes('--baseline')) {
    const [products, rows, customer] = await Promise.all([
      getProducts({ active: true, $or: [{ visibleInSales: { $ne: false } }, { _id: { $in: sale.items.flatMap(item => item.kind === 'MIX' ? item.ingredients.map(ingredient => ingredient.productId) : [item.productId]) } }] }, { timing }),
      StockTransaction.find({ referenceType: 'SALE', referenceId: sale._id }).lean(),
      sale.customerId ? Customer.findById(sale.customerId).lean() : null,
    ]);
    result = { sale, products: creditSaleStock(products, saleStockReturns(sale, rows)), customer };
  } else {
    const { getSaleEditData, getSaleEditProductPage, billedProductIds } = await import('../src/services/sale-edit-read.service.js');
    result = await getSaleEditData(sale, timing);
    measurements.push({ name: 'edit-initial', ms: Math.round(performance.now() - start), products: result.products.length, bytes: Buffer.byteLength(JSON.stringify(result)) });
    const pageStart = performance.now();
    const page = await getSaleEditProductPage(sale, new URLSearchParams(), timing);
    measurements.push({ name: 'edit-first-page', ms: Math.round(performance.now() - pageStart), products: page.rows.length, bytes: Buffer.byteLength(JSON.stringify(page)) });
    if (process.argv.includes('--parity')) {
      const { saleEditCart } = await import('../src/lib/sale-edit.js');
      const legacyProducts = await getProducts({ active: true, _id: { $in: billedProductIds(sale) } });
      const allocations = saleStockReturns(sale, sale.stockAllocations?.length ? [] : await StockTransaction.find({ referenceType: 'SALE', referenceId: sale._id }).lean());
      const oldCart = saleEditCart(sale, creditSaleStock(legacyProducts, allocations));
      const newCart = saleEditCart(sale, result.products);
      for (let index = 0; index < newCart.length; index++) {
        for (const key of Object.keys(newCart[index]).filter(key => !['batches', 'valuation', '__v', 'createdAt'].includes(key))) {
          assert.deepEqual(newCart[index][key], oldCart[index][key], `Billed cart parity: ${key}`);
        }
      }
      console.log(JSON.stringify({ billedCartParity: 'passed', lines: newCart.length }));
    }
  }
  const report = { mode: process.argv.includes('--baseline') ? 'baseline' : 'optimized', measurements,
    totalMs: Math.round(performance.now() - start), products: result.products.length, bytes: Buffer.byteLength(JSON.stringify(result)) };
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch (error) { console.error(JSON.stringify({ error: error.name, code: error.code, measurements })); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
