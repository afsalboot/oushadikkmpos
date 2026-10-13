import { createHash } from 'node:crypto';

// Computed only from a freshly validated server session; never from local storage.
export function salesCacheScope(session) {
  const identity = [session.storeId || '', session.sub, Number(session.authVersion || 0), session.role, [...(session.permissions || [])].sort()];
  return (session.storeId ? '' : 'volatile:') + createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}
export function salesCacheResponse(response, session) {
  response.headers.set('X-Sales-Cache-Scope', salesCacheScope(session));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
