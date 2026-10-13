# Sales hybrid browsing implementation

Historical memory-only stage. The completed IndexedDB cache, targeted invalidation and authenticated Electron/Chrome measurements are documented in [sales-cache-performance.md](sales-cache-performance.md).

Sales now uses a lightweight local search index alongside the existing paginated sale-detail API. Product search and category membership can render locally; selecting an uncached result loads one sale-detail record before the existing cart/mix logic runs. MongoDB InventoryBatch, transaction stock validation, pricing, checkout retry keys and refunds remain unchanged.

## Before and after

Previously: mount or search → 250 ms search debounce → authenticated products API → MongoDB product/count/batch queries → render. The grid hid its cards during the request. Completed product reads were discarded, so remounting started another initial read. Barcode scans always used the exact server endpoint.

Now: authenticated shell paints → idle prefetch of index, first 50 detailed products and categories. Sales initializes from memory. Local index search uses pre-normalized name/SKU/barcode/manufacturer/category fields immediately, without HTTP per keystroke. Exact barcode lookup uses a Map. Selection reuses a fresh detail or fetches `/api/products/:id?sales=true`; it never passes an index row into stock/pricing/cart calculations. Missing barcode IDs fall back to the existing exact barcode API. Category browsing shows index metadata immediately while loading one bounded detail page. Low/opened-stock filters retain the server path. Failed/stale reads keep browsing cards visible, with progress/error text beside search; access denial clears private browsing data.

Empty search retains 50-item pagination. Search results also paginate by 50. Clearing a search restores the remembered page for that category/mode within the mounted workspace. Loaded pages/details/categories survive navigation in memory; temporary UI errors do not. A browser refresh starts a new memory cache.

## Index contract

`GET /api/products/sales-index` requires the existing `products.view` session check, including active user, authVersion, forced password change and inactivity enforcement. It selects projected Product fields with `.lean()`, uses only category ID/name metadata, and bounds the catalogue at 10,000 products. Above that threshold it returns `complete: false` with no partial results, preserving server-search fallback.

Returned fields: `_id`, `name`, `sku`, optional `barcode`, `categoryId`, `categoryName`, pre-normalized `searchText`, `packageSellingPrice`, `baseUnit`, `packageType`, optional `allowPackageSale`, `allowLooseSale`, `allowMixture`, `loosePricingMethod`. Missing flag defaults are package sale enabled, loose/mix disabled, and non-count-based pricing. The full sale-detail response retains all existing configuration. `searchText` includes manufacturer matching and separates fields to prevent matches spanning unrelated fields. Case/space normalization does not change displayed names. Punctuation matches literally, without fuzzy matching.

No batches, precise stock, histories, tax configuration, supplier data, images, descriptions or audit data appear in the index. This model has no separate MRP/inventoryTracking field; no new inventory truth was invented.

## Measurements

Final read-only measurements against the configured database are stored in `sales-hybrid-measurements.json`. They exclude HTTP authentication, browser network transfer and React rendering. No database records, collections or indexes were created or changed by diagnostics.

| Measurement | Actual result |
| --- | ---: |
| Active visible products | 2,099 |
| Index JSON including response envelope | 691,089 bytes / 674.9 KiB |
| Index service load | 6,564.56 ms |
| Product query round trip, including transfer | 6,550.10 ms |
| Category query round trip | 64.67 ms |
| Database index-query execution, separate explain | 41 ms; 2,100 documents examined |
| Index normalization/assembly | 13.84 ms |
| Index JSON serialization | 2.88 ms |
| Local search, 1,000 runs on actual catalogue | 0.1424 ms median / 0.1909 ms p95 |
| Barcode Map lookup | 0.000034 ms average for misses; catalogue contains no barcodes |
| Existing first 50 sale-detail records | 939.21–1,172.26 ms; 80,827 response bytes |
| One product's sale detail | 169.46 ms |
| Actual Sales cold/warm browser load | Not measured |

The earlier index runs measured 7.4–8.1 seconds. The final query executes in 41 ms inside MongoDB, while its response round trip takes 6.55 seconds. This points to transport/driver overhead as the main remaining index-load cost, although these measurements do not isolate each transport component. The cold first-page target of 500–800 ms is not established. Warm rendering and search should avoid these round trips after prefetch, but browser timings under 100–200 ms/50 ms remain unverified.

The catalogue has no registered barcodes, so successful live scanning could not be benchmarked. Fixture tests cover exact hits, misses, leading zeros and avoiding fuzzy matches. An uncached scan still needs a detail read before adding stock-sensitive items.

