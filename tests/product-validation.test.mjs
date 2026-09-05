import test from "node:test";
import assert from "node:assert/strict";
import { calculateLooseUnitPrice, normalizeProductInput, parseBoolean, validateProductInput } from "../src/lib/product-validation.js";

test("normalizes product CSV values", () => {
  const product = normalizeProductInput({ name: "  Oil  ", sku: " oil-1 ", categoryId: "category", baseUnit: "ml", packageType: "Bottle", packageSize: "200", packageSellingPrice: "180", allowPackageSale: "true", allowLooseSale: "false", openingPackages: "5" });
  assert.equal(product.name, "Oil");
  assert.equal(product.sku, "OIL-1");
  assert.equal(product.packageSize, 200);
  assert.equal(product.loosePricePerUnit, 0.9);
  assert.equal(product.openingPackages, 5);
  assert.deepEqual(validateProductInput(product), []);
});

test("opening boxes and individual packages become sealed package stock", () => {
  const product = normalizeProductInput({
    name: "Herbal Tonic",
    sku: "TONIC-156",
    categoryId: "category",
    baseUnit: "ml",
    packageType: "Bottle",
    packageSize: 156,
    packageSellingPrice: 180,
    stockPackType: "Box",
    unitsPerStockPack: 12,
    openingStockPacks: 5,
    openingIndividualPackages: 3,
  });
  assert.equal(product.openingPackages, 63);
  assert.equal(product.packageSize, 156);
  assert.equal(product.unitsPerStockPack, 12);
});

test("calculates the loose-unit price from package price and size", () => {
  assert.equal(calculateLooseUnitPrice(200, 200), 1);
  assert.equal(calculateLooseUnitPrice(100, 120), 0.833333);
  assert.equal(calculateLooseUnitPrice(100, 0), 0);
});

test("accepts common CSV boolean representations", () => {
  assert.equal(parseBoolean("yes"), true);
  assert.equal(parseBoolean("0"), false);
  assert.equal(parseBoolean("maybe"), null);
});

test("normalizes current Add Product fields from the CSV template", () => {
  const product = normalizeProductInput({
    name: "Herbal Oil",
    sku: "OIL-WHOLESALE",
    categoryId: "category",
    hsn_code: "30049011",
    taxable: "true",
    use_default_gst_rate: "false",
    gst_rate: "5",
    gst_price_mode: "inclusive",
    base_unit: "ml",
    package_unit: "ml",
    package_type: "Bottle",
    package_size: "200",
    package_price: "180",
    allow_loose_sale: "true",
    loose_pricing_method: "TIERS",
    price_tiers: "50:48|100:90",
    wholesale_enabled: "true",
    wholesale_price: "160",
    wholesale_min_qty: "6",
    wholesale_unit: "Carton",
    units_per_wholesale_pack: "12",
    wholesale_price_tiers: "12:155|24:150",
    free_scheme_enabled: "true",
    free_scheme_type: "SAME_PRODUCT",
    free_scheme_buy_qty: "10",
    free_scheme_free_qty: "1",
    batch_tracking: "false",
  });
  assert.equal(product.hsnCode, "30049011");
  assert.equal(product.useDefaultGstRate, false);
  assert.equal(product.gstRate, 5);
  assert.deepEqual(product.priceTiers, [
    { quantity: 50, price: 48 },
    { quantity: 100, price: 90 },
  ]);
  assert.deepEqual(product.wholesalePriceTiers, [
    { quantity: 12, price: 155 },
    { quantity: 24, price: 150 },
  ]);
  assert.equal(product.freeSchemeEnabled, true);
  assert.deepEqual(validateProductInput(product), []);
});

test("normalizes an unselected free-scheme product to null", () => {
  const base = {
    name: "Herbal Oil",
    sku: "OIL-SCHEME",
    categoryId: "category",
    baseUnit: "ml",
    packageType: "Bottle",
    packageSize: 200,
    packageSellingPrice: 180,
  };

  assert.equal(
    normalizeProductInput({ ...base, freeSchemeFreeProduct: "" })
      .freeSchemeFreeProduct,
    null,
  );
  assert.equal(
    normalizeProductInput({ ...base, free_scheme_free_product: "  " })
      .freeSchemeFreeProduct,
    null,
  );
  assert.equal(
    normalizeProductInput({
      ...base,
      freeSchemeFreeProduct: "507f1f77bcf86cd799439011",
    }).freeSchemeFreeProduct,
    "507f1f77bcf86cd799439011",
  );
});

