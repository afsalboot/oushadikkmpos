import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { calculateSalePricing } from '../src/services/pricing.service.js';

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const source = readFileSync(new URL('../src/components/SalesWorkspaceModern.jsx', import.meta.url), 'utf8');
const { code } = await transform(source, { filename: 'SalesWorkspaceModern.jsx', jsc: {
  parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } },
}, module: { type: 'commonjs' } });

function fixture() {
  const cache = new Map();
  let reads = 0;
  const resource = {
    SALES_FIRST_PAGE: '/first-page', SALES_INDEX_URL: '/index', SALES_STOCK_IDS: {},
    peekSalesResource: key => { reads++; return cache.get(key); },
    peekSalesDisplayDetail: () => undefined, salesPerf: () => {},
  };
  const placeholder = ({ children }) => React.createElement('span', null, children);
  const dependencies = name => {
    if (name === 'next/link') return { __esModule: true, default: ({ children, href }) => React.createElement('a', { href }, children) };
    if (name === 'next/navigation') return { useRouter: () => ({}) };
    if (name === '@/lib/sales-resources') return resource;
    if (name === '@/components/SalesCacheContext') return { useSalesCacheScope: () => 'validated-scope' };
    if (name === '@/components/ConfirmDialog') return { useConfirm: () => () => {} };
    if (name === '@/services/pricing.service') return { calculateSalePricing };
    if (name.startsWith('@/components/')) return { __esModule: true, default: placeholder, LoadingPlaceholder: placeholder };
    if (name.startsWith('@/lib/')) return {};
    return require(name);
  };
  const fixtureModule = { exports: {} };
  new Function('require', 'module', 'exports', code)(dependencies, fixtureModule, fixtureModule.exports);
  return { Component: fixtureModule.exports.default, cache, reads: () => reads };
}

test('server and first browser render match even when prefetch has warmed the Sales cache', () => {
  const fixtureState = fixture();
  const serverHtml = renderToString(React.createElement(fixtureState.Component));
  fixtureState.cache.set('/first-page', { rows: [{ _id: 'cached', name: 'Cached product', stockLabel: '8 Bottles' }], pagination: { page: 1, pages: 4, total: 175 } });
  fixtureState.cache.set('/index', { complete: true, rows: [{ _id: 'cached', name: 'Cached product' }] });
  fixtureState.cache.set('/api/categories?context=sale', [{ _id: 'category', name: 'Cached category' }]);
  const firstClientHtml = renderToString(React.createElement(fixtureState.Component));
  assert.equal(firstClientHtml, serverHtml);
  assert.match(serverHtml, /data-sales-cache="server"/);
  assert.match(serverHtml, /role="status"/);
  assert.equal(fixtureState.reads(), 0, 'Private browser cache must only be read after hydration');
});

test('sale edit initial rendering also ignores a warm browse cache', () => {
  const fixtureState = fixture();
  const render = () => renderToString(React.createElement(fixtureState.Component, { editSaleId: 'existing-sale' }));
  const coldHtml = render();
  fixtureState.cache.set('/first-page', { rows: [{ name: 'Unrelated product' }] });
  assert.equal(render(), coldHtml);
  assert.equal(fixtureState.reads(), 0);
});
