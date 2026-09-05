export const BASE_UNITS = ["ml", "g", "kg", "tablets", "pcs"];
export const PACKAGE_TYPES = ["Bottle", "Strip", "Packet", "Box", "Piece", "Jar", "Container", "Tube", "Other"];
export const LOOSE_PRICING_METHODS = Object.freeze({ PROPORTIONAL: "PROPORTIONAL", CUSTOM: "CUSTOM", TIERED: "TIERS", COUNT_BASED: "count_based" });
export const LOOSE_CONVERSION_TYPES = Object.freeze({ FIXED: "fixed", COUNT_ON_OPEN: "count_on_open" });
export const LOOSE_UNITS = ["tablet", "capsule", "piece", "sachet", "other"];
import { BARCODE_TYPES, detectBarcodeType, normalizeBarcode, validateBarcode } from "./barcode.js";

export function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return null;
}

export function calculateLooseUnitPrice(packageSellingPrice, packageSize) {
  const price = Number(packageSellingPrice);
  const size = Number(packageSize);
  if (!Number.isFinite(price) || !Number.isFinite(size) || price < 0 || size <= 0) return 0;
  return Math.round((price / size) * 1_000_000) / 1_000_000;
}

function parsePriceTiers(value) {
  if (Array.isArray(value)) return value;
  if (!String(value || "").trim()) return [];
  return String(value)
    .split(/[|;]/)
    .map((entry) => {
      const [quantity, price] = entry.split(/[:=]/).map((part) => part.trim());
      return { quantity: Number(quantity), price: Number(price) };
    });
}

