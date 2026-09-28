import test from "node:test";
import assert from "node:assert/strict";
import { resolveReceiptPrinter } from "./printer-policy.mjs";

test("each computer can select POS80, Helett, or any exact installed name", () => {
  const printers = [{ name: "POS80", isDefault: true }, { name: "Helett" }, { name: "HP Receipt (Copy 1)" }];
  for (const printer of printers) assert.equal(resolveReceiptPrinter(printers, printer.name), printer);
  assert.equal(resolveReceiptPrinter(printers, ""), printers[0]);
});
test("missing default or disconnected saved printer requires explicit selection", () => {
  assert.equal(resolveReceiptPrinter([{ name: "Helett" }], ""), null);
  assert.equal(resolveReceiptPrinter([{ name: "POS80", isDefault: true }], "Helett"), null);
  assert.equal(resolveReceiptPrinter([], "Helett"), null);
});
