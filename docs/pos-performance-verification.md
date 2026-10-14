# Sales, checkout and payment verification — 14 October 2026

Follow-up: [actual stock on Sales cards](sales-stock-cards.md) adds compact authoritative stock labels to the index. The timings and unchanged-data fingerprints below describe the earlier checkout optimization run; the follow-up has its own native measurements and fingerprint results.

Implemented and verified locally for **Oushadi Kunnamkulam**. The user explicitly confirmed the current Oushadhi repository after the initial request said “different customer.” No Dr Abdulla/PVAMSP URL, credential, database, product or branding was used.

Repository: `D:\Next.js\Projects\Oushadi-POS\oushadi-pos`; starting HEAD: `94dd569274730a4c9a99e45bebf9d1694bbc7403`. The workspace was clean at the start. Electron package `oushadhi-pos-desktop` 0.1.1 and `desktop/policy.mjs` point packaged clients to `https://oushadikkmpos.vercel.app`; unpackaged `--local` points to `http://localhost:3000`. No URL, installer, hosted deployment or installed application was changed.

## Evidence and measurement boundary

- [Machine-readable summary](pos-performance-summary.json).
- Equivalent local production-build before samples: [Electron](pos-performance-before-electron-local-measurements.json), [Chrome](pos-performance-before-browser-local-measurements.json).
- Optimized production-build after samples: [Electron](pos-performance-after-electron-local-measurements.json), [Chrome](pos-performance-after-browser-local-measurements.json).
- [Service measurements](pos-performance-service-measurements.json) and [five-sample read-only query plans with existing indexes](pos-performance-query-plans.json).
- [Before fingerprint](pos-performance-before-fingerprint.json), [after fingerprint and equality results](pos-performance-after-fingerprint.json).

The before build used the starting application with only the diagnostic write barrier and disabled automatic model/index creation. Both builds ran Next.js production mode on the same local origin and database. The native Electron shell uses Chromium 152.0.7977.130; the normal installed Chrome browser uses 155.0.8059.40. Each measured action has five cycles. Reports retain individual readiness/paint samples, per-action catalogue request counts, request-start timestamps, encoded transfer bytes, available Server-Timing headers, cache source and persistence counts. Timing runs wait for the existing idle cache prefetch and bounded detail reads to settle.

Electron used an isolated signed-in diagnostic profile across the before/after runs, preserving authentication; Chrome used a separate fresh diagnostic profile each time. Only the benchmark's same-origin authentication cookies were transferred to Chrome in memory. This is an equivalent warm-action comparison; cold initialization and authentication are separately recorded and excluded from warm Sales targets. Native scheduling, paint and network variation remain visible. The final server-only retry-filter change was discovered after the UI benchmark and then verified with read-only query plans, route fixtures and a final production build; it does not affect the measured UI controls.

Sales timings use the authenticated live catalogue, with cart changes confined to local UI state. Checkout timings use **30 isolated cart lines and a checkout-enabled Settings override in renderer memory only**. Actual live `checkout.enabled` is false. These timings do not measure a real payment, live transaction, database commit or receipt.

## Implemented changes

