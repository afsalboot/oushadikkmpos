import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceFetch, clearResourceCache } from '../src/lib/resource-fetch.js';

test('overlapping mounts share one request and aborting one caller keeps the other alive', async t => {
  clearResourceCache();
  let finish, calls = 0;
  t.mock.method(globalThis, 'fetch', () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const controller = new AbortController();
  const first = resourceFetch('/api/categories', { signal: controller.signal });
  const second = resourceFetch('/api/categories');
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  finish(Response.json({ data: [1] }));
  assert.deepEqual(await (await second).json(), { data: [1] });
  assert.deepEqual(await (await resourceFetch('/api/categories')).json(), { data: [1] });
  assert.equal(calls, 1);
});

test('completed stock reads are never cached and writes clear settings and category data', async t => {
  clearResourceCache();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: ++calls }));
  await resourceFetch('/api/products?sales=true&page=1');
  await resourceFetch('/api/products?sales=true&page=1');
  assert.equal(calls, 2);
  await resourceFetch('/api/settings');
  await resourceFetch('/api/settings');
  assert.equal(calls, 3);
  await resourceFetch('/api/settings', { method: 'PATCH' });
  await resourceFetch('/api/settings');
  assert.equal(calls, 5);
});

test('a read started before a mutation cannot repopulate a cleared cache', async t => {
  clearResourceCache();
  let finish, calls = 0;
  t.mock.method(globalThis, 'fetch', (_url, options) => {
    calls++;
    if (calls === 1) return new Promise(resolve => { finish = resolve; });
    return Promise.resolve(Response.json({ data: options.method === 'PATCH' ? 'saved' : 'new' }));
  });
  const before = resourceFetch('/api/settings');
  await resourceFetch('/api/settings', { method: 'PATCH' });
  finish(Response.json({ data: 'old' }));
  await before;
  assert.equal((await (await resourceFetch('/api/settings')).json()).data, 'new');
  assert.equal(calls, 3);
});

test('failed reads are retried instead of cached', async t => {
  clearResourceCache();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: 'Denied' }, { status: 403 }); });
  await resourceFetch('/api/settings'); await resourceFetch('/api/settings');
  assert.equal(calls, 2);
});

test('workspace GET requests share pending work without retaining financial results', async t => {
  clearResourceCache();
  let finish, calls = 0;
  t.mock.method(globalThis, 'fetch', () => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  });
  const first = resourceFetch('/api/accounts?page=1');
  const second = resourceFetch('/api/accounts?page=1');
  assert.equal(calls, 1);
  finish(Response.json({ data: 'ledger' }));
  await Promise.all([first, second]);
  const fresh = resourceFetch('/api/accounts?page=1');
  assert.equal(calls, 2);
  finish(Response.json({ data: 'updated' }));
  assert.equal((await (await fresh).json()).data, 'updated');
});

test('HEAD and OPTIONS never reuse a GET response for the same URL', async t => {
  clearResourceCache();
  const methods = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    methods.push(options.method || 'GET');
    return new Response(null);
  });
  await resourceFetch('/api/settings');
  await resourceFetch('/api/settings', { method: 'HEAD' });
  await resourceFetch('/api/settings', { method: 'OPTIONS' });
  assert.deepEqual(methods, ['GET', 'HEAD', 'OPTIONS']);
});
