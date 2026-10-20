import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAccess, workspaceHome, WORKSPACE_MODULES } from '../src/lib/workspace-access.js';
import { flattenPermissions, getEffectivePermissionObject } from '../src/services/rbac.service.js';
import { salesSettings } from '../src/lib/sales-settings.js';

const staff = { role: 'STAFF', permissions: ['consultation.view', 'doctor.view', 'sales.view', 'sales.create'], consultationEnabled: true };

test('landing prioritizes Dashboard, then Sales, then other permitted modules', () => {
  assert.equal(workspaceHome(staff), '/sales');
  assert.equal(workspaceHome({ ...staff, permissions: [...staff.permissions, 'dashboard.view'] }), '/dashboard');
  assert.equal(workspaceHome({ role: 'STAFF', permissions: ['sales.view'] }), '/sales');
  assert.equal(workspaceHome({ role: 'STAFF', permissions: ['doctor.view'] }), '/doctors');
  assert.equal(workspaceHome({ ...staff, consultationEnabled: false }), '/sales');
  assert.equal(workspaceHome({ ...staff, permissions: ['consultation.view', 'doctor.view'] }), '/consultations');
  assert.equal(workspaceHome({ ...staff, consultationEnabled: false, permissions: ['consultation.view', 'doctor.view'] }), '/doctors');
  assert.equal(workspaceHome({ role: 'STAFF', permissions: [] }), '/settings');
  assert.equal(workspaceHome({ role: 'ADMIN' }), '/dashboard');
  assert.equal(workspaceHome({ ...staff, mustChangePassword: true }), '/change-password');
  assert.equal(workspaceHome(null), '/login');
});

test('existing and future custom roles land in any individually assigned module', () => {
  for (const entry of WORKSPACE_MODULES) {
    const [name] = entry.permission.split('.');
    for (const roleName of ['Existing employee role', 'New custom role']) {
      const user = { role: 'STAFF', roleId: { name: roleName, permissions: { [name]: { view: true } } } };
      const session = { role: user.role, consultationEnabled: true, permissions: flattenPermissions(getEffectivePermissionObject(user)) };
      assert.equal(workspaceHome(session), entry.href);
      assert.equal(canAccess(session, 'dashboard.view'), name === 'dashboard');
    }
  }
});

test('effective role permissions and revocations determine landing without granting dependency modules', () => {
  const user = { role: 'STAFF', roleId: { permissions: { dashboard: { view: true }, sales: { create: true } } }, permissionOverrides: { dashboard: { view: false } } };
  const session = { role: user.role, permissions: flattenPermissions(getEffectivePermissionObject(user)) };
  assert.equal(workspaceHome(session), '/sales');
  assert.equal(canAccess(session, ['sales.view', 'products.view']), true);
  assert.equal(canAccess(session, 'products.view'), false);
  assert.equal(canAccess(session, 'settings.view'), false);
  assert.equal(canAccess(session, 'dashboard.view'), false);
});

test('server page guard redirects denied staff before protected workspace is returned', async () => {
  const source = readFileSync(new URL('../src/lib/server/workspace-access.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
  const makeGuard = session => new Function('readSession', 'redirect', 'canAccess', 'workspaceHome', `${source}; return requireWorkspacePage;`)(async () => session, destination => { throw Object.assign(new Error('redirect'), { destination }); }, canAccess, workspaceHome);
  assert.equal(await makeGuard(staff)('sales.view'), staff);
  for (const permission of ['dashboard.view', 'products.view', 'staff.view', 'reports.view']) {
    await assert.rejects(makeGuard(staff)(permission), error => error.destination === '/sales');
  }
  await assert.rejects(makeGuard(null)('sales.view'), error => error.destination === '/login');
  await assert.rejects(makeGuard({ ...staff, mustChangePassword: true })('sales.view'), error => error.destination === '/change-password');
});

test('Sales settings expose checkout configuration without administrative settings or capabilities', () => {
  const full = { store: { name: 'Store' }, payments: { enabledMethods: ['CASH'] }, gst: { enabled: false },
    security: { sessionTimeoutMinutes: 480 }, backup: { directory: 'private' }, dataRetention: { enabled: true }, _storeId: 'private', _capabilities: { edit: true } };
  const projected = salesSettings(full, staff);
  assert.deepEqual(projected.payments, full.payments);
  assert.deepEqual(projected.gst, full.gst);
  for (const key of ['security', 'backup', 'dataRetention', '_storeId']) assert.equal(projected[key], undefined);
  assert.equal(projected._capabilities.edit, undefined);
  assert.equal(projected._capabilities.customerLookup, false);
  assert.equal(salesSettings(full, { role: 'ADMIN' })._capabilities.customerLookup, true);
});
