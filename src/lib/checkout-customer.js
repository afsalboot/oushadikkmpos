const clean = (value) => String(value || "").trim();
const phoneKey = (value) => {
  const digits = clean(value).replace(/\D/g, "");
  return digits.length > 10 && (digits.startsWith("91") || digits.startsWith("0"))
    ? digits.slice(-10) : digits;
};

export function resolveCheckoutCustomer(name, phone, customers = [], selected = null) {
  name = clean(name);
  phone = clean(phone);
  if (!name && !phone) return { customerType: "WALK_IN" };
  const retail = customers.filter((customer) => customer.customerType !== "WHOLESALE");
  if (selected && selected.customerType !== "WHOLESALE")
    return { customerType: "EXISTING", customerId: selected._id };
  const matches = retail.filter((customer) => phone
    ? phoneKey(customer.phone) === phoneKey(phone)
    : clean(customer.name).toLowerCase() === name.toLowerCase());
  if (matches.length > 1) throw new Error("Multiple customers match. Select the correct customer below.");
  if (matches.length === 1) return { customerType: "EXISTING", customerId: matches[0]._id };
  return { customerType: "NEW", customer: { name: name || phone, phone, customerType: "RETAIL" } };
}
