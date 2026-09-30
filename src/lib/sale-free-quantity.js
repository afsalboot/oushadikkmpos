export function saleFreeQuantity(value, { wholesale, saleMode, countBased = false, role }) {
  const quantity = Number(value ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0)
    throw new Error("Free quantity must be zero or greater");
  if (quantity > 0 && !wholesale)
    throw new Error("Select Wholesale to add free quantity");
  if (quantity > 0 && role !== "ADMIN")
    throw new Error("Only an administrator can change wholesale free quantity");
  if (quantity > 0 && !["PACKAGE", "LOOSE"].includes(saleMode))
    throw new Error("Free quantity is available for individual products");
  if ((saleMode === "PACKAGE" || countBased) && !Number.isSafeInteger(quantity))
    throw new Error("Free quantity must be a whole number");
  return quantity;
}