| Files | Change and reason |
| --- | --- |
| `src/components/SalesCheckoutHostV2.jsx` | Memoizes pricing against cart, cart customer, wholesale discount, edit snapshot, discount reason, settings, payment method and place of supply. Cash/reference entry no longer recalculates every cart line. Reuses one currency formatter. |
| `src/lib/checkout-submit.js`, checkout host | A synchronous ref guard covers validation, wholesale duplicate lookup, retail resolution and submission. `finally` releases it for corrections/retries. A disabled fieldset prevents editing the submitted form while it is resolving/submitting, retaining the existing layout. |
| `src/lib/checkout-request.js`, checkout host | An unchanged checkout intent reuses the original uncertain request body before resolving its potentially already-created customer. The original idempotency key and body are retained after network/body errors, server errors, 408 and 429. Changed intentions are blocked. Existing pending records retain exact-body matching. Intent includes the validated cache scope. |
| Checkout host | Aborted wholesale customer searches cannot overwrite newer results or clear newer loading state; closed checkout stops searching. Component lifetime checks prevent late lookups from submitting or late responses from dispatching success into a different page/account. |
| `src/lib/checkout-payment.js`, checkout host, `src/app/api/sales/route.js` | Shares existing server payment validation with the UI: enabled methods, split enablement, strictly positive components, required UPI/bank references, and full invoice total. Preserves the existing decimal `money()` arithmetic. Settings-enabled Bank is available; disabled methods/splits are excluded; required references are labelled and enforced. Credit eligibility/limits remain in the existing wholesale credit path. |
| Sales POST route | Includes `$type: "string"` with the validated request-key equality in both retry lookups, allowing the existing partial `requestKey_1` index to serve them. Actor/request-hash validation and transaction rechecks remain unchanged. |
| `src/lib/benchmark-safety.js`, `src/proxy.js`, `src/lib/db-connection.js` | Explicit `POS_BENCHMARK_READ_ONLY=1` rejects unsafe API methods before authentication/DB work, except manual login endpoints. Also disables automatic collection/index creation for diagnostic connections. Normal production does not enable this mode. |
| `scripts/profile-electron.mjs` | Adds phase-separated reports, checkout UI fixtures, request-start evidence, tracked isolated profile cleanup, and a local server-barrier preflight before launching a renderer. |
| `scripts/fingerprint-pos-data.mjs`, `scripts/fingerprint-identity.mjs`, `scripts/inspect-pos-query-plans.mjs` | Authenticated read-only database snapshot hashing and existing-index/execution-plan inspection, without recording document values or credentials. |
| Tests | Adds actual checkout-handler duplicate/race fixtures, shared payment-rule tests, uncertain customer retries, financial barrier coverage, fingerprint identity checks, and regular/direct checkout commit/retry/rollback fixtures. Existing edit/external-purchase fixtures are extended. |

The existing Sales memory/IndexedDB cache was retained. No duplicate catalogue store, new index, pricing formula, authentication bypass, speculative stock subtraction, product or customer seed was introduced. Original historical performance artifacts were preserved; this run has separate reports.

## Audit trace

| Area | Evidence and conclusion |
| --- | --- |
| Authentication and scope | `src/lib/auth.js` verifies PASSWORD_V2 JWT issuer/audience, active user, authentication version, role/effective permissions and inactivity rules. Workspace layout passes a server-derived scope. `src/lib/sales-cache-scope.js` hashes the actual persisted Settings store ID, user, auth version, role and sorted permissions. Store identity exists in this database. |
| Store/branch boundary | Products, Sales and inventory are scoped to the configured customer database and its `key: global` Settings document. These models do not have a Sales branch/tenant field. Consultation's branch field is separate. No unsupported branch identity was inferred. |
| Sales memory/persistence | `src/lib/sales-resources.js`, `src/lib/sales-indexed-db.js`, `src/components/AppShell.jsx` use one scoped memory cache plus native IndexedDB, with schema limits, bounded details, epoch fences, response scope headers, logout/account-change purging and persistence disabled for volatile/missing store identity. Existing regression fixtures cover late success/denial and purge ordering. |
| Search and barcode | `src/lib/sales-search.js`, `src/components/barcode/SalesBarcodeHost.jsx`, `SalesWorkspaceModern.jsx` use local searchable metadata and exact barcode maps. Index-only rows go through authoritative selling-detail resolution before cart/pricing. No real barcode is registered, so a real scanner/cache hit is unverified. |
| Product API and inventory | `src/services/sales-index.service.js` returns at most 10,000 compact rows and falls back if incomplete. `product.service.js` projects POS fields and fetches batches only for bounded product IDs; normal pages are 50. Existing Low/Opened stock membership queries retain authoritative server stock semantics, and cached memberships are searched locally. |
| Refresh/receipts | Successful resource mutations refresh affected product details from the server; unsuccessful writes retain stock. Sales POST returns affected IDs and receipt snapshots. `SalesSuccessHost.jsx` dispatch/print behavior remains after success; no receipt event was triggered during live benchmarks and no printer was exercised. Fixtures capture success events without invoking a printer. |
| Checkout/payments | The checkout host and shared payment validator enforce the same available methods/reference/split contract as Sales POST. Cash entry changes only tender/change state; switching payment method remains a pricing input because cash-only round-off can change totals. |
| Customer resolution | `checkout-customer.js` retains walk-in/name-only/existing/new and retail/wholesale rules. `CartCustomerFields.jsx` already fences aborted lookups. Checkout's previously unfenced wholesale lookup is fixed. Required permissions are retained. No live customer was created or edited. |
| Transactions/idempotency | Sales POST keeps FiscalGuard serialization, per-transaction product/stock state, atomic batch flush, invoice counter, audit/customer/expense writes and unique request-key enforcement. `requestHash` and actor matching reject changed reuse. Unknown-result retries now avoid changing NEW to EXISTING after a possibly committed response. |

