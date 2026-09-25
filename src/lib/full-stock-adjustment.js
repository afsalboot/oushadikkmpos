export function planFullStockAdjustment(batches, fullStock) {
  if (!Number.isSafeInteger(fullStock) || fullStock < 0) {
    throw new Error("Full stock must be a non-negative whole number");
  }
  const current = batches.reduce((total, batch) => total + Number(batch.sealedPackages || 0), 0);
  const difference = fullStock - current;
  let remaining = Math.max(0, -difference);
  const deductions = [];
  for (const batch of batches) {
    const quantity = Math.min(Number(batch.sealedPackages || 0), remaining);
    if (quantity > 0) deductions.push({ batchId: batch._id, quantity });
    remaining -= quantity;
  }
  return { current, difference, additions: Math.max(0, difference), deductions };
}
