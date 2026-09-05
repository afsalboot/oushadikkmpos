import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import {
  InventoryBatch,
  Product,
  Purchase,
  Sale,
  StockTransaction,
} from "@/models";
import { WHOLESALE_UNITS, validateWholesaleProduct } from "@/lib/wholesale";
import {
  MAX_BULK_PRODUCTS,
  bulkProductSectionsTouched,
  classifyBulkDeletion,
  missingWholesaleDefaults,
} from "@/lib/product-bulk";

function productIds(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) => String(value || ""))
        .filter((value) => mongoose.isValidObjectId(value)),
    ),
  ].slice(0, MAX_BULK_PRODUCTS);
}

export async function PATCH(request) {
  let session;
  try {
    await requireSession("products.edit");
    await connectDb();
    const body = await request.json();
    const ids = productIds(body.ids);
    if (!ids.length) return fail("Select at least one valid product");
    if ((body.ids || []).length > MAX_BULK_PRODUCTS)
      return fail(`Bulk updates are limited to ${MAX_BULK_PRODUCTS} products`);

    const changes = body.changes || {};
    const wholesaleFields = new Set([
      "wholesaleEnabled",
      "wholesalePricingMethod",
      "wholesalePrice",
      "wholesaleDiscountPercent",
      "wholesaleMinQty",
      "wholesaleSaleUnit",
      "wholesalePackEnabled",
      "unitsPerWholesalePack",
      "wholesalePackPrice",
      "allowWholesaleLooseSale",
      "wholesaleLoosePrice",
      "freeSchemeEnabled",
    ]);
    if (Object.keys(changes).some((field) => !wholesaleFields.has(field)))
      return fail("Mass update supports wholesale settings only");
    if (
      Object.values(changes).some(
        (value) => typeof value === "string" && !value.trim(),
      )
    )
      return fail("Blank values must be omitted from a mass update");
    const { wholesale: wholesaleTouched } =
      bulkProductSectionsTouched(changes);
    const fixed = {};
    if (typeof changes.wholesaleEnabled === "boolean") {
      fixed.wholesaleEnabled = changes.wholesaleEnabled;
    }
    if (changes.wholesalePricingMethod !== undefined) {
      if (!["FIXED", "DISCOUNT_FROM_RETAIL"].includes(changes.wholesalePricingMethod))
        return fail("Wholesale pricing method is invalid");
      fixed.wholesalePricingMethod = changes.wholesalePricingMethod;
    }
    for (const field of [
      "wholesalePrice",
      "wholesalePackPrice",
      "wholesaleLoosePrice",
    ]) {
      if (changes[field] === undefined) continue;
      const value = Number(changes[field]);
      if (!Number.isFinite(value) || value < 0)
        return fail(`${field} must be zero or greater`);
      fixed[field] = value;
    }
    if (changes.wholesaleDiscountPercent !== undefined) {
      const value = Number(changes.wholesaleDiscountPercent);
      if (!Number.isFinite(value) || value < 0 || value > 100)
        return fail("Wholesale discount must be between 0% and 100%");
      fixed.wholesaleDiscountPercent = value;
    }
    if (changes.wholesaleMinQty !== undefined) {
      const value = Number(changes.wholesaleMinQty);
      if (!Number.isInteger(value) || value <= 0)
        return fail(
          "Wholesale minimum quantity must be a positive whole number",
        );
      fixed.wholesaleMinQty = value;
    }
    if (changes.wholesaleUnit !== undefined) {
      if (
        ![
          "Piece",
          "Tablet",
          "Bottle",
          "Packet",
          "Jar",
          "Box",
          "Carton",
        ].includes(changes.wholesaleUnit)
      )
        return fail("Wholesale pack is invalid");
      fixed.wholesaleUnit = changes.wholesaleUnit;
    }
    if (changes.wholesaleSaleUnit !== undefined) {
      if (!["PACKAGE", "WHOLESALE_PACK", "LOOSE_UNIT"].includes(changes.wholesaleSaleUnit))
        return fail("Wholesale sale unit is invalid");
      fixed.wholesaleSaleUnit = changes.wholesaleSaleUnit;
    }
    if (typeof changes.wholesalePackEnabled === "boolean")
      fixed.wholesalePackEnabled = changes.wholesalePackEnabled;
    if (changes.unitsPerWholesalePack !== undefined) {
      const value = Number(changes.unitsPerWholesalePack);
      if (!Number.isInteger(value) || value <= 0)
        return fail(
          "Packages per wholesale pack must be a positive whole number",
        );
      fixed.unitsPerWholesalePack = value;
    }
    if (typeof changes.allowWholesaleLooseSale === "boolean")
      fixed.allowWholesaleLooseSale = changes.allowWholesaleLooseSale;
    if (typeof changes.freeSchemeEnabled === "boolean")
      fixed.freeSchemeEnabled = changes.freeSchemeEnabled;
    if (changes.freeSchemeType !== undefined) {
      if (
        !["SAME_PRODUCT", "DIFFERENT_PRODUCT"].includes(changes.freeSchemeType)
      )
        return fail("Free scheme type is invalid");
      fixed.freeSchemeType = changes.freeSchemeType;
      if (changes.freeSchemeType === "SAME_PRODUCT")
        fixed.freeSchemeFreeProduct = null;
    }
    for (const field of ["freeSchemeBuyQty", "freeSchemeFreeQty"]) {
      if (changes[field] === undefined) continue;
      const value = Number(changes[field]);
      if (!Number.isInteger(value) || value <= 0)
        return fail("Free scheme quantities must be positive whole numbers");
      fixed[field] = value;
    }

    if (!Object.keys(fixed).length)
      return fail("Choose at least one wholesale field to update");

    const products = await Product.find({ _id: { $in: ids } }).lean();
    if (!products.length) return fail("No selected products were found", 404);
    const operations = products.map((product) => {
      const update = { ...fixed };
      if (update.wholesalePackEnabled === true) {
        if (!product.wholesaleUnit || product.wholesaleUnit === product.packageType)
          update.wholesaleUnit = product.stockPackType || "Box";
        if (
          changes.unitsPerWholesalePack === undefined &&
          Number(product.unitsPerWholesalePack || 1) <= 1 &&
          Number(product.unitsPerStockPack || 1) > 1
        )
          update.unitsPerWholesalePack = Number(product.unitsPerStockPack);
      }
      if (wholesaleTouched) {
        const candidate = { ...product, ...update };
        Object.assign(
          update,
          missingWholesaleDefaults(candidate, WHOLESALE_UNITS),
        );
      }
      return {
        updateOne: { filter: { _id: product._id }, update: { $set: update } },
      };
    });

    const invalid = operations.flatMap((operation, index) => {
      const candidate = {
        ...products[index],
        ...operation.updateOne.update.$set,
      };
      const errors = wholesaleTouched
        ? validateWholesaleProduct(candidate)
        : [];
      if (
        changes.freeSchemeEnabled === true &&
        !candidate.wholesaleEnabled
      )
        errors.push("Enable wholesale before enabling a free scheme");
      return errors.length ? [`${candidate.name}: ${errors.join("; ")}`] : [];
    });
    if (invalid.length) return fail(invalid.slice(0, 5).join(". "));

    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await Product.bulkWrite(operations, { session });
    });
    return ok({ matched: products.length, updated: operations.length });
  } catch (error) {
    return apiError(error);
  } finally {
    if (session) await session.endSession();
  }
}