## Native UI results

Milliseconds, median of five samples. “Opening” includes the first measured open after cache/prefetch readiness; repeated-return medians are reported below. Two animation frames are included in paint timing.

| Action | Electron before | Electron after | Chrome before | Chrome after |
| --- | ---: | ---: | ---: | ---: |
| Sales opening | 34.6 | 27.8 | 23.5 | 52.3 |
| Local text search | 5.8 | 5.7 | 5.8 | 9.0 |
| Clear search | 12.4 | 11.0 | 9.1 | 25.2 |
| Fresh cached cart addition | 18.3 | 17.4 | 17.3 | 37.0 |
| Fixture checkout opening | 13.3 | 13.1 | 12.7 | 13.6 |
| Fixture checkout cancelling | 12.9 | 13.1 | 12.8 | 15.0 |
| Fixture cash/change entry | 12.9 | 13.4 | 13.0 | 8.6 |
| Fixture reference entry | 13.0 | 13.3 | 12.8 | 10.5 |
| Fixture switch to UPI | 12.7 | 12.9 | 12.9 | 14.7 |
| Fixture switch to Cash | 12.9 | 12.9 | 12.8 | 14.2 |

The existing cache was already fast in the before run. All five after samples meet the requested warm Sales/search/cart limits. Some Chrome timings increased; these samples do not establish a universal speedup. The checkout memo/formatter changes remove repeated computation, while frame scheduling limits the observable paint-level difference on this 30-line fixture. There is no debounce or catalogue request on clearing search.

After repeated-return medians: Electron **27.65 ms**, Chrome **50.85 ms**. First measured opens: Electron **74.8 ms**, Chrome **124.5 ms**.

After samples, in recorded order:

| Action | Electron | Chrome |
| --- | --- | --- |
| Sales opening | 74.8, 34.6, 27.8, 27.5, 27.3 | 124.5, 49.4, 45.6, 52.3, 57.8 |
| Local text search | 4.6, 6.1, 5.5, 5.8, 5.7 | 9.0, 7.7, 8.5, 9.4, 9.2 |
| Clear search | 11.0, 11.2, 11.8, 10.7, 10.2 | 28.6, 24.4, 29.2, 25.2, 24.4 |
| Cached cart addition | 17.4, 17.4, 15.6, 18.1, 23.1 | 31.9, 37.5, 37.0, 36.5, 38.0 |
| Fixture checkout opening | 16.6, 13.0, 13.1, 13.0, 13.2 | 24.7, 14.6, 13.6, 12.8, 10.6 |
| Fixture checkout cancelling | 13.4, 12.8, 13.1, 12.8, 13.4 | 15.0, 14.6, 15.6, 16.2, 12.2 |
| Fixture cash entry | 12.3, 13.2, 13.4, 13.4, 13.6 | 5.0, 13.0, 8.6, 7.8, 10.8 |
| Fixture reference entry | 13.4, 13.3, 13.3, 13.3, 13.4 | 12.4, 9.8, 8.8, 10.5, 10.7 |
| Fixture switch to UPI | 12.9, 12.9, 12.7, 13.0, 12.7 | 12.7, 15.0, 20.8, 14.2, 14.7 |
| Fixture switch to Cash | 12.5, 13.1, 12.8, 13.2, 12.9 | 15.2, 14.2, 13.9, 13.8, 15.5 |

Before individual samples and both sets of readiness/paint timings are in the linked JSON reports.

Catalogue request starts: **zero in every measured Sales open/return, search, clear and cached addition**, both before and after. Five searches in each cached Low Stock and Opened Stock filter also started **zero catalogue requests**. Each fixture checkout/control action started **zero API requests**. IndexedDB reload started **zero catalogue requests** in all four native reports.

