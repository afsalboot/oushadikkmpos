export const PRODUCT_IMPORT_FIELDS = [
  "name", "sku", "barcode", "barcode_type", "manufacturer", "category",
  "hsn_code", "taxable", "use_default_gst_rate", "gst_rate", "gst_price_mode",
  "base_unit", "package_unit", "package_type", "package_size", "package_price",
  "stock_pack_type", "units_per_stock_pack", "allow_package_sale", "allow_loose_sale",
  "loose_pricing_method", "loose_price", "loose_unit", "loose_conversion_type", "units_per_package", "price_tiers", "allow_mix",
  "wholesale_enabled", "wholesale_pricing_method", "wholesale_discount_percent", "wholesale_price", "wholesale_min_qty",
  "wholesale_sale_unit", "wholesale_unit", "wholesale_pack_enabled", "units_per_wholesale_pack", "wholesale_pack_price", "wholesale_price_tiers",
  "allow_wholesale_loose_sale", "wholesale_loose_price", "free_scheme_enabled", "free_scheme_type", "free_scheme_buy_qty", "free_scheme_free_qty", "free_scheme_free_product",
  "reorder_level", "opening_stock_packs", "opening_individual_packages", "opening_packages", "opening_quantity",
  "batch_tracking", "expiry_tracking", "batch_number", "manufacturing_date", "expiry_date", "purchase_price", "supplier", "pos_visible", "status",
];
export const REQUIRED_PRODUCT_IMPORT_FIELDS = ["name", "category", "base_unit", "package_type", "package_size", "package_price"];
export const PRODUCT_TEMPLATE_FIELDS = PRODUCT_IMPORT_FIELDS.filter(field => field !== "opening_packages");
export const productCategoryKey = value => String(value ?? "").trim().toLowerCase();
export const cleanProductImportRow = row => Object.fromEntries(Object.entries(row || {}).filter(([, value]) => value !== undefined && value !== null && !(typeof value === "string" && !value.trim())));
export const productImportAliases = Object.fromEntries(PRODUCT_IMPORT_FIELDS.flatMap(field => [
  [field, field], [field.replaceAll("_", " "), field], [field.replaceAll("_", ""), field],
]));
Object.assign(productImportAliases, { packagesellingprice: "package_price", "package selling price": "package_price", loosepriceperunit: "loose_price", allowmixture: "allow_mix", visibleinsales: "pos_visible" });
Object.assign(productImportAliases, { full_stock: "opening_packages", "full stock": "opening_packages" });
