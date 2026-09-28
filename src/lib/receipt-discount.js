export function receiptDiscountLabel(sale) {
  const summary = sale?.discountSummary;
  const label = summary?.reason === "Wholesale discount" ? "Wholesale discount" : "Discount";
  if (!summary?.discountType && Number(sale?.discount) > 0 && Number(sale?.subtotal) > 0) {
    const effective = Math.round(Number(sale.discount) / Number(sale.subtotal) * 10000) / 100;
    return `${label} (${effective}% effective)`;
  }
  return summary?.discountType === "PERCENTAGE" && Number(summary.discountValue) > 0
    ? `${label} (${Number(summary.discountValue)}%)` : label;
}