## Cache policy

- Transport and shared GET subscribers continue using `resourceFetch`; the Sales module shares parsed responses and keeps bounded Maps without a new state library.
- Index/categories: fresh for 5 minutes. Product pages/details: fresh for 30 seconds. Browsing snapshots may display while revalidating for up to 10 minutes; stale details are fetched again before selection.
- Up to 40 URL-keyed resource snapshots and 1,000 product details. Full URLs include all actual search/category/stock/mix/loose/page/limit parameters. No unpaged full-product prefetch is added.
- Every mutation through existing resource wrappers invalidates browsing caches before/after the request. A generation guard rejects older in-flight responses after invalidation. Checkout, refund/cancel, receiving, adjustment, product/category edits, import/merge and opening-stock changes retain their database write workflows.
- Successful mutations send a metadata-only localStorage signal to other tabs. Remote signals clear memory and refresh mounted Sales. No product/customer data is persisted to localStorage. When storage is unavailable, writes still invalidate the current tab; other tabs refresh on focus/TTL.
- Visible Sales revalidates browsing data every 30 seconds and on window focus. Writes from other devices/processes are eventually reflected via TTLs; they do not broadcast to this browser.
- Authentication writes, logout and access-denied responses clear the cache; concurrent older successes cannot restore private cached data afterward.
- Redis is not configured in this workspace and no Redis dependency exists. No Redis keys/TTLs or infrastructure dependency were added. All server reads still fall back directly to MongoDB; no server cached stock or transaction writes were introduced. Redis version keys are therefore not applicable.

## Validation and remaining checks

The final suite passes 333 tests, including 13 new index/cache/search tests. New coverage includes first/middle/last product matching, spaces/case, SKU/brand/category search, literal punctuation, 50-item pagination, local category/loose/mix filters, the large-catalogue fallback, barcode exact matches/misses, shared prefetch, individual detail reuse, stale revalidation, mutation races, access-denial races and cross-tab invalidation. Nine read-only live search comparisons match MongoDB result IDs for first/middle/last products and case/SKU queries. Existing pricing, stock/count-on-open, free items, external purchase, wholesale, edit/retry and fiscal regressions remain in the full suite.

Lint passes with the same three pre-existing warnings; production build and whitespace checks pass. Actual login → Sales, Dashboard → Sales, navigation return, responsive category/pagination interactions, React Profiler card timings, scanner devices, browser tabs, live checkout/stock refresh, receiving/refunds/cancellation and deployment have not been exercised in a browser. No blanket card memoization or Web Worker was added without profile evidence.

Timing instrumentation: server `POS_PERFORMANCE_LOG=1` logs index count/bytes and auth/connection/query/processing/serialization timings; responses expose `Server-Timing`. Client `[SalesPerf]` logs in development, or with `NEXT_PUBLIC_POS_PERFORMANCE_LOG=1`, record index/page/detail fetches, local search, barcode lookup and cold/cached grid commit timing without logging query values, identities or transaction data.

## Changed files

- `src/app/api/products/sales-index/route.js`, `src/services/sales-index.service.js`, `src/lib/sales-search.js`: authenticated, projected index and local matching.
- `src/app/api/products/[id]/route.js`: bounded sale-detail read without management histories.
- `src/lib/sales-resources.js`, `src/lib/resource-fetch.js`: parsed snapshots, detail/Map lookup, freshness, generation guards and cross-tab invalidation.
- `src/components/AppShell.jsx`, `src/components/SalesWorkspaceModern.jsx`, `src/components/barcode/SalesBarcodeHost.jsx`: prefetch, cached initialization, local results, progress UI, detail selection and exact-scan fallback.
- `tests/sales-search.test.mjs`, `tests/sales-resources.test.mjs`, `tests/sales-index-service.test.mjs`: new regression coverage.
- `scripts/profile-sales-hybrid.mjs`, `docs/sales-hybrid-measurements.json`, this report: reproducible read-only measurements and limitations.

The pre-existing edits in `docs/performance-audit.md` were left untouched.

Reproduce: `node scripts/profile-sales-hybrid.mjs --output`, `npm.cmd test`, `npm.cmd run lint`, then `$env:NEXT_DIST_DIR='.next-sales-hybrid'; npm.cmd run build` in PowerShell. The diagnostic script requires the installed Node version's `registerHooks` and `process.loadEnvFile` support.
