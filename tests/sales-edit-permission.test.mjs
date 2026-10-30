import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToString } from 'react-dom/server';
import mongoose from 'mongoose';
import { canAccess, workspaceHome } from '../src/lib/workspace-access.js';
import { flattenPermissions, getEffectivePermissionObject, normalizePermissionOverrides } from '../src/services/rbac.service.js';
import { saleEditProblem } from '../src/lib/sale-edit.js';
import { saleForActor } from '../src/lib/external-purchase.js';

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const authSource = read('lib/auth.js').match(/export async function requireSession\(requirement\)[^\n]+/)[0].replace('export ', '');
const guardSource = read('lib/server/workspace-access.js').replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
const routeSource = read('app/api/sales/[id]/route.js').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const id = new mongoose.Types.ObjectId().toString();
const sale = { _id: id, invoiceNumber: 'INV-EXISTING', paymentStatus: 'PAID', total: 100, items: [], payments: [] };
const creator = { role: 'STAFF', permissions: ['sales.view', 'sales.create'] };
const editor = { role: 'STAFF', permissions: ['sales.view', 'sales.edit'] };
const authFor = session => new Function('readSession', 'canAccess', `${authSource};return requireSession;`)(async () => session, canAccess);
const effectiveSession = user => ({ role: user.role, permissions: flattenPermissions(getEffectivePermissionObject(user)) });

function route(session, bill = sale) {
  const calls = [];
  const deps = {
    mongoose, requireSession: authFor(session), canAccess, saleEditProblem, saleForActor,
    connectDb: async () => { calls.push('connect'); },
    Sale: { findById: () => ({ populate() { return this; }, lean: async () => { calls.push('sale'); return bill; } }) },
    requestTiming: () => ({ measure: (_name, work) => work(), finish: response => response }),
    getSaleEditData: async () => { calls.push('edit'); return { sale: bill, products: [] }; },
    getSaleEditProductPage: async () => { calls.push('products'); return { rows: [] }; },
    ok: data => Response.json({ data }), fail: (error, status) => Response.json({ error }, { status }),
    apiError: error => Response.json({ error: error.message }, { status: error.message === 'UNAUTHORIZED' ? 401 : ['FORBIDDEN', 'PASSWORD_CHANGE_REQUIRED'].includes(error.message) ? 403 : 500 }),
  };
  const get = new Function(...Object.keys(deps), `${routeSource};return GET;`)(...Object.values(deps));
  return { calls, get: query => get(new Request(`http://localhost/api/sales/${id}${query}`), { params: Promise.resolve({ id }) }) };
}

test('sale detail edit capability follows saved roles, individual overrides, and owner access', async () => {
  for (const roleName of ['Existing role', 'Future role']) {
    const user = { role: 'STAFF', roleId: { name: roleName, permissions: { sales: { view: true, create: true, edit: true } } } };
    const granted = route(effectiveSession(user));
    assert.equal((await (await granted.get('')).json()).data.canEdit, true);
    const deniedUser = { ...user, permissionOverrides: normalizePermissionOverrides({ sales: { view: true, create: true, edit: false } }) };
    const denied = route(effectiveSession(deniedUser));
    const response = await denied.get('');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.canEdit, false);
    assert.equal((await denied.get('?edit=true')).status, 403);
    assert.equal((await denied.get('?edit=true&view=products')).status, 403);
  }
  assert.equal((await (await route({ role: 'ADMIN' }).get('')).json()).data.canEdit, true);
  assert.equal((await (await route(creator).get('')).json()).data.canEdit, false);
  assert.equal((await (await route(editor).get('')).json()).data.canEdit, true);
});

