# Sales cache optimization and native benchmarks

Measured on 14 October 2026 local time, against the configured catalogue of 2,099 active, visible products. This report supersedes the initial memory-only implementation described in sales-hybrid-performance.md. The hosted baseline remains in electron-hosted-measurements.json; the updated application was measured as a local Next.js production build in the real Electron shell and installed Chrome, using authenticated, isolated profiles.

## Why the earlier index was inactive

The hosted Electron session made one /api/products search request per search and three product requests per open/search/clear cycle, with no sales-index request. Electron's normal and packaged modes load https://oushadikkmpos.vercel.app; they have no separate Sales implementation. The unfinished sales-resources.js, sales-search.js, sales-index service and API were untracked in the local workspace and absent from Git HEAD 193ad47. The committed frontend used debounced server search. These facts support an older hosted frontend as the cause; they do not independently prove its deployed SHA. An anonymous 401 on /api/products/sales-index does not establish deployment because the dynamic product-detail route can return 401 before validating the ID.

The unfinished local path also lacked persistent storage, cleared all Sales data for every write, discarded reusable pages after 30 seconds, and refreshed the mounted workspace every 30 seconds. AppShell did not receive a user/store cache identity. These issues have been corrected in the existing cache modules.

## Architecture and cache contract

L1 is the existing application-level Sales module: index snapshots plus product ID, barcode and normalized SKU maps; 50-item local result pagination; bounded selling details and page snapshots. React subscribes to its changes, with the existing AppShell providing validated scope through a small context. No Zustand/Redux, virtual list, worker, Redis or SQLite dependency was introduced.

L2 uses native IndexedDB, database oushadi-sales-cache, schema version 1. Its entries object store has the composite primary key [scope, kind, id] and a scope index. Record kinds are index-meta, index-row, detail and resource. Records contain schema, scope, validation timestamp and browsing data; index metadata also records version/ETag, row count and full-fetch time. Full index replacement is atomic and deletes orphan rows; product patches write/remove individual index and detail records. Disk writes are serialized with logout purges.

The browser origin supplies one isolation boundary. Inside it, the server computes scope from the actual Settings document ID, validated user ID, authVersion, role and sorted effective permissions. This application currently uses a single global store, with no tenant field on Product; no invented tenant query or schema was added. A changed store/user/permission identity remounts the cache boundary and switches memory before child loading effects. Missing store identity disables persistence through a volatile scope. Logout and access denial purge private memory and IndexedDB. Old reads, including late access-denied responses, cannot restore an earlier scope, clear a newer account's cache or reactivate an older subscriber.

Index, category and page snapshots remain fresh for 5 minutes; selling details and stock-filter membership sets are fresh for 30 seconds. Browsing snapshots have a 24-hour hard retention boundary. Selection revalidates an expired detail even if its older browsing snapshot remains visible. Memory is bounded at 40 resources and 1,000 details; the primary index, first page and category snapshot are protected from page eviction. The index is limited to 10,000 products; an oversized catalogue explicitly uses server-search fallback rather than silently showing a partial result set. Persistence failure falls back to memory.

