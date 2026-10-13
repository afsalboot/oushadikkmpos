import test from 'node:test';
import assert from 'node:assert/strict';
import { salesCacheScope, salesCacheResponse } from '../src/lib/sales-cache-scope.js';
import { salesMutation } from '../src/lib/sales-mutation.js';
const session = { storeId: 'store', sub: 'cashier', authVersion: 1, role: 'STAFF', permissions: ['sales.view', 'products.view'] };
test('cache scope includes validated store, user, auth version, role and permissions; permission order is stable', () => {
  const scope = salesCacheScope(session);
  assert.equal(scope, salesCacheScope({ ...session, permissions: [...session.permissions].reverse() }));
  for (const change of [{ storeId: 'other' }, { sub: 'other' }, { authVersion: 2 }, { role: 'ADMIN' }, { permissions: ['sales.view'] }]) assert.notEqual(scope, salesCacheScope({ ...session, ...change }));
  assert.ok(salesCacheScope({ ...session, storeId: undefined }).startsWith('volatile:'));
  assert.equal(salesCacheResponse(Response.json({}), session).headers.get('X-Sales-Cache-Scope'), scope);
});
test('invalidation signals contain product IDs only, including mixture ingredients and restored edit allocations', () => {
  const id = '000000000000000000000001', other = '000000000000000000000002';
  const signal = salesMutation('/api/sales', 'POST', { customerName: 'private', items: [{ productId: id, ingredients: [{ productId: other }] }] }, { affectedProductIds: [other] });
  assert.deepEqual(signal, { kind: 'stock', ids: [id, other] });
  assert.deepEqual(salesMutation('/api/sales', 'POST', { editSaleId: id, items: [{ productId: id }] }), { kind: 'stock', ids: [] });
  assert.equal(salesMutation('/api/auth/logout', 'POST').kind, 'session');
  assert.equal(salesMutation('/api/customers', 'POST').kind, 'unrelated');
  assert.equal(salesMutation('/api/backups/restore', 'POST').kind, 'catalogue');
});
