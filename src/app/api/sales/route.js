import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, fail, apiError } from "@/lib/api";
import {
  Customer,
  DocumentCounter,
  InventoryBatch,
  Product,
  Sale,
  Settings,
  StockTransaction,
  AuditLog,
  FiscalGuard,
} from "@/models";
import {
  deductCountBasedLooseStock,
  deductLooseStock,
  deductPackageStock,
  getLooseUnit,
  isCountBasedProduct,
} from "@/services/inventory.service";
import {
  nextInvoiceNumber,
} from "@/services/document-number.service";
import { createCustomer } from "@/services/customer.service";
import {
  buildCustomerSnapshot,
  isWholesaleCustomer,
  normalizeDoctorName,
  prepareWholesaleCredit,
} from "@/lib/sale-customer";
import { calculateSalePricing } from "@/services/pricing.service";
import { buildWholesaleLine, wholesaleLooseRate } from "@/lib/wholesale";
import {assertRegistration,resolveSupply,validateFiscalLines,registrationStatus,financialYear,GST_RULE_VERSION} from "@/lib/gst-compliance";
import {requestHash,assertRetryMatches} from "@/lib/fiscal-integrity";
import {money,multiplyMoney} from "@/lib/money";

const amount = money;
const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function consumeStock(
  product,
  saleMode,
  requestedQuantity,
  dbSession,
  stockRows,
  transactionType = saleMode === "PACKAGE" ? "PACKAGE_SALE" : "LOOSE_SALE",
  settings,
  openPackageCounts = [],
) {
  let remaining = Number(requestedQuantity);
  if (!(remaining > 0))
    throw new Error(`Enter a valid quantity for ${product.name}`);
  const batchFilter = {
    productId: product._id,
    $or: [{ sealedPackages: { $gt: 0 } }, { openQuantity: { $gt: 0 } }],
  };
  if (settings?.batchExpiry?.blockExpiredSales)
    batchFilter.$and = [
      {
        $or: [
          { expiryDate: { $exists: false } },
          { expiryDate: null },
          { expiryDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        ],
      },
    ];
  const batches = await InventoryBatch.find(batchFilter)
    .sort({ expiryDate: 1, createdAt: 1 })
    .session(dbSession);
  let openCountCursor = 0;
  for (const batch of batches) {
    if (remaining <= 0) break;
    if (saleMode === "PACKAGE") {
      const used = Math.min(remaining, Number(batch.sealedPackages));
      if (!used) continue;
      const next = deductPackageStock(batch, used);
      batch.set(next);
      await batch.save({ session: dbSession });
      stockRows.push({
        productId: product._id,
        batchId: batch._id,
        type: transactionType,
        baseQuantity: -(used * Number(batch.packageSize)),
        packageQuantity: -used,
        unit: product.baseUnit,
        direction: "OUT",
      });
      remaining -= used;
    } else if (isCountBasedProduct(product)) {
      const looseUnit = getLooseUnit(product),
        availableOpen = Number(batch.openQuantity || 0),
        sealed = Number(batch.sealedPackages || 0);
      const disclosedCounts =
        product.looseConversionType === "count_on_open"
          ? openPackageCounts.slice(openCountCursor, openCountCursor + sealed)
          : [];
      const convertible =
        product.looseConversionType === "fixed"
          ? sealed * Number(product.unitsPerPackage || 0)
          : disclosedCounts.reduce((sum, count) => sum + Number(count || 0), 0);
      const used = Math.min(remaining, availableOpen + convertible);
      if (!used) continue;
      const result = deductCountBasedLooseStock(
        batch,
        used,
        product,
        disclosedCounts,
      );
      batch.set({
        sealedPackages: result.sealedPackages,
        openQuantity: result.openQuantity,
      });
      await batch.save({ session: dbSession });
      for (const count of result.openings) {
        stockRows.push({
          productId: product._id,
          batchId: batch._id,
          type: "PACKAGE_OPENED",
          baseQuantity: count,
          packageQuantity: -1,
          looseQuantity: count,
          looseUnit,
          unit: looseUnit,
          direction: "IN",
          source: "POS_SALE",
          reason: `Opened 1 ${product.packageType} → ${count} ${looseUnit}${count === 1 ? "" : "s"}`,
        });
      }
      openCountCursor += result.openings.length;
      stockRows.push({
        productId: product._id,
        batchId: batch._id,
        type: transactionType,
        baseQuantity: -used,
        looseQuantity: -used,
        looseUnit,
        unit: looseUnit,
        direction: "OUT",
      });
      remaining -= used;
    } else {
      const available =
        Number(batch.sealedPackages) * Number(batch.packageSize) +
        Number(batch.openQuantity);
      const used = Math.min(remaining, available);
      if (!used) continue;
      const beforePackages = Number(batch.sealedPackages);
      const next = deductLooseStock(batch, used);
      batch.set(next);
      await batch.save({ session: dbSession });
      stockRows.push({
        productId: product._id,
        batchId: batch._id,
        type: transactionType,
        baseQuantity: -used,
        packageQuantity: next.sealedPackages - beforePackages,
        unit: product.baseUnit,
        direction: "OUT",
      });
      remaining -= used;
    }
  }
  if (remaining > 0.000001) {
    if (
      saleMode === "LOOSE" &&
      isCountBasedProduct(product) &&
      product.looseConversionType === "count_on_open"
    )
      throw new Error(
        `Enter the number of ${getLooseUnit(product)}s in another ${product.packageType}.`,
      );
    throw new Error(
      `Insufficient ${saleMode === "PACKAGE" ? "sealed package " : ""}stock for ${product.name}`,
    );
  }
}

export async function GET(request) {
  try {
    await requireSession("sales.view");
    await connectDb();
    const parameters = new URL(request.url).searchParams;
    const customerId = parameters.get("customerId");
    const filter = mongoose.isValidObjectId(customerId)
      ? { customerId: new mongoose.Types.ObjectId(customerId) }
      : {};
    if (parameters.get("view") === "recent") {
      const page = Math.max(
        1,
        Number.parseInt(parameters.get("page") || "1", 10),
      );
      const limit = Math.min(
        50,
        Math.max(5, Number.parseInt(parameters.get("limit") || "20", 10)),
      );
      const search = parameters.get("q")?.trim();
      const paymentMethod = parameters.get("paymentMethod")?.trim();
      const saleMode = parameters.get("saleMode")?.trim();
      const dateFrom = parameters.get("dateFrom");
      const dateTo = parameters.get("dateTo");
      if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [
          { invoiceNumber: pattern },
          { "customerSnapshot.name": pattern },
          { "customerSnapshot.phone": pattern },
          { "customerSnapshot.doctorName": pattern },
          { "cashierSnapshot.name": pattern },
        ];
      }
      if (paymentMethod) filter["payments.method"] = paymentMethod;
      if (["PACKAGE", "LOOSE", "MIX", "WHOLESALE"].includes(saleMode))
        filter["items.saleMode"] = saleMode;
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(`${dateFrom}T00:00:00`);
        if (dateTo) filter.createdAt.$lte = new Date(`${dateTo}T23:59:59.999`);
      }
      const [sales, total, totals] = await Promise.all([
        Sale.find(filter)
          .populate("actorId", "name role")
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Sale.countDocuments(filter),
        Sale.aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$total" },
              items: { $sum: { $size: { $ifNull: ["$items", []] } } },
            },
          },
        ]),
      ]);
      const revenue = amount(totals[0]?.revenue || 0);
      return ok({
        sales,
        summary: {
          invoices: total,
          revenue,
          averageBill: total ? amount(revenue / total) : 0,
          items: totals[0]?.items || 0,
        },
        pagination: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    }
    return ok(
      await Sale.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request) {
  let dbSession;
  try {
    const session = await requireSession("sales.create");
    await connectDb();
    const body = await request.json();
    await Promise.all([Sale.init(),FiscalGuard.init()]);
    const requestKey=String(request.headers.get('Idempotency-Key')||'');
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestKey))return fail('A checkout retry key is required. Refresh checkout and try again.',422);
    const hash=requestHash(body);
    const previous=await Sale.findOne({requestKey}).lean();
    if(previous)return ok(assertRetryMatches(previous,hash,session.sub));
    const saleType = body.saleType === "WHOLESALE" ? "WHOLESALE" : "SALE";
    if (!Array.isArray(body.items) || !body.items.length)
      return fail("Add at least one item to the cart");
    if (String(body.doctorName || "").trim().length > 120)
      return fail("Doctor name cannot exceed 120 characters");
    const doctorName = normalizeDoctorName(body.doctorName);
    const customerType = ["WALK_IN", "EXISTING", "NEW"].includes(
      body.customerType,
    )
      ? body.customerType
      : body.customerId
        ? "EXISTING"
        : "NEW";
    dbSession = await mongoose.startSession();
    let completedSale;
    await dbSession.withTransaction(async () => {
      await FiscalGuard.findOneAndUpdate({key:'issuance'},{$inc:{revision:1}},{upsert:true,session:dbSession});
      const retried=await Sale.findOne({requestKey}).session(dbSession).lean();
      if(retried){completedSale=assertRetryMatches(retried,hash,session.sub);return;}
      let customer = null;
      if (customerType === "EXISTING") {
        if (!mongoose.isValidObjectId(body.customerId))
          throw new Error("Invalid customer");
        customer = await Customer.findOne({
          _id: body.customerId,
          active: { $ne: false },
        }).session(dbSession);
        if (!customer) throw new Error("Customer not found");
      } else if (customerType === "NEW")
        customer = await createCustomer(body.customer, dbSession);
      if (saleType === "WHOLESALE" && !customer)
        throw Object.assign(
          new Error("Select a wholesale customer before checkout"),
          { status: 422 },
        );
      if (saleType === "WHOLESALE" && !isWholesaleCustomer(customer))
        throw Object.assign(
          new Error(
            "The selected customer is not configured for wholesale sales. Select a wholesale customer or change this customer to Wholesale in Customers.",
          ),
          { status: 422 },
        );
      const productIds = new Set();
      for (const item of body.items) {
        if (item.kind === "MIX")
          for (const ingredient of item.ingredients || [])
            productIds.add(String(ingredient.productId));
        else productIds.add(String(item.productId));
      }
      if ([...productIds].some((id) => !mongoose.isValidObjectId(id)))
        throw new Error("The cart contains an invalid product");
      const products = await Product.find({
        _id: { $in: [...productIds] },
        active: true,
      })
        .session(dbSession)
        .lean();
      const productById = new Map(
        products.map((product) => [String(product._id), product]),
      );
      if (products.length !== productIds.size)
        throw new Error("A product in the cart is no longer available");
      const settings = await Settings.findOne({ key: "global" }).session(
        dbSession,
      );
      assertRegistration(settings);
      const supplyContext=resolveSupply(settings,customer,body.supplyContext||{});
      const saleItems = [];
      const stockRows = [];
      for (const item of body.items) {
        if (item.kind === "MIX") {
          if (saleType === "WHOLESALE")
            throw new Error(
              "Custom Mix items cannot be checked out as wholesale",
            );
          if (settings?.customMix?.enabled === false)
            throw new Error("Custom Mix is disabled in Settings");
          if (!Array.isArray(item.ingredients) || !item.ingredients.length)
            throw new Error("A custom mix needs at least one ingredient");
          const minimum = Number(settings?.customMix?.minIngredients || 1),
            maximum = Number(settings?.customMix?.maxIngredients || 10);
          if (
            item.ingredients.length < minimum ||
            item.ingredients.length > maximum
          )
            throw new Error(
              `Custom Mix must contain between ${minimum} and ${maximum} ingredients`,
            );
          const ingredients = [];
          const ingredientUnits = new Set();
          let ingredientTotal = 0;
          for (const entry of item.ingredients) {
            const product = productById.get(String(entry.productId));
            if (!product?.allowMixture)
              throw new Error(
                `${product?.name || "Product"} is not enabled for custom mixes`,
              );
            const baseQuantity = Number(entry.baseQuantity);
            ingredientUnits.add(product.baseUnit);
            await consumeStock(
              product,
              "LOOSE",
              baseQuantity,
              dbSession,
              stockRows,
              "MIXTURE_SALE",
              settings,
            );
            const total = multiplyMoney(baseQuantity,product.loosePricePerUnit);
            ingredientTotal += total;
            ingredients.push({
              productId: product._id,
              name: product.name,
              baseQuantity,
              baseUnit: product.baseUnit,
              unitPrice: product.loosePricePerUnit,
              total,
            });
          }
          if (
            settings?.customMix?.sameBaseUnitOnly !== false &&
            ingredientUnits.size > 1
          )
            throw new Error(
              "Custom Mix ingredients must use the same base unit",
            );
          const packagingPrice = amount(
            Math.max(0, Number(item.packagingPrice || 0)),
          );
          const total = amount(ingredientTotal + packagingPrice);
          saleItems.push({
            kind: "MIX",
            name: String(item.name || "Custom mix").trim(),
            saleMode: "MIX",
            quantity: 1,
            unitPrice: total,
            total,
            packageType: String(item.packageType || "Package"),
            hsnCode: "",
            gstRate: Number(settings?.gst?.defaultRate || 0),
            taxable: true,
            useDefaultGstRate: true,
            gstExempt: false,
            gstPriceMode: "STORE",
            ingredients,
          });
        } else {
          const product = productById.get(String(item.productId));
          if (saleType === "WHOLESALE" || item.saleMode === "WHOLESALE") {
            if (item.sellBy === "LOOSE") {
              if (!product.allowWholesaleLooseSale || !product.allowLooseSale)
                throw new Error(
                  `${product.name} is not enabled for wholesale loose sales`,
                );
              const looseQuantity = Number(item.quantity);
              if (
                !(looseQuantity > 0) ||
                (isCountBasedProduct(product) &&
                  !Number.isInteger(looseQuantity))
              )
                throw new Error(
                  `Enter a valid wholesale loose quantity for ${product.name}`,
                );
              await consumeStock(
                product,
                "LOOSE",
                looseQuantity,
                dbSession,
                stockRows,
                "WHOLESALE_SALE",
                settings,
                Array.isArray(item.openPackageCounts)
                  ? item.openPackageCounts.map(Number)
                  : [],
              );
              const unitPrice = wholesaleLooseRate(product),
                total = amount(looseQuantity * unitPrice);
              saleItems.push({
                kind: "PRODUCT",
                productId: product._id,
                name: product.name,
                saleMode: "WHOLESALE",
                quantity: looseQuantity,
                baseQuantity: looseQuantity,
                baseUnit: getLooseUnit(product),
                unitPrice,
                total,
                packageType: product.packageType,
                wholesaleUnit: getLooseUnit(product),
                orderedQuantity: looseQuantity,
                unitsPerWholesalePack: 1,
                paidQuantity: looseQuantity,
                freeQuantity: 0,
                totalOutgoingQuantity: looseQuantity,
                tierQuantity: 0,
                schemeType: "",
                manualFree: false,
                hsnCode: product.hsnCode || "",
                gstRate: product.gstRate,
                useDefaultGstRate: product.useDefaultGstRate !== false,
                taxable: product.taxable !== false && !product.gstExempt,
                gstExempt:
                  product.taxable === false || Boolean(product.gstExempt),
                gstPriceMode: product.gstPriceMode || "STORE",
              });
              continue;
            }
            if (item.saleMode !== "WHOLESALE")
              throw new Error(
                "Wholesale checkout contains an invalid retail item",
              );
            const manualFreeRequested =
              item.manualFreeQuantity !== undefined &&
              item.manualFreeQuantity !== null;
            if (manualFreeRequested && session.role !== "ADMIN")
              throw new Error(
                "Only an administrator can change wholesale free quantity",
              );
            const line = buildWholesaleLine(product, {
              sellBy: item.sellBy,
              quantity: item.quantity,
              manualFreeQuantity: manualFreeRequested
                ? item.manualFreeQuantity
                : null,
              manualFreeReason: item.manualFreeReason,
            });
            const sameProductFree =
              !product.freeSchemeEnabled ||
              product.freeSchemeType !== "DIFFERENT_PRODUCT";
            await consumeStock(
              product,
              "PACKAGE",
              line.paidPackageQuantity +
                (sameProductFree ? line.freeQuantity : 0),
              dbSession,
              stockRows,
              "WHOLESALE_SALE",
              settings,
            );
            let freeProduct = null;
            if (!sameProductFree && line.freeQuantity > 0) {
              if (!mongoose.isValidObjectId(product.freeSchemeFreeProduct))
                throw new Error(
                  `Select a valid free product for ${product.name}`,
                );
              freeProduct = productById.get(
                String(product.freeSchemeFreeProduct),
              );
              if (!freeProduct) {
                freeProduct = await Product.findOne({
                  _id: product.freeSchemeFreeProduct,
                  active: true,
                }).session(dbSession);
                if (freeProduct)
                  productById.set(String(freeProduct._id), freeProduct);
              }
              if (!freeProduct)
                throw new Error(
                  `The free product configured for ${product.name} is unavailable`,
                );
              await consumeStock(
                freeProduct,
                "PACKAGE",
                line.freeQuantity,
                dbSession,
                stockRows,
                "WHOLESALE_FREE",
                settings,
              );
            }
            saleItems.push({
              kind: "PRODUCT",
              productId: product._id,
              name: product.name,
              saleMode: "WHOLESALE",
              quantity: line.orderedQuantity,
              baseQuantity:
                line.paidPackageQuantity * Number(product.packageSize),
              baseUnit: product.baseUnit,
              unitPrice: line.unitPrice,
              total: line.total,
              packageType: product.packageType,
              wholesaleUnit: line.sellBy,
              orderedQuantity: line.orderedQuantity,
              unitsPerWholesalePack: line.unitsPerWholesalePack,
              paidQuantity: line.paidPackageQuantity,
              freeQuantity: line.freeQuantity,
              totalOutgoingQuantity: line.totalOutgoingQuantity,
              tierQuantity: line.tier?.quantity || 0,
              schemeType:
                line.freeQuantity > 0
                  ? product.freeSchemeType || "SAME_PRODUCT"
                  : "",
              freeProductId: freeProduct?._id || null,
              freeProductName: freeProduct?.name || "",
              manualFree: line.manualFree,
              manualFreeReason: line.manualFreeReason,
              hsnCode: product.hsnCode || "",
              gstRate: product.gstRate,
              useDefaultGstRate: product.useDefaultGstRate !== false,
              taxable: product.taxable !== false && !product.gstExempt,
              gstExempt:
                product.taxable === false || Boolean(product.gstExempt),
              gstPriceMode: product.gstPriceMode || "STORE",
            });
            continue;
          }
          const saleMode = item.saleMode === "LOOSE" ? "LOOSE" : "PACKAGE";
          if (saleMode === "PACKAGE" && !product.allowPackageSale)
            throw new Error(`${product.name} is not enabled for package sales`);
          if (saleMode === "LOOSE" && settings?.looseSales?.enabled === false)
            throw new Error("Loose sales are disabled in Settings");
          if (saleMode === "LOOSE" && !product.allowLooseSale)
            throw new Error(`${product.name} is not enabled for loose sales`);
          const quantity =
            saleMode === "PACKAGE"
              ? Number(item.quantity)
              : Number(item.baseQuantity);
          if (
            saleMode === "PACKAGE" &&
            (!Number.isInteger(quantity) || quantity <= 0)
          )
            throw new Error(
              `Enter a valid package quantity for ${product.name}`,
            );
          if (
            saleMode === "LOOSE" &&
            isCountBasedProduct(product) &&
            (!Number.isInteger(quantity) || quantity <= 0)
          )
            throw new Error(
              `${getLooseUnit(product)} quantity must be a positive whole number`,
            );
          const openPackageCounts = Array.isArray(item.openPackageCounts)
            ? item.openPackageCounts.map(Number)
            : [];
          if (
            openPackageCounts.some(
              (count) => !Number.isInteger(count) || count <= 0,
            )
          )
            throw new Error(
              `${getLooseUnit(product)} quantity must be a whole number.`,
            );
          await consumeStock(
            product,
            saleMode,
            quantity,
            dbSession,
            stockRows,
            undefined,
            settings,
            openPackageCounts,
          );
          const unitPrice =
            saleMode === "PACKAGE"
              ? Number(product.packageSellingPrice)
              : Number(product.loosePricePerUnit);
          const total = multiplyMoney(quantity,unitPrice);
          saleItems.push({
            kind: "PRODUCT",
            productId: product._id,
            name: product.name,
            saleMode,
            quantity,
            baseQuantity:
              saleMode === "LOOSE"
                ? quantity
                : quantity * Number(product.packageSize),
            baseUnit:
              saleMode === "LOOSE" ? getLooseUnit(product) : product.baseUnit,
            unitPrice,
            total,
            packageType: product.packageType,
            hsnCode: product.hsnCode || "",
            gstRate: product.gstRate,
            useDefaultGstRate: product.useDefaultGstRate !== false,
            taxable: product.taxable !== false && !product.gstExempt,
            gstExempt: product.taxable === false || Boolean(product.gstExempt),
            gstPriceMode: product.gstPriceMode || "STORE",
          });
        }
      }
      const subtotal = amount(
        saleItems.reduce((sum, item) => sum + item.total, 0),
      );
      if (
        settings?.gst?.enabled &&
        settings.gst.requireHsn &&
        saleItems.some(
          (item) =>
            item.kind === "PRODUCT" &&
            item.taxable !== false &&
            !item.gstExempt &&
            !item.hsnCode,
        )
      )
        throw new Error(
          "Every taxable product needs an HSN code before GST checkout",
        );
      const placeOfSupply = supplyContext.placeOfSupply;
      const creditRequested = body.credit === true;
      const submittedPayments = Array.isArray(body.payments)
          ? body.payments
          : [{ method: body.paymentMethod }],
        paymentMethods = [
          ...new Set(
            submittedPayments.map((payment) => payment.method).filter(Boolean),
          ),
        ],
        roundingPaymentMethod =
          creditRequested
            ? "CREDIT"
            : paymentMethods.length === 1
              ? paymentMethods[0]
              : "SPLIT";
      const wholesaleDefaultDiscount =
        saleType === "WHOLESALE" && !(Number(body.discountValue) > 0)
          ? Number(customer?.defaultDiscount || 0)
          : null;
      const pricing = calculateSalePricing({
        wholesaleDiscount: body.wholesaleDiscountEnabled === true ? body.wholesaleDiscountPercent ?? 0 : undefined,
        items: saleItems.map((item, index) => ({
          amount: item.total,
          gstRate: item.gstRate,
          useDefaultGstRate: item.useDefaultGstRate,
          taxable: item.taxable,
          gstExempt: item.gstExempt,
          gstPriceMode: item.gstPriceMode,
          kind: item.kind,
          saleMode: item.saleMode,
          discount: body.items?.[index]?.discount,
        })),
        discount: {
          type:
            wholesaleDefaultDiscount !== null
              ? "PERCENTAGE"
              : body.discountType || "FIXED",
          value:
            wholesaleDefaultDiscount ?? body.discountValue ?? body.discount,
          reason:
            body.discountReason ||
            (wholesaleDefaultDiscount > 0
              ? "Wholesale customer default discount"
              : ""),
        },
        settings,
        currentUser: session,
        paymentMethod: roundingPaymentMethod,
        placeOfSupply,
      });
      if (pricing.validationErrors.length)
        throw new Error(pricing.validationErrors[0]);
      if (pricing.approvalRequired)
        throw new Error("Administrator approval is required for this discount");
      const requestedDiscount = pricing.totalDiscount,
        gstInvoice = pricing.gst;
      gstInvoice.lines.forEach((tax, index) =>
        Object.assign(saleItems[index], {
          total: tax.total,
          discount: tax.discount,
          cgstRate:tax.cgstRate,sgstRate:tax.sgstRate,utgstRate:tax.utgstRate,igstRate:tax.igstRate,utgst:tax.utgst,
          gstRate: tax.gstRate,
          gstPriceMode: tax.gstPriceMode,
          taxableValue: tax.taxableValue,
          taxAmount: tax.taxAmount,
          totalTax: tax.totalGST,
          cgst: tax.cgst,
          sgst: tax.sgst,
          igst: tax.igst,
          priceIncludesTax: tax.priceIncludesTax,
        }),
      );
      const roundOff = pricing.roundOff,
        total = pricing.total;
      const documentType=validateFiscalLines(saleItems,settings,supplyContext,total);
      const requestedPayments = Array.isArray(body.payments)
          ? body.payments
          : [
              {
                method: body.paymentMethod,
                amount: total,
                reference: body.paymentReference,
              },
            ],
        enabledMethods = settings?.payments?.enabledMethods || ["CASH", "UPI"];
      const credit = prepareWholesaleCredit({
        saleType,
        requested: creditRequested,
        customer,
        total,
      });
      if (
        !creditRequested &&
        requestedPayments.length > 1 &&
        settings?.payments?.splitPayment === false
      )
        throw new Error("Split payment is disabled in Settings");
      if (
        !creditRequested &&
        (!requestedPayments.length ||
        requestedPayments.some(
          (payment) =>
            !enabledMethods.includes(payment.method) ||
            !(Number(payment.amount) > 0),
        ))
      )
        throw new Error("Select an enabled payment method");
      if (
        !creditRequested &&
        requestedPayments.some(
          (payment) =>
            (payment.method === "UPI" &&
              settings?.payments?.upi?.requireReference &&
              !String(payment.reference || "").trim()) ||
            (payment.method === "BANK" &&
              settings?.payments?.bank?.requireReference &&
              !String(payment.reference || "").trim()),
        )
      )
        throw new Error(
          "Payment reference is required for the selected method",
        );
      const paymentTotal = creditRequested
        ? 0
        : amount(
            requestedPayments.reduce(
              (sum, payment) => sum + Number(payment.amount),
              0,
            ),
          );
      if (!creditRequested && Math.abs(paymentTotal - total) > 0.009)
        throw new Error("Payment amounts must equal the invoice total");
      const payments = creditRequested
        ? []
        : requestedPayments.map((payment) => ({
            method: payment.method,
            amount: amount(payment.amount),
            reference: String(payment.reference || "").trim(),
          }));
      const prefix =
        saleType === "WHOLESALE"
          ? settings?.invoice?.wholesalePrefix || "WSI"
          : settings?.invoice?.prefix || "INV";
      const invoiceDate=new Date();
      const invoiceNumber = await nextInvoiceNumber({
        Counter: DocumentCounter,
        prefix,
        value: invoiceDate,
        session: dbSession,
        registrationKey:registrationStatus(settings)==="UNREGISTERED"?"UNREGISTERED":settings.store.gstin,
      });
      const wholesaleSummary = saleItems.reduce(
        (summary, item) => ({
          paidQuantity: summary.paidQuantity + Number(item.paidQuantity || 0),
          freeQuantity: summary.freeQuantity + Number(item.freeQuantity || 0),
          totalOutgoing:
            summary.totalOutgoing + Number(item.totalOutgoingQuantity || 0),
        }),
        { paidQuantity: 0, freeQuantity: 0, totalOutgoing: 0 },
      );
      [completedSale] = await Sale.create(
        [
          {
            invoiceNumber,
            requestKey,requestHash:hash,
            invoiceDate,financialYear:financialYear(invoiceDate),documentType,documentStatus:"FINALIZED",supplyContext,
            registrationSnapshot:{status:registrationStatus(settings),effectiveFrom:settings?.gst?.effectiveFrom,gstin:settings?.store?.gstin},
            taxRuleVersion:GST_RULE_VERSION,utgst:gstInvoice.utgst,
            saleType,
            wholesaleSummary,
            customerType: customer ? "EXISTING" : "WALK_IN",
            customerId: customer?._id || null,
            customerSnapshot: buildCustomerSnapshot(customer, doctorName),
            cashierSnapshot: {
              name: session.name || "Cashier",
              role: session.role,
            },
            storeSnapshot: {
              name: settings?.store?.name || settings?.storeName || "Oushadi",
              legalName: settings?.store?.legalName || "",
              address: settings?.store?.address || "",
              phone: settings?.store?.phone || "",
              gstin: settings?.store?.gstin || "",
              stateCode: settings?.store?.stateCode || "",
            },
            items: saleItems,
            subtotal,
            discount: requestedDiscount,
            discountSummary: {
              itemDiscount: pricing.itemDiscount,
              cartDiscount: pricing.cartDiscount,
              automaticDiscount: pricing.automaticDiscount,
              totalDiscount: pricing.totalDiscount,
              discountType: pricing.discountType,
              discountValue: pricing.discountValue,
              reason: pricing.reason,
              approvalRequired: pricing.approvalRequired,
              approved: false,
              approvedBy: null,
              approvedByName: "",
              approvedAt: null,
            },
            taxableSubtotal: gstInvoice.taxableSubtotal,
            tax: gstInvoice.tax,
            cgst: gstInvoice.cgst,
            sgst: gstInvoice.sgst,
            igst: gstInvoice.igst,
            gstEnabled: Boolean(settings?.gst?.enabled),
            gstPriceMode: gstInvoice.priceMode,
            gstCalculationMethod: gstInvoice.calculationMethod,
            taxDetermination: gstInvoice.taxDetermination,
            taxType: gstInvoice.taxType,
            showGstOnInvoice: Boolean(settings?.gst?.showOnInvoice),
            gstDisplayStyle:
              settings?.gst?.displayStyle === "COMPACT"
                ? "COMPACT"
                : "DETAILED",
            supplierStateCode: gstInvoice.supplierState,
            placeOfSupply: gstInvoice.placeOfSupply,
            roundOff,
            roundingSummary: pricing.roundingSummary,
            total,
            payments,
            paymentStatus: credit?.paymentStatus || "PAID",
            amountPaid: credit?.amountPaid ?? total,
            balanceDue: credit?.balanceDue || 0,
            actorId: new mongoose.Types.ObjectId(session.sub),
          },
        ],
        { session: dbSession, ordered: true },
      );
      if (credit) {
        customer.set("outstandingAmount", credit.outstandingAfter);
        await customer.save({ session: dbSession });
      }
      if (stockRows.length)
        await StockTransaction.create(
          stockRows.map((row) => ({
            ...row,
            referenceType: "SALE",
            referenceId: completedSale._id,
            actorId: new mongoose.Types.ObjectId(session.sub),
          })),
          { session: dbSession, ordered: true },
        );
      await AuditLog.create([{actorId:session.sub,action:'INVOICE_FINALIZED',module:'sales',targetType:'Sale',targetId:completedSale._id,description:`Issued ${invoiceNumber}`,metadata:{invoiceNumber,documentType,total,tax:gstInvoice.tax,placeOfSupply,ruleVersion:GST_RULE_VERSION}}],{session:dbSession});
    });
    return ok(completedSale, 201);
  } catch (error) {
    // Plain validation errors abort the transaction and are safe to correct/retry.
    if(error?.constructor===Error&&!error.status)error.status=422;
    return apiError(error);
  } finally {
    if (dbSession) await dbSession.endSession();
  }
}