Cold prefetch and first-use stock filters still make legitimate read requests. Complete after-run API starts were Electron 18 and Chrome 19, including dashboard/notification/settings/customer-directory reads and filter initialization; they are not the counts for warm Sales actions. Financial write starts were zero. The only recorded unsafe request in the before runs was the user's manual username login. CDP `writesBlocked: 0` means no forbidden write was attempted, not that its blocker was disabled. The local server barrier was additionally proven with blocked 403 responses before benchmarking.

Cache mode was `local` throughout measured Sales actions. Persistence retained 2,099 metadata rows; the before/after Electron profile restored its own persisted cache and warm route returns used memory. Chrome independently populated its cache; its reload restored IndexedDB. MongoDB remained authoritative for selling details and stock membership.

## Read-only database/request evidence

Existing indexes were inspected before changes. No index was added or rebuilt.

| Query | Five-sample evidence |
| --- | --- |
| Lightweight catalogue index | `active_1_name_1` IXSCAN plus sort; 2,100 examined / 2,099 returned; query execution 13–16 ms. |
| Bounded selling page | `active_1_name_1`; exactly 50 documents/keys examined; query execution 0 ms at MongoDB's resolution. |
| Bounded positive-stock batches | `productId_1_expiryDate_1_createdAt_1`; 44 documents, 83 keys examined; 40 returned; query execution 0 ms. |
| Representative checkout stock query | Actual positive-stock and configured expiry filters for 50 catalogue IDs; `productId_1` plus sort; 44 documents examined; query execution 1 ms. This is a read query, not checkout latency. |
| Retry lookup before | COLLSCAN; 515 documents examined in all five samples. Client explain times 45.12, 38.54, 157.53, 38.02, 40.49 ms. |
| Retry lookup with string predicate | Existing partial unique `requestKey_1` IXSCAN; one document and one key examined in all five samples. Client explain times 37.61, 42.53, 37.11, 39.17, 47.67 ms. Network dominates; no transaction-speed claim follows from these times. |

Current service-only measurements: first 50 products 198.70 / 270.12 ms, lightweight metadata 316.45 ms, serialization 1.68 ms, one full selling detail 204.03 ms. Metadata payload is **743,596 JSON bytes** for 2,099 rows; the bounded 50-product payload is **82,777 JSON bytes** and one detail is **1,611 bytes**. Native encoded transfers, including HTTP framing/headers, are retained separately in the browser/Electron reports. After Chrome's index request transferred 744,945 bytes and took 811.03 ms; its Server-Timing total was 789.5 ms. These cold reads do not count as warm action latency.

Available Server-Timing separates auth, connection, product/batch query, processing, stock-filter, serialization and total time. It also exposes still-expensive dashboard inventory aggregation and notification alerts; these were traced but are outside this Sales/checkout change. Ordinary production performance logging is disabled (`NEXT_PUBLIC_POS_PERFORMANCE_LOG` is not `1`); no SalesPerf console events were recorded.

## Data safety

Before snapshot: `2026-10-14T05:38:30.948Z`. After snapshot: `2026-10-14T05:56:34.329Z`. Each uses an authenticated MongoDB snapshot session and sorted **raw BSON**, hashing every persisted field with a length prefix. Counts, byte counts and SHA256 values all match exactly:

| Collection | Count | BSON bytes | Matching before/after SHA256 |
| --- | ---: | ---: | --- |
| sales | 551 | 1,842,763 | `90ae5b10dd5291645d20faac8372914e7dbeaed3d114af16e753222872657c43` |
| inventorybatches | 1,590 | 368,910 | `d4bd42c96ba45b4efc76bc783968b380956fb97720e469d42a70bb59cf51b055` |
| stocktransactions | 3,003 | 1,151,067 | `52e486ceb9b3a5178c62c1604fa8fdb3ef8f2a5e83a7b3453116f1241ce18a21` |
| products | 2,101 | 2,502,624 | `60d388463183e6fe18c740cb74cf1dc62b31352e3835421f5a66ac1d81347c4e` |

The original database identifier used MongoDB's SRV discovery order, which changed between connections. The original before report is preserved. The final tool verifies that identifier against permutations of the same host set and database, then records a canonical sorted-host identifier. `sameIdentity`, every collection comparison and `matchExactly` are **true**. Tests reject a different database or host set; matching store identity alone is insufficient.

