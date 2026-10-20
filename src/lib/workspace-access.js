export const WORKSPACE_MODULES = [
  { href: '/dashboard', permission: 'dashboard.view' },
  { href: '/consultations', permission: 'consultation.view' },
  { href: '/doctors', permission: 'doctor.view' },
  { href: '/sales', permission: 'sales.view' },
  { href: '/products', permission: 'products.view' },
  { href: '/customers', permission: 'customers.view' },
  { href: '/purchases', permission: 'purchases.view' },
  { href: '/expenses', permission: 'expenses.view' },
  { href: '/accounts', permission: 'accounts.view' },
  { href: '/reports', permission: 'reports.view' },
  { href: '/staff', permission: 'staff.view' },
  { href: '/settings', permission: 'settings.view' },
];

export function canAccess(user, requirement) {
  if (!user) return false;
  if (Array.isArray(requirement)) return requirement.some(value => canAccess(user, value));
  return user.role === 'ADMIN' || (user.permissions || []).includes(requirement);
}

export function workspaceHome(user) {
  if (!user) return '/login';
  if (user.mustChangePassword) return '/change-password';
  return WORKSPACE_MODULES.find(module => canAccess(user, module.permission)
    && (module.href !== '/consultations' || user.consultationEnabled === true))?.href || '/settings';
}
