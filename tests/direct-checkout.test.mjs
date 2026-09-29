import test from "node:test";
import assert from "node:assert/strict";
import { directCheckoutPayments } from "../src/lib/direct-checkout.js";
import { normalizeSettings, validateSettings } from "../src/services/settings.service.js";

test("checkout window remains enabled for existing settings", () => {
  assert.equal(normalizeSettings({}).checkout.enabled, true);
  assert.equal(directCheckoutPayments({}, 100, {}), null);
});

test("direct checkout requires explicit server-side enablement", () => {
  assert.throws(() => directCheckoutPayments({}, 100, { skipCheckout: true }), /Checkout is enabled/);
  assert.throws(() => directCheckoutPayments({ checkout: { enabled: true } }, 100, { skipCheckout: true }), /Checkout is enabled/);
});

test("direct checkout records the server total as Cash regardless of client payment values", () => {
  const settings = { checkout: { enabled: false }, payments: { enabledMethods: ["CASH", "UPI"] } };
  assert.deepEqual(directCheckoutPayments(settings, 250.5, { skipCheckout: true, payments: [{ method: "UPI", amount: 1 }] }), [{ method: "CASH", amount: 250.5, reference: "" }]);
  assert.throws(() => directCheckoutPayments(settings, 100, { skipCheckout: true, credit: true }), /full Cash/);
});

test("direct checkout cannot use a disabled payment method", () => {
  assert.throws(() => directCheckoutPayments({ checkout: { enabled: false }, payments: { enabledMethods: ["UPI"] } }, 100, { skipCheckout: true }), /Enable Cash/);
  const settings = normalizeSettings({ checkout: { enabled: false }, payments: { enabledMethods: ["UPI"] } });
  assert.match(validateSettings(settings)["checkout.enabled"], /Enable Cash/);
});
