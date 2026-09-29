export function directCheckoutPayments(settings, total, request) {
  if (request.skipCheckout !== true) return null;
  if (settings?.checkout?.enabled !== false) throw new Error("Checkout is enabled. Open checkout and try again.");
  if (!(settings?.payments?.enabledMethods || ["CASH", "UPI"]).includes("CASH")) throw new Error("Enable Cash in Settings to use direct checkout.");
  if (request.credit === true) throw new Error("Direct checkout requires full Cash payment.");
  return [{ method: "CASH", amount: total, reference: "" }];
}
