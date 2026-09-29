import test from "node:test";
import assert from "node:assert/strict";
import { resolveCheckoutCustomer as resolve } from "../src/lib/checkout-customer.js";

const customers = [
  { _id: "retail", name: "Anu", phone: "9876543210", customerType: "RETAIL" },
  { _id: "legacy", name: "Ravi", phone: "9876543211" },
  { _id: "wholesale", name: "Wholesale", phone: "9876543212", customerType: "WHOLESALE" },
];
test("blank customer fields complete as walk-in", () => {
  assert.deepEqual(resolve("  ", ""), { customerType: "WALK_IN" });
});
test("exact names and normalized phone numbers link existing retail customers", () => {
  assert.equal(resolve(" anu ", "", customers).customerId, "retail");
  assert.equal(resolve("", "+91 98765 43210", customers).customerId, "retail");
  assert.equal(resolve("Ravi", "", customers).customerId, "legacy");
});
test("unmatched name or number creates a new retail customer", () => {
  assert.deepEqual(resolve("New person", ""), {
    customerType: "NEW", customer: { name: "New person", phone: "", customerType: "RETAIL" },
  });
  assert.equal(resolve("", "9876543222").customer.name, "9876543222");
  assert.equal(resolve("An", "", customers).customerType, "NEW");
});
test("phone takes precedence over a shared name and wholesale is excluded", () => {
  assert.equal(resolve("Anu", "9876543222", customers).customerType, "NEW");
  assert.equal(resolve("Wholesale", "9876543212", customers).customerType, "NEW");
});
test("ambiguous names require selection and explicit selection resolves ambiguity", () => {
  const matches = [...customers, { _id: "second", name: "Anu" }];
  assert.throws(() => resolve("Anu", "", matches), /Multiple customers/);
  assert.equal(resolve("Anu", "", matches, matches[3]).customerId, "second");
});

test("checked wholesale customer entry matches only the wholesale directory", () => {
  assert.equal(resolve("", "+91 98765 43212", customers, null, "WHOLESALE").customerId, "wholesale");
  assert.deepEqual(resolve("New trader", "9876543222", customers, null, "WHOLESALE"), {
    customerType: "NEW", customer: { name: "New trader", phone: "9876543222", customerType: "WHOLESALE" },
  });
});

test("switching wholesale clears incompatible selected customer identity", () => {
  const wholesale = resolve("Anu", "9876543210", customers, customers[0], "WHOLESALE");
  assert.equal(wholesale.customerType, "NEW");
  assert.equal(wholesale.customer.customerType, "WHOLESALE");
  const retail = resolve("Wholesale", "9876543212", customers, customers[2], "RETAIL");
  assert.equal(retail.customerType, "NEW");
  assert.equal(retail.customer.customerType, "RETAIL");
});

test("wholesale discount without customer details stays walk-in", () => {
  assert.deepEqual(resolve("", "", [], null, "WHOLESALE"), { customerType: "WALK_IN" });
  assert.equal(resolve("Trader", "", [], null, "WHOLESALE").customer.customerType, "WHOLESALE");
});
