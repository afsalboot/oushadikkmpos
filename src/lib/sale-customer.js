const MAX_DOCTOR_NAME_LENGTH = 120;

export function normalizeDoctorName(value) {
  const doctorName = String(value || "").trim();
  if (doctorName.length > MAX_DOCTOR_NAME_LENGTH)
    throw new Error("Doctor name cannot exceed 120 characters");
  return doctorName;
}

export function customerValue(customer, field) {
  if (!customer) return undefined;
  if (typeof customer.get === "function") return customer.get(field);
  return customer[field];
}

const money = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function prepareWholesaleCredit({ saleType, requested, customer, total }) {
  if (!requested) return null;
  if (saleType !== "WHOLESALE" || !isWholesaleCustomer(customer)) {
    throw Object.assign(
      new Error("Credit checkout is available only for wholesale customers"),
      { status: 422 },
    );
  }

  const invoiceTotal = money(total);
  const creditLimit = money(Math.max(0, Number(customerValue(customer, "creditLimit") || 0)));
  const outstandingBefore = money(
    Math.max(0, Number(customerValue(customer, "outstandingAmount") || 0)),
  );
  const availableBefore = money(Math.max(0, creditLimit - outstandingBefore));

  if (!(creditLimit > 0)) {
    throw Object.assign(
      new Error("Set a credit limit for this wholesale customer before using credit"),
      { status: 422 },
    );
  }
  if (!(invoiceTotal > 0) || invoiceTotal > availableBefore) {
    throw Object.assign(
      new Error(
        `Credit limit exceeded. Available credit is ₹${availableBefore.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
      ),
      { status: 422 },
    );
  }

  return {
    paymentStatus: "UNPAID",
    amountPaid: 0,
    balanceDue: invoiceTotal,
    outstandingBefore,
    outstandingAfter: money(outstandingBefore + invoiceTotal),
    creditLimit,
  };
}

export function isWholesaleCustomer(customer) {
  return customerValue(customer, "customerType") === "WHOLESALE";
}

export function buildCustomerSnapshot(customer, doctorName) {
  const snapshot = customer
    ? {
        name: customerValue(customer, "name"),
        phone: customerValue(customer, "phone"),
        email: customerValue(customer, "email"),
        address: customerValue(customer, "address"),
        customerType: customerValue(customer, "customerType") || "RETAIL",
        businessName: customerValue(customer, "businessName") || "",
        gstin: customerValue(customer, "gstin") || "",
        billingAddress:
          customerValue(customer, "billingAddress") ||
          customerValue(customer, "address") ||
          "",
        shippingAddress: customerValue(customer, "shippingAddress") || "",
      }
    : { name: "Walk-in Customer" };
  return { ...snapshot, doctorName: normalizeDoctorName(doctorName) };
}
