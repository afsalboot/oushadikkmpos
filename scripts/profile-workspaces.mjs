// Read-only before/after diagnostics. Do not create indexes or collections.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = path.resolve('src', specifier.slice(2));
    const file = [base + '.js', path.join(base, 'index.js')].find(existsSync);
    if (file) return next(pathToFileURL(file).href, context);
  }
  return next(specifier, context);
} });
process.loadEnvFile('.env.local');
mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
const measurements = [];
const measure = async (name, work) => { const start = performance.now(); const value = await work(); measurements.push({ name, ms: Math.round(performance.now() - start), bytes: Buffer.byteLength(JSON.stringify(value)) }); return value; };
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  const models = await import('../src/models/index.js');
  const { buildAccountLedger } = await import('../src/services/accounting.service.js');
  const params = new URLSearchParams({ dateFrom: '2026-09-14', dateTo: '2026-10-13', page: '1', limit: '25', order: 'desc' });
  const legacySource = execFileSync('git', ['show', 'HEAD:src/services/report.service.js'], { encoding: 'utf8' }).replace(/from "(\.[^"]+)"/g, (_match, specifier) => 'from ' + JSON.stringify(pathToFileURL(path.resolve('src/services', specifier)).href));
  const legacy = await import('data:text/javascript;base64,' + Buffer.from(legacySource).toString('base64'));
  let beforeAccounts, beforeReport;
  if (process.argv.includes('--baseline') || process.argv.includes('--parity')) {
    beforeAccounts = await measure('accounts-before', async () => {
      const [sales, expenses, purchases, settings, consultations] = await Promise.all([
        models.Sale.find().populate('actorId', 'name role').sort({ createdAt: 1 }).lean(),
        models.Expense.find().populate('actorId', 'name role').populate('staffId', 'name email role').sort({ expenseDate: 1 }).lean(),
        models.Purchase.find().select('purchaseNumber supplierSnapshot supplierInvoiceNumber total amountPaid balanceDue paymentReference').lean(),
        models.Settings.findOne({ key: 'global' }).select('payments').lean(), models.Consultation.find().lean(),
      ]);
      return buildAccountLedger(sales, expenses, { purchases, consultations, enabledMethods: settings?.payments?.enabledMethods || ['CASH', 'UPI', 'BANK'], page: 1, limit: 25, sort: 'date', order: 'desc' });
    });
    beforeReport = await measure('overview-before', () => legacy.getReport('overview', params));
  }
  if (!process.argv.includes('--baseline')) {
    const { getAccountData } = await import('../src/services/account-data.service.js');
    const { getReport } = await import('../src/services/report.service.js');
    const { getProductCatalogue } = await import('../src/services/product-catalogue.service.js');
    for (let run = 1; run <= 2; run++) {
      const account = await measure('accounts-after-' + run, () => getAccountData({ page: 1, limit: 25, sort: 'date', order: 'desc' }));
      const report = await measure('overview-after-' + run, () => getReport('overview', params));
      await measure('catalogue-page-' + run, () => getProductCatalogue(new URLSearchParams({ page: '1', limit: '20' })));
      if (beforeAccounts) assert.deepEqual(account, beforeAccounts);
      if (beforeReport) assert.deepEqual(report, beforeReport);
    }
  }
  console.log(JSON.stringify({ measurements, parity: process.argv.includes('--parity') ? 'PASS' : undefined, databaseWrites: 0 }));
} catch (error) { console.error(JSON.stringify({ error: error.name, code: error.code, operator: error.operator, measurements })); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
