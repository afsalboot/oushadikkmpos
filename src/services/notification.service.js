import { InventoryBatch, Product, Purchase } from "../models/index.js";
import { purchaseDueNotificationId } from "../lib/notification-utils.js";
import { getSettings } from "./settings.service.js";
import { formatPhysicalStock, isLowStock } from "./inventory.service.js";

const hasPermission = (session, permission) => session.role === "ADMIN" || session.permissions.includes(permission);
const positiveStock = (batch) => Number(batch.sealedPackages || 0) > 0 || Number(batch.openQuantity || 0) > 0;

export async function getNotifications(session) {
  const settings = await getSettings();
  const warningLimit = new Date(Date.now() + Number(settings.batchExpiry.firstWarningDays || 90) * 86400000);
  const [products, batches, purchases] = await Promise.all([
    settings.notifications.lowStock ? Product.aggregate([
      { $match: { active: true, reorderLevel: { $gt: 0 } } },
      { $project: { name: 1, reorderLevel: 1, baseUnit: 1, packageType: 1, packageSize: 1, loosePricingMethod: 1, looseUnit: 1, stockPackType: 1, unitsPerStockPack: 1, updatedAt: 1 } },
      { $lookup: { from: 'inventorybatches', localField: '_id', foreignField: 'productId', pipeline: [{ $group: { _id: null, sealedPackages: { $sum: '$sealedPackages' }, openQuantity: { $sum: '$openQuantity' } } }], as: 'stockRows' } },
      { $set: { stock: { $ifNull: [{ $arrayElemAt: ['$stockRows', 0] }, { sealedPackages: 0, openQuantity: 0 }] } } },
      { $match: { $expr: { $lte: [{ $cond: [{ $eq: ['$loosePricingMethod', 'count_based'] }, '$stock.sealedPackages', { $add: ['$stock.sealedPackages', { $cond: [{ $gt: ['$packageSize', 0] }, { $divide: ['$stock.openQuantity', '$packageSize'] }, 0] }] }] }, '$reorderLevel'] } } },
      { $unset: 'stockRows' },
    ]) : [],
    settings.notifications.expired || settings.notifications.expiry ? InventoryBatch.aggregate([
      { $match: { $or: [{ sealedPackages: { $gt: 0 } }, { openQuantity: { $gt: 0 } }], expiryDate: { $lte: warningLimit, $ne: null } } },
      { $project: { productId: 1, batchNumber: 1, expiryDate: 1, sealedPackages: 1, openQuantity: 1, updatedAt: 1 } },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', pipeline: [{ $match: { active: true } }, { $project: { name: 1 } }], as: 'product' } },
      { $set: { productName: { $arrayElemAt: ['$product.name', 0] } } }, { $unset: 'product' },
    ]) : [],
    settings.notifications.purchaseDue && hasPermission(session, "purchases.view")
      ? Purchase.find({ purchaseStatus: { $ne: "CANCELLED" }, balanceDue: { $gt: 0 } }).select("purchaseNumber supplierSnapshot balanceDue purchasedAt").sort({ purchasedAt: 1 }).limit(100).lean()
      : [],
  ]);

  const items = [];

  if (settings.notifications.lowStock) {
    for (const product of products) {
      const stock = product.stock;
      if (isLowStock(stock, product)) items.push({ id: `low-${product._id}`, type: "LOW_STOCK", title: `${product.name} is low in stock`, detail: `${formatPhysicalStock(stock, product)} remaining · reorder at ${product.reorderLevel} ${product.packageType}${Number(product.reorderLevel) === 1 ? "" : "s"}`, href: "/products", priority: 2, createdAt: product.updatedAt });
    }
  }

  const now = new Date();
  const warningDays = Number(settings.batchExpiry.firstWarningDays || 90);
  for (const batch of batches.filter(positiveStock)) {
    if (!batch.expiryDate) continue;
    const days = Math.ceil((new Date(batch.expiryDate).getTime() - now.getTime()) / 86_400_000);
    const product = { name: batch.productName };
    if (days < 0 && settings.notifications.expired) items.push({ id: `expired-${batch._id}`, type: "EXPIRED", title: `${product?.name || "Product"} batch expired`, detail: `Batch ${batch.batchNumber || "Default"} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`, href: "/products", priority: 0, createdAt: batch.updatedAt });
    else if (days >= 0 && days <= warningDays && settings.notifications.expiry) items.push({ id: `expiry-${batch._id}`, type: "EXPIRY", title: `${product?.name || "Product"} expires soon`, detail: `Batch ${batch.batchNumber || "Default"} · ${days === 0 ? "expires today" : `${days} day${days === 1 ? "" : "s"} remaining`}`, href: "/products", priority: days <= Number(settings.batchExpiry.criticalWarningDays || 7) ? 0 : 1, createdAt: batch.updatedAt });
  }

  const notificationTimeZone = settings.store?.timezone || "Asia/Kolkata";
  for (const purchase of purchases) items.push({ id: purchaseDueNotificationId(purchase._id, now, notificationTimeZone), type: "PURCHASE_DUE", title: "Supplier payment pending", detail: `${purchase.supplierSnapshot?.name || purchase.purchaseNumber} · ₹${Number(purchase.balanceDue || 0).toLocaleString("en-IN")}`, href: "/purchases", priority: 2, createdAt: now });

  items.sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title));
  return { count: items.length, items, generatedAt: new Date().toISOString() };
}