export function normalizeProductInput(input = {}) {
  const packageSize = Number(input.packageSize ?? input.package_size);
  const packageSellingPrice = Number(input.packageSellingPrice ?? input.packagePrice ?? input.package_price ?? 0);
  const requestedLooseMethod = String(input.loosePricingMethod ?? input.loose_pricing_method ?? LOOSE_PRICING_METHODS.PROPORTIONAL).trim();
  const loosePricingMethod = requestedLooseMethod.toLowerCase() === LOOSE_PRICING_METHODS.COUNT_BASED ? LOOSE_PRICING_METHODS.COUNT_BASED : requestedLooseMethod.toUpperCase();
  const countBased = loosePricingMethod === LOOSE_PRICING_METHODS.COUNT_BASED;
  const looseConversionType = countBased ? String(input.looseConversionType ?? input.loose_conversion_type ?? LOOSE_CONVERSION_TYPES.COUNT_ON_OPEN).trim().toLowerCase() : undefined;
  const manufacturingDate = input.manufacturingDate ?? input.manufacturing_date;
  const expiryDate = input.expiryDate ?? input.expiry_date;
  const taxable = parseBoolean(input.taxable, input.gstExempt===undefined?true:!parseBoolean(input.gstExempt,false));
  const requestedGstPriceMode = String(input.gstPriceMode ?? input.gst_price_mode ?? "STORE").trim().toUpperCase();
  const stockPackType = ["Box", "Carton"].includes(input.stockPackType ?? input.stock_pack_type) ? input.stockPackType ?? input.stock_pack_type : "Box";
  const unitsPerStockPack = Number(input.unitsPerStockPack ?? input.units_per_stock_pack ?? 1);
  const openingStockPacks = Number(input.openingStockPacks ?? input.opening_stock_packs ?? 0);
  const openingIndividualPackages = Number(input.openingIndividualPackages ?? input.opening_individual_packages ?? input.openingPackages ?? input.opening_packages ?? 0);
  return {
    name: String(input.name || "").trim(),
    sku: String(input.sku || "").trim().toUpperCase(),
    barcode: normalizeBarcode(input.barcode),
    barcodeType: BARCODE_TYPES.includes(String(input.barcodeType || "").toUpperCase()) ? String(input.barcodeType).toUpperCase() : detectBarcodeType(input.barcode),
    categoryId: input.categoryId,
    manufacturer: String(input.manufacturer ?? input.brand ?? "").trim(),
    hsnCode: String(input.hsnCode ?? input.hsn_code ?? input.hsn ?? "").trim(),
    taxable,
    useDefaultGstRate: parseBoolean(input.useDefaultGstRate ?? input.use_default_gst_rate, (input.gstRate ?? input.gst_rate)===""||(input.gstRate ?? input.gst_rate)===undefined||(input.gstRate ?? input.gst_rate)===null),
    gstRate: taxable === false ? 0 : (input.gstRate ?? input.gst_rate)===""||(input.gstRate ?? input.gst_rate)===undefined||(input.gstRate ?? input.gst_rate)===null?null:Number(input.gstRate ?? input.gst_rate),
    gstExempt: taxable === false,
    gstPriceMode: ["INCLUSIVE", "EXCLUSIVE"].includes(requestedGstPriceMode) ? requestedGstPriceMode : "STORE",
    baseUnit: String(input.baseUnit ?? input.base_unit ?? input.packageUnit ?? input.package_unit ?? "").trim(),
    packageUnit: String(input.packageUnit ?? input.package_unit ?? input.baseUnit ?? input.base_unit ?? "").trim(),
    packageType: String(input.packageType ?? input.package_type ?? "").trim(),
    packageSize,
    stockPackType,
    unitsPerStockPack,
    allowPackageSale: parseBoolean(input.allowPackageSale ?? input.allow_package_sale, true),
    allowLooseSale: parseBoolean(input.allowLooseSale ?? input.allow_loose_sale, false),
    allowMixture: parseBoolean(input.allowMixture ?? input.allowMix ?? input.allow_mix, false),
    visibleInSales: parseBoolean(input.visibleInSales ?? input.posVisible ?? input.pos_visible, true),
    active: String(input.status || "").toUpperCase() === "INACTIVE" ? false : parseBoolean(input.active, true),
    packageSellingPrice,
    loosePricingMethod,
    looseUnit: countBased ? String(input.looseUnit ?? input.loose_unit ?? "tablet").trim().toLowerCase() : String(input.looseUnit ?? input.loose_unit ?? input.baseUnit ?? input.base_unit ?? "").trim().toLowerCase(),
    loosePricePerUnit: [LOOSE_PRICING_METHODS.CUSTOM, LOOSE_PRICING_METHODS.COUNT_BASED].includes(loosePricingMethod) ? Number(input.loosePricePerUnit ?? input.loosePrice ?? input.loose_price) : calculateLooseUnitPrice(packageSellingPrice, packageSize),
    looseConversionType,
    unitsPerPackage: countBased && looseConversionType === LOOSE_CONVERSION_TYPES.FIXED ? Number(input.unitsPerPackage ?? input.units_per_package) : null,
    priceTiers: parsePriceTiers(input.priceTiers ?? input.price_tiers).map((tier) => ({ quantity: Number(tier.quantity), price: Number(tier.price) })),
    wholesaleEnabled: parseBoolean(input.wholesaleEnabled ?? input.wholesale_enabled, false),
    wholesalePricingMethod: String(input.wholesalePricingMethod ?? input.wholesale_pricing_method ?? "FIXED").trim().toUpperCase(),
    wholesaleDiscountPercent: Number(input.wholesaleDiscountPercent ?? input.wholesale_discount_percent ?? 0),
    wholesalePrice: Number(input.wholesalePrice ?? input.wholesale_price ?? 0),
    wholesaleMinQty: Number(input.wholesaleMinQty ?? input.wholesale_min_qty ?? 1),
    wholesaleSaleUnit: String(input.wholesaleSaleUnit ?? input.wholesale_sale_unit ?? "WHOLESALE_PACK").trim().toUpperCase(),
    wholesaleUnit: String(input.wholesaleUnit ?? input.wholesale_unit ?? input.packageType ?? input.package_type ?? "Box").trim(),
    wholesalePackEnabled: parseBoolean(input.wholesalePackEnabled ?? input.wholesale_pack_enabled, true),
    unitsPerWholesalePack: Number(input.unitsPerWholesalePack ?? input.units_per_wholesale_pack ?? 1),
    wholesalePackPrice: (input.wholesalePackPrice ?? input.wholesale_pack_price) === "" || (input.wholesalePackPrice ?? input.wholesale_pack_price) === undefined || (input.wholesalePackPrice ?? input.wholesale_pack_price) === null ? null : Number(input.wholesalePackPrice ?? input.wholesale_pack_price),
    wholesalePriceTiers: normalizeWholesaleTiers(parsePriceTiers(input.wholesalePriceTiers ?? input.wholesale_price_tiers)),
    allowWholesaleLooseSale: parseBoolean(input.allowWholesaleLooseSale ?? input.allow_wholesale_loose_sale, false),
    wholesaleLoosePrice: (input.wholesaleLoosePrice ?? input.wholesale_loose_price) === "" || (input.wholesaleLoosePrice ?? input.wholesale_loose_price) === undefined || (input.wholesaleLoosePrice ?? input.wholesale_loose_price) === null ? null : Number(input.wholesaleLoosePrice ?? input.wholesale_loose_price),
    freeSchemeEnabled: parseBoolean(input.freeSchemeEnabled ?? input.free_scheme_enabled, false),
    freeSchemeType: String(input.freeSchemeType ?? input.free_scheme_type ?? "SAME_PRODUCT").trim().toUpperCase(),
    freeSchemeBuyQty: Number(input.freeSchemeBuyQty ?? input.free_scheme_buy_qty ?? 1),
    freeSchemeFreeQty: Number(input.freeSchemeFreeQty ?? input.free_scheme_free_qty ?? 1),
    freeSchemeFreeProduct: String(input.freeSchemeFreeProduct ?? input.free_scheme_free_product ?? "").trim() || null,
    reorderLevel: Number(input.reorderLevel ?? input.reorder_level ?? 0),
    openingPackages: openingStockPacks * unitsPerStockPack + openingIndividualPackages,
    openingStockPacks,
    openingIndividualPackages,
    openingQuantity: Number(input.openingQuantity ?? input.opening_quantity ?? 0),
    batchTracking: parseBoolean(input.batchTracking ?? input.batch_tracking ?? input.trackBatch, false),
    expiryTracking: parseBoolean(input.expiryTracking ?? input.expiry_tracking ?? input.trackBatch ?? input.batch_tracking, false),
    batchNumber: String(input.batchNumber ?? input.batch_number ?? "OPENING").trim() || "OPENING",
    manufacturingDate: manufacturingDate ? new Date(manufacturingDate) : undefined,
    expiryDate: expiryDate ? new Date(expiryDate) : undefined,
    purchasePrice: Number(input.purchasePrice ?? input.purchase_price ?? 0),
    supplierId: input.supplierId || undefined,
  };
}

