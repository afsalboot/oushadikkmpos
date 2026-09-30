import { REQUIRED_PRODUCT_IMPORT_FIELDS } from "./product-import-fields.js";

export const PRODUCT_SAMPLE_FIELDS = [
  ...REQUIRED_PRODUCT_IMPORT_FIELDS,
  "full_stock", "brand_name",
];

export function productImportSampleRows(category = "REPLACE_WITH_EXISTING_CATEGORY") {
  return [
    ["Sample Herbal Oil", "ml", "Bottle", 200, 180, 27],
    ["Sample Herbal Powder", "g", "Packet", 100, 85, 15],
    ["Sample Herbal Syrup", "ml", "Bottle", 100, 120, 30],
  ].map(([name, base_unit, package_type, package_size, package_price, full_stock]) => ({
    name, category, base_unit, package_type, package_size, package_price, full_stock, brand_name: "Sample Ayurveda",
  }));
}

