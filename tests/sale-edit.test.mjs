import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import { Sale as SaleModel } from "../src/models/index.js";
import { saleEditProblem, saleStockReturns, creditSaleStock, saleEditCart } from "../src/lib/sale-edit.js";
import { calculateSalePricing } from "../src/services/pricing.service.js";
import { createSaleStockBuffer } from "../src/lib/sale-stock-buffer.js";
import { deductPackageStock, deductLooseStock, deductCountBasedLooseStock, getLooseUnit, isCountBasedProduct } from "../src/services/inventory.service.js";
import { assertRegistration, resolveSupply, validateFiscalLines, registrationStatus, financialYear, GST_RULE_VERSION } from "../src/lib/gst-compliance.js";
import { requestHash, assertRetryMatches } from "../src/lib/fiscal-integrity.js";
import { buildCustomerSnapshot, normalizeDoctorName, prepareWholesaleCredit, isWholesaleCustomer } from "../src/lib/sale-customer.js";
import { money, multiplyMoney } from "../src/lib/money.js";
import { directCheckoutPayments } from "../src/lib/direct-checkout.js";
import { saleFreeQuantity } from "../src/lib/sale-free-quantity.js";
import { buildExternalPurchase, isExternalPurchase, externalPurchaseSummary } from "../src/lib/external-purchase.js";
import { syncExternalPurchaseExpenses } from "../src/services/external-purchase.service.js";

