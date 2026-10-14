import { dashboardRange, dashboardChartWindows } from "@/lib/dashboard-dates";
import { Consultation, Customer, Expense, InventoryBatch, Product, Purchase, Sale, Supplier, User } from "@/models";
import { dashboardSalesPipeline, applyDashboardCostRounding } from "@/lib/dashboard-sales-pipeline";
import { dashboardInventoryPipeline, dashboardBatchPipeline, dashboardProductIdsPipeline } from "@/lib/dashboard-inventory-pipeline";
import { getSettings } from "@/services/settings.service";
import { getLooseUnit } from "@/services/inventory.service";
import {historicalSalesAggregate} from '@/services/sale-history.service';

const amount = value => Number(Number(value || 0).toFixed(2));
const comparison = (current, previous) => previous ? amount(((current - previous) / previous) * 100) : null;

export async function getDashboardData(range = 'today', from, to, { timing } = {}) {
  let dates;
  try { dates = dashboardRange(range, from, to); } catch (error) { error.status = 422; throw error; }
  const measure = (name, work) => timing ? timing.measure(name, work) : work();
  const settings = await measure('settings', () => getSettings());
  const windows = dashboardChartWindows(dates);
  const neededIds = await measure('sale_product_ids', () => historicalSalesAggregate(dashboardProductIdsPipeline(dates)));
  const [inventoryFacets, batchFacets, expenseGroups, purchaseFacets, consultationGroups, customerCount, supplierCount, staffCount] = await Promise.all([
    measure('inventory_aggregation', () => Product.aggregate(dashboardInventoryPipeline(neededIds.map(row => row._id)))),
    measure('batch_aggregation', () => InventoryBatch.aggregate(dashboardBatchPipeline(new Date(), Number(settings.batchExpiry?.firstWarningDays || 90)))),
    measure('expenses', () => Expense.aggregate([
      { $match: { status: { $ne: 'VOID' }, expenseDate: { $gte: dates.previousStart, $lte: dates.end } } },
      { $group: { _id: { $cond: [{ $gte: ['$expenseDate', dates.start] }, 'current', 'previous'] }, amount: { $sum: '$amount' }, paid: { $sum: { $cond: [{ $eq: ['$source', 'PURCHASE'] }, { $ifNull: ['$paidAmount', '$amount'] }, '$amount'] } } } },
    ])),
    measure('purchases', () => Purchase.aggregate([
      { $match: { purchaseStatus: 'RECEIVED', purchasedAt: { $gte: dates.start, $lte: dates.end } } },
      { $facet: { summary: [{ $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }], latest: [{ $sort: { purchasedAt: -1 } }, { $limit: 1 }] } },
    ])),
    settings.features?.consultation === true ? measure('consultations', () => Consultation.aggregate([{ $match: { status: 'COMPLETED', createdAt: { $gte: dates.start, $lte: dates.end } } }, { $group: { _id: null, count: { $sum: 1 }, collection: { $sum: '$consultationFee' } } }])) : null,
    Customer.countDocuments({ active: { $ne: false } }), Supplier.countDocuments({ active: { $ne: false } }), User.countDocuments({ active: true }),
  ]);
  const inventory = inventoryFacets[0] || {}, inventoryTotals = inventory.totals?.[0] || {}, batchSummary = batchFacets[0] || {};
  const products = await Product.populate(inventory.costProducts || [], { path: 'categoryId', select: 'name' });
  const productById = new Map(products.map(product => [String(product._id), product]));
  const unitCost = new Map(products.map(product => [String(product._id), product.unitCost || 0]));
  const sellingValue = amount(inventoryTotals.sellingValue);
  const lowStockCount = inventory.lowCount?.[0]?.count || 0, expiredCount = batchSummary.expiredCount?.[0]?.count || 0;
  const [salesResult] = await measure('sales_aggregation', () => historicalSalesAggregate(dashboardSalesPipeline(dates, windows, products, unitCost)));
  const sales = applyDashboardCostRounding(salesResult || {});
  const current = sales.summary?.find(row => row._id === 'current') || {}, previous = sales.summary?.find(row => row._id === 'previous') || {};
  const currentRevenue = amount(current.revenue), previousRevenue = amount(previous.revenue), currentProfit = amount(current.profit), previousProfit = amount(previous.profit);
  const average = row => row.orders ? amount(row.revenue / row.orders) : 0;
  const currentExpense = expenseGroups.find(row => row._id === 'current') || {}, previousExpense = expenseGroups.find(row => row._id === 'previous') || {};
  const payments = (sales.payments || []).map(row => ({ method: row._id, amount: amount(row.amount) }));
  const paymentTotal = (sales.payments || []).reduce((sum, row) => sum + row.amount, 0);
  const wholesaleRow = sales.wholesale?.[0] || {};
  const wholesale = { invoices: wholesaleRow.invoices || 0, revenue: amount(wholesaleRow.revenue), discount: amount(wholesaleRow.discount), customers: (wholesaleRow.customers || []).filter(Boolean).length, averageInvoice: wholesaleRow.invoices ? amount(wholesaleRow.revenue / wholesaleRow.invoices) : 0 };
  const productSales = (sales.products || []).map(row => {
    const product = productById.get(String(row._id));
    return { id: row._id, name: row.name, category: product?.categoryId?.name || 'Uncategorized', quantity: row.quantity, revenue: row.revenue, unit: product?.baseUnit };
  });
  const categorySales = new Map();
  for (const row of productSales) categorySales.set(row.category, (categorySales.get(row.category) || 0) + row.revenue);
  const loose = { count: 0, revenue: 0, quantities: { ml: 0, g: 0, tablets: 0, pcs: 0 } };
  for (const row of sales.loose || []) {
    const unit = row._id.unit || getLooseUnit(productById.get(String(row._id.productId)) || {});
    loose.count += row.count; loose.revenue += row.revenue;
    loose.quantities[unit] = amount((loose.quantities[unit] || 0) + row.quantity);
  }
  loose.revenue = amount(loose.revenue);
  const mixtureRows = (sales.mixtures || []).map(row => ({ name: row._id, sales: row.sales, revenue: row.revenue }));
  const mixtures = { count: mixtureRows.reduce((sum, row) => sum + row.sales, 0), revenue: amount(mixtureRows.reduce((sum, row) => sum + row.revenue, 0)), items: mixtureRows.sort((a, b) => b.sales - a.sales).slice(0, 4) };
  const chart = windows.map((window, index) => {
    const row = sales.chart?.find(row => row._id.slot === index && row._id.period === 'current') || {}, before = sales.chart?.find(row => row._id.slot === index && row._id.period === 'previous') || {};
    return { label: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(window.start), date: window.start.toISOString(), sales: amount(row.revenue), previous: amount(before.revenue), orders: row.orders || 0, profit: amount(row.profit) };
  });
  const purchaseSummary = purchaseFacets[0]?.summary?.[0] || {}, latest = purchaseFacets[0]?.latest?.[0] || null;
  if (latest?.supplierId) latest.supplierId = await Supplier.findById(latest.supplierId).select('name').lean();
  const expiringSoonCount = batchSummary.expiringSoon?.[0]?.count || 0;
  return {
    consultation: consultationGroups ? { count: consultationGroups[0]?.count || 0, collection: amount(consultationGroups[0]?.collection) } : null,
    storeName: settings.store?.name || settings.storeName || 'Store',
    features: { loose: settings.looseSales?.enabled !== false && Boolean(inventoryTotals.loose), mix: settings.customMix?.enabled !== false && Boolean(inventoryTotals.mix) },
    expired: batchSummary.expired || [], expiredCount: expiredCount, expiryWarningDays: Number(settings.batchExpiry?.firstWarningDays || 90), blockExpiredSales: settings.batchExpiry?.blockExpiredSales !== false,
    range, rangeLabel: { today: 'Today', yesterday: 'Yesterday', '7d': 'Last 7 Days', week: 'This Week', month: 'This Month', custom: 'Custom Date' }[range] || 'Today', generatedAt: new Date(),
    kpis: { sales: currentRevenue, orders: current.orders || 0, profit: currentProfit, averageOrderValue: average(current), transactions: current.transactions || 0, lowStock: lowStockCount, comparisons: { sales: comparison(currentRevenue, previousRevenue), orders: comparison(current.orders || 0, previous.orders || 0), profit: comparison(currentProfit, previousProfit), averageOrderValue: comparison(current.orders ? currentRevenue / current.orders : 0, previous.orders ? previousRevenue / previous.orders : 0), transactions: comparison(current.transactions || 0, previous.transactions || 0) } },
    salesOverview: { current: currentRevenue, previous: previousRevenue, chart }, topProducts: productSales.sort((a, b) => b.revenue - a.revenue).slice(0, 5), recentTransactions: (sales.recent || []).filter(row=>!row.historyOnly),
    inventory: { groups: Object.fromEntries((inventory.groups || []).map(row => [row._id, amount(row.quantity)])), value: amount(inventoryTotals.value), sellingValue, missingCostBatches: inventoryTotals.missingCostBatches || 0 },
    expiring: batchSummary.expiring || [], lowStock: inventory.lowStock || [], opened: batchSummary.opened || [], loose, mixtures, wholesale,
    payments: payments.map(row => ({ ...row, percent: paymentTotal ? amount(row.amount / paymentTotal * 100) : 0 })),
    financial: { sales: currentRevenue, expenses: amount(currentExpense.amount), profit: currentProfit, netMovement: amount(paymentTotal - Number(currentExpense.paid || 0)), previousExpenses: amount(previousExpense.amount) },
    purchases: { total: amount(purchaseSummary.total), count: purchaseSummary.count || 0, latest }, suppliers: { active: supplierCount },
    categories: [...categorySales.entries()].map(([name, value]) => ({ name, value: amount(value), percent: currentRevenue ? amount(value / currentRevenue * 100) : 0 })).sort((a, b) => b.value - a.value).slice(0, 5),
    totals: { products: inventoryTotals.products || 0, customers: customerCount, suppliers: supplierCount, staff: staffCount, inventoryValue: sellingValue },
    notifications: { count: lowStockCount + expiringSoonCount + expiredCount, lowStock: lowStockCount, expiring: expiringSoonCount, expired: expiredCount },
  };
}
