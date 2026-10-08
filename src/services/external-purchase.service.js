import { isExternalPurchase } from "../lib/external-purchase.js";

// Sale issuance is serialized by FiscalGuard. All expense changes share the
// checkout transaction and its retry key; one expense per persisted sale line.
export async function syncExternalPurchaseExpenses({ sale, Expense, ExpenseCategory, session, actor }) {
  const lines = sale.items.map((item, index) => ({ item, index })).filter(({ item }) => isExternalPurchase(item) && item.externalPurchasePaymentMethod);
  const existing = await Expense.find({ source: "EXTERNAL_PURCHASE", referenceType: "SALE", referenceId: sale._id }).session(session);
  if (!lines.length && !existing.length) return;
  const category = await ExpenseCategory.findOneAndUpdate({ name: /^External Purchase$/i },
    { $setOnInsert: { name: "External Purchase", type: "SYSTEM", active: true } }, { upsert: true, new: true, session });
  for (const { item, index } of lines) {
    const paymentMethod = item.externalPurchasePaymentMethod;
    const paidAmount = paymentMethod === "CREDIT" ? 0 : item.totalPurchaseCost;
    const fields = { title: `External Purchase: ${item.name}`, category: "External Purchase", categoryId: category._id,
      description: `${sale.invoiceNumber} · ${item.quantity} ${item.packageType} · ${item.name}`, paidTo: item.externalSupplierName,
      notes: item.externalPurchaseNotes, amount: item.totalPurchaseCost, paidAmount,
      balanceDue: item.totalPurchaseCost - paidAmount, paymentMethod, source: "EXTERNAL_PURCHASE",
      referenceType: "SALE", referenceId: sale._id, saleLineIndex: index,
      externalPurchaseId: item.externalPurchaseId,
      expenseNumber: `EP-${sale._id}-${item.externalPurchaseId}`, expenseDate: sale.createdAt || new Date(),
      status: "ACTIVE", actorId: actor.sub, creatorSnapshot: { name: actor.name, role: actor.role } };
    await Expense.findOneAndUpdate({ source: "EXTERNAL_PURCHASE", referenceId: sale._id, externalPurchaseId: item.externalPurchaseId },
      { $set: fields }, { upsert: true, new: true, runValidators: true, session });
  }
  const retained = new Set(lines.map(({ item }) => item.externalPurchaseId));
  for (const expense of existing) {
    if (retained.has(expense.externalPurchaseId) || expense.status === "VOID") continue;
    // Removing a sold line is not evidence that the supplier returned money.
    // Retain the real expense and its history; annotate it for reconciliation.
    const note = `Removed from ${sale.invoiceNumber} during sale edit; supplier cost retained.`;
    if (expense.notes?.includes(note)) continue;
    expense.notes = `${expense.notes || ""}\n${note}`.trim();
    await expense.save({ session });
  }
}