The server barrier applies before route authentication and database work, including automatic/direct checkout and customer/payment/stock/refund/backup APIs. The diagnostic connection disables autoCreate/autoIndex, and database scripts use the raw authenticated driver without model initialization. Renderer interception independently blocks all unsafe requests except manual login. No live sale/customer/product was created or edited, payment taken, stock changed, refund issued, receipt printed, backup run or seed inserted. Authentication can perform its existing login/audit/throttle/last-active bookkeeping; the unchanged-data assertion covers the four named financial/catalogue collections, not authentication metadata.

Both owned local server processes stopped. All recorded benchmark profiles were removed: three unique directories, with Electron's profile reused between the two phases. Existing user profiles, Electron installations and unrelated processes were left alone.

## Verification and limits

- **371 application tests passed**, including existing Sales cache/search/scope/pricing/inventory/customer fixtures and new checkout regressions.
- **9 Electron tests passed**. These tests use isolated filesystem/network/printer fixtures; they do not run a live backup or physical printer.
- **Lint: zero errors, three existing warnings**: two in `ExpensesWorkspace.jsx`, one existing Sales effect dependency warning.
- **Production builds passed** for before, optimized UI and final server retry-filter source. Final build uses `.next-pos-after`.
- **Whitespace check passed**.
- Regular and direct checkout success, receipt snapshot responses, edit/external expense rollback, duplicate handler clicks, serialized duplicate server requests, modified-key reuse and uncertain-result retries were exercised with isolated dependencies. No fixture result is live transaction latency. The server fixture serializes its mocked transactions; actual MongoDB concurrent commit/rollback behavior remains unverified under this no-live-write constraint.
- Actual live barcode/cache-hit timing is **unverified** because barcode count is zero. Existing barcode cache regression fixtures pass; no live product was given a test barcode.
- Actual live payment-window interaction is **unverified** because this customer's payment window is disabled. All checkout-control timing is explicitly a fixture. The customer's Settings were not changed to enable it.
- Hosted production changes and performance are **unverified for this patch**; nothing was deployed. The installed Electron binary continues using its configured hosted URL and does not receive these local web changes until a separately authorized deployment. Installed upgrade/startup, device printing and real checkout latency were not tested, and no installer was rebuilt.
- This live UI session verified the signed-in account's access to Sales, products, settings and customer-directory reads; its exact role was not retained in the redacted report. Additional staff-role/permission UI combinations and all physical barcode devices remain unverified; permission/cache scope behavior is covered by isolated regression fixtures without loosening server permissions.
- Remaining cold-read cost includes catalogue metadata transfer, authoritative detail hydration, stock-filter aggregates and auth/network latency. The existing full-index sort is small at this catalogue size, so another index/store was unjustified. Dashboard/notification latency and customer substring-search indexing are separate findings; they were not expanded into unrelated changes.

## Reproduction (PowerShell)

From this repository, run the checks and build:

```powershell
npm.cmd test
npm.cmd run desktop:test
npm.cmd run lint
$env:NEXT_DIST_DIR = '.next-pos-after'
npm.cmd run build
node scripts/inspect-pos-query-plans.mjs
node scripts/fingerprint-pos-data.mjs --output=docs/pos-recheck-before.json
$env:POS_BENCHMARK_READ_ONLY = '1'
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
```

In a second terminal:

```powershell
node scripts/profile-electron.mjs --local --interactive --compare-browser --checkout --phase=after
```

Sign in only inside the labelled Electron window. The local script verifies the server barrier before opening a renderer. It performs five cycles in Electron and Chrome and removes its owned profiles. `--checkout` uses isolated UI fixtures, never submits them, and writes phase-labelled reports; preserve existing reports if comparing another run.

After the benchmark finishes, stop only that local server with Ctrl+C and compare fingerprints:

```powershell
node scripts/fingerprint-pos-data.mjs --output=docs/pos-recheck-after.json --compare=docs/pos-recheck-before.json
Remove-Item Env:POS_BENCHMARK_READ_ONLY -ErrorAction SilentlyContinue
Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
```

Database scripts read only this checkout's `.env.local`; do not copy another customer's environment. Reproduction requires access to this database and an in-app sign-in. Do not run an installer build or deployment as part of this procedure.
