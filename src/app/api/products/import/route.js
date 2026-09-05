import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import { Category, Product, Supplier } from "@/models";
import { normalizeProductInput, validateProductInput } from "@/lib/product-validation";
import { createProduct } from "@/services/product.service";

const slugify = (value) => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function POST(request) {
  try {
    const auth = await requireSession("products.import");
    await connectDb();
    const { rows, createMissingCategories = false, duplicateMode = "SKIP" } = await request.json();
    if (!Array.isArray(rows) || !rows.length) return fail("Import contains no rows");
    if (rows.length > 1000) return fail("Import is limited to 1,000 rows at a time");

    const categories = await Category.find({ active: true }).lean();
    const categoryMap = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category]));
    const suppliers = await Supplier.find({ active: { $ne: false } }).select("name").lean();
    const supplierMap = new Map(suppliers.map((supplier) => [supplier.name.trim().toLowerCase(), supplier]));
    const existingProducts = await Product.find({}, { sku: 1, barcode: 1 }).lean();
    const existingSkus = new Set(existingProducts.map((product) => product.sku?.toUpperCase()).filter(Boolean));
    const existingBarcodes = new Set(existingProducts.map((product) => product.barcode).filter(Boolean));
    const usedSkus = new Set(existingProducts.map((product) => product.sku?.toUpperCase()).filter(Boolean));
    const usedBarcodes = new Set(existingProducts.map((product) => product.barcode).filter(Boolean));
    const results = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const rowNumber = index + 2;
      const categoryName = String(row.category || "").trim();
      let category = categoryMap.get(categoryName.toLowerCase());
      const rowErrors = [];

      if (!categoryName) rowErrors.push("Category is required");
      if (!category && categoryName && createMissingCategories) {
        try {
          category = await Category.create({ name: categoryName, slug: slugify(categoryName), isSystem: false, active: true });
          categoryMap.set(categoryName.toLowerCase(), category);
        } catch (error) {
          if (error?.code === 11000) {
            category = await Category.findOne({ name: { $regex: `^${categoryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
          } else {
            rowErrors.push("Category could not be created");
          }
        }
      }
      if (!category && categoryName) rowErrors.push(`Unknown category: ${categoryName}`);
      const supplierName = String(row.supplier || "").trim();
      const supplier = supplierName ? supplierMap.get(supplierName.toLowerCase()) : null;
      if (supplierName && !supplier) rowErrors.push(`Unknown supplier: ${supplierName}`);

      const normalized = normalizeProductInput({
        ...row,
        categoryId: category?._id,
        supplierId: supplier?._id,
        packageSellingPrice: row.packageSellingPrice ?? row.packagePrice,
      });
      rowErrors.push(...validateProductInput(normalized));
      const existingDuplicate = existingSkus.has(normalized.sku) || (normalized.barcode && existingBarcodes.has(normalized.barcode));
      if (existingDuplicate && duplicateMode === "SKIP") {
        results.push({ row: rowNumber, name: normalized.name || "Unnamed product", status: "SKIPPED", errors: ["Existing SKU or barcode skipped"] });
        continue;
      }
      if (normalized.sku && usedSkus.has(normalized.sku)) rowErrors.push("SKU already exists or is duplicated in this file");
      if (normalized.barcode && usedBarcodes.has(normalized.barcode)) rowErrors.push("Barcode already exists or is duplicated in this file");

      if (rowErrors.length) {
        results.push({ row: rowNumber, name: normalized.name || "Unnamed product", status: "ERROR", errors: [...new Set(rowErrors)] });
        continue;
      }

      let product;
      let dbSession;
      try {
        dbSession = await mongoose.startSession();
        await dbSession.withTransaction(async () => {
          product = await createProduct({ ...row, ...normalized, categoryId: category._id }, new mongoose.Types.ObjectId(auth.sub), dbSession);
        });
        usedSkus.add(product.sku);
        if (product.barcode) usedBarcodes.add(product.barcode);
        results.push({ row: rowNumber, name: product.name, status: "IMPORTED" });
      } catch (error) {
        results.push({ row: rowNumber, name: normalized.name, status: "ERROR", errors: [error?.code === 11000 ? "SKU or barcode already exists" : error.message] });
      } finally {
        if (dbSession) await dbSession.endSession();
      }
    }

    return ok({ imported: results.filter((result) => result.status === "IMPORTED").length, skipped: results.filter((result) => result.status === "SKIPPED").length, failed: results.filter((result) => result.status === "ERROR").length, results });
  } catch (error) {
    return apiError(error);
  }
}
