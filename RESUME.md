# Latest task — Sidebar order and Consultation submenu (2026-10-20)

## Original task

Order the owner and staff sidebar as Dashboard, Sales, Products, then other modules; place Doctors inside Consultation.

## What has been completed

- Reordered the shared desktop/mobile sidebar: Dashboard, Sales, Products, Consultation, Customers, Purchases, Expenses, Accounts, Reports, Staff, Settings. Only permitted entries appear.
- Consultation is an expandable, keyboard-accessible group containing Consultations and Doctors. Each child retains its own permission check. The group appears when at least one child is permitted; doctor-only staff can access Doctors without gaining consultation access.
- Consultation ticket entry still honors the enabled feature. The group opens on active consultation/doctor routes; links identify the current page and close the mobile drawer.
- Targeted ESLint, diff whitespace check and production build in `.next-sidebar` passed.

## What is currently being worked on

Implementation and automated code verification are complete.

## Files modified

`src/components/AppShell.jsx`; `RESUME.md`. Previous uncommitted Sales-priority changes in `src/lib/workspace-access.js` and `tests/workspace-access.test.mjs` remain intact.

## Important implementation decisions

The Doctors route and its server permission guard remain unchanged; only its sidebar position is nested. Existing login priority remains Dashboard, then Sales, then other permitted modules. Desktop and mobile use the same sidebar rendering.

## Known bugs/issues

No known code issues. Browser visual/keyboard verification and hosted deployment have not been performed.

## Remaining tasks in order

1. Browser-check owner and restricted staff menus on desktop/mobile, including expanding Consultation and selecting Doctors.

## Commands/tests that should be run next

Passed: `npx.cmd eslint src/components/AppShell.jsx`; `git diff --check`; `$env:NEXT_DIST_DIR='.next-sidebar'; npm.cmd run build`. No new tests added for the reversible sidebar presentation change.

## Exact recommended next step

Browser-check the menu order and permission-filtered Consultation submenu for an owner and restricted staff user, on desktop/mobile.

---

# Previous task — Staff module access and Sales loading (2026-10-20)

## Original task

Staff assigned Consultation, Doctor and Sales were always sent to Dashboard despite lacking access; Sales failed with 403s on settings/products/categories/index and then displayed “Sign in again to load Sales”. User requested only assigned modules and APIs, Dashboard disabled when unassigned, and the first permitted module after Dashboard as login priority.

Follow-up: user clarified that this must cover currently saved users and all future roles/permission combinations.

Latest clarification: when Dashboard is denied, prioritize Sales ahead of all other assigned modules. Only fall back to other modules when Sales is also denied.

## What has been completed

- Added permission-aware landing priority: Dashboard when allowed, then Sales, then Consultation (when enabled), Doctors and remaining assigned modules. Root, login, post-login/password-change, forbidden-page redirects and logo navigation use the permitted destination. Latest change only reorders the shared priority and updates routing tests.
- Added server page guards for Dashboard, Consultation, Doctors, Sales, Products, Customers, Purchases/Suppliers, Expenses, Accounts, Reports and Staff. Unauthorized pages redirect before client workspaces mount; API permission checks remain enforced.
- Added a standalone Doctors page and navigation entry. Settings no longer appears as a granted module for all staff; own password/PIN security remains accessible through the staff name link.
- Sales-only product pages/details, stock membership/index and barcode reads accept Sales permission without granting Products module access. General catalogue/detail and write permissions remain unchanged.
- Added explicit Sales category context and projected Sales settings. POS clients/prefetch/cache use these limited reads; store administration, security, backup and retention configuration are excluded.
- Sales customer searches run only when the staff also has customer-directory access. Checkout behavior otherwise remains unchanged.
- Sales cache still clears on denied access; forbidden scopes now explain missing permission instead of incorrectly asking users to sign in again. Expired sessions still require sign-in.
- Added landing/guard/permission/configuration tests and route fixtures exercising permitted Sales reads and blocked unrestricted reads. Full suite passed: 427 tests, zero failures/skips. Lint passed: zero errors and three existing warnings.
- Follow-up found a second bug: staff Customize saves discarded false overrides, so unchecked inherited grants returned. Added `normalizePermissionOverrides` for complete customized selections; create/update now preserve denials, module view denial revokes inherited actions/legacy grants, and the UI clears module actions when view is unchecked. Editing a customized user starts from effective permissions.
- Added tests for every module as the only grant under existing/new role names, plus staff create/update customization persistence and explicit module revocation. Full suite passed 430 tests; production build passed in `.next-staff-roles`. A test variable named `module` triggered Next's lint rule; renamed it `entry`, reran 14 relevant tests successfully, and lint is being rerun.

## What is currently being worked on

Follow-up permission-save fix and verification are complete. All 430 tests passed, production build passed in `.next-staff-roles`, final lint passed with zero errors and three existing warnings, and diff whitespace check passed. Fourteen relevant tests passed again after a lint-only test variable rename.

