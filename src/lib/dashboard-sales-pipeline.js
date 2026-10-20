import { productSalesExpression } from './sale-revenue.js';

// Bound the data sent to Node: summary groups, product groups, and six invoices.
// Preserve the existing dashboard's current-stock cost estimate and per-sale rounding.
export function dashboardSalesPipeline(dates, windows, products, unitCost) {
  const ids = products.map(product => String(product._id));
  const costs = ids.map(id => unitCost.get(id) || 0);
  const sizes = products.map(product => Number(product.packageSize || 0));
  const lookup = (id, values, fallback = 0) => ({ $let: {
    vars: { index: { $indexOfArray: [{ $literal: ids }, { $toString: id }] } },
    in: { $cond: [{ $gte: ['$$index', 0] }, { $arrayElemAt: [{ $literal: values }, '$$index'] }, fallback] },
  } });
  const number = field => ({ $ifNull: [field, 0] });
  const freeId = { $ifNull: ['$$item.freeProductId', '$$item.productId'] };
  const itemCost = { $cond: [
    { $eq: ['$$item.kind', 'MIX'] },
    { $sum: { $map: { input: { $ifNull: ['$$item.ingredients', []] }, as: 'ingredient', in: { $multiply: [number('$$ingredient.baseQuantity'), lookup('$$ingredient.productId', costs)] } } } },
    { $add: [
      { $multiply: [number('$$item.baseQuantity'), lookup('$$item.productId', costs)] },
      { $multiply: [number('$$item.freeQuantity'), { $cond: [{ $eq: ['$$item.saleMode', 'LOOSE'] }, 1, lookup(freeId, sizes, lookup('$$item.productId', sizes))] }, lookup(freeId, costs)] },
    ] },
  ] };
  const rangeMatch = { createdAt: { $gte: dates.start, $lte: dates.end } };
  const current = [{ $match: rangeMatch }];
  const summaryGroup = { $group: { _id: '$period', revenue: { $sum: '$productSales' }, consultationFee: { $sum: number('$consultationFee') }, treatmentFee: { $sum: number('$treatmentFee') }, orders: { $sum: 1 }, profit: { $sum: { $subtract: ['$productSales', '$estimatedCost'] } }, transactions: { $sum: { $size: { $ifNull: ['$payments', []] } } } } };
  const slot = (start, end) => ({ $and: [{ $gte: ['$createdAt', start] }, { $lte: ['$createdAt', end] }] });
  const branches = windows.flatMap((window, index) => [
    { case: slot(window.start, window.end), then: index },
    { case: slot(window.previousStart, window.previousEnd), then: index },
  ]);
  const nonMix = [...current, { $unwind: '$items' }, { $match: { 'items.kind': { $ne: 'MIX' } } }];
  return [
    { $match: { documentStatus: { $ne: 'CANCELLED' }, createdAt: { $gte: dates.previousStart, $lte: dates.end } } },
    { $set: {
      period: { $cond: [{ $gte: ['$createdAt', dates.start] }, 'current', 'previous'] },
      productSales: productSalesExpression(),
      rawCost: { $ifNull: ['$retentionEstimatedCost', { $sum: { $map: { input: { $ifNull: ['$items', []] }, as: 'item', in: itemCost } } }] },
    } },
    { $set: { estimatedCost: { $round: ['$rawCost', 2] } } },
    { $facet: {
      summary: [summaryGroup],
      chart: [{ $set: { slot: { $switch: { branches, default: -1 } } } }, { $group: { _id: { slot: '$slot', period: '$period' }, revenue: { $sum: '$productSales' }, orders: { $sum: 1 }, profit: { $sum: { $subtract: ['$productSales', '$estimatedCost'] } } } }],
      // MongoDB rounds half-cent ties to even; retain JS toFixed behavior for those rows.
      costCorrections: [{ $match: { $expr: { $eq: [{ $mod: [{ $multiply: ['$rawCost', 100] }, 1] }, 0.5] } } }, { $project: { _id: 0, period: 1, rawCost: 1, estimatedCost: 1, slot: { $switch: { branches, default: -1 } } } }],
      recent: [...current, { $sort: { createdAt: -1 } }, { $limit: 6 }, { $unset: ['period', 'estimatedCost', 'rawCost'] }],
      products: [...nonMix, { $group: { _id: '$items.productId', name: { $first: '$items.name' }, quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.total' } } }],
      loose: [...nonMix, { $match: { 'items.saleMode': 'LOOSE' } }, { $group: { _id: { productId: '$items.productId', unit: '$items.looseUnit' }, count: { $sum: 1 }, revenue: { $sum: '$items.total' }, quantity: { $sum: '$items.baseQuantity' } } }],
      mixtures: [...current, { $unwind: '$items' }, { $match: { 'items.kind': 'MIX' } }, { $group: { _id: { $ifNull: ['$items.name', 'Custom mix'] }, sales: { $sum: { $cond: [{ $gt: ['$items.quantity', 0] }, '$items.quantity', 1] } }, revenue: { $sum: '$items.total' } } }],
      payments: [...current, { $unwind: '$payments' }, { $group: { _id: '$payments.method', amount: { $sum: '$payments.amount' } } }],
      wholesale: [...current, { $match: { $or: [{ saleType: 'WHOLESALE' }, { 'items.saleMode': 'WHOLESALE' }, { 'discountSummary.reason': 'Wholesale discount' }] } }, { $group: { _id: null, invoices: { $sum: 1 }, revenue: { $sum: '$productSales' }, discount: { $sum: { $ifNull: ['$discountSummary.totalDiscount', { $ifNull: ['$discount', 0] }] } }, customers: { $addToSet: '$customerId' } } }],
    } },
  ];
}

export function applyDashboardCostRounding(sales) {
  for (const row of sales.costCorrections || []) {
    const difference = Number(Number(row.rawCost || 0).toFixed(2)) - row.estimatedCost;
    const summary = sales.summary?.find(group => group._id === row.period);
    const chart = sales.chart?.find(group => group._id.period === row.period && group._id.slot === row.slot);
    if (summary) summary.profit -= difference;
    if (chart) chart.profit -= difference;
  }
  return sales;
}
