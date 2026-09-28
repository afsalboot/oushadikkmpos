const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function inventoryValue(batches = [], product = {}) {
  let knownCost = 0, sellingValue = 0, missingCostBatches = 0;
  for (const batch of batches) {
    const sealed = Number(batch.sealedPackages || 0), open = Number(batch.openQuantity || 0);
    if (!sealed && !open) continue;
    const countBased = product.loosePricingMethod === "count_based";
    const units = countBased
      ? (product.looseConversionType === "fixed" ? Number(product.unitsPerPackage || 0) : 0)
      : Number(batch.packageSize || product.packageSize || 0);
    const equivalent = sealed + (units > 0 ? open / units : 0);
    const cost = Number(batch.purchasePrice || 0);
    knownCost += equivalent * cost;
    if (!(cost > 0) || (open > 0 && !(units > 0))) missingCostBatches++;
    const packagePrice = Number(product.packageSellingPrice ?? batch.sellingPrice ?? 0);
    sellingValue += sealed * packagePrice + (countBased
      ? open * Number(product.loosePricePerUnit || (units > 0 ? packagePrice / units : 0))
      : (units > 0 ? open / units * packagePrice : 0));
  }
  return { knownCost: money(knownCost), costValue: missingCostBatches ? null : money(knownCost), sellingValue: money(sellingValue), missingCostBatches };
}