export function validateProductInput(product) {
  const errors = [];
  if (!product.name) errors.push("Name is required");
  if (!product.sku) errors.push("SKU is required");
  errors.push(...validateBarcode(product.barcode));
  if (!BARCODE_TYPES.includes(product.barcodeType)) errors.push("Barcode type is invalid");
  if (!product.categoryId) errors.push("Category is required");
  if (!BASE_UNITS.includes(product.baseUnit)) errors.push(`Base unit is invalid: \"${product.baseUnit}\". Allowed: ${BASE_UNITS.join(", ")}`);
  if (!PACKAGE_TYPES.includes(product.packageType)) errors.push("Package type is invalid");
  if (!Number.isFinite(product.packageSize) || product.packageSize <= 0) errors.push("Package size must be greater than zero");
  if (!["Box", "Carton"].includes(product.stockPackType)) errors.push("Stock pack must be Box or Carton");
  if (!Number.isInteger(product.unitsPerStockPack) || product.unitsPerStockPack <= 0) errors.push("Packages per stock pack must be a positive whole number");
  if (!Number.isFinite(product.packageSellingPrice) || product.packageSellingPrice < 0) errors.push("Package price must be zero or greater");
  if (product.hsnCode&&!/^\d{2,8}$/.test(product.hsnCode)) errors.push("HSN code must contain 2 to 8 digits");
  if (product.gstRate!==null&&(!Number.isFinite(product.gstRate)||product.gstRate<0||product.gstRate>100)) errors.push("GST rate must be between 0 and 100");
  if (!["STORE", "INCLUSIVE", "EXCLUSIVE"].includes(product.gstPriceMode)) errors.push("GST price mode is invalid");
  if (!Object.values(LOOSE_PRICING_METHODS).includes(product.loosePricingMethod)) errors.push("Loose pricing method is invalid");
  if (product.allowLooseSale && product.loosePricingMethod === "CUSTOM" && (!Number.isFinite(product.loosePricePerUnit) || product.loosePricePerUnit < 0)) errors.push("Loose price must be zero or greater");
  if (product.allowLooseSale && product.loosePricingMethod === "TIERS" && (!product.priceTiers.length || product.priceTiers.some((tier) => !(tier.quantity > 0) || !(tier.price >= 0)))) errors.push("Add at least one valid quantity price tier");
  if (product.allowLooseSale && product.loosePricingMethod === LOOSE_PRICING_METHODS.COUNT_BASED) {
    if (!LOOSE_UNITS.includes(product.looseUnit)) errors.push("Select a valid loose selling unit");
    if (!(product.loosePricePerUnit > 0)) errors.push("Loose price must be greater than zero for count-based sales");
    if (!Object.values(LOOSE_CONVERSION_TYPES).includes(product.looseConversionType)) errors.push("Select how package quantity is converted");
    if (product.looseConversionType === LOOSE_CONVERSION_TYPES.FIXED && (!Number.isInteger(product.unitsPerPackage) || product.unitsPerPackage <= 0)) errors.push("Units per package must be a positive whole number");
    if (!Number.isInteger(product.openingQuantity) || product.openingQuantity < 0) errors.push("Opening loose quantity must be a non-negative whole number");
  }
  if (!Number.isFinite(product.reorderLevel) || product.reorderLevel < 0) errors.push("Reorder level must be zero or greater");
  if (!Number.isInteger(product.openingPackages) || product.openingPackages < 0) errors.push("Opening packages must be a non-negative whole number");
  if (!Number.isInteger(product.openingStockPacks) || product.openingStockPacks < 0) errors.push("Opening stock packs must be a non-negative whole number");
  if (!Number.isInteger(product.openingIndividualPackages) || product.openingIndividualPackages < 0 || (product.unitsPerStockPack > 1 && product.openingIndividualPackages >= product.unitsPerStockPack)) errors.push("Opening individual packages must be a valid remainder smaller than one stock pack");
  if (product.loosePricingMethod !== LOOSE_PRICING_METHODS.COUNT_BASED && (!Number.isFinite(product.openingQuantity) || product.openingQuantity < 0 || (product.packageSize > 0 && product.openingQuantity >= product.packageSize))) errors.push(`Opening quantity must be between 0 and less than ${product.packageSize} ${product.baseUnit}`);
  if ([product.allowPackageSale, product.allowLooseSale, product.allowMixture, product.visibleInSales, product.active, product.batchTracking,product.taxable,product.useDefaultGstRate,product.gstExempt,product.wholesaleEnabled,product.allowWholesaleLooseSale,product.freeSchemeEnabled].includes(null)) errors.push("Boolean values must be true or false");
  if (!product.allowPackageSale && !product.allowLooseSale) errors.push("Enable package sale or loose sale");
  errors.push(...validateWholesaleProduct(product));
  if (product.batchTracking && !product.expiryDate) errors.push("Expiry date is required when batch tracking is enabled");
  if (product.manufacturingDate && Number.isNaN(product.manufacturingDate.getTime())) errors.push("Manufacturing date is invalid");
  if (product.expiryDate && Number.isNaN(product.expiryDate.getTime())) errors.push("Expiry date is invalid");
  if (product.manufacturingDate && product.expiryDate && product.expiryDate <= product.manufacturingDate) errors.push("Expiry date must be after manufacturing date");
  return errors;
}
import { normalizeWholesaleTiers, validateWholesaleProduct } from "./wholesale.js";
