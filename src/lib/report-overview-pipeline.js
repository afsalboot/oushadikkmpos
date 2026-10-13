export function reportOverviewPipeline(filter) {
  const nz = field => ({ $ifNull: [field, 0] });
  const wholesale = { $or: [{ $eq: ['$saleType', 'WHOLESALE'] }, { $in: ['WHOLESALE', { $ifNull: ['$items.saleMode', []] }] }] };
  const decimal = field => ({ $toDecimal: { $toString: nz(field) } });
  const lineCost = { $divide: [{ $floor: { $add: [{ $multiply: [decimal('$items.quantity'), decimal('$items.purchaseCost'), 100] }, { $toDecimal: '0.5' }] } }, 100] };
  return [
    { $match: filter }, { $set: { wholesale } },
    { $facet: {
      summary: [{ $group: { _id: null, revenue: { $sum: '$total' }, wholesaleRevenue: { $sum: { $cond: ['$wholesale', '$total', 0] } } } }],
      trend: [{ $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } }, revenue: { $sum: '$total' }, wholesaleRevenue: { $sum: { $cond: ['$wholesale', '$total', 0] } }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      items: [{ $unwind: '$items' }, { $group: {
        _id: null,
        inventoryRevenue: { $sum: { $cond: [{ $eq: ['$items.itemSource', 'external_purchase'] }, 0, nz('$items.total')] } },
        externalRevenue: { $sum: { $cond: [{ $eq: ['$items.itemSource', 'external_purchase'] }, nz('$items.total'), 0] } },
        externalCost: { $sum: { $cond: [{ $eq: ['$items.itemSource', 'external_purchase'] }, lineCost, 0] } },
        unknownExternalCost: { $max: { $cond: [{ $and: [{ $eq: ['$items.itemSource', 'external_purchase'] }, { $not: [{ $ifNull: ['$items.externalPurchasePaymentMethod', false] }] }] }, 1, 0] } },
      } }, { $set: { externalCost: { $toDouble: '$externalCost' } } }],
    } },
  ];
}

export function reportInventoryUnitsPipeline() {
  return [
    { $project: { productId: 1, sealedPackages: 1, openQuantity: 1, packageSize: 1 } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', pipeline: [{ $project: { baseUnit: 1, loosePricingMethod: 1 } }], as: 'product' } },
    { $unwind: '$product' },
    { $group: { _id: '$product.baseUnit', quantity: { $sum: { $cond: [{ $eq: ['$product.loosePricingMethod', 'count_based'] }, { $ifNull: ['$openQuantity', 0] }, { $add: [{ $multiply: [{ $ifNull: ['$sealedPackages', 0] }, { $ifNull: ['$packageSize', 0] }] }, { $ifNull: ['$openQuantity', 0] }] }] } } } },
  ];
}
