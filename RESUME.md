# Latest task — shimmering loading animations (2026-10-14)

## Original task

User asked: `change the all loading animation to shimmering animation`.

## Completed

- Replaced all Lucide loading-icon references throughout the app with a shared `LoadingShimmer` component. Checkout preparation's remaining spinning indicator now shimmers.
- Existing page/table/chart skeletons share a transform-based shimmering highlight. Reduced-motion preferences render static placeholders.
- Added accessible `LoadingPlaceholder` skeletons for login initialization, customer detail loading, supplier/operation loads, audit/backup panels, doctors, product details and the purchase product picker.
- Added page skeletons for sale editing and sale details, skeleton cards for empty Sales grids, and shimmer indicators for Sales detail/stock loading.
- Page skeletons retain loading announcements and hide decorative shapes from assistive technology. Buttons retain their existing text and disabled behavior.
- Source search found no remaining `LoaderCircle`, `Loader2`, `animate-spin`, `animate-pulse` or custom spinner references in `src`.
- Final verification: 409 tests passed with zero failures/skips; lint passed with zero errors and three existing warnings; production build passed in `.next-shimmer`; diff check passed.

## Currently being worked on

Local implementation and automated verification are complete. Browser visual verification was not performed.

## Files modified

New: `src/components/LoadingShimmer.jsx`.

Modified: `src/app/globals.css`; `src/components/PageShimmer.jsx`, `AccountsWorkspace.jsx`, `BackupFolderPicker.jsx`, `ChangePasswordForm.jsx`, `ConfirmDialog.jsx`, `CustomerWorkspaceAdvanced.jsx`, `DoctorSettings.jsx`, `ExpensesWorkspace.jsx`, `LoginForm.jsx`, `NotificationsWorkspace.jsx`, `OperationsWorkspace.jsx`, `PremiumSelects.jsx`, `ProductCatalogue.jsx`, `PurchaseForm.jsx`, `PurchasesWorkspace.jsx`, `SaleSourceDetails.jsx`, `SalesCheckoutHostV2.jsx`, `SalesWorkspaceModern.jsx`, `SettingsWorkspace.jsx`, `StaffWorkspace.jsx`; `src/components/barcode/BarcodeInput.jsx`, `CameraBarcodeScanner.jsx`, `ScannerStatus.jsx`; `RESUME.md`.

Prior sale-edit performance changes and retention handoffs are preserved below.

## Important implementation decisions

- Shared span-based shimmer replaces SVG loaders; status labels stay on surrounding controls, while standalone skeletons announce loading.
- A pseudo-element animates with `transform`; skeleton backgrounds remain stable. `prefers-reduced-motion: reduce` disables the animation.
- Existing request logic, sale/cart behavior, permissions and database mutations were not changed for this visual task.
- No new tests were added for this reversible visual-only change. Existing lint/build/tests provide code validation; they do not prove visual animation rendering.

## Known issues and remaining tasks in order

1. Browser-check shimmer rendering on login, Sales/edit, tables, dialogs, buttons and scanners; check reduced motion. No browser automation package is installed in this repository and no browser connector was available.
2. Hosted deployment and Electron runtime/installer checks were not requested or performed. Three pre-existing lint warnings remain.

## Commands/tests to run next

All checks passed. Only repeat after further changes: `npm.cmd test`; `npm.cmd run lint`; `$env:NEXT_DIST_DIR='.next-shimmer'; npm.cmd run build`; `git diff --check`.

## Exact recommended next step

Open the app in the existing authenticated local browser and verify shimmer rendering during page navigation, sale editing and checkout preparation, including reduced-motion behavior. No production transaction is needed to inspect the loading animation.

---

# Previous task — sale edit fetch optimization complete (2026-10-14)

## Original task

User reported `GET /api/sales/6acf7732f9711956440254db?edit=true 200 in 32.7s` and asked to make sale-edit fetching faster.

## Completed

- Reproduced the bottleneck with read-only configured-database queries: the old route returned 2,110 products / 3.89 MB; edit-data work took 30,158 ms plus 150 ms sale lookup.
- Initial edit now loads only billed product/mixture IDs, with POS projections. Modern allocations skip an unnecessary stock-history query; legacy bills retain the ledger fallback.
- Added admin-protected, eligible-sale product browse pages capped at 50 rows, including search, category, mixture, loose, low-stock and opened-stock filters. Original stock credits apply to every page; active hidden billed products remain accessible.
- Wired existing Sales pagination/loading/error/retry behavior into edit mode; kept edit data out of ordinary Sales caches and retained shared GET coalescing/abandoned-response guards.
- Added Server-Timing diagnostics, a read-only profiler, seven regression tests and performance documentation.
- Measured initial edit data at 197 ms plus 145 ms sale lookup; first browse page at 1,103 ms. Second read: 180 + 149 ms initial, 1,149 ms first page. Billed-cart parity passed for the reported sale.
- Final checks: 409 tests passed; production build passed in `.next-sale-edit`; lint zero errors / three existing warnings; diff check passed.

## Currently being worked on

No remaining authorized local implementation work. Browser and hosted HTTP verification were not performed.