test('both edit reads deny unauthorized staff before sale/product access and allow assigned staff', async () => {
  for (const query of ['?edit=true', '?edit=true&view=products']) {
    for (const session of [creator, { role: 'STAFF', permissions: ['sales.view', 'products.edit'] }, { role: 'STAFF', permissions: [] }, null, { ...editor, mustChangePassword: true }]) {
      const denied = route(session);
      assert.equal((await denied.get(query)).status, session ? 403 : 401);
      assert.deepEqual(denied.calls, []);
    }
    for (const session of [editor, { role: 'ADMIN' }]) {
      const allowed = route(session);
      assert.equal((await allowed.get(query)).status, 200);
      assert.equal(allowed.calls.at(-1), query.includes('products') ? 'products' : 'edit');
    }
  }
});

test('edit permission keeps tax, cancelled and credit bill locks enforced', async () => {
  for (const locked of [{ gstEnabled: true }, { documentStatus: 'CANCELLED' }, { paymentStatus: 'CREDIT' }]) {
    const h = route(editor, { ...sale, ...locked });
    assert.equal((await (await h.get('')).json()).data.canEdit, false);
    assert.equal((await h.get('?edit=true')).status, 422);
    assert.equal((await h.get('?edit=true&view=products')).status, 422);
    assert.equal(h.calls.includes('edit') || h.calls.includes('products'), false);
  }
});

const compile = async (path, extra = '') => (await transform(read(path) + extra, {
  filename: path, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
})).code;
const [pageCode, staffCode, detailCode] = await Promise.all([
  compile('app/(workspace)/sales/page.js'),
  compile('components/StaffWorkspace.jsx', '\nexport { PermissionMatrix };'),
  compile('components/SaleSourceDetails.jsx'),
]);
function evaluate(code, overrides = {}) {
  const fixture = { exports: {} };
  const placeholder = ({ children }) => React.createElement('span', null, children);
  const dependencies = name => {
    if (name in overrides) return overrides[name];
    if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { ...props, href }, children) };
    if (name.startsWith('@/')) return { __esModule: true, default: placeholder };
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(dependencies, fixture, fixture.exports);
  return fixture.exports;
}

test('direct sale edit URL redirects denied staff before mounting the workspace', async () => {
  const pageFor = session => {
    const guard = new Function('readSession', 'redirect', 'canAccess', 'workspaceHome', `${guardSource};return requireWorkspacePage;`)(
      async () => session, destination => { throw Object.assign(new Error('redirect'), { destination }); }, canAccess, workspaceHome,
    );
    return evaluate(pageCode, { '@/lib/server/workspace-access': { requireWorkspacePage: guard } }).default;
  };
  await assert.rejects(pageFor(creator)({ searchParams: Promise.resolve({ edit: id }) }), error => error.destination === '/sales');
  await assert.rejects(pageFor(null)({ searchParams: Promise.resolve({ edit: id }) }), error => error.destination === '/login');
  await assert.rejects(pageFor({ ...editor, mustChangePassword: true })({ searchParams: { edit: id } }), error => error.destination === '/change-password');
  for (const session of [editor, { role: 'ADMIN' }]) {
    const tree = await pageFor(session)({ searchParams: Promise.resolve({ edit: id }) });
    assert.equal(tree.props.children[0].props.editSaleId, id);
  }
  const tree = await pageFor(creator)({ searchParams: Promise.resolve({}) });
  assert.equal(tree.props.children[0].props.editSaleId, null);
});

test('permission matrix names the Sales action and sale detail only offers authorized editing', () => {
  const { PermissionMatrix } = evaluate(staffCode);
  const html = renderToString(React.createElement(PermissionMatrix, { value: { sales: { view: true, edit: false } }, onChange: () => {} }));
  assert.match(html, /Edit sale \/ Add products/);
  for (const canEdit of [false, true]) {
    const Component = evaluate(detailCode, { react: { ...React, useEffect: () => {}, useState: value => [value === null ? { ...sale, canEdit } : value === true ? false : value, () => {}] } }).default;
    const detail = renderToString(React.createElement(Component, { id }));
    assert.equal(detail.includes('Edit sale / Add products'), canEdit);
    assert.equal(detail.includes(`/sales?edit=${id}`), canEdit);
  }
});
