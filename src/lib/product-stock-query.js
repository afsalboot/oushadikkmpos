export function productStockFilterPipeline(filter, stockFilter) {
  return [
    { $match: filter },
    { $project: { packageSize: 1, loosePricingMethod: 1, reorderLevel: 1 } },
    { $lookup: { from: 'inventorybatches', localField: '_id', foreignField: 'productId', pipeline: [{ $group: { _id: null, sealed: { $sum: '$sealedPackages' }, open: { $sum: '$openQuantity' } } }], as: 'stockRows' } },
    { $set: { stock: { $ifNull: [{ $arrayElemAt: ['$stockRows', 0] }, { sealed: 0, open: 0 }] } } },
    stockFilter === 'opened' ? { $match: { 'stock.open': { $gt: 0 } } } : { $match: { reorderLevel: { $gt: 0 }, $expr: { $lte: [
      { $cond: [{ $eq: ['$loosePricingMethod', 'count_based'] }, '$stock.sealed', { $add: ['$stock.sealed', { $cond: [{ $gt: ['$packageSize', 0] }, { $divide: ['$stock.open', '$packageSize'] }, 0] }] }] }, '$reorderLevel',
    ] } } },
    { $project: { _id: 1 } },
  ];
}