export async function DELETE(request) {
  let session;
  try {
    await requireSession("ADMIN");
    await connectDb();
    const body = await request.json();
    const ids = productIds(body.ids);
    if (!ids.length) return fail("Select at least one valid product");
    if ((body.ids || []).length > MAX_BULK_PRODUCTS)
      return fail(`Bulk deletion is limited to ${MAX_BULK_PRODUCTS} products`);
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const products = await Product.find({ _id: { $in: objectIds } })
      .select("name")
      .lean();
    if (!products.length) return fail("No selected products were found", 404);

    const [saleIds, mixSaleIds, purchaseIds, transactionIds, stockedIds] =
      await Promise.all([
        Sale.distinct("items.productId", {
          "items.productId": { $in: objectIds },
        }),
        Sale.distinct("items.ingredients.productId", {
          "items.ingredients.productId": { $in: objectIds },
        }),
        Purchase.distinct("items.productId", {
          "items.productId": { $in: objectIds },
        }),
        StockTransaction.distinct("productId", {
          productId: { $in: objectIds },
        }),
        InventoryBatch.distinct("productId", {
          productId: { $in: objectIds },
          $or: [{ sealedPackages: { $gt: 0 } }, { openQuantity: { $gt: 0 } }],
        }),
      ]);
    const preserve = new Set(
      [
        ...saleIds,
        ...mixSaleIds,
        ...purchaseIds,
        ...transactionIds,
        ...stockedIds,
      ].map(String),
    );
    const { deactivateIds, deleteIds } = classifyBulkDeletion(
      products,
      preserve,
    );

    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      if (deactivateIds.length)
        await Product.updateMany(
          { _id: { $in: deactivateIds } },
          { $set: { active: false, visibleInSales: false } },
          { session },
        );
      if (deleteIds.length) {
        await InventoryBatch.deleteMany(
          { productId: { $in: deleteIds } },
          { session },
        );
        await Product.deleteMany({ _id: { $in: deleteIds } }, { session });
      }
    });
    return ok({
      selected: products.length,
      deleted: deleteIds.length,
      deactivated: deactivateIds.length,
      missing: ids.length - products.length,
    });
  } catch (error) {
    return apiError(error);
  } finally {
    if (session) await session.endSession();
  }
}