## Files modified for this task

- `src/app/api/sales/[id]/route.js`
- `src/components/SalesWorkspaceModern.jsx`
- `src/services/sale-edit-read.service.js` (new)
- `tests/sale-edit-read.test.mjs` (new)
- `scripts/profile-sale-edit.mjs` (new)
- `docs/sale-edit-performance.md`, `docs/sale-edit-before.json`, `docs/sale-edit-after.json` (new)
- `RESUME.md` (this new section; prior retention handoff preserved below)

## Important implementation decisions

- Load billed cart first; fetch browsing pages separately. Do not reload the whole catalogue during edits.
- Reuse persisted stock allocations or legacy ledger rows without changing stock during GET. Preserve actual checkout editing transactions, original prices, invoice identity, revision/version checks and idempotency.
- Both edit views require admin and an editable fully paid commercial bill. Hidden billed products remain included; inactive products retain their prior unavailable behavior.
- Low-stock filter uses physical stock, matching the prior editor. Opened-stock filter includes returned loose stock.
- Benchmarks are read-only and disable autoIndex/autoCreate. Timings exclude auth/HTTP/browser work and must not be described as measured browser response times.

## Known issues and remaining tasks in order

1. Browser-check opening the reported sale, next/previous pages, search/category/mix/stock filters, billed quantities and adding a product. Actual checkout submission requires an appropriate test environment; do not mutate production for verification.
2. Hosted response timing and deployment remain unverified; no deployment requested or performed.
3. Three existing lint warnings remain. Preserve prior retention work described below and its production activation boundaries.

## Commands/tests to run next

Only rerun passed checks if code changes: `node --test tests/sale-edit-read.test.mjs tests/sale-edit.test.mjs`, `npm.cmd test`, `npm.cmd run lint`, `$env:NEXT_DIST_DIR='.next-sale-edit'; npm.cmd run build`, `git diff --check`.

Read-only profiling: `node scripts/profile-sale-edit.mjs --parity`. Raw before/after artifacts and limits are documented in `docs/sale-edit-performance.md`.

## Exact recommended next step

Open the reported sale edit in the user's existing authenticated local browser; verify the billed cart appears promptly and browse pagination/search work. Inspect the request's Server-Timing header for actual route timings. Local implementation is complete.

---

# Previous task — local implementation complete

Implement safe permanent deletion of detailed POS sales/bills older than 90 days, preserving historical reports, tax/payment totals, customers, expenses and stock. Original request: `C:/Users/User/.codex/attachments/904d1007-e5f1-42f0-a6f2-39332fdc0318/Pasted text.txt`.

Customer confirmed: current Oushadhi repository; Electron production URL remains `https://oushadikkmpos.vercel.app`. Do not deploy, rebuild installers, run production backfill/cleanup, create transactions/payments/stock changes, print or run backups. Credentials only inside the app. Prior Sales performance and stock-card changes are unrelated uncommitted work and must be preserved.

## Completed before the resume request

- Audited all sale consumers, immutable edit flows, numbering, retries, stock, customer totals, account ledger, dashboard and reports.
- Added permanent compact analytics ledger, daily financial/product/customer summaries, retention validation state and bounded cleanup logs. No Sale TTL.
- Added transaction-bound checkout/edit summary synchronization, historical read union with deduplication, purged-bill 410 response and retry protection.
- Added protected backfill, checkpointed validation, bounded transactional cleanup with no stock reversal, audit snapshot trimming, legacy restore protection and product-merge history synchronization.
- Added admin Settings retention controls, read-only preview, protected cron route, daily UTC schedule and store-bound CLI utilities.
- Added pure tests and a temporary localhost MongoDB replica set test suite; seven integration scenarios passed, including actual rollback after deletion and before/after financial KPIs.
- Read-only live audit: 559 sales, no bills older than 60/90 days, no Sale TTL, no permanent retention collections populated. All production database writes: zero.
- Last lint passed with three pre-existing warnings. Full tests/build have not yet been rerun after all changes.

## Completed after resuming

- Compared compact facts directly with source bills, added full source-coverage checks and deterministic backfill repair for missing/corrupt daily/product/customer summaries.
- Preserved legacy payment/mix calculations and dashboard cost fallback; strengthened scope isolation, retention-policy reset protection and user-facing validation errors.
- Verified the actual checkout route against localhost MongoDB: commit, duplicate requests, retries, history failure rollback and purged retry rejection. Added customer endpoint, cancelled/mix/external/credit/legacy-payment report, tamper, missing-ledger, product-merge and admin/cron gate fixtures.
- Verified 100,000 fixture bills: expiry index selected; one batch examined/deleted exactly 100; 99,900 detailed bills remained; historical count/revenue stayed 100,000. This was not a test of purging all 100,000 or production migration latency.
- Final application tests: **402 passed, 0 failed, 0 skipped**. Electron tests: **9 passed**. Lint: **0 errors, 3 existing warnings**. Final local production build: **passed**.
- Wrote `docs/sale-retention-verification.md` with exact changed-file inventory, migration instructions, evidence and limitations. Added `scripts/inspect-retention-activity.mjs`, environment examples and machine-readable fixture/activity/fingerprint results.
- Verified the new CLI in authenticated read-only preview mode: 572 detailed sales, zero older than 60/90 days, validation incomplete, cleanup disabled, no previous cleanup.
- All six live retention collections remain empty; no production backfill, validation write or cleanup occurred. Owned MongoDB fixture processes stopped; a read-only process listing found no remaining mongod process.

