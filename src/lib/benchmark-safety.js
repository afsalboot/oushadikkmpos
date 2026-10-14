// Explicit local diagnostic mode: reject writes before authentication or DB work.
// Ordinary production does not enable this flag.
export function benchmarkWriteBlocked(enabled, method, pathname) {
  if (!enabled || ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return false;
  return !(method.toUpperCase() === 'POST' && /^\/api\/auth\/(login|username-login|pin-login)$/.test(pathname));
}