Latest Sales-priority change is complete: nine routing/access tests passed, targeted ESLint passed, and diff whitespace check passed. No full-suite/build rerun was needed for reordering the shared destination list. Browser/hosted verification remains open.

## Files modified

- `src/lib/workspace-access.js`, `src/lib/server/workspace-access.js`, `src/lib/sales-settings.js` (new); `src/lib/auth.js`, `src/lib/sales-resources.js`.
- `src/app/page.js`, `src/app/login/page.js`; new module `layout.js` guards under `src/app/(workspace)/{dashboard,consultations,doctors,sales,products,customers,purchases,suppliers,expenses,accounts,reports,staff}`; new `doctors/page.js`.
- `src/app/api/products/route.js`, `products/[id]/route.js`, `products/barcode/[barcode]/route.js`, `products/sales-index/route.js`, `categories/route.js`, `settings/route.js`.
- `src/components/AppShell.jsx`, `LoginForm.jsx`, `ChangePasswordForm.jsx`, `SalesWorkspaceModern.jsx`, `SalesCheckoutHostV2.jsx`, `CartCustomerFields.jsx`.
- New `tests/workspace-access.test.mjs`, `tests/sales-read-access.test.mjs`; updated `tests/sales-resources.test.mjs`; `RESUME.md`.
- Follow-up: `src/services/rbac.service.js`, `src/services/staff.service.js`, `src/components/StaffWorkspace.jsx`; `tests/rbac.test.mjs`, `tests/staff-credentials.test.mjs`, `tests/workspace-access.test.mjs`.

## Important implementation decisions

- Permissions are read from the validated current session and effective role/override resolution. No role assignments, credentials or live financial/stock records were changed.
- Narrow Sales dependency reads use their existing POS projections and response scope headers. Adding Sales permission does not grant Products/Settings module access or write access.
- Personal account security is available even with no assigned modules; `/settings` is the safe fallback and exposes only existing self-service controls for such staff.
- Current Consultation/Doctor/Sales role lands at Sales. Owners and staff with Dashboard permission retain Dashboard priority. Without Sales permission, use the first other permitted module.

## Known bugs/issues

No known automated failures. An authenticated browser verification with the user's staff account and hosted deployment are unverified. Existing lint warnings remain in ExpensesWorkspace and the existing Sales effect dependency.

Older staff customizations may already have lost explicit denies in storage. Intent cannot safely be inferred: owner should re-save the intended customized selection once after updating. Existing role/user permissions were not migrated or rewritten.

## Remaining tasks in order

1. Browser-check the staff role after signing out and back in: login should open Sales, navigation should show Consultation/Doctors/Sales, direct `/dashboard` should redirect to Sales without dashboard API requests, and Sales should load without dependency 403s. Check saving a customized existing/new user with inherited permissions unchecked.

## Commands/tests that should be run next

Passed: `npm.cmd test` (427 tests); `npm.cmd run lint` (three existing warnings); `$env:NEXT_DIST_DIR='.next-staff-access'; npm.cmd run build`; `git diff --check`. Temporary test log removed. Repeat checks only after further changes.

Follow-up passed: `npm.cmd test` (430 tests); `$env:NEXT_DIST_DIR='.next-staff-roles'; npm.cmd run build`; `node --test tests/workspace-access.test.mjs tests/rbac.test.mjs tests/staff-credentials.test.mjs` (14 tests); `npm.cmd run lint` (three existing warnings). Temporary test log removed.

## Exact recommended next step

Sign out and back in with the restricted staff account on the updated local app and verify permitted landing/menu/Sales reads. Hosted deployment remains a separate action.

---

# Previous task — Separate fees from sales tracking (2026-10-20)

## Original task

User requested consultation and treatment fees be excluded from sales tracking, with separate tracking in Reports and Dashboard.

## What has been completed

- Added shared product revenue calculation: invoice total minus consultation and treatment fees. Product discounts, GST and invoice rounding retain their existing allocation.
- Dashboard sales/profit KPIs, current/previous charts and wholesale totals use product revenue. Cancelled invoices are excluded. Added separate consultation (Sales cart) and treatment fee cards linking to the new report.
- Reports Overview displays separate fee KPIs; sales/wholesale/staff sales values and customer revenue KPIs exclude fees. Actual customer spending, invoice/payment totals, cash flow and fiscal registers preserve full invoice amounts.
- Added a Fees category and Consultation & Treatment Fees report with separate columns/KPIs, date filters, search, sorting, pagination and CSV export. It uses existing reports.sales/export permissions. Dashboard links open the fee report through a validated report query parameter.
- Existing OP consultation ticket collection remains a separately labelled tracker. The new report tracks Sales cart fees only.
- Added pure report/revenue tests and an isolated MongoDB scenario validating dashboard/report/payment reconciliation before and after archival cleanup. No live financial writes or production retention migration were performed.

