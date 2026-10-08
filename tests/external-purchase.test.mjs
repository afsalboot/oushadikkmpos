import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildExternalPurchase, externalPurchaseSummary, inventoryTracked, saleForActor } from "../src/lib/external-purchase.js";
import { saleEditCart, saleStockReturns } from "../src/lib/sale-edit.js";
import { buildAccountLedger } from "../src/services/accounting.service.js";
import { syncExternalPurchaseExpenses } from "../src/services/external-purchase.service.js";
import { Sale, Expense } from "../src/models/index.js";
import { getReport } from "../src/services/report.service.js";

const input = { itemSource: "external_purchase", name: "Dasamoolarishtam", quantity: 2, packageType: "bottle", unitPrice: 220, purchaseCost: 180, externalPurchasePaymentMethod: "CASH", externalSupplierName: "ABC Medicals" };
test("external costs and revenue use quantity and decimal money; tracking is forced off", () => {
  const line = buildExternalPurchase({ ...input, inventoryTracked: true });
  assert.equal(line.inventoryTracked, false);
  assert.equal(line.productId, null);
  assert.equal(line.total, 440);
  assert.equal(line.totalPurchaseCost, 360);
  assert.deepEqual(externalPurchaseSummary([line, { ...line, quantity: 1, total: 220 }, { name: "Inventory", total: 500 }]), { externalPurchaseRevenue: 660, externalPurchaseCost: 540, externalPurchaseProfit: 120 });
  assert.equal(inventoryTracked({ productId: "old-product" }), true);
  assert.equal(inventoryTracked(line), false);
});
test("required values and malformed external inputs fail server validation", () => {
  for (const change of [{ name: "" }, { quantity: 0 }, { quantity: Infinity }, { purchaseCost: -1 }, { purchaseCost: "" }, { unitPrice: -1 }, { unitPrice: null }, { packageType: "" }, { externalPurchasePaymentMethod: "INVALID" }, { kind: "MIX" }, { freeQuantity: 1 }]) {
    assert.throws(() => buildExternalPurchase({ ...input, ...change }));
  }
});
test("manual and linked external history edits never need a live product or stock returns", () => {
  const line = buildExternalPurchase(input);
  const items = [line, { ...line, productId: "zero-stock" }];
  const cart = saleEditCart({ items }, []);
  assert.equal(cart.length, 2);
  assert.equal(cart[1].productId, "zero-stock");
  assert.deepEqual(saleStockReturns({ items }, [{ direction: "OUT", productId: "zero-stock" }]), []);
});
test("internal supplier and cost data require existing staff permissions", () => {
  const sale = { items: [buildExternalPurchase(input)], ...externalPurchaseSummary([buildExternalPurchase(input)]) };
  const safe = saleForActor(sale, { role: "STAFF", permissions: ["sales.view"] });
  assert.equal(safe.externalPurchaseCost, undefined);
  assert.equal(safe.items[0].purchaseCost, undefined);
  assert.equal(safe.items[0].externalSupplierName, undefined);
  assert.equal(saleForActor(sale, { role: "STAFF", permissions: ["sales.create"] }).items[0].purchaseCost, 180);
});
test("schema persists line snapshots and all supplier payment methods", async () => {
  const sale = new Sale({ invoiceNumber: "INV-EP", items: [buildExternalPurchase(input)], total: 440, actorId: "507f1f77bcf86cd799439011" });
  assert.equal(sale.items[0].itemSource, "external_purchase");
  assert.equal(sale.items[0].inventoryTracked, false);
  for (const paymentMethod of ["CASH", "UPI", "CARD", "OWNER", "CREDIT"]) {
    const expense = new Expense({ category: "External Purchase", amount: 360, paymentMethod, source: "EXTERNAL_PURCHASE" });
    await expense.validate();
  }
});
test("supplier expenses synchronize once, survive reordered lines, and retain unpaid balances", async () => {
  const rows = [], session = {}, category = { _id: "category" };
  const Expense = { find: () => ({ session: async () => rows }), findOneAndUpdate: async (filter, update, options) => {
    assert.equal(options.session, session);
    const existing = rows.find(row => row.externalPurchaseId === filter.externalPurchaseId);
    if (existing) Object.assign(existing, update.$set); else rows.push({ ...update.$set });
  } };
  const ExpenseCategory = { findOneAndUpdate: async () => category };
  const line = buildExternalPurchase({ ...input, externalPurchasePaymentMethod: "CREDIT" });
  const sale = { _id: "sale", invoiceNumber: "INV-EP", items: [line], createdAt: new Date() };
  const sync = () => syncExternalPurchaseExpenses({ sale, Expense, ExpenseCategory, session, actor: { sub: "staff" } });
  await sync(); await sync();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].paidAmount, 0); assert.equal(rows[0].balanceDue, 360);
  sale.items = [{ itemSource: "inventory" }, { ...line, quantity: 3, totalPurchaseCost: 540 }];
  await sync();
  assert.equal(rows.length, 1); assert.equal(rows[0].amount, 540); assert.equal(rows[0].saleLineIndex, 1);
});
test("cash ledger subtracts cash external costs once; other modes leave physical cash unchanged", () => {
  const sale = { _id: "sale", invoiceNumber: "INV-EP", total: 2000, payments: [{ method: "CASH", amount: 2000 }], createdAt: "2026-10-08T08:00:00Z" };
  for (const method of ["CASH", "UPI", "CARD", "OWNER", "CREDIT"]) {
    const expense = { _id: "expense", source: "EXTERNAL_PURCHASE", category: "External Purchase", referenceId: "sale", amount: 300, paidAmount: method === "CREDIT" ? 0 : 300, paymentMethod: method, createdAt: sale.createdAt };
    const ledger = buildAccountLedger([sale], [expense]);
    assert.equal(5000 + ledger.summary.cashBalance, method === "CASH" ? 6700 : 7000);
    assert.equal(ledger.summary.digitalBalance, ["UPI", "CARD"].includes(method) ? -300 : 0);
    assert.equal(ledger.movements.filter(row => row.type === "EXPENSE").length, method === "CREDIT" ? 0 : 1);
  }
});
test("receipt renderer never renders supplier cost or source fields", () => {
  const receipt = readFileSync(new URL("../src/components/ThermalReceiptPrinter.jsx", import.meta.url), "utf8");
  for (const privateField of ["purchaseCost", "totalPurchaseCost", "externalSupplierName", "externalPurchasePaymentMethod", "externalPurchaseNotes", "External Purchase"]) assert.equal(receipt.includes(privateField), false);
  assert.ok(receipt.includes('item.packageType || "item"'));
});

