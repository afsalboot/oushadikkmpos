import { money as amount } from './money.js';

// One contract for checkout controls and the existing server payment rules.
export function validateSalePayments(settings, requested, total, creditRequested = false) {
  if (creditRequested) return [];
  if (requested.length > 1 && settings?.payments?.splitPayment === false)
    throw new Error('Split payment is disabled in Settings');
  const enabled = settings?.payments?.enabledMethods || ['CASH', 'UPI'];
  if (!requested.length || requested.some(row => !enabled.includes(row.method) || !Number.isFinite(Number(row.amount)) || !(Number(row.amount) > 0)))
    throw new Error('Select an enabled payment method');
  if (requested.some(row => ['UPI', 'BANK'].includes(row.method) && settings?.payments?.[row.method.toLowerCase()]?.requireReference && !String(row.reference || '').trim()))
    throw new Error('Payment reference is required for the selected method');
  const paid = amount(requested.reduce((sum, row) => sum + Number(row.amount), 0));
  if (Math.abs(paid - total) > 0.009) throw new Error('Payment amounts must equal the invoice total');
  return requested.map(row => ({ method: row.method, amount: amount(row.amount), reference: String(row.reference || '').trim() }));
}

export function checkoutPaymentOptions(settings, wholesale = false) {
  const enabled = settings?.payments?.enabledMethods || ['CASH', 'UPI'];
  const options = ['CASH', 'UPI', 'BANK', 'CARD'].filter(method => enabled.includes(method));
  if (settings?.payments?.splitPayment !== false && enabled.includes('CASH') && enabled.includes('UPI')) options.push('SPLIT');
  if (wholesale) options.push('CREDIT');
  return options;
}

export function checkoutPayments(method, total, { splitCash, splitUpi, reference = '' } = {}) {
  if (method === 'CREDIT') return [];
  if (method === 'SPLIT') return [{ method: 'CASH', amount: Number(splitCash) }, { method: 'UPI', amount: Number(splitUpi), reference }];
  return [{ method, amount: total, reference: ['UPI', 'BANK', 'CARD'].includes(method) ? reference : '' }];
}