test("normalizes barcode metadata and rejects accidental spaces", () => {
  const base = { name: "Oil", sku: "OIL-BARCODE", categoryId: "category", baseUnit: "ml", packageType: "Bottle", packageSize: 200, packageSellingPrice: 180 };
  const normalized = normalizeProductInput({ ...base, barcode: " 8901234567890 " });
  assert.equal(normalized.barcode, "8901234567890");
  assert.equal(normalized.barcodeType, "EAN13");
  assert.deepEqual(validateProductInput(normalized), []);
  const invalid = normalizeProductInput({ ...base, barcode: "8901 2345" });
  assert.match(validateProductInput(invalid).join(" "), /must not contain spaces/);
});

test("stores a non-taxable product with zero GST and a product GST price mode", () => {
  const product = normalizeProductInput({ name: "Soap", sku: "SOAP-1", categoryId: "category", baseUnit: "pcs", packageType: "Box", packageSize: 12, packageSellingPrice: 120, taxable: false, gstRate: 18, gstPriceMode: "exclusive" });
  assert.equal(product.taxable, false);
  assert.equal(product.gstRate, 0);
  assert.equal(product.gstExempt, true);
  assert.equal(product.gstPriceMode, "EXCLUSIVE");
  assert.deepEqual(validateProductInput(product), []);
});

test("rejects missing identity and invalid stock values", () => {
  const product = normalizeProductInput({ baseUnit: "litre", packageType: "Bottle", packageSize: 0, packageSellingPrice: -1, openingPackages: 1.5, allowPackageSale: false, allowLooseSale: false });
  const errors = validateProductInput(product).join(" | ");
  assert.match(errors, /Name is required/);
  assert.match(errors, /SKU is required/);
  assert.match(errors, /Category is required/);
  assert.match(errors, /Base unit is invalid/);
  assert.match(errors, /Opening packages must be a non-negative whole number/);
  assert.match(errors, /Enable package sale or loose sale/);
});

test("normalizes opening loose stock and explicit custom pricing", () => {
  const product = normalizeProductInput({ name: "Tablet A", sku: "tab-1", categoryId: "category", base_unit: "tablets", package_type: "Strip", package_size: "10", package_price: "100", allow_loose_sale: "yes", loose_pricing_method: "custom", loose_price: "11", opening_packages: "12", opening_quantity: "7" });
  assert.equal(product.loosePricingMethod, "CUSTOM");
  assert.equal(product.loosePricePerUnit, 11);
  assert.equal(product.openingPackages * product.packageSize + product.openingQuantity, 127);
  assert.deepEqual(validateProductInput(product), []);
});

test("requires expiry after manufacturing date for tracked batches", () => {
  const product = normalizeProductInput({ name: "Oil", sku: "OIL-1", categoryId: "category", baseUnit: "ml", packageType: "Bottle", packageSize: 200, packageSellingPrice: 180, batchTracking: true, manufacturingDate: "2026-08-20", expiryDate: "2026-08-19" });
  assert.match(validateProductInput(product).join(" | "), /Expiry date must be after manufacturing date/);
});

test("validates unknown count-on-open jars without kg conversion",()=>{const product=normalizeProductInput({name:"Ayurvedic Tablet",sku:"TAB-JAR",categoryId:"category",baseUnit:"kg",packageType:"Jar",packageSize:1,packageSellingPrice:900,allowLooseSale:true,loosePricingMethod:"count_based",looseUnit:"tablet",loosePricePerUnit:3,looseConversionType:"count_on_open",openingPackages:10,openingQuantity:0});assert.equal(product.unitsPerPackage,null);assert.equal(product.packageUnit,"kg");assert.deepEqual(validateProductInput(product),[]);});

test("fixed count requires positive whole units per package",()=>{const product=normalizeProductInput({name:"Tablet Bottle",sku:"TAB-BTL",categoryId:"category",baseUnit:"tablets",packageType:"Bottle",packageSize:100,allowLooseSale:true,loosePricingMethod:"count_based",looseUnit:"tablet",loosePricePerUnit:3,looseConversionType:"fixed",unitsPerPackage:3.5});assert.match(validateProductInput(product).join(" | "),/positive whole number/);});
