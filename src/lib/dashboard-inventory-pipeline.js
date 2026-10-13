export function dashboardInventoryPipeline(neededIds) {
  const nz = field => ({ $ifNull: [field, 0] });
  const money = field => ({ $divide: [{ $floor: { $add: [{ $multiply: [{ $add: [field, Number.EPSILON] }, 100] }, 0.5] } }, 100] });
  const stockQuantity = { $cond: [{ $eq: ['$loosePricingMethod', 'count_based'] }, { $add: ['$stock.open', { $cond: [{ $eq: ['$looseConversionType', 'fixed'] }, { $multiply: ['$stock.sealed', nz('$unitsPerPackage')] }, 0] }] }, '$stock.base'] };
  const equivalent = { $cond: [{ $eq: ['$loosePricingMethod', 'count_based'] }, '$stock.sealed', { $add: ['$stock.sealed', { $cond: [{ $gt: ['$packageSize', 0] }, { $divide: ['$stock.open', '$packageSize'] }, 0] }] }] };
  const low = { $match: { reorderLevel: { $gt: 0 }, $expr: { $lte: ['$equivalent', '$reorderLevel'] } } };
  return [
    { $match: { active: true } },
    { $project: { name: 1, categoryId: 1, baseUnit: 1, looseUnit: 1, packageSize: 1, packageType: 1, reorderLevel: 1, loosePricingMethod: 1, looseConversionType: 1, unitsPerPackage: 1, packageSellingPrice: 1, loosePricePerUnit: 1, allowLooseSale: 1, allowMixture: 1 } },
    { $lookup: {
      from: 'inventorybatches', localField: '_id', foreignField: 'productId',
      let: { size: '$packageSize', countBased: { $eq: ['$loosePricingMethod', 'count_based'] }, units: { $cond: [{ $eq: ['$looseConversionType', 'fixed'] }, nz('$unitsPerPackage'), 0] }, price: '$packageSellingPrice', loosePrice: nz('$loosePricePerUnit') },
      pipeline: [
        { $match: { $or: [{ sealedPackages: { $gt: 0 } }, { openQuantity: { $gt: 0 } }] } },
        { $set: { units: { $cond: ['$$countBased', '$$units', { $cond: [{ $gt: ['$packageSize', 0] }, '$packageSize', '$$size'] }] }, price: { $ifNull: ['$$price', nz('$sellingPrice')] }, cost: nz('$purchasePrice') } },
        { $set: { base: { $add: [nz('$openQuantity'), { $multiply: [nz('$sealedPackages'), { $cond: [{ $gt: ['$packageSize', 0] }, '$packageSize', '$$size'] }] }] }, equivalent: { $add: [nz('$sealedPackages'), { $cond: [{ $gt: ['$units', 0] }, { $divide: [nz('$openQuantity'), '$units'] }, 0] }] } } },
        { $group: { _id: null, sealed: { $sum: '$sealedPackages' }, open: { $sum: '$openQuantity' }, base: { $sum: { $add: [{ $multiply: [nz('$sealedPackages'), nz('$packageSize')] }, nz('$openQuantity')] } }, costBase: { $sum: '$base' }, weightedCost: { $sum: { $multiply: ['$base', { $divide: ['$cost', { $cond: [{ $gt: ['$packageSize', 0] }, '$packageSize', { $cond: [{ $gt: ['$$size', 0] }, '$$size', 1] }] }] }] } },
          knownCost: { $sum: { $multiply: ['$equivalent', '$cost'] } },
          sellingValue: { $sum: { $add: [{ $multiply: [nz('$sealedPackages'), '$price'] }, { $cond: ['$$countBased', { $multiply: [nz('$openQuantity'), { $cond: [{ $gt: ['$$loosePrice', 0] }, '$$loosePrice', { $cond: [{ $gt: ['$units', 0] }, { $divide: ['$price', '$units'] }, 0] }] }] }, { $cond: [{ $gt: ['$units', 0] }, { $multiply: [{ $divide: [nz('$openQuantity'), '$units'] }, '$price'] }, 0] }] }] } },
          missing: { $sum: { $cond: [{ $or: [{ $lte: ['$cost', 0] }, { $and: [{ $gt: ['$openQuantity', 0] }, { $lte: ['$units', 0] }] }] }, 1, 0] } },
        } },
      ], as: 'stockRows',
    } },
    { $set: { stock: { $ifNull: [{ $arrayElemAt: ['$stockRows', 0] }, { sealed: 0, open: 0, base: 0, costBase: 0, weightedCost: 0, knownCost: 0, sellingValue: 0, missing: 0 }] } } },
    { $set: { equivalent, stockQuantity, stockUnit: { $cond: [{ $eq: ['$loosePricingMethod', 'count_based'] }, { $ifNull: ['$looseUnit', 'tablet'] }, '$baseUnit'] } } },
    { $facet: {
      totals: [{ $group: { _id: null, products: { $sum: 1 }, value: { $sum: money('$stock.knownCost') }, sellingValue: { $sum: money('$stock.sellingValue') }, missingCostBatches: { $sum: '$stock.missing' }, loose: { $max: { $cond: ['$allowLooseSale', 1, 0] } }, mix: { $max: { $cond: ['$allowMixture', 1, 0] } } } }],
      groups: [{ $match: { stockQuantity: { $gt: 0 } } }, { $group: { _id: '$stockUnit', quantity: { $sum: '$stockQuantity' } } }],
      lowCount: [low, { $count: 'count' }],
      lowStock: [low, { $set: { ratio: { $divide: ['$equivalent', '$reorderLevel'] } } }, { $sort: { ratio: 1 } }, { $limit: 5 }, { $project: { _id: 0, id: '$_id', name: 1, unit: '$packageType', current: '$equivalent', reorder: '$reorderLevel' } }],
      costProducts: [{ $match: { _id: { $in: neededIds } } }, { $project: { name: 1, categoryId: 1, baseUnit: 1, looseUnit: 1, loosePricingMethod: 1, packageSize: 1, unitCost: { $cond: [{ $gt: ['$stock.costBase', 0] }, { $divide: ['$stock.weightedCost', '$stock.costBase'] }, 0] } } }],
    } },
  ];
}

