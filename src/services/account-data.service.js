import { Sale, Expense, Purchase, Consultation, Settings } from '../models/index.js';
import { buildAccountLedger } from './accounting.service.js';

// Keep all-history balances, but omit full invoice items and unrelated snapshots.
export async function getAccountData(options = {}, timing) {
  const measure = (name, work) => timing ? timing.measure(name, work) : work();
  const [sales, expenses, purchases, consultations, settings] = await Promise.all([
    measure('sale_movements', () => Sale.aggregate([{ $sort: { createdAt: 1 } }, { $project: { invoiceNumber: 1, createdAt: 1, total: 1, 'payments.method': 1, 'payments.amount': 1, 'payments.reference': 1, 'payments.paidAt': 1, 'customerSnapshot.name': 1, 'cashierSnapshot.name': 1, actorId: 1, itemCount: { $size: { $ifNull: ['$items', []] } } } }])),
    measure('expense_movements', () => Expense.find().select('expenseNumber expenseDate createdAt status amount paidAmount source referenceId title description category paidTo staffId staffSnapshot.name paymentMethod paymentReference actorId creatorSnapshot.name').populate('actorId', 'name role').populate('staffId', 'name email role').sort({ expenseDate: 1 }).lean()),
    measure('purchase_references', () => Purchase.find().select('purchaseNumber supplierSnapshot.name supplierInvoiceNumber total amountPaid balanceDue paymentReference').lean()),
    measure('consultations', () => Consultation.find().select('opNumber patient.name doctorSnapshot.name creatorSnapshot.name paymentMethod paymentReference consultationFee createdAt status refundedAmount cancelledAt cancellationReason refundReference').lean()),
    Settings.findOne({key:'global'}).select('payments').lean(),
  ]);
  await measure('sale_actors', () => Sale.populate(sales, { path: 'actorId', select: 'name role' }));
  return measure('ledger', () => buildAccountLedger(sales, expenses, { ...options, purchases, consultations, enabledMethods: options.inferPaymentMethods ? settings?.payments?.enabledMethods : settings?.payments?.enabledMethods || ['CASH', 'UPI', 'BANK'] }));
}