The index/category/page cache restores after a browser or Electron page reload. Idle prefetch starts after the shell renders and only for users allowed to view both Sales and products. The Sales Link opts into complete dynamic-route prefetch after idle so cached navigation can avoid server rendering as well as product reads. See the [Next.js Link documentation](https://nextjs.org/docs/app/api-reference/components/link#prefetch).

## APIs, search and inventory

GET /api/products/sales-index projects selling/search metadata with lean reads, active/visible filters, stable name/ID ordering and category names. Fields are _id, name, SKU, optional barcode, category ID/name, pre-normalized searchText, packageSellingPrice, baseUnit, packageType, sale-mode flags, count-based loose-method flag and updatedAt-derived revision. No product histories, purchase/audit data, images, inventory batches or exact stock are downloaded for all 2,099 products.

The endpoint authenticates first, then uses an ETag built from schema version and Product/Category counts and maximum updatedAt timestamps. An unchanged revision returns authenticated 304 without product or category rows. It also supports bounded ?ids= selections of up to 200 products for targeted metadata changes. The index is refreshed unconditionally after imports/restores/category changes, and periodically after a maximum 15-minute full-fetch age, even if timestamps stay unchanged. The visible browsing snapshot remains available during refresh. A visible/focus background check runs every 2 minutes; metadata's 5-minute freshness window means a normal remote metadata edit can take up to approximately 6 minutes to appear, while stock details are checked separately.

Sales product and category responses carry X-Sales-Cache-Scope. The client checks it before retaining private results; a mismatched or missing header cannot populate the persistent cache. The response remains private/no-store at the transport level.

Local text search has no debounce and generates no product request while a complete index exists. Name, SKU, barcode, manufacturer and category matching use pre-normalized fields. Exact barcode and SKU precede name-prefix, contained-name and other matches; stable ties retain catalogue order. Barcode equality preserves leading zeros and has no fuzzy fallback. An uncached exact barcode uses the existing authenticated endpoint once, warms the selling detail and maps, and subsequent fresh scans reuse that cache.

Low Stock and Opened Stock load compact membership IDs through GET /api/products?view=sales-stock-ids&stock=low|opened, reusing the existing stock-filter aggregation. Search then intersects that ID Set locally; it does not run a stock aggregation per character. Missing visible selling details are fetched for at most 50 result IDs, without repeating the catalogue-wide stock aggregation. Membership sets refresh after successful relevant writes and during background checks.

The first ordinary uncached load makes one metadata-index request plus the existing first 50 selling-details request and category request. Bounded stock/detail reads remain allowed where stock display/selection requires them. Normal warm opening, returning, searching and clearing do not reload the catalogue. Selecting an uncached/expired product loads its existing complete POS configuration before any price, mixture, count-on-open or cart operation; lightweight index rows never enter those calculations.

After a successful sale, the response adds affectedProductIds, including restored stock from an edited original bill and new stock transactions. Existing checkout transactions, idempotency keys, prices, GST, payments, receipts and allocations remain authoritative and unchanged. The resource wrapper refreshes only affected cached selling details from the server after commit. It does not subtract stock speculatively, clear the index or delay receipt delivery while refreshing. Failed writes leave cached stock intact; uncertain checkout retries retain the existing server/idempotency behavior.

Product creation/edit/visibility/merge/deletion patch or remove only relevant metadata, reverse maps and selling details. Stock adjustments, opening stock, purchases and cancellations refresh affected cached details. Unknown stock changes expire selection freshness and refresh a bounded recent set. Import batches coalesce into one background catalogue refresh after the last batch, including interrupted imports that may have committed earlier batches. Cross-tab messages contain only mutation kind and product IDs, without customer data or credentials. Other devices use background freshness checks. The repository has no standalone sale-refund write endpoint to modify; no refund workflow was invented.

Cached browsing does not enable offline checkout. The existing server checkout remains required and validates inventory, expiry, quantities, prices, tax and payment rules. Cart contents/customer fields are not reset by index refresh, local search or filters.

## Query and render audit

The selling-detail service already uses projected lean products, a bounded page and one batched InventoryBatch query grouped by product ID, rather than one batch query per card. Detail reads retain FEFO/expiry, sealed/open/count stock and the existing wholesale, tier, free-item and tax configuration. The lightweight index makes no InventoryBatch query. Exact barcode/SKU paths retain equality lookups; product-management regex search remains available.

The read-only database index audit confirmed unique SKU, unique sparse barcode, active/name, category/name, active/category/name and productId/expiryDate/createdAt batch indexes. No indexes were created, dropped or duplicated. The measured index query executed in 17 ms inside MongoDB, examining 2,100 documents for 2,099 results. It is not justified to add another sort/updatedAt index for this small dataset on that evidence.

Authentication retains current active-user, authVersion, permissions, forced-password and inactivity checks. Safe settings caching and existing per-request session caching remain; no global authorization cache was added. Removing interaction requests removes repeated authorization cost without weakening it.

The grid already limits DOM cards to 50. Currency/quantity formatters are now reused, and cart pricing is memoized against the actual cart, customer, settings, wholesale and edit inputs. No UI redesign or cart model rewrite was needed. Measured search and cached cart additions meet their targets without broad component memoization or virtualization.

Read-only service measurements are in sales-cache-service-measurements.json: revision check 104.83 ms; lightweight index 315.06 ms / 743,564 JSON bytes; normalization 5.39 ms; serialization 1.85 ms; local search median 0.0911 ms, p95 0.1200 ms over 1,000 runs; first 50 selling details 275.10–385.19 ms / 82,777 JSON bytes; one selling detail 170.16 ms. These exclude HTTP authentication, UI rendering and browser network time. They are not directly comparable to hosted request durations from another server/network path.

## Native UI results

Electron and Chrome each completed five open/search/clear/Customers cycles, five cached cart additions, five searches in each stock filter and a persistent reload. The collector measures visible DOM readiness plus two animation frames and records product request starts. It blocks all renderer writes except manually authorized login; no sales, stock edits, refunds, printing or backups are submitted. Normal login/session activity can still update authentication records on the server.

| Measurement | Before: hosted Electron | After: local Electron | After: local Chrome |
| --- | ---: | ---: | ---: |
| First warmed Sales opening | Not a comparable sample | 81.1 ms | 53.4 ms |
| Return to Sales, four-repeat median | 2,555.5 ms | 27.35 ms | 22.7 ms |
| Search, five-run median | 1,709.5 ms | 5.1 ms | 5.7 ms |
| Clear search, five-run median | Not recorded | 11.8 ms | 9.8 ms |
| Cached cart addition, five-run median | Not recorded | 18.0 ms | 16.0 ms |
| Product requests per search | 1 | 0 | 0 |
| Product requests per open/search/clear cycle | 3 | 0 | 0 |
| Low Stock search range, after membership load | Not recorded | 7.2–8.9 ms | 6.2–6.9 ms |
| Opened Stock search range, after membership load | Not recorded | 3.4–6.3 ms | 4.5–8.3 ms |
| Product requests during stock-filter search/clear | Not recorded | 0 in all 10 cases | 0 in all 10 cases |
| IndexedDB restore after page reload | No persistent cache | 34.9 ms | 43.5 ms |
| Product requests after persistent page reload | Not recorded | 0 | 0 |
| Cart remained unchanged through search/clear | Not recorded | Verified | Verified |

Final reports: electron-local-measurements.json (2026-10-13T20:22:24.999Z) and browser-local-measurements.json (2026-10-13T20:23:20.894Z). The Electron renderer used Chromium 152; the installed Chrome comparison used Chrome 155. Both showed a complete 2,099-row local index and restored 101 selling details after the stock-filter checks. The persistence count snapshot in the Chrome report occurs before those filter checks, so initially lists 50 details. All measured frames were visible and painted. Request capture begins after debugger attachment; some early startup/prefetch requests may be absent from API timing lists.

The historical hosted baseline is return-to-Sales median 2,555.5 ms, search median 1,709.5 ms and one product request per search/three per cycle. The updated results use a local production frontend/server against the same configured database. They establish local cached performance and removal of interaction requests; they do not prove the yet-undeployed hosted version's final latency, nor an isolated Electron/browser speed ratio.

Cold index transfer, dashboard inventory aggregation, authentication/network latency and uncached stock/detail reads remain server-dependent. In the final run, the Chrome client logged a cold index fetch of 568 ms; Electron logged an unchanged index check of 146.4 ms, with 119 ms server time for its authenticated 304. The read-only revision service check measured 104.83 ms. Those waits occur during warming/background validation rather than each search. The old hosted first-opening outlier of 34.86 seconds includes unisolated route/paint scheduling and is not used as a typical baseline. Five samples do not establish a reliable native UI p95.

The live catalogue contains no registered barcodes. Exact hits, leading zeros, misses and repeat-scan cache reuse are regression-tested with fixtures; successful live or physical scanner timings remain unverified. No data was seeded or edited to manufacture a barcode benchmark.

## Validation and changed files

The final suite passes 353 application tests and 9 desktop tests; production build and whitespace check pass. Lint has zero errors and the same three existing warnings. New regressions cover cold coalescing, memory/IndexedDB restore, scopes and permission identities, logout purge ordering, late success/denial races, failed checkout, authoritative targeted stock refresh, product/map mutations, 304 reuse, unconditional refresh age, incompatible responses, orphan repair, imports and stock-filter search.

Changed implementation files:

- src/lib/sales-resources.js, sales-search.js, resource-fetch.js, sales-mutation.js, sales-indexed-db.js and sales-cache-scope.js: existing L1 extension, local matching, mutation transport, persistence and scope checks.
- src/services/sales-index.service.js and src/app/api/products/sales-index/route.js: metadata, revision/ETag and targeted reads.
- src/app/api/products/route.js, [id]/route.js, barcode/[barcode]/route.js, categories/route.js and src/services/product.service.js: compact stock membership, selling projections and authenticated response scopes.
- src/lib/auth.js, src/services/settings.service.js, src/app/(workspace)/layout.js, src/components/AppShell.jsx and SalesCacheContext.jsx: actual store/user identity, cache lifecycle and idle route/data prefetch.
- src/components/SalesWorkspaceModern.jsx and barcode/SalesBarcodeHost.jsx: immediate local search/filtering, safe cached selection, stable pricing and exact scan reuse.
- src/app/api/sales/route.js: successful affected-product metadata; no financial/inventory transaction rewrite.
- tests/sales-resources.test.mjs, sales-search.test.mjs, sales-index-service.test.mjs and sales-cache-scope.test.mjs: cache/search/security regressions. fake-indexeddb is a test-only dependency; the browser uses native IndexedDB.
- desktop/main.mjs and scripts/profile-electron.mjs: isolated diagnostic profiles, visible manual login, native Chrome comparison, request counts, persistence/cart/filter measurements. Benchmark-only profile reuse is restricted to a real temporary benchmark directory; packaged behavior is unaffected.
- scripts/profile-sales-hybrid.mjs and the measurement/report files: read-only database/index evidence and reproducible results.

The pre-existing edits to docs/performance-audit.md were left untouched. The benchmark server was stopped and its six isolated temporary Electron/Chrome profiles were removed after measurement. No production deployment or installer rebuild was performed. Publishing the web changes, then reconnecting the existing Electron client, is the remaining deployment step. Live financial writes, multi-device stock changes and physical printing/scanning have not been exercised; unit/service evidence is separated from native browsing evidence.

## Reproduce

In PowerShell:

~~~powershell
$env:NEXT_DIST_DIR='.next-sales-cache'
$env:NEXT_PUBLIC_POS_PERFORMANCE_LOG='1'
npm.cmd run build
node node_modules/next/dist/bin/next start -p 3000
~~~

From another terminal in the project root:

~~~powershell
node scripts/profile-electron.mjs --local --interactive --compare-browser
node scripts/profile-sales-hybrid.mjs --cache-output
~~~

Sign in only in the SPEED TEST window. The collector transfers only its own same-origin authenticated session in memory to its isolated Chrome comparison; it never logs or writes cookie values to report files. Reports are docs/electron-local-measurements.json and docs/browser-local-measurements.json. For a future deployed check, omit --local; that writes the hosted report, so preserve the historical baseline first. Debug logs are enabled only in development or by the explicit performance environment flags.
