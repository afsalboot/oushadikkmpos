import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomerSnapshot,
  isWholesaleCustomer,
  normalizeDoctorName,
  prepareWholesaleCredit,
} from "../src/lib/sale-customer.js";

test("doctor name is trimmed and stored for a walk-in invoice", () => {
  assert.deepEqual(buildCustomerSnapshot(null, "  Dr. Maya  "), {
    name: "Walk-in Customer",
    doctorName: "Dr. Maya",
  });
});

test("doctor name is added without changing an existing customer snapshot", () => {
  const customer = {
    name: "Anu",
    phone: "123",
    email: "anu@example.com",
    address: "Town",
  };
  assert.deepEqual(buildCustomerSnapshot(customer, "Dr. Ravi"), {
    ...customer,
    customerType: "RETAIL",
    businessName: "",
    gstin: "",
    billingAddress: "Town",
    shippingAddress: "",
    doctorName: "Dr. Ravi",
  });
});

test("doctor name length is limited", () => {
  assert.throws(
    () => normalizeDoctorName("D".repeat(121)),
    /cannot exceed 120 characters/,
  );
});

test("wholesale checkout accepts only explicitly wholesale customers", () => {
  assert.equal(isWholesaleCustomer({ customerType: "WHOLESALE" }), true);
  assert.equal(isWholesaleCustomer({ customerType: "RETAIL" }), false);
  assert.equal(isWholesaleCustomer({}), false);
  assert.equal(isWholesaleCustomer(null), false);
});

test("wholesale checkout reads customer type from a hydrated database document", () => {
  const values = {
    name: "Ayurveda Distributors",
    customerType: "WHOLESALE",
    businessName: "Ayurveda Distributors LLP",
    billingAddress: "Kochi",
  };
  const customer = { get: (field) => values[field] };

  assert.equal(isWholesaleCustomer(customer), true);
  assert.deepEqual(buildCustomerSnapshot(customer, ""), {
    name: "Ayurveda Distributors",
    phone: undefined,
    email: undefined,
    address: undefined,
    customerType: "WHOLESALE",
    businessName: "Ayurveda Distributors LLP",
    gstin: "",
    billingAddress: "Kochi",
    shippingAddress: "",
    doctorName: "",
  });
});

test("wholesale credit adds the invoice to the customer outstanding balance", () => {
  assert.deepEqual(
    prepareWholesaleCredit({
      saleType: "WHOLESALE",
      requested: true,
      customer: {
        customerType: "WHOLESALE",
        creditLimit: 10000,
        outstandingAmount: 2500,
      },
      total: 1250.5,
    }),
    {
      paymentStatus: "UNPAID",
      amountPaid: 0,
      balanceDue: 1250.5,
      outstandingBefore: 2500,
      outstandingAfter: 3750.5,
      creditLimit: 10000,
    },
  );
});

test("wholesale credit enforces the available customer credit", () => {
  assert.throws(
    () =>
      prepareWholesaleCredit({
        saleType: "WHOLESALE",
        requested: true,
        customer: {
          customerType: "WHOLESALE",
          creditLimit: 1000,
          outstandingAmount: 800,
        },
        total: 250,
      }),
    /Credit limit exceeded.*200/,
  );
  assert.throws(
    () =>
      prepareWholesaleCredit({
        saleType: "SALE",
        requested: true,
        customer: { customerType: "RETAIL", creditLimit: 1000 },
        total: 100,
      }),
    /only for wholesale customers/,
  );
});
