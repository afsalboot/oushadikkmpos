export function receiptLayout(receipt = {}) {
  const paper = receipt.width === "58mm" ? 58 : 80;
  return { paper, content: paper === 58 ? 50 : 72, logo: paper === 58 ? 44 : 62 };
}
