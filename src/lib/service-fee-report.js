import { saleFeeTotals } from './sale-revenue.js';
import { sumMoney } from './money.js';

export function buildServiceFeeReport(sales, parameters = new URLSearchParams()) {
  const query = String(parameters.get('search') || '').trim().toLowerCase();
  let rows = sales.filter(sale => sale.documentStatus !== 'CANCELLED').map(sale => ({
    date: sale.createdAt,
    invoice: sale.historyOnly ? 'Historical sale (bill deleted)' : sale.invoiceNumber,
    customer: sale.customerType === 'WALK_IN' ? 'Walk-in Customer' : sale.customerSnapshot?.name || 'Registered Customer',
    staff: sale.actorId?.name || sale.cashierSnapshot?.name || 'Cashier',
    ...saleFeeTotals(sale),
    sourcePath: sale.historyOnly ? null : `/sales/${sale._id}`,
  })).filter(row => row.totalFees > 0 && (!query || [row.invoice, row.customer, row.staff].some(value => String(value || '').toLowerCase().includes(query))));
  const kpis = [
    { label: 'Consultation Fees (Sales Cart)', value: sumMoney(rows.map(row => row.consultationFee)), type: 'money' },
    { label: 'Treatment Fees', value: sumMoney(rows.map(row => row.treatmentFee)), type: 'money' },
    { label: 'Total Fees', value: sumMoney(rows.map(row => row.totalFees)), type: 'money' },
    { label: 'Invoices with Fees', value: rows.length },
  ];
  const columns = [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'invoice', label: 'Invoice' },
    { key: 'customer', label: 'Customer' }, { key: 'staff', label: 'Staff' },
    { key: 'consultationFee', label: 'Consultation fee', type: 'money' },
    { key: 'treatmentFee', label: 'Treatment fee', type: 'money' },
    { key: 'totalFees', label: 'Total fees', type: 'money' },
  ];
  const sort = parameters.get('sort'), order = parameters.get('order') === 'asc' ? 1 : -1;
  if (columns.some(column => column.key === sort)) rows = rows.toSorted((a, b) => {
    if (sort === 'date') return (+new Date(a.date) - +new Date(b.date)) * order;
    return (typeof a[sort] === 'number' ? a[sort] - b[sort] : String(a[sort] || '').localeCompare(String(b[sort] || ''))) * order;
  });
  const page = Math.max(1, Number(parameters.get('page')) || 1);
  const limit = parameters.get('format') === 'csv' ? Math.max(1, rows.length) : Math.min(100, Math.max(1, Number(parameters.get('limit')) || 25));
  const total = rows.length;
  return {
    title: 'Consultation & Treatment Fees',
    description: 'Fees billed in the Sales cart, tracked separately from product sales. OP tickets use the Consultation report. Payment Methods shows actual collections.',
    columns, kpis, rows: rows.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }, charts: {},
  };
}
