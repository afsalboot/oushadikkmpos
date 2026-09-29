export function getBatchExpirySummary(batches = [], now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const expired = batches.filter((batch) =>
    (Number(batch.sealedPackages || 0) > 0 || Number(batch.openQuantity || 0) > 0) &&
    batch.expiryDate && new Date(batch.expiryDate) < today,
  );
  return {
    expired: expired.length > 0,
    expiredBatchCount: expired.length,
    nearestExpiredExpiry: expired.length
      ? new Date(Math.min(...expired.map((batch) => new Date(batch.expiryDate).getTime()))).toISOString()
      : null,
  };
}