export function dashboardBatchPipeline(now, warningDays) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const limit = new Date(now); limit.setDate(limit.getDate() + warningDays);
  const expiring = { $match: { expiryDate: { $gte: today, $lte: limit } } };
  const expired = { $match: { expiryDate: { $lt: today, $ne: null } } };
  const project = { $project: { _id: 0, id: '$_id', product: '$product.name', batch: '$batchNumber', expiryDate: 1, days: { $ceil: { $divide: [{ $subtract: ['$expiryDate', today] }, 86400000] } } } };
  return [
    { $match: { $or: [{ sealedPackages: { $gt: 0 } }, { openQuantity: { $gt: 0 } }], $and: [{ $or: [{ expiryDate: { $lte: limit, $ne: null } }, { openQuantity: { $gt: 0 } }] }] } },
    { $project: { productId: 1, batchNumber: 1, expiryDate: 1, sealedPackages: 1, openQuantity: 1, updatedAt: 1 } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', pipeline: [{ $match: { active: true } }, { $project: { name: 1, baseUnit: 1, looseUnit: 1, loosePricingMethod: 1, packageType: 1 } }], as: 'products' } },
    { $unwind: '$products' }, { $set: { product: '$products' } },
    { $facet: {
      expiring: [expiring, { $sort: { expiryDate: 1 } }, { $limit: 5 }, project],
      expiringSoon: [expiring, project, { $match: { days: { $lte: 30 } } }, { $count: 'count' }],
      expired: [expired, { $sort: { expiryDate: 1 } }, { $limit: 5 }, project, { $unset: 'days' }],
      expiredCount: [expired, { $count: 'count' }],
      opened: [{ $match: { openQuantity: { $gt: 0 } } }, { $sort: { updatedAt: -1 } }, { $limit: 5 }, { $project: { _id: 0, id: '$_id', product: '$product.name', batch: '$batchNumber', sealed: '$sealedPackages', open: '$openQuantity', unit: { $cond: [{ $eq: ['$product.loosePricingMethod', 'count_based'] }, { $ifNull: ['$product.looseUnit', 'tablet'] }, '$product.baseUnit'] }, packageType: '$product.packageType', updatedAt: 1 } }],
    } },
  ];
}

export function dashboardProductIdsPipeline(dates) {
  return [
    { $match: { createdAt: { $gte: dates.previousStart, $lte: dates.end } } }, { $unwind: '$items' },
    { $project: { ids: { $concatArrays: [['$items.productId', '$items.freeProductId'], { $map: { input: { $ifNull: ['$items.ingredients', []] }, as: 'ingredient', in: '$$ingredient.productId' } }] } } },
    { $unwind: '$ids' }, { $match: { ids: { $ne: null } } }, { $group: { _id: '$ids' } },
  ];
}