const serviceSource = readFileSync(new URL("../src/services/sale-edit.service.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "");
const service = new Function("saleEditProblem", "saleStockReturns", `${serviceSource}; return { restoreSaleStock, loadSaleForEdit, findSaleEditRetry, saveSaleEdit };`)(saleEditProblem, saleStockReturns);
const route = readFileSync(new URL("../src/app/api/sales/route.js", import.meta.url), "utf8").replace(/^import[\s\S]*?;\r?\n/gm, "").replaceAll("export ", "");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const id = new mongoose.Types.ObjectId(), productId = new mongoose.Types.ObjectId(), batchId = new mongoose.Types.ObjectId(), actorId = new mongoose.Types.ObjectId();
const addedProductId = new mongoose.Types.ObjectId(), addedBatchId = new mongoose.Types.ObjectId();
const original = { _id: id, invoiceNumber: "INV-ORIGINAL", invoiceDate: new Date("2026-10-07T10:00:00Z"), createdAt: new Date("2026-10-07T10:00:00Z"), updatedAt: new Date("2026-10-07T10:00:00Z"),
  documentType: "COMMERCIAL_INVOICE", documentStatus: "FINALIZED", financialYear: "2026-27", actorId, cashierSnapshot: { name: "Owner" }, storeSnapshot: { name: "Original store" },
  items: [{ kind: "PRODUCT", name: "Oil", productId, saleMode: "PACKAGE", quantity: 2, unitPrice: 100, total: 200 }],
  subtotal: 200, total: 200, amountPaid: 200, balanceDue: 0, paymentStatus: "PAID", payments: [{ method: "CASH", amount: 200 }],
  stockAllocations: [{ productId, batchId, sealedPackages: 2, openQuantity: 0 }] };

function harness() {
  const state = { sale: { ...original }, batches: [{ _id: batchId, productId, packageSize: 100, sealedPackages: 3, openQuantity: 0 }, { _id: addedBatchId, productId: addedProductId, packageSize: 100, sealedPackages: 4, openQuantity: 0 }], rows: [], audits: [] };
  // Preserve ObjectId values through the fake database round trips.
  state.expenses = [];
  const query = value => ({ select() { return this; }, sort() { return this; }, session() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  const batchDoc = batch => ({ ...batch, set(next) { Object.assign(this, next); }, validateSync() { return this.sealedPackages < 0 || this.openQuantity < 0 ? new Error("Invalid stock") : null; }, async save() { batch.sealedPackages = this.sealedPackages; batch.openQuantity = this.openQuantity; } });
  const InventoryBatch = { findOne: filter => query(state.batches.find(batch => String(batch._id) === String(filter._id)) ? batchDoc(state.batches.find(batch => String(batch._id) === String(filter._id))) : null),
    find: filter => query(state.batches.filter(batch => filter.productId.$in.map(String).includes(String(batch.productId))).map(batchDoc)),
    bulkWrite: async operations => { for (const op of operations) Object.assign(state.batches.find(batch => String(batch._id) === String(op.updateOne.filter._id)), op.updateOne.update.$set); return { matchedCount: operations.length }; } };
  const StockTransaction = { find: () => query(state.rows), insertMany: async rows => { state.rows.push(...rows); } };
  const AuditLog = { findOne: filter => query(state.audits.find(audit => audit.metadata.requestKey === filter["metadata.requestKey"])), create: async entries => state.audits.push(...entries) };
  const Sale = function(fields) { return new SaleModel(fields); };
  Object.assign(Sale, { init: async () => {}, findOne: filter => query(state.sale.requestKey === filter.requestKey ? state.sale : null), findById: () => query(state.sale),
    create: async ([fields]) => { const sale = new SaleModel({ ...fields, createdAt: new Date(), updatedAt: new Date() }); await sale.validate(); state.sale = sale.toObject(); return [sale]; },
    collection: { updateOne: async (filter, update) => { assert.equal(String(filter._id), String(state.sale._id)); assert.equal(+new Date(filter.updatedAt), +new Date(state.sale.updatedAt)); state.sale = { ...state.sale, ...update.$set }; return { matchedCount: 1 }; } } });
  const session = { withTransaction: async callback => {
    const snapshot = { sale: state.sale, batches: state.batches.map(batch => ({ ...batch })), rows: [...state.rows], audits: [...state.audits] };
    snapshot.expenses = structuredClone(state.expenses);
    try { await callback(); } catch (error) { Object.assign(state, snapshot); throw error; }
  }, endSession: async () => {} };
  const product = { _id: productId, name: "Oil", active: true, packageType: "Bottle", baseUnit: "ml", packageSize: 100, packageSellingPrice: 120, loosePricePerUnit: 1, allowPackageSale: true };
  const catalogue = [product, { ...product, _id: addedProductId, name: "Drops", packageSellingPrice: 50 }];
  const settings = { gst: { enabled: false, registrationStatus: "UNREGISTERED" }, store: { stateCode: "32" }, discount: { enabled: false }, roundOff: { enabled: false }, payments: { enabledMethods: ["CASH", "UPI"] } };
  const dependencies = { ...service, mongoose: { ...mongoose, startSession: async () => session },
    requireSession: async permission => { if (h.staff && permission === "ADMIN") throw new Error("FORBIDDEN"); return { sub: String(actorId), role: "ADMIN", name: "Owner" }; }, connectDb: async () => {},
    ok: (data, status = 200) => ({ data, status, headers: new Map() }), fail: (error, status = 400) => ({ error, status, headers: new Map() }), apiError: error => ({ error: error.message, status: error.message === "FORBIDDEN" ? 403 : error.status || 500, headers: new Map() }),
    Sale, InventoryBatch, StockTransaction, AuditLog, FiscalGuard: { init: async () => {}, findOneAndUpdate: async () => {} }, Settings: { findOne: () => query(settings) }, Product: { find: filter => query(catalogue.filter(entry => filter._id.$in.includes(String(entry._id)))) },
    Customer: {}, DocumentCounter: {}, createCustomer: async () => { throw new Error("Unexpected customer creation"); }, nextInvoiceNumber: async () => "INV-NEW",
    buildExternalPurchase, isExternalPurchase, externalPurchaseSummary, syncExternalPurchaseExpenses,
    ExpenseCategory: { findOneAndUpdate: async () => ({ _id: new mongoose.Types.ObjectId() }) },
    Expense: { find: () => query(state.expenses), findOneAndUpdate: async (filter, update) => {
      const prior = state.expenses.find(expense => expense.externalPurchaseId === filter.externalPurchaseId);
      if (h.failExpense) throw new Error("Expense write failed");
      if (prior) Object.assign(prior, update.$set);
      else state.expenses.push({ ...update.$set, _id: new mongoose.Types.ObjectId() });
    } },
    calculateSalePricing, createSaleStockBuffer, deductPackageStock, deductLooseStock, deductCountBasedLooseStock, getLooseUnit, isCountBasedProduct,
    assertRegistration, resolveSupply, validateFiscalLines, registrationStatus, financialYear, GST_RULE_VERSION, requestHash, assertRetryMatches, buildCustomerSnapshot, normalizeDoctorName, prepareWholesaleCredit, isWholesaleCustomer, money, multiplyMoney, directCheckoutPayments, saleFreeQuantity };
  const h = { state, settings, staff: false, async invoke({ create = false, quantity = 3, version = new Date(state.sale.updatedAt).toISOString(), revision = Number(state.sale.editRevision || 0), key = "sale-edit-retry-key-001", price = quantity * 100, items } = {}) {
    const body = { ...(!create ? { editSaleId: String(id), editVersion: version, editRevision: revision } : {}), items: items || [{ kind: "PRODUCT", productId: String(productId), saleMode: "PACKAGE", quantity, billedLineIndex: 0 }], customerType: "WALK_IN", payments: [{ method: "CASH", amount: price }] };
    const run = new AsyncFunction(...Object.keys(dependencies), "request", `${route}\nreturn POST(request);`);
    return run(...Object.values(dependencies), { json: async () => body, headers: { get: () => key } });
  } };
  return h;
}

test("editing a paid sale keeps its invoice, billed price and date, adjusts stock once, and preserves an audited original", async () => {
  const h = harness();
  const result = await h.invoke();
  assert.equal(result.status, 201, result.error);
  assert.equal(result.data.invoiceNumber, "INV-ORIGINAL");
  assert.equal(result.data.total, 300);
  assert.equal(result.data.items[0].unitPrice, 100); // Catalogue price is now 120.
  assert.equal(+result.data.createdAt, +original.createdAt);
  assert.equal(+result.data.invoiceDate, +original.invoiceDate);
  assert.equal(h.state.batches[0].sealedPackages, 2); // 3 + old 2 - revised 3.
  assert.equal(h.state.sale.editRevision, 1);
  assert.equal(h.state.audits[0].metadata.before.total, 200);
  assert.equal(h.state.audits[0].metadata.after.total, 300);
  const retry = await h.invoke({ version: original.updatedAt.toISOString(), revision: 0 });
  assert.equal(retry.status, 200);
  assert.equal(h.state.batches[0].sealedPackages, 2);
  assert.equal(h.state.audits.length, 1);
});

test("insufficient stock and incorrect payment roll back stock returns, sale changes and audit writes", async () => {
  for (const change of [{ quantity: 6 }, { price: 1 }]) {
    const h = harness();
    const response = await h.invoke(change);
    assert.equal(response.status, 422, response.error);
    assert.equal(h.state.batches[0].sealedPackages, 3);
    assert.equal(h.state.sale.total, 200);
    assert.equal(h.state.rows.length, 0);
    assert.equal(h.state.audits.length, 0);
  }
});

test("staff, stale edits, tax documents and credit sales cannot change a billed sale", async () => {
  const staff = harness(); staff.staff = true;
  assert.equal((await staff.invoke()).status, 403);
  const stale = harness();
  assert.equal((await stale.invoke({ version: "2026-10-01T00:00:00.000Z" })).status, 409);
  for (const change of [{ gstEnabled: true }, { documentStatus: "CANCELLED" }, { paymentStatus: "PARTIAL", balanceDue: 10 }]) {
    const h = harness(); h.state.sale = { ...h.state.sale, ...change };
    assert.equal((await h.invoke()).status, 422);
    assert.equal(h.state.rows.length, 0);
  }
});

test("a second edit uses only the latest allocations and altered retries are rejected", async () => {
  const h = harness();
  assert.equal((await h.invoke()).status, 201);
  assert.equal((await h.invoke({ quantity: 4, key: "sale-edit-retry-key-002" })).status, 201);
  assert.equal(h.state.batches[0].sealedPackages, 1);
  assert.equal(h.state.sale.editRevision, 2);
  assert.equal((await h.invoke({ quantity: 2, key: "sale-edit-retry-key-002" })).status, 409);
  assert.equal(h.state.batches[0].sealedPackages, 1);
});

test("legacy loose and mix returns preserve opened packages and count actual units", () => {
  const sale = { items: [] };
  const rows = [
    { productId, batchId, direction: "IN", type: "PACKAGE_OPENED", packageQuantity: -1, looseQuantity: 50 },
    { productId, batchId, direction: "OUT", type: "LOOSE_SALE", packageQuantity: -1, baseQuantity: -25 },
    { productId, batchId, direction: "OUT", type: "MIXTURE_SALE", baseQuantity: -10 },
  ];
  const returned = saleStockReturns(sale, rows);
  assert.equal(returned.reduce((sum, row) => sum + row.sealedPackages, 0), 0);
  assert.equal(returned.reduce((sum, row) => sum + row.openQuantity, 0), 35);
  assert.throws(() => saleStockReturns(sale, [{ productId, direction: "OUT", type: "UNKNOWN" }]), /ambiguous/);
});

test("edit cart shows billed quantities and prices with returned stock available for changes", () => {
  const products = creditSaleStock([{ _id: productId, name: "Oil", packageSize: 100, packageSellingPrice: 120, stock: { sealedPackages: 3, openQuantity: 0, totalBaseQuantity: 300 } }], original.stockAllocations);
  const cart = saleEditCart(original, products);
  assert.equal(products[0].stock.sealedPackages, 5);
  assert.equal(cart[0].quantity, 2);
  assert.equal(cart[0].packageSellingPrice, 100);
  assert.equal(cart[0].billedLineIndex, 0);
});

test("adding another product and removing a billed line reconcile both original batches", async () => {
  const h = harness();
  const oldLine = { kind: "PRODUCT", productId: String(productId), saleMode: "PACKAGE", quantity: 2, billedLineIndex: 0 };
  const newLine = { kind: "PRODUCT", productId: String(addedProductId), saleMode: "PACKAGE", quantity: 1 };
  let result = await h.invoke({ items: [oldLine, newLine], price: 250 });
  assert.equal(result.status, 201, result.error);
  assert.equal(result.data.items.length, 2);
  assert.equal(h.state.batches[0].sealedPackages, 3);
  assert.equal(h.state.batches[1].sealedPackages, 3);
  result = await h.invoke({ items: [newLine], price: 50, key: "sale-edit-retry-key-002" });
  assert.equal(result.status, 201, result.error);
  assert.equal(result.data.items.length, 1);
  assert.equal(h.state.batches[0].sealedPackages, 5);
  assert.equal(h.state.batches[1].sealedPackages, 3);
  assert.equal(result.data.total, 50);
});

const externalInput = (extra = {}) => ({ itemSource: "external_purchase", inventoryTracked: true,
  externalPurchaseId: "external-purchase-line-001", name: "Dasamoolarishtam", quantity: 2, packageType: "bottle",
  unitPrice: 220, purchaseCost: 180, externalSupplierName: "ABC Medicals", externalPurchasePaymentMethod: "CASH", ...extra });

test("checkout accepts manual external products, ignores forged tracking, and retries without duplicate expenses", async () => {
  const h = harness(), items = [externalInput()];
  let result = await h.invoke({ create: true, items, price: 440 });
  assert.equal(result.status, 201, result.error);
  assert.equal(result.data.items[0].productId, null);
  assert.equal(result.data.items[0].inventoryTracked, false);
  assert.equal(result.data.externalPurchaseCost, 360);
  assert.equal(result.data.externalPurchaseProfit, 80);
  assert.equal(h.state.batches[0].sealedPackages, 3);
  assert.equal(h.state.rows.length, 0);
  assert.equal(h.state.expenses.length, 1);
  result = await h.invoke({ create: true, items, price: 440 });
  assert.equal(result.status, 200, result.error);
  assert.equal(h.state.expenses.length, 1);
});

test("mixed checkout deducts only inventory lines, including an external reference to a zero-stock product", async () => {
  const h = harness();
  h.state.batches[1].sealedPackages = 0;
  const items = [{ kind: "PRODUCT", productId: String(productId), saleMode: "PACKAGE", quantity: 1 }, externalInput({ productId: String(addedProductId) })];
  const result = await h.invoke({ create: true, items, price: 560 });
  assert.equal(result.status, 201, result.error);
  assert.equal(h.state.batches[0].sealedPackages, 2);
  assert.equal(h.state.batches[1].sealedPackages, 0);
  assert.equal(h.state.rows.length, 1);
  assert.equal(String(h.state.rows[0].productId), String(productId));
  assert.equal(result.data.total, 560);
});

test("completed external quantity edit updates totals and the linked expense without stock writes", async () => {
  const h = harness();
  let result = await h.invoke({ create: true, items: [externalInput()], price: 440 });
  assert.equal(result.status, 201, result.error);
  result = await h.invoke({ items: [externalInput({ quantity: 3, billedLineIndex: 0 })], price: 660, key: "sale-edit-external-key-002" });
  assert.equal(result.status, 201, result.error);
  assert.equal(result.data.externalPurchaseRevenue, 660);
  assert.equal(result.data.externalPurchaseCost, 540);
  assert.equal(result.data.externalPurchaseProfit, 120);
  assert.equal(h.state.rows.length, 0);
  assert.equal(h.state.batches[0].sealedPackages, 3);
  assert.equal(h.state.expenses.length, 1);
  assert.equal(h.state.expenses[0].amount, 540);
});

test("supplier expense failure rolls back mixed checkout stock and invoice", async () => {
  const h = harness(); h.failExpense = true;
  const result = await h.invoke({ create: true, items: [{ kind: "PRODUCT", productId: String(productId), saleMode: "PACKAGE", quantity: 1 }, externalInput()], price: 560 });
  assert.equal(result.status, 422, result.error);
  assert.equal(h.state.batches[0].sealedPackages, 3);
  assert.equal(h.state.rows.length, 0);
  assert.equal(h.state.expenses.length, 0);
  assert.equal(h.state.sale.invoiceNumber, "INV-ORIGINAL");
});

test("malformed external checkout aborts and ordinary products cannot disable stock", async () => {
  const h = harness();
  for (const item of [externalInput({ quantity: -1 }), externalInput({ purchaseCost: -1 }), { kind: "PRODUCT", productId: String(productId), saleMode: "PACKAGE", quantity: 1, inventoryTracked: false }]) {
    const result = await h.invoke({ create: true, items: [item], price: 120 });
    assert.equal(result.status, 422, result.error);
    assert.equal(h.state.batches[0].sealedPackages, 3);
    assert.equal(h.state.expenses.length, 0);
  }
});
