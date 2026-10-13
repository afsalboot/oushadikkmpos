    # POS loading performance audit — 13 October 2026

    Implemented changes target the measured loading bottlenecks. All live diagnostic runs disabled Mongoose index creation and automatic collection creation and performed no database writes. No checkout, receiving, refund, cancellation, or live user mutation was performed for verification.

    ## Measurements and root cause

    See `performance-measurements.json` for the recorded values. These are service timings on the existing database, **not authenticated HTTP endpoint benchmarks**. They exclude session verification, proxy execution, browser transfer, and route serialization. The store continued operating between runs, so invoice counts and response bytes changed.

    | Loading operation | Reproduced before | Final measured service time |
    | --- | ---: | ---: |
    | Sales product loading | 27.52–27.79 s, all 2,099 products | 0.91–1.40 s, first 50 products including total count |
    | Dashboard, today | 26.53–26.73 s | 2.30–2.57 s |
    | Generated notifications | 4.33–4.36 s | 0.78–0.79 s |
    | Categories | User log: 233–381 ms, HTTP | 88–100 ms, service |
    | Settings, cold cache | User log: 92–254 ms, HTTP | 114–125 ms, service |
    | Settings, warm cache | Not measured before | Less than 1 ms, service |

    The product query used `IXSCAN` and took 4–5 ms inside MongoDB, examining approximately 2,100 documents. The sampled sales date query also used `IXSCAN` and took less than 1 ms. Missing indexes were **not the demonstrated reason** for the 30-second product reads.

    A native driver comparison reproduced 27.93 s for 2,100 full products (2,841,666 JSON bytes), versus 1.48 s for their IDs and names (131,292 bytes). The full cursor's `getMore` command took 26,399 ms for 1,999 records. An aggregation returning those same full documents also took 28.27 s. This confirms that large cursor responses dominate elapsed time; it does not identify a particular network device, Atlas tier limit, or server bandwidth policy. No per-product query or stock reconstruction from sales/purchases was present in the original product loading service.

    Zlib was tested, but the server advertised no shared compression algorithm and timings did not improve. Compression was not retained in the application connection configuration. MongoDB compression requires negotiation with the server: [Node driver documentation](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/network-compression/).

    ## Findings, fixes, and evidence

    | Verdict | Evidence and failure mode | Implemented fix / verification |
    | --- | --- | --- |
    | FIXED for the Sales screen; remaining full-list limitation | `src/services/product.service.js:120` loaded all products; the original Sales mount requested the unpaged endpoint. Native cursor timings above reproduced the delay. | Sales now requests 50 rows per page, with total counts, server search, category/loose/mix/stock filters, Previous/Next, loading/error states, and retry. `src/components/SalesWorkspaceModern.jsx:594` and `src/app/api/products/route.js:10`. Unpaged responses retain their existing array contract and remain slow when explicitly requested. |
    | FIXED | Original dashboard loaded full period sales, full active products, every inventory batch, and populated products again through the batches. Large reads and Node-side chart scans compounded the transfer cost. | Sales, payments, wholesale, chart, expense, purchase, and inventory summaries use aggregation. Only six recent invoices, five stock/expiry/opened rows, and cost metadata for products referenced by period sales reach Node. `src/lib/server/dashboard-data.js:12`, `src/lib/dashboard-sales-pipeline.js`, `src/lib/dashboard-inventory-pipeline.js`. Read-only live parity and non-persistent fixtures passed. |
    | FIXED | Original dashboard used `status: "RECEIVED"` for purchases, although `purchaseStatus` is the model field (`src/models/index.js`). | The aggregate uses `purchaseStatus: "RECEIVED"`; purchases now appear in their intended summary. This is an intentional correctness change excluded from the before/after parity assertion. |
    | FIXED | Original notifications selected every active product and positive-stock batch, then used `products.find()` inside the expiry loop. Route state also performed two sequential user reads and sometimes wrote during GET. | Generate low-stock candidates and relevant expiry alerts in MongoDB; project only required fields. Preserve active alert IDs, priority order, purchase-due permissions, counts, unread/dismissed state, and the existing 100-item display limit. One user read runs alongside alert generation. GET is read-only; pruning occurs atomically during explicit notification mutations. `src/services/notification.service.js:9`, `src/app/api/notifications/route.js:9`, `src/lib/notification-state.js`. |
    | FIXED | Categories used `$lookup` to materialize every complete related product merely to compute `$size`. | One projected category read and one product count grouping run concurrently; the returned category contract remains unchanged. `src/app/api/categories/route.js:4`. Final live timing: 88–100 ms excluding authentication. |
    | FIXED in source; browser count verification UNKNOWN | Strict Mode can mount effects twice. Dashboard timer/focus/visibility triggers could overlap. Desktop/mobile navigation and the notification page could each poll. | Shared in-flight GET requests with independent subscriber abort signals; 1-second coalescing for dashboard/notifications/auth status; 5-minute settings/category caching. Desktop bell stops polling while mobile navigation is open. Polls skip hidden pages; dashboard queues a refresh after a mutation if its current read is still running. `src/lib/resource-fetch.js`, `DashboardWorkspace.jsx`, `NotificationBell.jsx`, `NotificationsWorkspace.jsx`, `AppShell.jsx`. Strict Mode remains enabled. Six request-sharing/cache race tests pass. |
    | FIXED | Login called both `router.replace()` and `router.refresh()`, causing redundant navigation work. Settings cache could issue concurrent cold reads. | Login uses navigation once. Settings cold reads share a promise; writes invalidate its generation to prevent late reads from replacing saved settings. Mutation fetch wrappers invalidate client resources, including login/logout and stock-affecting operations. `LoginForm.jsx`, `src/services/settings.service.js:38`, `src/lib/checkout-request.js`. |
    | PASS, source and tests | `src/lib/db.js` stores the connection and pending promise on `globalThis`; `src/lib/db-connection.js` clears failed attempts. | Connections are reused; no per-request disconnect was found in app request paths. Existing concurrency/retry tests pass. Diagnostic scripts disconnect only their own process when done. |
    | PASS for preserving the inspected security controls | `src/lib/auth.js:23`, `src/proxy.js`, and each changed route still verify live user activity, token authVersion, inactivity timeout, forced password change, and required permissions. | User/role reads use selected lean fields. React caching is confined to server render request scope; live permissions are not placed in a cross-request identity cache. API proxy still enforces cross-site write checks. Authentication behavior itself was not browser-tested. |
    | NOT APPLICABLE to this repository | `src/models/index.js`, `src/lib/auth.js`, `src/proxy.js`, and the affected routes implement one global store; no businessId tenancy filter, business lookup, persisted Notification model, or subscription middleware exists here. | No hypothetical tenant/subscription subsystem was added or removed. This is not a multi-tenant security certification. |
    | PRESERVED | Inventory is maintained in `InventoryBatch` by existing transactional sale/purchase/adjustment workflows. External purchase lines explicitly carry `inventoryTracked:false`. | No new current-stock counter or inventory migration was introduced. Package, loose, count-on-open/fixed-count, mix, wholesale, free-item, held-sale, retry-key, and sale-edit workflows retain server validation. Existing tests pass; no live transactions were executed. |
    | REMAINING, outside the measured loading hot paths | `src/services/purchase.service.js:91` and sale mutation handlers intentionally perform sequential transactional stock writes. Other report subtypes and explicit legacy exports still support complete datasets. | These were inspected and retained. Parallelizing operations on one transaction session or removing stock checks would risk correctness. Accounts, Overview and the management catalogue are optimized in the follow-up below. Other report subtype latency and large historical exports were not benchmarked. |

    ## Index declarations

    `src/models/index.js:731` registers indexes on fresh schemas before model creation so hot reload does not append them repeatedly:

    - Product `{ active: 1, name: 1 }`: active POS listing in name order.
    - Product `{ categoryId: 1, name: 1 }`: category listing/count access.
    - InventoryBatch `{ productId: 1, expiryDate: 1, createdAt: 1 }`: bulk selected-product batches in FEFO order.
    - Sale `{ createdAt: -1 }`: period analytics and recent sales. This index already exists in the live database and is now declared in this repository.
    - Purchase `{ purchaseStatus: 1, purchasedAt: -1 }`: received purchase summary and latest purchase.

    Existing unique barcode/SKU/retry-key indexes remain intact. Diagnostic runs did not install indexes or call `syncIndexes()`. Verify missing indexes through a controlled deployment/migration; do not use `syncIndexes()` to remove unrelated existing indexes. The live database contains additional indexes from its existing setup. New index effects were not included in the benchmark.

    ## Changed files

    - Backend: `src/app/api/{products,dashboard,notifications,categories}/route.js`; `src/services/{product,notification,settings}.service.js`; `src/lib/auth.js`; `src/lib/server/dashboard-data.js`; `src/models/index.js`.
    - Query/state helpers: `src/lib/{dashboard-sales-pipeline,dashboard-inventory-pipeline,product-stock-query,notification-state,performance,resource-fetch}.js`; `src/lib/dashboard-summary.js`; `src/lib/checkout-request.js`.
    - Frontend loading/polling: `SalesWorkspaceModern.jsx`, `DashboardWorkspace.jsx`, `NotificationBell.jsx`, `NotificationsWorkspace.jsx`, `AppShell.jsx`, `LoginForm.jsx`.
    - Shared mutation/cache wrappers: `ProductCatalogue.jsx`, `PurchaseForm.jsx`, `PurchasesWorkspace.jsx`, `ExpensesWorkspace.jsx`, `OperationsWorkspace.jsx`, `SettingsWorkspace.jsx`, `FutureInvoiceReset.jsx`, `CustomerWorkspaceAdvanced.jsx`, `StaffWorkspace.jsx`, `ConsultationWorkspace.jsx`, `ChangePasswordForm.jsx`, `LoginPinForm.jsx`.
    - Verification: `tests/resource-fetch.test.mjs`; existing `tests/fiscal-models.test.mjs` reload regression from the preceding fix; the three diagnostic scripts below; this report and `performance-measurements.json`.

    ## Verification and remaining work

    - Unit suite: 320 tests passed, including checkout retries, inventory/count-based/wholesale/free stock, pricing, consultation, request sharing/cache invalidation, and half-cent cost rounding compatibility.
    - Live MongoDB `$documents` fixtures: 26 assertions passed without persisting records, covering summary arithmetic, fixed/count-on-open inventory value, no-stock products, inactive products, expiry, mix/free-product costing, wholesale, notification ID updates, and half-cent rounding.
    - Live dashboard comparison against `HEAD`: 10 summary/chart field comparisons passed. Purchase filtering is the intentional exception described above; unstable timestamps and tie ordering are not compared.
    - Final working-tree lint: zero errors and three existing warnings. Production build passed using `.next-performance`, leaving the dev build directory separate. `git diff --check` passed. Browser/responsive pagination, scanner-device behavior, actual login, physical printing, live checkout/cancellation, and deployment remain unverified.

    The approximately 1-second products, 1–2-second dashboard, and 300–500 ms notification targets are **not consistently achieved** on this connection. The final dashboard inventory stage is about 1.27–1.35 s and its sales aggregation about 0.80–0.87 s. Investigate network throughput, database/server placement, and actual explain plans for these aggregations before claiming the stricter targets. Arbitrary short-term stock-result caching was deliberately avoided.

    The legacy unpaged Sales API and management full-catalogue loading still transfer the complete dataset. They are not the initial Sales loading path after this change. Substring search remains escaped case-insensitive regex to preserve matching behavior; exact barcode scanning continues to use the existing indexed equality route. A dedicated search index would need separate deployment/data support.

    Useful timing logs are opt-in: set `POS_PERFORMANCE_LOG=1` and restart. Products/dashboard/notification/accounts/report responses expose `Server-Timing` stages for authentication, connection, query/aggregation, and serialization without logging user data. The main connection time is usually charged inside authentication because authentication connects first.

    Reproduce safe diagnostics from the project root:

    ```powershell
    node scripts/profile-read-apis.mjs --pages-only
    node scripts/profile-mongo-transport.mjs
    node scripts/verify-performance-readonly.mjs
    npm.cmd test
    npm.cmd run lint
    $env:NEXT_DIST_DIR='.next-performance'; npm.cmd run build
    ```

    The standalone scripts require Node's `registerHooks` and `process.loadEnvFile` APIs (verified with the installed Node 24). They print timings/counts/field names, not document values or credentials. The parity script compares against the checked-in `HEAD` implementation, so after committing this optimization its baseline changes; use the original commit for a historical comparison. Settings uses a 30-second server cache and a 5-minute client cache with local write invalidation; changes from another process/tab can take the cache lifetime to appear, while checkout remains server-validated. Restart the dev server to adopt the new model index declarations.

    ## Follow-up: remaining Products, Accounts and Reports delays

    The later request logs reproduced 30–32 s for unpaged products, 20–21 s for Accounts, and 27–28 s for Reports Overview. These costs were in application work, not Next.js compilation.

    | Operation | Read-only reproduced before | Measured after |
    | --- | ---: | ---: |
    | Accounts, page 1 / 25 | 20.41 s | 2.27–2.31 s |
    | Reports Overview, 14 Sep–13 Oct | 29.13 s | 1.97–2.01 s |
    | Product management, first 20 | Earlier complete-products benchmark: 27.52–27.79 s | 1.61–1.63 s |

    These are service measurements, excluding HTTP authentication and route/browser overhead. A separate full-response parity run passed for both Accounts and Overview, with Accounts at 2.02–2.15 s and Overview at 2.06–2.22 s. The final catalogue selection-validity metadata adds only the requested selected IDs; the timed catalogue runs preceded that small metadata addition.

    - Product Catalogue requests `view=catalogue&page=1&limit=20`. A MongoDB facet computes filtered IDs, counts, brand choices, global stock metrics and the first 201 IDs used to enforce the existing 200-item bulk-selection cap. Only visible rows load complete editable product/batch data. Search, category, brand, stock, capabilities, visibility, expiry and active-batch filters remain server-driven. Current-page selection stays distinct from Select all filtered; search/deletion prunes unavailable selected IDs without discarding selection when changing pages. The bounded table and sticky header remain in place.
    - Purchases no longer downloads every product during startup. Its picker searches 30 products per page when opened. Draft editing/duplication starts from persisted line snapshots/populated details and refreshes the specific product IDs in one bounded read. The lightweight product-choice list loads only for management modals that require it.
    - Accounts aggregates only invoice payment fields, actor/customer names and item count. Expense, supplier-reference and consultation reads select their ledger fields. The existing ledger builder still processes all history before filtering/pagination, preserving chronological running balances, split payments, supplier paid portions and consultation refunds. A shared store date formatter avoids repeatedly constructing Intl formatters.
    - Reports Overview computes sales totals, wholesale totals, daily trends, external purchase margins and inventory units in MongoDB. It reuses the compact Accounts reader for actual cash flow instead of loading full sales and inventory reports again. Gross Profit remains unavailable without reliable historical COGS. Count-based inventory and inactive existing products retain the prior report semantics.
    - All API wrappers share overlapping GET requests, including Accounts/Reports/Purchases/Expenses/Staff. Completed financial/product results are not cached. HEAD and OPTIONS have separate requests. No database connection, auth check or stock mutation validation was removed.
    - Sales Previous/Next now sits below the product/cart layout, outside the product card grid, so it cannot occupy card columns.

    Verification: 320 unit tests passed; 98 non-persistent MongoDB aggregation assertions passed; full live Accounts/Overview response parity passed. Lint has zero errors and three existing warnings. The isolated production build passed. No browser login, responsive screenshot, scanner, checkout, receiving, refund or physical printer verification was performed. No data or indexes were created during diagnostics. Generated notifications still take about 0.8 s at the service layer; this follow-up does not establish a further improvement beyond that earlier measurement.

    Reproduce the additional diagnostics:

    ```powershell
    node scripts/profile-workspaces.mjs
    node scripts/profile-workspaces.mjs --parity
    node scripts/verify-workspace-performance.mjs
    ```

    Use the original checked-in commit for historical parity comparisons after committing these changes. Restart `npm run dev` to load the full update. The normal management route now requests paginated catalogue data; manually requesting bare `/api/products` retains the existing full-array contract and can still be slow.