## What is currently being worked on

Implementation and automated verification are complete: 419 tests passed with zero failures/skips, lint passed with zero errors and three existing warnings, and the production build passed in `.next-fee-tracking`. The isolated MongoDB case confirms product sales, fees and payments reconcile before and after retention. An initial fixture assertion was corrected to supply the same inventory cost before and after retention; retained dashboard cost snapshots already include cost.

## Files modified for this request

New: `src/lib/sale-revenue.js`, `src/lib/service-fee-report.js`, `tests/service-fee-report.test.mjs`.

Modified: `src/lib/dashboard-sales-pipeline.js`, `report-overview-pipeline.js`, `dashboard-summary.js`, `wholesale-reporting.js`, `server/dashboard-data.js`; `src/services/report.service.js`, `report-overview.service.js`; `src/components/DashboardWorkspace.jsx`, `ReportsWorkspace.jsx`; `src/app/(workspace)/reports/page.js`; `tests/sale-retention-db.test.mjs`; `RESUME.md`.

Prior Treatment fee implementation changes remain in the working tree and are documented below.

## Important implementation decisions

- Stored sale totals/payments stay authoritative for actual billing/collections. Separate read calculations prevent counting fee income as product revenue without rewriting past bills.
- Historical report readers already union retained facts; those facts preserve fee fields. Permanent retention reconciliation metrics are unchanged, avoiding an unsolicited historical migration.
- Separate fees are billed values, including any unpaid invoices, consistent with the existing revenue reports. Actual collections remain in Payment Methods and Cash Flow.
- Missing fee values on older bills count as zero. Cancelled invoices do not contribute fees or product revenue.

## Known bugs/issues

Browser visual verification remains open. No live deployment or physical printing checks were performed.

## Remaining tasks in order

1. Browser-check dashboard fee cards and Reports > Fees including date filters and CSV export.

## Commands/tests that should be run next

Passed: `npm.cmd test` (419 tests); `npm.cmd run lint` (three existing warnings); `$env:NEXT_DIST_DIR='.next-fee-tracking'; npm.cmd run build`; `git diff --check`. Repeat only after code changes.

## Exact recommended next step

Open Dashboard and verify the separate consultation/treatment fee cards for the selected date range, then open Reports > Fees and confirm the invoice breakdown, filters and export. Invoice collections should equal product sales plus fees.

---

# Previous task — Treatment fee in Sales cart (2026-10-20)

## Original task

Add a Treatment fee checkbox below Consultation Fee in the Sales cart, showing an amount field when checked.

## What has been completed

- Added the checkbox and conditional required amount field directly beneath Consultation Fee; unchecking clears the fee.
- Included treatment fees in shared client/server pricing, checkout payloads, saved sales, sale editing, payment summary, sale details, thermal receipts and retained financial facts.
- Added tests for optional/combined fees, invalid input, retained facts, checkout creation, fee editing/removal and rejection before stock writes.
- Full test suite passed: 414 tests, zero failures/skips. Lint passed with zero errors and three existing warnings. Production build passed in `.next-treatment-fee`. Diff whitespace check passed.

## What is currently being worked on

Implementation and automated verification are complete.

## Files modified

`src/components/SalesWorkspaceModern.jsx`, `SalesCheckoutHostV2.jsx`, `SaleSourceDetails.jsx`, `ThermalReceiptPrinter.jsx`; `src/app/api/sales/route.js`; `src/services/pricing.service.js`; `src/models/index.js`; `src/lib/sale-retention.js`; `tests/sale-edit.test.mjs`; new `tests/treatment-fee.test.mjs`; `RESUME.md`.

## Important implementation decisions

- Follow existing consultation fee behavior: validate enabled amounts between 0.01 and 99,999,999, add the separate fee after product pricing and before rounding.
- Persist the numeric fee with default zero; infer the checkbox from a positive saved fee when editing. Existing sales need no migration.
- Include treatment input in the existing pre-payment browser validity checks. Stock logic is unchanged.
- All checkout verification uses isolated fixtures; no live transactions were created.

## Known bugs/issues

No known implementation defects. Browser layout and physical printing remain unverified.

## Remaining tasks in order

1. Browser-check selecting/clearing the checkbox and changing the amount; confirm cart/payment summaries and saved receipt display.

## Commands/tests that should be run next

All passed: `npm.cmd test` (414 tests); `npm.cmd run lint` (three existing warnings); `$env:NEXT_DIST_DIR='.next-treatment-fee'; npm.cmd run build`; `git diff --check`. Repeat only after further code changes.

## Exact recommended next step

Open Sales in an authenticated browser, select Treatment Fee below Consultation Fee, enter an amount and verify the total updates; clear it and verify the fee disappears. No live transaction is required for this UI check.

---

# Previous task — shimmering loading animations (2026-10-14)

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
