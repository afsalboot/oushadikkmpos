import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearResourceCache, resourceFetch } from '../src/lib/resource-fetch.js';
import { readSalesCache, writeSalesCache, purgeSalesCache } from '../src/lib/sales-indexed-db.js';
import { salesIndexRow, searchSalesIndex } from '../src/lib/sales-search.js';
import { SALES_FIRST_PAGE, SALES_INDEX_URL, SALES_STOCK_IDS, loadSalesResource, loadSalesDetail, loadSalesBarcode, peekSalesResource, peekSalesDetail, prefetchSales, lookupSalesBarcode, lookupSalesSku, lookupSalesProduct, configureSalesScope, clearSalesCache, flushSalesPersistence, flushSalesMutations, refreshSalesInBackground } from '../src/lib/sales-resources.js';

const id = '000000000000000000000001', other = '000000000000000000000002';
const product = { _id: id, name: 'Ashwa', sku: 'SKU-1', barcode: '000123', active: true, stock: { sealedPackages: 2 } };
const scope = 'store-user-one', options = { scope };
async function setup(t, handler) {
  await flushSalesMutations(); clearResourceCache(); await flushSalesPersistence();
  await configureSalesScope(scope);
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url, request = {}) => {
    urls.push(String(url));
    const response = handler ? await handler(url, request) : undefined;
    if (response && !response.headers.has('X-Sales-Cache-Scope')) response.headers.set('X-Sales-Cache-Scope', scope);
    return response || Response.json({ data: url === SALES_INDEX_URL ? { rows: [salesIndexRow(product)], complete: true } : url === SALES_FIRST_PAGE ? { rows: [product], pagination: { page: 1 } } : url === '/api/categories' ? [] : product }, { headers: { 'X-Sales-Cache-Scope': scope, ETag: 'W/"one"' } });
  });
  t.after(async () => { await flushSalesMutations(); await flushSalesPersistence(); });
  return urls;
}
test('cold prefetch coalesces concurrent callers; memory search, clear, barcode and return issue zero product reads', async t => {
  const urls = await setup(t);
  await Promise.all([prefetchSales(options), prefetchSales(options), loadSalesResource(SALES_FIRST_PAGE, options)]);
  assert.equal(urls.length, 3);
  for (let run = 0; run < 5; run++) {
    assert.equal(searchSalesIndex(peekSalesResource(SALES_INDEX_URL, scope).rows, { search: 'AShwa' }).rows[0]._id, id);
    searchSalesIndex(peekSalesResource(SALES_INDEX_URL, scope).rows, { search: '' });
    assert.equal(lookupSalesBarcode('000123', scope)._id, id);
    assert.equal(lookupSalesBarcode('123', scope), undefined);
    assert.equal(lookupSalesSku('sku-1', scope)._id, id);
    assert.equal(lookupSalesProduct(id, scope)._id, id);
    assert.deepEqual(await loadSalesDetail(id, options), product);
    await prefetchSales(options);
  }
  assert.equal(urls.length, 3);
});
test('IndexedDB restores a complete index, first page and selling details without a network request', async t => {
  const urls = await setup(t);
  await prefetchSales(options); await flushSalesPersistence();
  assert.ok((await readSalesCache(scope)).some(row => row.kind === 'index-row'));
  clearSalesCache({ purge: false });
  await configureSalesScope(scope);
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope).rows.length, 1);
  assert.deepEqual(await loadSalesDetail(id, options), product);
  await prefetchSales(options);
  assert.equal(urls.length, 3);
});
test('different store, user, or permission scopes never see the prior memory or persistent catalogue', async t => {
  await setup(t); await prefetchSales(options); await flushSalesPersistence();
  assert.equal(peekSalesResource(SALES_INDEX_URL, 'other-store'), undefined);
  await configureSalesScope('other-store');
  assert.equal(peekSalesResource(SALES_INDEX_URL, 'other-store'), undefined);
  assert.equal(lookupSalesBarcode('000123', 'other-store'), undefined);
  assert.deepEqual(await readSalesCache('other-store'), []);
  await configureSalesScope(scope);
  assert.equal(lookupSalesProduct(id, scope)._id, id);
});
test('successful stock write refreshes only affected cached detail; index and unrelated detail survive', async t => {
  let saved = false;
  const second = { ...product, _id: other, name: 'Other' };
  const urls = await setup(t, (url, request) => {
    if (request.method === 'POST') { saved = true; return Response.json({ data: { affectedProductIds: [id] } }); }
    if (url.includes('ids=')) return Response.json({ data: [{ ...product, stock: { sealedPackages: 1 } }] });
    if (url.includes(other)) return Response.json({ data: second });
  });
  await prefetchSales(options); await loadSalesDetail(other, options);
  const index = peekSalesResource(SALES_INDEX_URL, scope);
  await resourceFetch('/api/sales', { method: 'POST', body: JSON.stringify({ items: [{ productId: id }] }) });
  await flushSalesMutations(); await flushSalesPersistence();
  assert.equal(saved, true);
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope), index);
  assert.equal(peekSalesDetail(id, scope).stock.sealedPackages, 1);
  assert.deepEqual(peekSalesDetail(other, scope), second);
  assert.equal(urls.filter(url => url === SALES_INDEX_URL).length, 1);
  assert.equal(urls.filter(url => url.includes('ids=')).length, 1);
  clearSalesCache({ purge: false }); await configureSalesScope(scope);
  assert.equal(peekSalesDetail(id, scope).stock.sealedPackages, 1);
});
test('failed checkout and network failure leave cached stock and index intact', async t => {
  const urls = await setup(t, (_url, request) => request.method === 'POST' ? Response.json({ error: 'Insufficient stock' }, { status: 422 }) : undefined);
  await prefetchSales(options);
  const index = peekSalesResource(SALES_INDEX_URL, scope);
  await resourceFetch('/api/sales', { method: 'POST' }); await flushSalesMutations();
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope), index);
  assert.equal(peekSalesDetail(id, scope).stock.sealedPackages, 2);
  assert.equal(urls.length, 4);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Offline'); });
  await assert.rejects(resourceFetch('/api/sales', { method: 'POST' }), /Offline/);
  assert.equal(peekSalesDetail(id, scope).stock.sealedPackages, 2);
});
test('product create/edit updates metadata, exact maps and persisted rows; delete/hidden removes only that product', async t => {
  let current = product;
  await setup(t, (url, request) => {
    if (request.method) return Response.json({ data: request.method === 'DELETE' ? { deleted: true } : current });
    if (url.includes('ids=')) return Response.json({ data: { rows: current.active === false ? [] : [salesIndexRow(current)], removedIds: current.active === false ? [id] : [] } });
  });
  await prefetchSales(options);
  current = { ...product, name: 'New Name', barcode: '000999', sku: 'NEW', packageSellingPrice: 100 };
  await resourceFetch('/api/products', { method: 'PUT', body: JSON.stringify({ id }) }); await flushSalesMutations();
  assert.equal(lookupSalesBarcode('000123', scope), undefined);
  assert.equal(lookupSalesBarcode('000999', scope).name, 'New Name');
  assert.equal(lookupSalesSku('new', scope)._id, id);
  assert.equal(searchSalesIndex(peekSalesResource(SALES_INDEX_URL, scope).rows, { search: 'new name' }).rows.length, 1);
  current = { ...product, _id: other, name: 'Created' };
  await resourceFetch('/api/products', { method: 'POST' }); await flushSalesMutations();
  assert.equal(lookupSalesProduct(other, scope).name, 'Created');
  await resourceFetch('/api/products?id=' + id, { method: 'DELETE' }); await flushSalesMutations();
  assert.equal(lookupSalesProduct(id, scope), undefined);
  assert.equal(lookupSalesProduct(other, scope).name, 'Created');
  current = { ...current, active: false };
  await resourceFetch('/api/products', { method: 'PATCH', body: JSON.stringify({ id: other }) }); await flushSalesMutations();
  await flushSalesPersistence();
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope).rows.length, 0);
  clearSalesCache({ purge: false }); await configureSalesScope(scope);
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope).rows.length, 0);
});
test('conditional refresh sends ETag; 304 retains the same index object and stale refresh never blanks browsing', async t => {
  let now = Date.now(), refresh = false;
  await setup(t, (url, request) => {
    if (url === SALES_INDEX_URL && refresh) {
      assert.equal(request.headers['If-None-Match'], 'W/"one"');
      return new Response(null, { status: 304, headers: { 'X-Sales-Cache-Scope': scope } });
    }
  });
  t.mock.method(Date, 'now', () => now);
  await prefetchSales(options);
  const index = peekSalesResource(SALES_INDEX_URL, scope);
  now += 300001; refresh = true;
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope), index);
  assert.equal(await loadSalesResource(SALES_INDEX_URL, options), index);
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope), index);
});
test('offline refresh retains browsing, expires selling details, retries, and hard-expires persisted snapshots', async t => {
  let now = Date.now(), fail = false;
  await setup(t, () => fail ? Response.json({ error: 'Offline' }, { status: 503 }) : undefined);
  t.mock.method(Date, 'now', () => now);
  await prefetchSales(options); now += 31000;
  assert.equal(peekSalesDetail(id, scope), undefined);
  assert.equal(peekSalesResource(SALES_FIRST_PAGE, scope).rows.length, 1);
  fail = true; now += 300000;
  await assert.rejects(loadSalesResource(SALES_INDEX_URL, options), /Offline/);
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope).rows.length, 1);
  fail = false; await loadSalesResource(SALES_INDEX_URL, options);
  now += 86400001;
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope), undefined);
});
test('logout purges persistent data after pending writes; expired or denied sessions cannot restore old responses', async t => {
  await setup(t); await prefetchSales(options);
  await resourceFetch('/api/auth/logout', { method: 'POST' }); await flushSalesPersistence();
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope), undefined);
  assert.deepEqual(await readSalesCache(scope), []);
  clearResourceCache(); await configureSalesScope(scope);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Denied' }, { status: 403 }));
  await assert.rejects(loadSalesResource(SALES_INDEX_URL, options));
  await flushSalesPersistence();
  await assert.rejects(loadSalesResource(SALES_INDEX_URL, options), /Sign in again/);
  assert.deepEqual(await readSalesCache(scope), []);
});
test('a late response cannot restore a previous scope or overwrite stock after a write', async t => {
  await setup(t);
  let finish;
  t.mock.method(globalThis, 'fetch', async (_url, request) => request?.method === 'POST' ? Response.json({ data: { affectedProductIds: [id] } }) : new Promise(resolve => { finish = resolve; }));
  const stale = loadSalesDetail(id, options);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await resourceFetch('/api/sales', { method: 'POST' });
  finish(Response.json({ data: product }));
  await assert.rejects(stale, { name: 'AbortError' });
  assert.equal(peekSalesDetail(id, scope), undefined);
});
test('server scope mismatch purges all memory and disk instead of saving another account response', async t => {
  await setup(t); await prefetchSales(options); await flushSalesPersistence();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: product }, { headers: { 'X-Sales-Cache-Scope': 'another-user' } }));
  await assert.rejects(loadSalesDetail(other, options), /session changed/);
  await flushSalesPersistence();
  assert.deepEqual(await readSalesCache(scope), []);
  assert.equal(lookupSalesBarcode('000123', scope), undefined);
});
test('incompatible/incomplete disk index is ignored rather than accepted as complete search', async t => {
  await setup(t);
  await writeSalesCache(scope, [{ kind: 'index-meta', id: 'current', at: Date.now(), data: { count: 2, complete: true } }, { kind: 'index-row', id, at: Date.now(), data: salesIndexRow(product) }]);
  clearSalesCache({ purge: false }); await configureSalesScope(scope);
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope), undefined);
  await purgeSalesCache(scope);
});
test('another tab stock change preserves the local index and refreshes only the named product', async t => {
  const prior = globalThis.window; globalThis.window = new EventTarget();
  t.after(() => { if (prior) globalThis.window = prior; else delete globalThis.window; });
  const urls = await setup(t, url => url.includes('ids=') ? Response.json({ data: [{ ...product, stock: { sealedPackages: 1 } }] }) : undefined);
  await prefetchSales(options);
  const index = peekSalesResource(SALES_INDEX_URL, scope);
  const event = new Event('storage');
  Object.assign(event, { key: 'oushadi-resource-invalidation', newValue: JSON.stringify({ change: { kind: 'stock', ids: [id] } }) });
  window.dispatchEvent(event); await flushSalesMutations();
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope), index);
  assert.equal(peekSalesDetail(id, scope).stock.sealedPackages, 1);
  assert.equal(urls.filter(url => url === SALES_INDEX_URL).length, 1);
});
test('background checks fetch bounded stale details without changing the metadata index', async t => {
  let now = Date.now();
  const urls = await setup(t, url => url.includes('ids=') ? Response.json({ data: [{ ...product, stock: { sealedPackages: 1 } }] }) : undefined);
  t.mock.method(Date, 'now', () => now);
  await prefetchSales(options); const index = peekSalesResource(SALES_INDEX_URL, scope);
  now += 120001; await refreshSalesInBackground(options);
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope), index);
  assert.equal(peekSalesDetail(id, scope).stock.sealedPackages, 1);
  assert.equal(urls.filter(url => url === SALES_INDEX_URL).length, 1);
});
test('full refresh repairs orphan persisted rows so the next restart can restore a complete index', async t => {
  const urls = await setup(t);
  await writeSalesCache(scope, [{ kind: 'index-row', id: other, at: Date.now(), data: salesIndexRow({ ...product, _id: other }) }]);
  await prefetchSales(options); await flushSalesPersistence();
  const disk = await readSalesCache(scope);
  assert.equal(disk.filter(row => row.kind === 'index-row').length, 1);
  clearSalesCache({ purge: false }); await configureSalesScope(scope); await prefetchSales(options);
  assert.equal(urls.length, 3);
});
test('stock-filter ID sets are cached and searched locally, then refreshed only after a successful stock change', async t => {
  let membership = [id];
  const url = SALES_STOCK_IDS['Low Stock'];
  const urls = await setup(t, (requestUrl, request) => {
    if (requestUrl === url) return Response.json({ data: { ids: membership } });
    if (request.method === 'POST') { membership = []; return Response.json({ data: { affectedProductIds: [id] } }); }
    if (requestUrl.includes('ids=')) return Response.json({ data: [product] });
  });
  await prefetchSales(options); await loadSalesResource(url, options);
  for (let run=0; run<5; run++) {
    const ids = new Set((await loadSalesResource(url, options)).ids);
    assert.equal(searchSalesIndex(peekSalesResource(SALES_INDEX_URL, scope).rows, { search: 'ash', filter: 'Low Stock', stockIds: ids }).rows.length, 1);
  }
  assert.equal(urls.filter(value => value === url).length, 1);
  await resourceFetch('/api/sales', { method: 'POST' }); await flushSalesMutations();
  assert.equal(peekSalesResource(url, scope).ids.length, 0);
  assert.equal(urls.filter(value => value === url).length, 2);
  assert.equal(urls.filter(value => value === SALES_INDEX_URL).length, 1);
});
test('consecutive import batches trigger one background catalogue refresh after the final batch', async t => {
  const urls = await setup(t, (_url, request) => request.method === 'POST' ? Response.json({ data: { imported: 10 } }) : undefined);
  await prefetchSales(options);
  for (let run=0; run<3; run++) await resourceFetch('/api/products/import', { method: 'POST', body: JSON.stringify({ rows: [{ name: 'Fixture' }] }) });
  assert.equal(urls.filter(url => url === SALES_INDEX_URL).length, 1);
  await flushSalesMutations();
  assert.equal(urls.filter(url => url === SALES_INDEX_URL).length, 2);
  assert.equal(peekSalesResource(SALES_INDEX_URL, scope).rows.length, 1);
});
test('an exact server barcode fallback warms its detail and maps; subsequent scans use zero requests', async t => {
  const scanned = { ...product, _id: other, barcode: '000999' };
  const urls = await setup(t, url => url.includes('/barcode/') ? Response.json({ data: scanned }) : undefined);
  await prefetchSales(options);
  assert.deepEqual(await loadSalesBarcode('000999', options), scanned);
  const count = urls.length;
  for(let run=0;run<5;run++) assert.deepEqual(await loadSalesBarcode('000999', options), scanned);
  assert.equal(urls.length, count);
  assert.equal(lookupSalesBarcode('000999', scope)._id, other);
  assert.equal(lookupSalesBarcode('999', scope), undefined);
});
test('missing scope headers cannot populate private Sales cache from an incompatible backend', async t => {
  await setup(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: product }));
  await assert.rejects(loadSalesDetail(id, options), /Update the POS backend/);
  assert.equal(peekSalesDetail(id, scope), undefined);
});
test('a full refresh is forced after the maximum revision-check age even if timestamps never change', async t => {
  let now = Date.now(), full = false;
  await setup(t, (url, request) => {
    if(url===SALES_INDEX_URL && full) {
      assert.equal(request.headers, undefined);
      return Response.json({data:{rows:[salesIndexRow({...product,name:'Restored name'})],complete:true}});
    }
  });
  t.mock.method(Date, 'now', () => now);
  await prefetchSales(options); now+=900001;full=true;
  await loadSalesResource(SALES_INDEX_URL, options);
  assert.equal(lookupSalesProduct(id,scope).name,'Restored name');
  await flushSalesPersistence();clearSalesCache({purge:false});await configureSalesScope(scope);
  assert.equal(lookupSalesProduct(id,scope).name,'Restored name');
});
test('late access-denied responses and old subscribers cannot clear or reactivate a different validated scope', async t => {
  await setup(t);
  let finish;
  t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>{finish=resolve;}));
  const stale=loadSalesDetail(id,options);
  while(!finish)await new Promise(resolve=>setImmediate(resolve));
  const next='new-validated-user';
  await writeSalesCache(next,[{kind:'index-meta',id:'current',at:Date.now(),data:{count:1,complete:true}},{kind:'index-row',id:other,at:Date.now(),data:salesIndexRow({...product,_id:other})}]);
  await configureSalesScope(next);
  finish(Response.json({error:'Expired'},{status:401}));
  await assert.rejects(stale,{name:'AbortError'});
  assert.equal(lookupSalesProduct(other,next)._id,other);
  await assert.rejects(loadSalesDetail(id,options),{name:'AbortError'});
  assert.equal(lookupSalesProduct(other,next)._id,other);
});
