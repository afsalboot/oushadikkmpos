import { isWholesaleSale } from "./wholesale-reporting.js";
import { calculatePhysicalStock, isLowStock, packageEquivalentStock, getLooseUnit } from "../services/inventory.service.js";

const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function dashboardWholesale(sales = []) {
  const rows = sales.filter((sale) => isWholesaleSale(sale) || sale.discountSummary?.reason === "Wholesale discount");
  const revenue = money(rows.reduce((sum, sale) => sum + Number(sale.total || 0), 0));
  return {
    invoices: rows.length,
    revenue,
    customers: new Set(rows.map((sale) => String(sale.customerId || "")).filter(Boolean)).size,
    discount: money(rows.reduce((sum, sale) => sum + Number(sale.discountSummary?.totalDiscount ?? sale.discount ?? 0), 0)),
    averageInvoice: rows.length ? money(revenue / rows.length) : 0,
  };
}

export function dashboardStock(products, batches) {
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const currentBatches = batches.filter((batch) => productMap.has(String(batch.productId?._id || batch.productId)));
  const byProduct = new Map();
  for (const batch of currentBatches) {
    const key = String(batch.productId?._id || batch.productId);
    byProduct.set(key, [...(byProduct.get(key) || []), batch]);
  }
  const lowStock = [];
  const groups = {};
  for (const product of products) {
    const stock = calculatePhysicalStock(byProduct.get(String(product._id)) || [], product);
    if (isLowStock(stock, product)) lowStock.push({ id: product._id, name: product.name, unit: product.packageType, current: packageEquivalentStock(stock, product), reorder: Number(product.reorderLevel) });
    const unit = getLooseUnit(product);
    const quantity = product.loosePricingMethod === "count_based" ? stock.totalLooseQuantity : stock.totalBaseQuantity;
    if (quantity > 0) groups[unit] = money((groups[unit] || 0) + quantity);
  }
  return { batches: currentBatches, groups, lowStock: lowStock.sort((a, b) => a.current / a.reorder - b.current / b.reorder) };
}
