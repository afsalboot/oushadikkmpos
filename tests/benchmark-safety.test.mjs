import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkWriteBlocked } from '../src/lib/benchmark-safety.js';

test('diagnostic barrier blocks every financial, stock, customer and backup write including direct checkout', () => {
  for (const path of ['/api/sales', '/api/sales/fixture/refund', '/api/customers', '/api/customers/fixture/payments', '/api/inventory/open', '/api/products', '/api/purchases', '/api/backups', '/api/settings', '/api/auth/setup']) {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) assert.equal(benchmarkWriteBlocked(true, method, path), true);
    assert.equal(benchmarkWriteBlocked(true, 'GET', path), false);
    assert.equal(benchmarkWriteBlocked(false, 'POST', path), false);
  }
  assert.equal(benchmarkWriteBlocked(true, 'POST', '/api/auth/login'), false);
  assert.equal(benchmarkWriteBlocked(true, 'DELETE', '/api/auth/login'), true);
  assert.equal(benchmarkWriteBlocked(true, 'POST', '/api/auth/login/extra'), true);
});
