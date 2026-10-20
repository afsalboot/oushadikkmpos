import test from 'node:test';
import assert from 'node:assert/strict';
import { productSalesTotal, saleFeeTotals } from '../src/lib/sale-revenue.js';
import { buildServiceFeeReport } from '../src/lib/service-fee-report.js';
import { dashboardWholesale } from '../src/lib/dashboard-summary.js';
import { summarizeWholesaleSales } from '../src/lib/wholesale-reporting.js';
import { reportCsv } from '../src/services/report.service.js';

test('product sales exclude both fees while preserving discount, GST and rounding in the invoice', () => {
  const sale = { total: 118.5, consultationFee: 10, treatmentFee: 8.25 };
  assert.equal(productSalesTotal(sale), 100.25);
  assert.deepEqual(saleFeeTotals(sale), { consultationFee: 10, treatmentFee: 8.25, totalFees: 18.25 });
  assert.equal(sale.total, 118.5);
  assert.equal(productSalesTotal({ total: 90 }), 90);
  assert.equal(productSalesTotal({ total: 10, consultationFee: 10 }), 0);
});

test('both wholesale summaries exclude consultation and treatment fees', () => {
  const sales = [{ saleType: 'WHOLESALE', total: 180, consultationFee: 30, treatmentFee: 50, items: [] }];
  assert.equal(summarizeWholesaleSales(sales).revenue, 100);
  assert.equal(dashboardWholesale(sales).revenue, 100);
});

test('fee report separates fees, excludes cancellations and empty fees, and searches before totals', () => {
  const sales = [
    { _id: 'one', invoiceNumber: 'INV-ONE', total: 130, consultationFee: 10, treatmentFee: 20 },
    { _id: 'two', invoiceNumber: 'INV-TWO', consultationFee: 25 },
    { documentStatus: 'CANCELLED', treatmentFee: 999 },
    { total: 100 },
  ];
  const report = buildServiceFeeReport(sales);
  assert.equal(report.pagination.total, 2);
  assert.deepEqual(report.kpis.map(row => row.value), [35, 20, 55, 2]);
  const searched = buildServiceFeeReport(sales, new URLSearchParams({ search: 'inv-two' }));
  assert.deepEqual(searched.kpis.map(row => row.value), [25, 0, 25, 1]);
  assert.equal(report.rows[0].sourcePath, '/sales/one');
});

test('fee report paginates without losing totals and exports every matched fee', () => {
  const sales = Array.from({ length: 40 }, (_, i) => ({ _id: String(i), invoiceNumber: `INV-${i}`, treatmentFee: i + 1, date: new Date() }));
  const report = buildServiceFeeReport(sales, new URLSearchParams({ page: '2', limit: '10', sort: 'treatmentFee', order: 'desc' }));
  assert.equal(report.rows.length, 10);
  assert.equal(report.rows[0].treatmentFee, 30);
  assert.equal(report.kpis[1].value, 820);
  const exported = buildServiceFeeReport(sales, new URLSearchParams({ format: 'csv' }));
  assert.equal(exported.rows.length, 40);
  assert.match(reportCsv(exported), /Treatment fee/);
  assert.match(reportCsv(exported), /INV-39/);
  const history = buildServiceFeeReport([{ historyOnly: true, treatmentFee: 5 }]);
  assert.equal(history.rows[0].sourcePath, null);
  assert.equal(history.rows[0].invoice, 'Historical sale (bill deleted)');
});
