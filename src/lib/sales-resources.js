import { resourceFetch, onResourceInvalidated, clearResourceCache } from './resource-fetch.js';
import { salesIndexRow, normalizeSalesSearch } from './sales-search.js';
import { SALES_CACHE_SCHEMA, readSalesCache, writeSalesCache, purgeSalesCache } from './sales-indexed-db.js';

export const SALES_FIRST_PAGE = '/api/products?sales=true&page=1&limit=50';
export const SALES_INDEX_URL = '/api/products/sales-index';
export const SALES_STOCK_IDS = { 'Low Stock': '/api/products?view=sales-stock-ids&stock=low', 'Opened Stock': '/api/products?view=sales-stock-ids&stock=opened' };
const entries = new Map(), details = new Map(), pending = new Map();
const byId = new Map(), byBarcode = new Map(), bySku = new Map(), listeners = new Set(), mutationWork = new Set();
const deniedScopes = new Set();
let scope = typeof window === 'undefined' ? 'volatile:test' : null;
let epoch = 0, snapshot = 0, hydration, persisted = Promise.resolve();
let catalogueTimer, catalogueDirty = false, catalogueRefresh = Promise.resolve(), finishCatalogueWait;
const freshFor = key => key.includes('view=sales-stock-ids') ? 30000 : key.includes('?') || key === SALES_INDEX_URL || key === '/api/categories' ? 300000 : 30000;
const retainedFor = 86400000;
const compareRows = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a._id.localeCompare(b._id);
export function salesPerf(operation, start, metadata = {}) {
  if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_POS_PERFORMANCE_LOG === '1') {
    console.info('[SalesPerf]', { operation, ms: +(performance.now() - start).toFixed(2), ...metadata });
  }
}
function emit() { snapshot++; for (const listener of listeners) listener(); }
export const subscribeSalesCache = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const salesCacheSnapshot = () => snapshot;
const validScope = requested => Boolean(scope && (!requested || requested === scope));
const record = (kind, id, entry) => ({ kind, id, ...entry });
function persist(records, removals = [], target = scope, replaceIndex = false) {
  persisted = persisted.catch(() => {}).then(() => writeSalesCache(target, records, removals, replaceIndex)).catch(() => {});
  return persisted;
}
export const flushSalesPersistence = () => persisted;
export const flushSalesMutations = async () => { await catalogueRefresh; return Promise.allSettled([...mutationWork]); };
function reset() {
  clearTimeout(catalogueTimer); finishCatalogueWait?.(); catalogueDirty = false;
  epoch++; entries.clear(); details.clear(); pending.clear(); byId.clear(); byBarcode.clear(); bySku.clear(); emit();
}
export function clearSalesCache({ purge = true } = {}) {
  reset(); hydration = undefined;
  // Serialize purges behind pending writes so logout cannot resurrect old data.
  if (purge) persisted = persisted.catch(() => {}).then(() => purgeSalesCache()).catch(() => {});
}
function mapRow(row) {
  byId.set(row._id, row);
  if (row.barcode) byBarcode.set(row.barcode.trim(), row);
  if (row.sku) bySku.set(normalizeSalesSearch(row.sku), row);
}
function indexMaps(rows) { byId.clear(); byBarcode.clear(); bySku.clear(); for (const row of rows) mapRow(row); }
function unmapRow(id) {
  const old = byId.get(id);
  if (!old) return;
  if (byBarcode.get(old.barcode?.trim()) === old) byBarcode.delete(old.barcode?.trim());
  if (bySku.get(normalizeSalesSearch(old.sku)) === old) bySku.delete(normalizeSalesSearch(old.sku));
  byId.delete(id);
}
export async function configureSalesScope(next) {
  if (!next) throw new Error('Sales cache requires a validated session');
  if (deniedScopes.has(next)) throw Object.assign(new Error('Sign in again to load Sales'), { status: 401 });
  if (scope === next && hydration) return hydration;
  if (scope !== next) { reset(); scope = next; }
  const version = epoch, started = performance.now();
  hydration = (async () => {
    const rows = await readSalesCache(next).catch(() => []);
    if (scope !== next || version !== epoch) return;
    const metadata = rows.find(row => row.kind === 'index-meta' && row.id === 'current');
    const removals = [];
    for (const row of rows) {
      if (row.schema !== SALES_CACHE_SCHEMA || (row.kind !== 'index-row' && Date.now() - row.at > retainedFor) || row.at > Date.now() + 60000) {
        removals.push([row.kind, row.id]); continue;
      }
      if (row.kind === 'resource' && entries.size < 40 && !entries.has(row.id)) entries.set(row.id, { data: row.data, at: row.at });
      if (row.kind === 'detail' && details.size < 1000 && !details.has(row.id)) details.set(row.id, { data: row.data, at: row.at });
    }
    if (metadata?.schema === SALES_CACHE_SCHEMA && Date.now() - metadata.at <= retainedFor && !entries.has(SALES_INDEX_URL)) {
      const indexRows = rows.filter(row => row.kind === 'index-row' && row.schema === SALES_CACHE_SCHEMA).map(row => row.data);
      if (indexRows.length === metadata.data.count && indexRows.length <= 10000) {
        entries.set(SALES_INDEX_URL, { data: { ...metadata.data, rows: indexRows.sort(compareRows) }, at: metadata.at, fullAt: metadata.fullAt || metadata.at });
        indexMaps(indexRows);
      }
    }
    if (removals.length) void persist([], removals, next);
    emit(); salesPerf('indexeddb-restore', started, { count: byId.size, details: details.size });
  })();
  return hydration;
}
function peek(map, key, fresh = false, requested) {
  if (!validScope(requested)) return undefined;
  const entry = map.get(key);
  if (!entry || Date.now() - entry.at > retainedFor) return undefined;
  if (fresh && Date.now() - entry.at > freshFor(key)) return undefined;
  return entry.data;
}
export const peekSalesResource = (url, requested) => peek(entries, url, false, requested);
export const peekSalesDetail = (id, requested) => peek(details, String(id), true, requested);
export const peekSalesDisplayDetail = (id, requested) => peek(details, String(id), false, requested);
function put(map, key, data, maximum, kind) {
  map.delete(key); map.set(key, { data, at: Date.now() });
  const removals = [];
  while (map.size > maximum) {
    const old = [...map.keys()].find(id => map !== entries || ![SALES_FIRST_PAGE, SALES_INDEX_URL, '/api/categories'].includes(id));
    if (!old) break;
    map.delete(old); removals.push([kind, old]);
  }
  void persist([record(kind, key, map.get(key))], removals);
}
function storeIndex(data) {
  const at = Date.now(), oldIds = new Set(byId.keys());
  indexMaps(data.rows); entries.set(SALES_INDEX_URL, { data, at, fullAt: at });
  const metadata = { ...data, rows: undefined, count: data.rows.length };
  void persist([record('index-meta', 'current', { data: metadata, at, fullAt: at }), ...data.rows.map(row => record('index-row', row._id, { data: row, at }))], [...oldIds].filter(id => !byId.has(id)).map(id => ['index-row', id]), scope, true);
  // A changed metadata revision invalidates selling details, not the active cart.
  for (const [id, entry] of details) if (data.complete && (!byId.has(id) || (byId.get(id).revision && byId.get(id).revision !== Number(new Date(entry.data.updatedAt))) || byId.get(id).categoryName !== (entry.data.categoryId?.name || ''))) {
    details.delete(id); void persist([], [['detail', id]]);
  }
  if (data.complete) for (const [url, entry] of entries) {
    if (url === SALES_INDEX_URL || !entry.data?.rows) continue;
    const rows = entry.data.rows.filter(row => byId.has(String(row._id)));
    if (rows.length !== entry.data.rows.length) { entry.data = { ...entry.data, rows }; void persist([record('resource', url, entry)]); }
  }
  emit();
}
function verifyScope(response, requested, url) {
  const returned = response.headers.get('X-Sales-Cache-Scope');
  if (requested && !returned && (response.ok || response.status === 304) && (url?.startsWith('/api/products') || url === '/api/categories')) throw Object.assign(new Error('Update the POS backend before using the Sales cache'), { status: 409 });
  if (requested && returned && returned !== requested) {
    clearResourceCache('sales-session-changed');
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('oushadi-session-changed'));
    throw Object.assign(new Error('Your session changed. Reload Sales.'), { status: 401 });
  }
}
async function readiness(requested) {
  if (requested && scope && requested !== scope) throw new DOMException('Sales session changed', 'AbortError');
  if (requested) await configureSalesScope(requested);
  if (!validScope(requested)) throw Object.assign(new Error('Sign in to load Sales'), { status: 401 });
}
export async function loadSalesResource(url, { scope: requested, force = false, unconditional = false } = {}) {
  await readiness(requested);
  const cached = peek(entries, url, true, requested);
  if (cached && !force) { salesPerf('memory-cache', performance.now(), { count: cached.rows?.length }); return cached; }
  if (pending.has(url)) return pending.get(url);
  const version = epoch, currentScope = scope, start = performance.now();
  const promise = (async () => {
    const previous = peekSalesResource(url, requested), fullAt = entries.get(url)?.fullAt || entries.get(url)?.at;
    // A periodic full refresh also catches timestamp-preserving restores/external edits.
    const etag = url === SALES_INDEX_URL && !unconditional && Date.now() - fullAt < 900000 ? previous?.etag : undefined;
    const response = await resourceFetch(url, etag ? { headers: { 'If-None-Match': etag } } : undefined);
    if (epoch !== version || scope !== currentScope) throw new DOMException('Sales data changed', 'AbortError');
    verifyScope(response, requested, url);
    if (response.status === 304 && previous) {
      entries.get(url).at = Date.now();
      void persist([record('index-meta', 'current', { data: { ...previous, rows: undefined, count: previous.rows.length }, at: Date.now(), fullAt })]);
      salesPerf('index-unchanged', start); return previous;
    }
    const result = await response.json();
    if (epoch !== version || scope !== currentScope) throw new DOMException('Sales data changed', 'AbortError');
    if (!response.ok) {
      if ([401, 403].includes(response.status)) clearResourceCache('sales-access-denied');
      throw Object.assign(new Error(result.error || 'Unable to load Sales products'), { status: response.status });
    }
    const data = result.data;
    if (url === SALES_INDEX_URL) storeIndex({ ...data, etag: response.headers.get('ETag') || undefined });
    else {
      if (!url.startsWith('/api/products/') && !url.includes('ids=')) put(entries, url, data, 40, 'resource');
      if (url.startsWith('/api/products')) for (const row of Array.isArray(data) ? data : data.rows || (data._id ? [data] : [])) put(details, String(row._id), row, 1000, 'detail');
      emit();
    }
    salesPerf(url === SALES_INDEX_URL ? 'index-fetch' : url === SALES_FIRST_PAGE ? 'first-page-fetch' : 'detail-fetch', start, { count: data.rows?.length, bytes: new TextEncoder().encode(JSON.stringify(result)).byteLength });
    return url === SALES_INDEX_URL ? entries.get(url).data : data;
  })();
  pending.set(url, promise);
  try { return await promise; } finally { if (pending.get(url) === promise) pending.delete(url); }
}
export async function loadSalesDetail(id, options = {}) {
  await readiness(options.scope);
  const cached = peekSalesDetail(id, options.scope);
  return cached || loadSalesResource(`/api/products/${encodeURIComponent(id)}?sales=true`, options);
}
export function lookupSalesBarcode(barcode, requested) {
  const start = performance.now();
  const row = validScope(requested) && peekSalesResource(SALES_INDEX_URL)?.complete ? byBarcode.get(barcode.trim()) : undefined;
  salesPerf('barcode-lookup', start, { found: Boolean(row) }); return row;
}
export const lookupSalesSku = (sku, requested) => validScope(requested) ? bySku.get(normalizeSalesSearch(sku)) : undefined;
export const lookupSalesProduct = (id, requested) => validScope(requested) ? byId.get(String(id)) : undefined;
export async function loadSalesBarcode(barcode, options = {}) {
  await readiness(options.scope);
  const indexed = lookupSalesBarcode(barcode, options.scope);
  if (indexed) {
    try {
      const product = await loadSalesDetail(indexed._id, options);
      if (product.barcode === barcode) return product;
    } catch (error) { if (error.status !== 404) throw error; }
  }
  const version = epoch, currentScope = scope;
  const response = await resourceFetch('/api/products/barcode/' + encodeURIComponent(barcode) + '?context=sale');
  if (version !== epoch || scope !== currentScope) throw new DOMException('Sales data changed', 'AbortError');
  verifyScope(response, options.scope, '/api/products/barcode');
  const result = await response.json();
  if (version !== epoch || scope !== currentScope) throw new DOMException('Sales data changed', 'AbortError');
  if (!response.ok) {
    if ([401, 403].includes(response.status)) clearResourceCache('sales-access-denied');
    throw Object.assign(new Error(result.error || 'Unable to scan barcode. Please try again.'), { status: response.status });
  }
  const product = result.data;
  if (product.barcode !== barcode) throw new Error('Barcode no longer matches this product');
  patchIndex([salesIndexRow({ ...product, categoryId: product.categoryId?._id || product.categoryId }, product.categoryId?.name || '')], []);
  put(details, String(product._id), product, 1000, 'detail'); emit();
  return product;
}
export async function prefetchSales(options = {}) {
  await readiness(options.scope);
  return Promise.allSettled([SALES_INDEX_URL, SALES_FIRST_PAGE, '/api/categories'].map(url => loadSalesResource(url, options)));
}
function patchIndex(rows, removed) {
  const index = peekSalesResource(SALES_INDEX_URL);
  if (!index) return;
  const at = Date.now(), removals = [];
  for (const id of [...removed, ...rows.map(row => row._id)]) unmapRow(id);
  for (const id of removed) { details.delete(id); removals.push(['index-row', id], ['detail', id]); }
  for (const row of rows) { mapRow(row); details.delete(row._id); removals.push(['detail', row._id]); }
  const updated = { ...index, rows: [...byId.values()].sort(compareRows), etag: undefined, version: undefined };
  const indexAt = entries.get(SALES_INDEX_URL).at;
  const fullAt = entries.get(SALES_INDEX_URL).fullAt;
  entries.set(SALES_INDEX_URL, { data: updated, at: indexAt, fullAt });
  for (const [url, entry] of entries) {
    if (url === SALES_INDEX_URL || !url.startsWith('/api/products')) continue;
    const filtered = entry.data.rows?.filter(row => !removed.includes(String(row._id)));
    if (filtered && filtered.length !== entry.data.rows.length) { entry.data = { ...entry.data, rows: filtered }; void persist([record('resource', url, entry)]); }
  }
  void persist([record('index-meta', 'current', { data: { ...updated, rows: undefined, count: updated.rows.length }, at: indexAt, fullAt }), ...rows.map(row => record('index-row', row._id, { data: row, at }))], removals);
  emit();
}
async function refreshDetails(ids, requested) {
  for (let offset = 0; offset < ids.length; offset += 100) {
    const selection = ids.slice(offset, offset + 100);
    const rows = await loadSalesResource('/api/products?sales=true&ids=' + selection.join(','), { scope: requested, force: true });
    const returned = new Set(rows.map(row => String(row._id))), removed = selection.filter(id => !returned.has(id));
    if (removed.length) patchIndex([], removed);
    const replacements = new Map(rows.map(row => [String(row._id), row]));
    for (const [url, entry] of entries) if (url !== SALES_INDEX_URL && entry.data?.rows && entry.data.rows.some(row => replacements.has(String(row._id)))) {
      entry.data = { ...entry.data, rows: entry.data.rows.map(row => replacements.get(String(row._id)) || row) };
      void persist([record('resource', url, entry)]);
    }
    emit();
  }
}
export async function refreshSalesInBackground(options = {}) {
  await readiness(options.scope);
  const work = [loadSalesResource(SALES_INDEX_URL, options)];
  for (const url of Object.values(SALES_STOCK_IDS)) if (entries.has(url)) work.push(loadSalesResource(url, options));
  const stale = [...details].filter(([, entry]) => Date.now() - entry.at > 120000).slice(-50).map(([id]) => id);
  if (stale.length) work.push(refreshDetails(stale, options.scope));
  return Promise.allSettled(work);
}
async function applyMutation(mutation, data, version) {
  const currentScope = scope, cachedIds = mutation.ids.filter(id => details.has(id));
  if (mutation.kind === 'catalogue-batch') { scheduleCatalogueRefresh(); return; }
  if (mutation.kind === 'stock') {
    const ids = mutation.ids.length ? cachedIds : [...details.keys()].slice(-50);
    for (const id of mutation.ids.length ? cachedIds : [...details.keys()]) { const entry = details.get(id); entry.at = 0; void persist([record('detail', id, entry)]); }
    emit(); if (ids.length) await refreshDetails(ids, currentScope);
  } else if (mutation.kind === 'products') {
    const removed = [...(mutation.removed || [])], rows = [];
    if (data?._id && mutation.ids.includes(String(data._id))) {
      if (data.active === false || data.visibleInSales === false) removed.push(String(data._id));
      else {
        const categoryId = String(data.categoryId?._id || data.categoryId || '');
        const category = peekSalesResource('/api/categories')?.find(row => String(row._id) === categoryId);
        rows.push(salesIndexRow({ ...data, categoryId }, data.categoryId?.name || category?.name || ''));
      }
    }
    patchIndex(rows, removed);
    const ids = mutation.ids.filter(id => !removed.includes(id));
    for (let offset = 0; offset < ids.length; offset += 200) {
      const selection = ids.slice(offset, offset + 200);
      const response = await resourceFetch(SALES_INDEX_URL + '?ids=' + selection.join(','));
      if (scope !== currentScope || epoch !== version) return;
      verifyScope(response, currentScope, SALES_INDEX_URL);
      const result = await response.json();
      if (scope !== currentScope || epoch !== version) return;
      if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
      patchIndex(result.data.rows, result.data.removedIds || []);
      const reload = cachedIds.filter(id => selection.includes(id) && !removed.includes(id));
      if (reload.length) await refreshDetails(reload, currentScope);
    }
  } else if (mutation.kind === 'catalogue') {
    if (entries.has(SALES_INDEX_URL)) entries.get(SALES_INDEX_URL).at = Date.now() - 300001;
    entries.delete('/api/categories');
    await Promise.allSettled([loadSalesResource(SALES_INDEX_URL, { scope: currentScope, force: true, unconditional: true }), loadSalesResource('/api/categories', { scope: currentScope })]);
  }
  if (scope === currentScope && epoch === version) await Promise.allSettled(Object.values(SALES_STOCK_IDS).filter(url => entries.has(url)).map(url => loadSalesResource(url, { scope: currentScope, force: true })));
}
function scheduleCatalogueRefresh() {
  clearTimeout(catalogueTimer); finishCatalogueWait?.(); catalogueDirty = true;
  const expectedScope = scope;
  catalogueRefresh = new Promise(resolve => { finishCatalogueWait = resolve; });
  const finish = finishCatalogueWait;
  catalogueTimer = setTimeout(async () => {
    if (scope !== expectedScope) { finish(); return; }
    catalogueDirty = false;
    try { await applyMutation({ kind: 'catalogue', ids: [] }, undefined, epoch); }
    catch { /* Browsing remains available; the next freshness check retries. */ }
    finally { finish(); }
  }, 250);
}
onResourceInvalidated((reason, change) => {
  if (!change) {
    if (reason === 'sales-access-denied' || reason === 'sales-session-changed') deniedScopes.add(scope);
    else deniedScopes.clear();
    clearSalesCache(); return;
  }
  if (change.phase === 'start') {
    epoch++; pending.clear();
    if (String(reason).startsWith('/api/products/import')) { clearTimeout(catalogueTimer); finishCatalogueWait?.(); }
    return;
  }
  if (change.phase !== 'success' || !scope) {
    if (catalogueDirty && scope) scheduleCatalogueRefresh();
    return;
  }
  if (change.mutation?.kind === 'session') {
    deniedScopes.clear();
    clearSalesCache();
    if (reason === 'remote' && typeof window !== 'undefined') window.dispatchEvent(new Event('oushadi-session-changed'));
    return;
  }
  if (!change.mutation || change.mutation.kind === 'unrelated') return;
  const version = ++epoch;
  pending.clear();
  const work = applyMutation(change.mutation, change.data, version).catch(error => {
    if ([401, 403].includes(error.status)) clearResourceCache('sales-access-denied');
    if (epoch === version) salesPerf('mutation-refresh-failed', performance.now(), { status: error.status });
  });
  mutationWork.add(work);
  void work.finally(() => mutationWork.delete(work));
});