## Current work status

No remaining authorized local implementation work. Hosted deployment, production migration/activation, storage reclamation and new Settings visual/installed-Electron checks have not been performed. Keep cleanup disabled until explicit migration authorization and validation review.

## Final live-data fingerprint evidence

Original/final fingerprints **do not match exactly**, but the store/database identity matches. During local development, live sales increased 559→572, inventory batches 1,590→1,595, stock transactions 3,017→3,045 and products 2,101→2,104. Creation timestamps account for those additions; 25 batches and four products were also updated. Request/client attribution is unverified. Do not claim pre-existing records remained identical. All agent mutations ran in the owned localhost fixture; production checks were read-only. See `docs/sale-retention-concurrent-activity.json` and the before/after fingerprint files.

## Files changed for retention

New: `src/lib/sale-retention.js`, `src/lib/retention-cron.js`, `src/services/sale-history.service.js`, `src/services/sale-retention.service.js`, `src/components/SaleRetentionSettings.jsx`, `src/app/api/settings/sale-retention/route.js`, `src/app/api/cron/sale-retention/route.js`, `scripts/sale-retention.mjs`, `scripts/inspect-sale-retention.mjs`, `tests/sale-retention.test.mjs`, `tests/sale-retention-db.test.mjs`, `vercel.json`, this file, and `docs/sale-retention-*.json` evidence.

Modified: package files (development-only mongodb-memory-server), models, sales routes, customer routes, product merge, Settings/Recent Sales/Sale Source Details, GST/dashboard pipeline, account data/accounting, report services, backup restore protection, product deletion guard, sale edit retry, settings service, related existing test harnesses. `git status --short` also lists prior unrelated performance/stock changes; never reset them.

## Decisions

- One store per database, scoped using persisted global Settings `_id`; no invented tenant/branch fields.
- Strict expiry `< now`, backend invoice date fallback to createdAt, 90 elapsed days, Asia/Kolkata reporting days.
- Compact analytics facts omit invoice number, unit selling prices, customer PII, allocations, receipt and payment references. They cannot reconstruct/reprint bills. Daily/monthly totals remain permanent.
- All mutations use the existing FiscalGuard and snapshot/majority transactions. Cleanup requires environment `SALES_RETENTION_CLEANUP_ENABLED=1`, enabled policy and successful validation.
- No independent sale refund/day-closing workflow exists. Consultation refunds remain independent. Reliable inventory COGS was already unavailable; do not invent it. Freeze existing dashboard estimated cost on purge.
- MongoDB fixture binary 8.2.6 cached in the OS temporary directory by mongodb-memory-server; tests create only an owned localhost database and stop owned processes.
- Scheduler remains bounded: 100 bills per batch, at most 10 batches per invocation, no new batch after 30 seconds. Manual/CLI cleanup is one batch of 100; remaining backlog is reported.
- Automatic approval review rejected increasing the scheduler to up to 500,000 deletions per invocation because of irreversible production blast radius. The rejected expansion was not applied. Do not bypass it.
- No new archive/backup/restore system was built. Existing same-database restore preserves permanent history and filters purged bills. An old archive alone cannot restore purged analytics on a fresh database.

## Known issues and future operational work, in order

1. Review `docs/sale-retention-verification.md` and live activity evidence. Existing lint warnings and ten dependency-audit advisories remain; dependency-wide remediation was outside this change.
2. Obtain explicit deployment authorization; keep `SALES_RETENTION_CLEANUP_ENABLED=0` for the initial release. Verify the new Settings panel visually and the hosted/Electron behavior.
3. Obtain explicit store-bound backfill/validation authorization. Compare original reports while details still exist, complete checkpointed validation and review preview results.
4. Only after explicit activation approval, enable cleanup and verify the first bounded run plus hosted cron behavior with fresh fingerprints. Very large backlogs require additional approved bounded invocations. A slow/oversized daily validation may time out safely; do not weaken checks to bypass it.

## Reproduction commands — do not repeat passed checks without changes

```powershell
node --test tests/sale-retention.test.mjs tests/sale-retention-db.test.mjs
npm.cmd test
npm.cmd run desktop:test
npm.cmd run lint
npm.cmd run build
node scripts/fingerprint-pos-data.mjs --output=docs/sale-retention-after-fingerprint.json --compare=docs/sale-retention-before-fingerprint.json
```

Tests/Next output and downloads may require workspace process/network escalation under this Windows environment. Fingerprint/audit commands require network access but are raw authenticated read-only queries with no auto-indexing.

## Exact recommended next step

Read `docs/sale-retention-verification.md`, confirm the local task is complete and wait for explicit deployment/migration authorization. Keep cleanup disabled. Do not recreate completed work or treat these operational instructions as authorization for production writes.