test("rendered thermal invoice includes external selling information and no supplier information", async () => {
  const require = createRequire(import.meta.url);
  const { transform, loadBindings } = require("next/dist/build/swc");
  await loadBindings();
  const source = readFileSync(new URL("../src/components/ThermalReceiptPrinter.jsx", import.meta.url), "utf8");
  const { code } = await transform(source, { filename: "ThermalReceiptPrinter.jsx", jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const receiptModule = { exports: {} };
  const localRequire = name => require(name.startsWith("@/") ? `../src/${name.slice(2)}.js` : name);
  new Function("require", "module", "exports", code)(localRequire, receiptModule, receiptModule.exports);
  const line = buildExternalPurchase({ ...input, externalPurchaseNotes: "INTERNAL-NOTE-ONLY" });
  const html = renderToStaticMarkup(createElement(receiptModule.exports.ThermalReceipt, { sale: { invoiceNumber: "INV-EP", createdAt: "2026-10-08T08:00:00Z", items: [line], total: 440, subtotal: 440, payments: [{ method: "UPI", amount: 440 }], storeSnapshot: { name: "Shop" } } }));
  assert.match(html, /Dasamoolarishtam/);
  assert.match(html, /2 bottle/);
  assert.match(html, /220/);
  assert.match(html, /440/);
  for (const secret of ["ABC Medicals", "INTERNAL-NOTE-ONLY", "External Purchase", "180", "360"]) assert.equal(html.includes(secret), false, secret);
});

test("sales and profit reports include external margins without claiming unavailable inventory COGS", async () => {
  const originalFind = Sale.find;
  const sales = [{ _id: "sale", createdAt: "2026-10-08T08:00:00Z", total: 940, items: [{ itemSource: "inventory", total: 500 }, buildExternalPurchase(input)], payments: [{ method: "CASH", amount: 940 }] }];
  Sale.find = () => ({ populate() { return this; }, sort() { return this; }, lean: async () => sales });
  try {
    for (const type of ["sales", "gross-profit"]) {
      const report = await getReport(type, new URLSearchParams());
      const metric = label => report.kpis.find(kpi => kpi.label === label)?.value;
      assert.equal(metric("Inventory Product Sales"), 500);
      assert.equal(metric("External Purchase Sales"), 440);
      assert.equal(metric("External Purchase Cost"), 360);
      assert.equal(metric("External Purchase Profit"), 80);
      if (type === "gross-profit") assert.equal(metric("Gross Profit"), null);
    }
  } finally { Sale.find = originalFind; }
});
