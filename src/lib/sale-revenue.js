import { money, sumMoney } from './money.js';

// Invoice totals and payments include service fees. Product sales tracking does
// not; keep the invoice's existing discount, GST and round-off allocation.
export function saleFeeTotals(sale = {}) {
  const consultationFee = money(sale.consultationFee || 0);
  const treatmentFee = money(sale.treatmentFee || 0);
  return { consultationFee, treatmentFee, totalFees: sumMoney([consultationFee, treatmentFee]) };
}

export function productSalesTotal(sale = {}) {
  return money(Number(sale.total || 0) - saleFeeTotals(sale).totalFees);
}

export const productSalesExpression = () => ({ $subtract: [
  { $ifNull: ['$total', 0] },
  { $add: [{ $ifNull: ['$consultationFee', 0] }, { $ifNull: ['$treatmentFee', 0] }] },
] });
