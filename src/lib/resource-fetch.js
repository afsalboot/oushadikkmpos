// Share GET work across mounts without sharing an AbortController between callers.
// Stock is never retained after a request completes. All writes invalidate reads.
const reads = new Map();
let generation = 0;
const lifetime = (url) => url === '/api/settings' || url === '/api/categories' ? 300000
  : url === '/api/auth/status' || url.startsWith('/api/notifications') || url.startsWith('/api/dashboard?') ? 1000 : 0;
const shared = (url) => url.startsWith('/api/');

export function clearResourceCache() { generation++; reads.clear(); }

function subscribe(promise, signal) {
  if (!signal) return promise.then(response => response.clone());
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(response => { if (!signal.aborted) resolve(response.clone()); }, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function resourceFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    clearResourceCache();
    const response = await fetch(url, options);
    clearResourceCache();
    if (response.ok && typeof window !== 'undefined') window.dispatchEvent(new Event('oushadi-data-changed'));
    return response;
  }
  if (method !== 'GET' || typeof url !== 'string' || !shared(url) || options.headers || options.body) return fetch(url, options);
  const cached = reads.get(url);
  if (cached && (cached.pending || cached.expires > Date.now())) return subscribe(cached.promise, options.signal);
  const version = generation;
  const entry = { pending: true, expires: 0 };
  entry.promise = fetch(url, { ...options, signal: undefined, cache: 'no-store' }).then(async response => {
    // Buffer a clone before sharing, so interrupted response bodies never get cached.
    await response.clone().arrayBuffer();
    if (!response.ok || generation !== version || !lifetime(url)) {
      if (reads.get(url) === entry) reads.delete(url);
    } else { entry.pending = false; entry.expires = Date.now() + lifetime(url); }
    return response;
  }).catch(error => { if (reads.get(url) === entry) reads.delete(url); throw error; });
  reads.set(url, entry);
  return subscribe(entry.promise, options.signal);
}
