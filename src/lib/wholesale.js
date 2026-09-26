const amount = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const WHOLESALE_UNITS = ["Piece", "Tablet", "Bottle", "Packet", "Jar", "Box", "Carton"];
export const FREE_SCHEME_TYPES = ["SAME_PRODUCT", "DIFFERENT_PRODUCT"];

// Resolve unconfigured products at sale time, including existing records.
export function resolveWholesaleProduct(product) {
  if (product?.wholesaleEnabled) return product;
  const source = typeof product?.toObject === "function" ? product.toObject() : product;
  return { ...source, wholesaleEnabled: true,
    wholesalePricingMethod: "FIXED", wholesalePrice: Number(product?.packageSellingPrice || 0),
    wholesaleMinQty: 1, wholesaleSaleUnit: "PACKAGE", wholesaleUnit: product?.packageType,
    unitsPerWholesalePack: 1, wholesalePackEnabled: false, wholesalePackPrice: null,
    wholesalePriceTiers: [], freeSchemeEnabled: false,
    allowWholesaleLooseSale: Boolean(product?.allowLooseSale),
    wholesaleLoosePrice: Number(product?.loosePricePerUnit || 0),
  };
}

export function wholesalePackConversion(product) {
  const wholesaleUnit = product?.wholesaleUnit || product?.packageType;
  const configured = Number(product?.unitsPerWholesalePack || 1);
  return product?.wholesalePackEnabled !== false && wholesaleUnit !== product?.packageType && Number.isInteger(configured) && configured > 0 ? configured : 1;
}

export function minimumWholesalePackageQuantity(product) {
  const conversion =
    product?.wholesaleSaleUnit === "PACKAGE"
      ? 1
      : wholesalePackConversion(product);
  return Number(product?.wholesaleMinQty || 1) * conversion;
}

export function normalizeWholesaleTiers(tiers = []) {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .map((tier) => ({ quantity: Number(tier.quantity), price: amount(tier.price) }))
    .sort((left, right) => left.quantity - right.quantity);
}

export function wholesaleBasePrice(product) {
  product = resolveWholesaleProduct(product);
  if (product?.wholesalePricingMethod === "DISCOUNT_FROM_RETAIL") {
    const discount = Number(product?.wholesaleDiscountPercent || 0);
    return amount(Number(product?.packageSellingPrice || 0) * (1 - discount / 100));
  }
  return amount(product?.wholesalePrice);
}

export function wholesaleLooseRate(product) {
  product = resolveWholesaleProduct(product);
  if (Number.isFinite(product?.wholesaleLoosePrice))
    return amount(product.wholesaleLoosePrice);
  return amount(wholesaleBasePrice(product) / Number(product?.packageSize || 1));
}

export function wholesaleRate(product, paidPackageQuantity, sellBy) {
  product = resolveWholesaleProduct(product);
  const quantity = Number(paidPackageQuantity || 0);
  const tiers = (product?.wholesalePricingMethod === "DISCOUNT_FROM_RETAIL"
    ? []
    : normalizeWholesaleTiers(product?.wholesalePriceTiers)
  ).filter((tier) => Number.isInteger(tier.quantity) && tier.quantity > 0 && tier.price >= 0);
  const applied = tiers.filter((tier) => quantity >= tier.quantity).at(-1);
  const conversion = wholesalePackConversion(product);
  const usesPackPrice =
    sellBy === product?.wholesaleUnit &&
    conversion > 1 &&
    Number.isFinite(product?.wholesalePackPrice);
  return {
    price: usesPackPrice
      ? amount(product.wholesalePackPrice / conversion)
      : amount(applied?.price ?? wholesaleBasePrice(product)),
    tier: applied || null,
  };
}

