// Share GET work across mounts without sharing an AbortController between callers.
// Stock is never retained after a request completes. All writes invalidate reads.
import { salesMutation } from './sales-mutation.js';
const reads = new Map();
let generation = 0;
const invalidationListeners = new Set();
export const resourceGeneration = () => generation;
export function onResourceInvalidated(listener) { invalidationListeners.add(listener); return () => invalidationListeners.delete(listener); }
const lifetime = (url) => url === '/api/settings' || url === '/api/categories' ? 300000
  : url === '/api/auth/status' || url.startsWith('/api/notifications') || url.startsWith('/api/dashboard?') ? 1000 : 0;
const shared = (url) => url.startsWith('/api/');

export function clearResourceCache(reason = '', change) { generation++; reads.clear(); for (const listener of invalidationListeners) listener(reason, change); }

let listening = false;
function listenForOtherTabs() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('storage', event => {
    if (event.key !== 'oushadi-resource-invalidation' || !event.newValue) return;
    let change;
    try { change = JSON.parse(event.newValue).change; } catch {}
    clearResourceCache('remote', { phase: 'success', mutation: change || { kind: 'catalogue', ids: [] } });
    window.dispatchEvent(new Event('oushadi-data-changed'));
  });
}

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
  listenForOtherTabs();
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    clearResourceCache(url, { phase: 'start' });
    let response;
    try { response = await fetch(url, options); }
    catch (error) { clearResourceCache(url, { phase: 'failed' }); throw error; }
    let mutation, mutationData;
    if (response.ok) {
      let body = {}, data = {};
      try { if (typeof options.body === 'string') body = JSON.parse(options.body); } catch {}
      if (typeof url === 'string' && /^\/api\/(products|sales|purchases|inventory|stock|categories|backups)(\/|\?|$)/.test(url)) {
        try { data = (await response.clone().json()).data || {}; } catch {}
      }
      mutation = salesMutation(String(url), method, body, data);
      mutationData = data;
    }
    clearResourceCache(url, { phase: response.ok ? 'success' : 'failed', mutation, data: mutationData });
    if (response.ok && typeof window !== 'undefined') {
      try { localStorage.setItem('oushadi-resource-invalidation', JSON.stringify({ at: Date.now(), nonce: Math.random(), change: mutation })); } catch {}
      window.dispatchEvent(new Event('oushadi-data-changed'));
    }
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
