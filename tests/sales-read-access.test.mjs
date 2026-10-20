import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { canAccess } from '../src/lib/workspace-access.js';
import { salesSettings } from '../src/lib/sales-settings.js';
import { normalizeBarcode, validateBarcode } from '../src/lib/barcode.js';

const authSource = readFileSync(new URL('../src/lib/auth.js', import.meta.url), 'utf8').match(/export async function requireSession\(requirement\)[^\n]+/)[0].replace('export ', '');
const authFor = session => new Function('readSession', 'canAccess', `${authSource};return requireSession;`)(async () => session, canAccess);
const staff = { sub: 'staff', role: 'STAFF', permissions: ['sales.view', 'sales.create'] };
const id = new mongoose.Types.ObjectId().toString();
const product = { _id: id, name: 'Oil', active: true, visibleInSales: true, barcode: 'POS-00000125', stock: { hasStock: true } };
const query = value => ({ select() { return this; }, sort() { return this; }, lean: async () => value });

function route(file, session = staff) {
  const calls = [];
  const source = readFileSync(new URL(`../src/app/api/${file}/route.js`, import.meta.url), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '').replaceAll('export ', '');
  const deps = {
    mongoose, requireSession: authFor(session), connectDb: async () => {},
    ok: data => Response.json({ data }), fail: (error, status = 400) => Response.json({ error }, { status }),
    apiError: error => Response.json({ error: error.message }, { status: error.message === 'UNAUTHORIZED' ? 401 : ['FORBIDDEN', 'PASSWORD_CHANGE_REQUIRED'].includes(error.message) ? 403 : 500 }),
    requestTiming: () => ({ measure: (_name, work) => work(), finish: value => value }),
    salesCacheResponse: response => { response.headers.set('X-Sales-Cache-Scope', 'fixture-scope'); return response; },
    getProducts: async (filter, options) => { calls.push({ filter, options }); return [product]; },
    Product: { countDocuments: async () => 1, aggregate: async () => [{ _id: id }] },
    Category: { find: () => query([{ _id: id, name: 'Oils' }]) },
    getProductDetails: async () => { throw new Error('Administrative detail must not be read'); },
    getSalesRevision: async () => 'revision', getSalesIndex: async () => ({ rows: [product], complete: true }), SALES_INDEX_SCHEMA_VERSION: 1,
    productStockFilterPipeline: () => [], normalizeBarcode, validateBarcode,
    getSettings: async () => ({ payments: { enabledMethods: ['CASH'] }, security: { sessionTimeoutMinutes: 480 }, backup: { directory: 'private' } }),
    salesSettings, usesDatabaseBackupStorage: () => true,
  };
  const get = new Function(...Object.keys(deps), `${source};return GET;`)(...Object.values(deps));
  return { calls, get: (params = '', context) => get(new Request('http://localhost/api/' + file + params), context) };
}

test('multi-permission reads retain authentication, forced-password and owner checks', async () => {
  assert.equal(await authFor(staff)(['sales.view', 'products.view']), staff);
  await assert.rejects(authFor(staff)('products.view'), /FORBIDDEN/);
  await assert.rejects(authFor(staff)('ADMIN'), /FORBIDDEN/);
  await assert.rejects(authFor(null)(['sales.view', 'products.view']), /UNAUTHORIZED/);
  await assert.rejects(authFor({ ...staff, mustChangePassword: true })(['sales.view', 'products.view']), /PASSWORD_CHANGE_REQUIRED/);
});

test('Sales-only staff can read the POS product page, details, stock filters and index', async () => {
  const list = route('products');
  const response = await list.get('?sales=true&page=1&limit=50');
  assert.equal(response.status, 200);
  assert.equal(list.calls[0].options.salesOnly, true);
  assert.equal(list.calls[0].filter.active, true);
  assert.deepEqual(list.calls[0].filter.visibleInSales, { $ne: false });
  assert.equal(response.headers.get('X-Sales-Cache-Scope'), 'fixture-scope');
  assert.equal((await route('products').get('?view=sales-stock-ids&stock=low')).status, 200);
  assert.equal((await route('products/sales-index').get()).status, 200);
  assert.equal((await route('products/[id]').get('?sales=true', { params: Promise.resolve({ id }) })).status, 200);
  assert.equal((await route('products/barcode/[barcode]').get('?context=sale', { params: Promise.resolve({ barcode: product.barcode }) })).status, 200);
});

test('Sales permissions never grant catalogue management, unrestricted details, purchasing scans or full settings', async () => {
  for (const params of ['', '?view=catalogue', '?view=options', '?sales=true&view=catalogue']) assert.equal((await route('products').get(params)).status, 403, params);
  assert.equal((await route('products/[id]').get('', { params: Promise.resolve({ id }) })).status, 403);
  assert.equal((await route('products/barcode/[barcode]').get('?context=purchase', { params: Promise.resolve({ barcode: product.barcode }) })).status, 403);
  assert.equal((await route('settings').get()).status, 403);
  assert.equal((await route('categories').get()).status, 403);
});

test('Sales-specific categories and settings succeed for Sales staff and deny unrelated staff', async () => {
  assert.equal((await route('categories').get('?context=sale')).status, 200);
  const response = await route('settings').get('?view=sales');
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(data.payments.enabledMethods, ['CASH']);
  assert.equal(data.security, undefined);
  assert.equal(data.backup, undefined);
  const other = { role: 'STAFF', permissions: ['consultation.view', 'doctor.view'] };
  assert.equal((await route('settings', other).get('?view=sales')).status, 403);
  assert.equal((await route('categories', other).get('?context=sale')).status, 403);
  assert.equal((await route('products', other).get('?sales=true')).status, 403);
  assert.equal((await route('products/sales-index', other).get()).status, 403);
});