export function automaticFreeQuantity(product, paidPackageQuantity) {
  if (!product?.freeSchemeEnabled) return 0;
  const buyQuantity = Number(product.freeSchemeBuyQty || 0);
  const freeQuantity = Number(product.freeSchemeFreeQty || 0);
  if (!Number.isInteger(buyQuantity) || buyQuantity <= 0 || !Number.isInteger(freeQuantity) || freeQuantity <= 0) return 0;
  const conversion = wholesalePackConversion(product);
  const paidWholesalePacks = Math.floor(Number(paidPackageQuantity || 0) / conversion);
  const earnedFreeUnits = Math.floor(paidWholesalePacks / buyQuantity) * freeQuantity;
  return product.freeSchemeType === "DIFFERENT_PRODUCT" ? earnedFreeUnits : earnedFreeUnits * conversion;
}

export function buildWholesaleLine(product, { sellBy, quantity, manualFreeQuantity = null, manualFreeReason = "" } = {}) {
  product = resolveWholesaleProduct(product);
  const orderedQuantity = Number(quantity);
  if (!Number.isInteger(orderedQuantity) || orderedQuantity <= 0) throw new Error("Wholesale quantity must be a positive whole number");
  const wholesaleUnit = product.wholesaleUnit || product.packageType;
  const sellingByWholesalePack = sellBy === wholesaleUnit && wholesaleUnit !== product.packageType;
  const conversion = sellingByWholesalePack ? Number(product.unitsPerWholesalePack || 0) : 1;
  if (!Number.isInteger(conversion) || conversion <= 0) throw new Error("Wholesale pack conversion must be a positive whole number");
  const paidPackageQuantity = orderedQuantity * conversion;
  const minimum = Number(product.wholesaleMinQty || 1);
  const minimumPackages = minimumWholesalePackageQuantity(product);
  if (paidPackageQuantity < minimumPackages) {
    const minimumUnit =
      product.wholesaleSaleUnit === "PACKAGE"
        ? product.packageType
        : product.wholesaleUnit || product.packageType;
    throw new Error(`Minimum wholesale order is ${minimum} ${minimumUnit}${minimum === 1 ? "" : "s"} (${minimumPackages} ${product.packageType}${minimumPackages === 1 ? "" : "s"})`);
  }
  const automaticFree = automaticFreeQuantity(product, paidPackageQuantity);
  const hasManualFree = manualFreeQuantity !== null && manualFreeQuantity !== undefined;
  const freeQuantity = hasManualFree ? Number(manualFreeQuantity) : automaticFree;
  if (!Number.isInteger(freeQuantity) || freeQuantity < 0) throw new Error("Free quantity must be a non-negative whole number");
  const rate = wholesaleRate(product, paidPackageQuantity, sellBy);
  return {
    sellBy: sellingByWholesalePack ? wholesaleUnit : product.packageType,
    orderedQuantity,
    unitsPerWholesalePack: conversion,
    paidPackageQuantity,
    freeQuantity,
    totalOutgoingQuantity: paidPackageQuantity + freeQuantity,
    unitPrice: rate.price,
    total: amount(paidPackageQuantity * rate.price),
    tier: rate.tier,
    manualFree: hasManualFree,
    manualFreeReason: String(manualFreeReason || "").trim(),
  };
}

export function buildWholesaleCartItem(product, line) {
  const productId = product?.productId || product?._id;
  return {
    ...product,
    kind: "PRODUCT",
    saleMode: "WHOLESALE",
    wholesaleLine: line,
    sellBy: line.sellBy,
    quantity: line.orderedQuantity,
    paidPackageQuantity: line.paidPackageQuantity,
    freeQuantity: line.freeQuantity,
    manualFreeQuantity: line.manualFree ? line.freeQuantity : null,
    manualFreeReason: line.manualFreeReason,
    wholesaleUnit: line.sellBy,
    wholesalePriceApplied: line.unitPrice,
    wholesaleTotal: line.total,
    productId,
    _id: `wholesale-${productId}`,
  };
}

