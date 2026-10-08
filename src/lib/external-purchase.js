import { money, multiplyMoney } from "./money.js";

export const SALE_ITEM_SOURCE = { INVENTORY: "inventory", EXTERNAL_PURCHASE: "external_purchase" };
export const EXTERNAL_PURCHASE_PAYMENTS = { CASH: "Cash", UPI: "UPI / GPay", CARD: "Card", OWNER: "Owner / Personal", CREDIT: "Credit / Pay Later" };
export const isExternalPurchase = item => item?.itemSource === SALE_ITEM_SOURCE.EXTERNAL_PURCHASE;
export const inventoryTracked = item => !isExternalPurchase(item) && item?.inventoryTracked !== false;

export function buildExternalPurchase(item, product) {
  const name = String(item.name || product?.name || "").trim();
  const unit = String(item.packageType || item.unit || product?.packageType || "").trim();
  const quantity = Number(item.quantity), purchaseCost = Number(item.purchaseCost), unitPrice = Number(item.unitPrice);
  if (!name || name.length > 160) throw new Error("Product name is required and must be at most 160 characters.");
  if (!unit || unit.length > 40) throw new Error("Unit is required and must be at most 40 characters.");
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 99999999) throw new Error("Quantity must be greater than zero.");
  if (item.purchaseCost === "" || item.purchaseCost == null || !Number.isFinite(purchaseCost) || purchaseCost < 0 || purchaseCost > 99999999) throw new Error("Purchase cost must be zero or greater.");
  if (item.unitPrice === "" || item.unitPrice == null || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 99999999) throw new Error("Selling price must be zero or greater.");
  if (!Object.hasOwn(EXTERNAL_PURCHASE_PAYMENTS, item.externalPurchasePaymentMethod)) throw new Error("Select a purchase payment method.");
  if (item.kind === "MIX" || item.ingredients?.length || Number(item.freeQuantity) > 0) throw new Error("External Purchase cannot contain mixtures or free stock.");
  return { kind: "PRODUCT", productId: product?._id || null, name, packageType: unit, baseUnit: unit,
    externalPurchaseId: /^[a-zA-Z0-9-]{16,80}$/.test(item.externalPurchaseId || "") ? item.externalPurchaseId : crypto.randomUUID(),
    saleMode: "PACKAGE", itemSource: SALE_ITEM_SOURCE.EXTERNAL_PURCHASE, inventoryTracked: false,
    quantity, unitPrice: money(unitPrice), total: multiplyMoney(quantity, money(unitPrice)),
    purchaseCost: money(purchaseCost), totalPurchaseCost: multiplyMoney(quantity, money(purchaseCost)),
    externalSupplierName: String(item.externalSupplierName || "").trim().slice(0, 160),
    externalPurchasePaymentMethod: item.externalPurchasePaymentMethod,
    externalPurchaseNotes: String(item.externalPurchaseNotes || "").trim().slice(0, 1000),
    hsnCode: product?.hsnCode || "", gstRate: product?.gstRate || 0,
    taxable: product?.taxable !== false && !product?.gstExempt, gstExempt: product?.taxable === false || Boolean(product?.gstExempt),
    useDefaultGstRate: product?.useDefaultGstRate !== false, gstPriceMode: product?.gstPriceMode || "STORE" };
}

export function externalPurchaseSummary(items = []) {
  const external = items.filter(isExternalPurchase);
  const externalPurchaseRevenue = money(external.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const externalPurchaseCost = money(external.reduce((sum, item) => sum + multiplyMoney(item.quantity, item.purchaseCost), 0));
  return { externalPurchaseRevenue, externalPurchaseCost, externalPurchaseProfit: money(externalPurchaseRevenue - externalPurchaseCost) };
}

export const canViewExternalCosts = actor => actor?.role === "ADMIN" || actor?.permissions?.includes("sales.create") || actor?.permissions?.includes("expenses.view");
export function saleForActor(sale, actor) {
  if (!sale || canViewExternalCosts(actor)) return sale;
  const { externalPurchaseCost, externalPurchaseProfit, ...safe } = sale;
  void externalPurchaseCost; void externalPurchaseProfit;
  safe.items = (sale.items || []).map(item => {
    const { purchaseCost, totalPurchaseCost, externalSupplierName, externalPurchasePaymentMethod, externalPurchaseNotes, ...line } = item;
    void purchaseCost; void totalPurchaseCost; void externalSupplierName; void externalPurchasePaymentMethod; void externalPurchaseNotes;
    return line;
  });
  return safe;
}