// Keep the regular cart key stable when switching a package line to wholesale.
export function setCartItemWholesale(item, enabled, quantity = item.quantity) {
  if (item.kind !== "PRODUCT" || !["PACKAGE", "WHOLESALE"].includes(item.saleMode))
    throw new Error("Wholesale selection is available for package products");
  if (!enabled) return { ...item, saleMode: "PACKAGE", quantity, discount: undefined };
  const line = buildWholesaleLine(item, { sellBy: item.packageType, quantity });
  const outgoing = line.paidPackageQuantity + (item.freeSchemeType === "DIFFERENT_PRODUCT" ? 0 : line.freeQuantity);
  if (outgoing > Number(item.stock?.sealedPackages || 0))
    throw new Error(`Insufficient sealed stock for ${item.name}`);
  return { ...buildWholesaleCartItem(item, line), _id: item._id };
}

export function validateWholesaleProduct(product) {
  const errors = [];
  if (!product.wholesaleEnabled) return errors;
  if (product.allowWholesaleLooseSale && !product.allowLooseSale) errors.push("Enable ordinary loose sale before wholesale loose sale");
  if (!["FIXED", "DISCOUNT_FROM_RETAIL"].includes(product.wholesalePricingMethod || "FIXED")) errors.push("Select a valid wholesale pricing method");
  const wholesaleDiscountPercent = Number(product.wholesaleDiscountPercent ?? 0);
  if (!Number.isFinite(wholesaleDiscountPercent) || wholesaleDiscountPercent < 0 || wholesaleDiscountPercent > 100) errors.push("Wholesale discount must be between 0% and 100%");
  if (!Number.isFinite(product.wholesalePrice) || product.wholesalePrice < 0) errors.push("Wholesale price must be zero or greater");
  if (!Number.isInteger(product.wholesaleMinQty) || product.wholesaleMinQty <= 0) errors.push("Wholesale minimum quantity must be a positive whole number");
  if (!["PACKAGE", "WHOLESALE_PACK", "LOOSE_UNIT"].includes(product.wholesaleSaleUnit || "WHOLESALE_PACK")) errors.push("Select a valid wholesale sale unit");
  if (!WHOLESALE_UNITS.includes(product.wholesaleUnit)) errors.push("Select a valid wholesale unit");
  if (!Number.isInteger(product.unitsPerWholesalePack) || product.unitsPerWholesalePack <= 0) errors.push("Units per wholesale pack must be a positive whole number");
  if (product.wholesalePackPrice !== null && product.wholesalePackPrice !== undefined && (!Number.isFinite(product.wholesalePackPrice) || product.wholesalePackPrice < 0)) errors.push("Wholesale pack price must be zero or greater");
  if (product.wholesaleLoosePrice !== null && product.wholesaleLoosePrice !== undefined && (!Number.isFinite(product.wholesaleLoosePrice) || product.wholesaleLoosePrice < 0)) errors.push("Wholesale loose price must be zero or greater");
  if ((product.wholesalePriceTiers || []).some((tier) => !Number.isInteger(tier.quantity) || tier.quantity <= 0 || !Number.isFinite(tier.price) || tier.price < 0)) errors.push("Wholesale price tiers must contain valid quantities and prices");
  if (product.freeSchemeEnabled) {
    if (!FREE_SCHEME_TYPES.includes(product.freeSchemeType)) errors.push("Select a valid free scheme type");
    if (!Number.isInteger(product.freeSchemeBuyQty) || product.freeSchemeBuyQty <= 0) errors.push("Scheme buy quantity must be a positive whole number");
    if (!Number.isInteger(product.freeSchemeFreeQty) || product.freeSchemeFreeQty <= 0) errors.push("Scheme free quantity must be a positive whole number");
    if (product.freeSchemeType === "DIFFERENT_PRODUCT" && !product.freeSchemeFreeProduct) errors.push("Select the free product for this scheme");
  }
  return errors;
}
