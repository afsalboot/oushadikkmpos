# 90-day sale retention: implementation and verification

Implemented locally for the confirmed Oushadhi application. Hosted deployment and the installed Electron application have not been changed. No production backfill, validation mutation, cleanup, transaction, payment, stock change, receipt printing or backup was performed. All mutation verification used an owned localhost MongoDB replica set.

## Repository audit and preserved contracts

| Area | Evidence and resulting behavior |
| --- | --- |
| Store scope | One global Settings record per database; no Sale business/tenant/branch field. Permanent history uses the persisted Settings `_id`. Missing identity blocks migration and cleanup. Foreign scoped rows are excluded from historical reads and prevent validation. |
| Sale/bill | `src/models/index.js`, `src/app/api/sales/route.js`, `src/services/sale-edit.service.js`. The existing finalized-sale, original-price, audit, permission and transaction rules remain. Detailed documents receive backend expiry and verified inclusion markers. |
| Stock | `InventoryBatch`, `StockTransaction`, inventory services and the stock buffer maintain stock independently of old Sale documents. Cleanup calls the raw Sale collection only; it does not run stock return/edit hooks. |
| Payments/credit | Payment components are embedded in Sale. Compact facts preserve numeric method/date inputs; existing account/report readers retain their caps and rounding. Customer outstanding balances are not recalculated or changed by deletion. |
| Refunds | This repository has consultation cancellation/refund records, which remain independent and untouched. Sale quantity editing is the existing correction flow. No standalone sale refund lifecycle, refund model or refund API was found. Daily sale refund totals remain zero rather than inventing transactions. |
| Day closing | No finalized day-closing model/API was found. Accounts and cash-flow running balances use permanent history after purge. No invented closing workflow was added. |
| Profit | Reliable consumed inventory batch COGS was already unavailable in the gross-profit report; that remains unavailable. External purchase cost/profit remains reportable. The dashboard's existing weighted current-stock cost estimate is frozen per bill at purge and continues to be explicitly an estimate. |
| Customers | Directory KPIs, lifetime purchases/spend, average/highest bill, purchase dates and frequent products include permanent history. Detailed bill lists contain retained Sale records only. Customers with historical sales are deactivated instead of physically deleted. |
| Purchases/expenses | These collections and supplier balances are excluded from cleanup. Their original reporting paths remain. |
| Detailed invoices | Purged IDs return HTTP 410 with the retention message. Exact purged invoice searches return that message. Historical report rows are labelled as analytics and have no bill/reprint link. |
| Retry/numbering | Permanent request key/hash/actor identity rejects altered requests and returns 410 for a purged checkout retry. Hashed invoice identities prevent invoice reuse. Edit-audit retries also return 410 after purge. |
| Existing restore/merge | Legacy restore preserves the permanent collections, rejects a different store or changed history, filters purged invoices and resets validation. Product merges synchronize retained contributions and remap purged analytical product references. No new archive or restore system was built. |

## Permanent records and safety gates

`SalesHistoryLedger` is a dedicated analytics ledger with one stable original sale ID. It is not an invoice archive: it omits invoice number, customer contact/address/GSTIN snapshots, unit selling prices, receipts, payment references, allocations and submitted checkout input. It retains only the numerical/dimensional facts needed by the existing historical reports, customer statistics and idempotency protection.

`DailySalesSummary` stores counts, monetary values in paise, discounts, GST, supported payment components, unpaid amounts and known/unknown cost coverage. `DailyProductSalesSummary` keeps package, loose, mixture and wholesale paid/free quantities distinct. `DailyCustomerSalesSummary` retains lifetime-statistic building blocks. Monthly/yearly summaries can group daily `date` prefixes; the current historical report APIs use the permanent analytic ledger to preserve their existing date/filter/rounding semantics.

`SalesRetentionState` stores validation checkpoints and cleanup totals. `SalesRetentionRun` keeps the latest 30 lightweight runs per store, including counts, cutoff, status and failure code. No collection receives a TTL index.

All sale creation/editing and summary writes share the existing checkout transaction. Backfill uses bounded source-ID pages and idempotent per-sale replacement/deltas; affected days are deterministically reconciled. Validation resumes from a server-owned cursor, checks source coverage, compares facts directly with their bills and reconciles daily/product/customer summaries. Cleanup rechecks source hashes, facts, metrics, expiry and store scope, validates affected days, then deletes a bounded batch with its purge markers and audit trimming in one transaction. Transactions use snapshot reads and majority writes. [MongoDB transaction documentation](https://www.mongodb.com/docs/manual/core/transactions/).

Expiry is exactly backend `invoiceDate` (fallback `createdAt`) plus 90 elapsed days. Eligibility is strictly `expiresAt < now`; a bill exactly 90 days old, a future-dated bill or an invalid/unverified contribution is not deleted. Daily grouping uses Asia/Kolkata.

Cleanup requires all three conditions: `SALES_RETENTION_CLEANUP_ENABLED=1`, an enabled fixed-90-day policy, and completed validation for the same persisted store. Benchmark mode also blocks the cron route. Disabled cron requests do not connect to the database or initialize models.

The scheduled route processes 100 bills per transaction, at most 10 batches per invocation, and stops starting batches after 30 seconds. It returns `more` when backlog remains. Manual admin/CLI cleanup processes one batch of 100. Large backlogs require additional explicitly approved invocations; this implementation does not launch an unbounded deletion loop. Automatic approval review rejected increasing the scheduler to up to 500,000 deletions per invocation; the bounded limits were preserved.

## Verification results

- Full application suite: 402 passed, 0 failed, 0 skipped.
- Electron policy/printer/backup fixture suite: 9 passed. No installer rebuild or installed-device test.
- Lint: 0 errors, 3 existing warnings in ExpensesWorkspace and SalesWorkspaceModern.
- Local production build: passed; the new admin and cron routes are included.
- Actual MongoDB fixture server: 8.2.6, owned localhost replica set; stopped and removed by the test runner.
- Financial mutation tests: actual checkout commit, duplicate requests, unchanged retry, history-write failure rollback, purge retry rejection, actual deletion rollback after a forced ledger-write failure and simultaneous cleanup jobs.
- Before/after verification: sales/wholesale/product/loose/mixture/payment/customer/staff/GST/HSN/account/overview KPIs, applicable report rows, cash-flow and running balances; cancelled, credit, external, legacy mixture and overpayment fixtures are included.
- Customer API verification: directory/details statistics and frequent products remain identical; only retained bill details remain; historical customers cannot be physically removed.
- 100,000-bill fixture: one cleanup batch deleted exactly 100, left 99,900 detailed bills, and historical count/revenue remained 100,000. The expiry index was selected and exactly 100 documents were examined. The fixture's migration data was prepared synthetically; this is not a claim that all 100,000 bills were purged or that the complete production backfill was timed.

Machine-readable fixture evidence: `sale-retention-fixture-verification.json`. First run may download the pinned local MongoDB fixture binary; subsequent runs use its OS temporary cache. Tests never load `.env.local` and assert a localhost fixture database before connecting or clearing collections. Development-only dependency: `mongodb-memory-server`.

## Live read-only evidence

Confirmed live store: Oushadhi Kunnamkulam. The latest audit read 572 sales, zero sales older than 60/90 days, zero future/invalid business dates and no Sale TTL index. All six retention collections remained empty. The new CLI's read-only preview reported `validated:false`, `cleanupEnabled:false`, zero eligible bills and no prior cleanup run.

Read-only estimated BSON sizes: detailed Sale data 1,925,662 bytes; projected compact ledger 1,449,250 bytes, about 24.7% smaller before adding permanent daily/product/customer summaries and their indexes. There are currently no age-eligible bills, so no storage was reclaimed. This is a projection, not measured Atlas storage reduction; physical storage and index sizes are recorded separately in `sale-retention-live-audit.json`.

The original and final raw BSON fingerprints **do not match exactly**. Both refer to the same confirmed store/database. Between 07:20:03 and 09:13:30 UTC on 14 October 2026:

| Collection | Before | After | Change |
| --- | ---: | ---: | ---: |
| Sales | 559 | 572 | +13 |
| Inventory batches | 1,590 | 1,595 | +5 |
| Stock transactions | 3,017 | 3,045 | +28 |
| Products | 2,101 | 2,104 | +3 |

Read-only creation timestamps account for these additions; 25 batches and four products were also updated in that interval. Request clients/authors were not identified. These aggregate reads do not prove that all pre-existing records were unchanged. All agent mutations used the localhost fixture; no production retention collections were populated. Evidence: `sale-retention-before-fingerprint.json`, `sale-retention-after-fingerprint.json`, `sale-retention-concurrent-activity.json`.

## Safe migration and activation instructions — not executed

1. Prepare the initial release with `SALES_RETENTION_CLEANUP_ENABLED=0`. Keep the actual customer connection/authentication/branding unchanged. Set a random `CRON_SECRET` of at least 32 characters through the deployment's secret configuration. Do not enable cleanup during benchmarking.
2. Obtain a store-bound read-only preview:

   ```powershell
   node scripts/sale-retention.mjs --action=preview
   ```

3. After an approved initial deployment, prepare existing source bills and permanent summaries. Replace `<storeId>` with that preview's identity, never another customer's identity:

   ```powershell
   node scripts/sale-retention.mjs --action=backfill --store=<storeId> --confirm=PREPARE_HISTORY
   ```

   This command writes summaries and retention markers, not sales transactions or stock. It prints bounded checkpoints. To resume, add `--after=<last-next-id>`; restarting from the beginning is also idempotent.

4. Reconcile and validate every contribution. Resume uses the saved validation cursor; `--restart=true` starts a new validation pass:

   ```powershell
   node scripts/sale-retention.mjs --action=validate --store=<storeId> --confirm=PREPARE_HISTORY --restart=true
   node scripts/sale-retention.mjs --action=preview
   ```

5. Review the completed validation output and compare original report totals against the prepared history while details still exist. Confirm age counts, scope, missing/unknown COGS coverage and any failed candidates. Do not activate on failed/incomplete validation. The same actions are available to ADMIN under Settings → Sale Retention.
6. Only after this review and explicit production activation, set `SALES_RETENTION_CLEANUP_ENABLED=1`. The Settings policy can pause cleanup; resetting other Settings preserves that retention policy. A manual single batch requires typing `DELETE OLD BILLS` in Settings, or the explicit CLI confirmation:

   ```powershell
   node scripts/sale-retention.mjs --action=cleanup --store=<storeId> --confirm=DELETE_OLD_BILLS
   ```

The Vercel cron expression is `30 20 * * *` (20:30 UTC, 02:00 Asia/Kolkata the following day). Vercel schedules production deployments, and Hobby timing is imprecise; no exact firing time is claimed. The route requires its bearer secret. [Vercel cron setup](https://vercel.com/docs/cron-jobs/quickstart), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Reproduction commands

```powershell
npm.cmd test
npm.cmd run desktop:test
npm.cmd run lint
npm.cmd run build
node scripts/inspect-sale-retention.mjs --output=docs/sale-retention-live-audit.json
node scripts/sale-retention.mjs --action=preview
node scripts/fingerprint-pos-data.mjs --output=docs/sale-retention-after-fingerprint.json --compare=docs/sale-retention-before-fingerprint.json
node scripts/inspect-retention-activity.mjs
```

The audit/preview/fingerprint commands authenticate using the existing local environment and perform read-only operations. Do not run backfill/validation/cleanup commands without the migration approvals above.

## Changed files for this task

- Models/core: `src/models/index.js`, `src/lib/sale-retention.js`, `src/lib/retention-cron.js`, `src/services/sale-history.service.js`, `src/services/sale-retention.service.js`.
- Transactions/history: `src/app/api/sales/route.js`, `src/app/api/sales/[id]/route.js`, `src/services/sale-edit.service.js`, `src/services/product.service.js`, `src/app/api/products/merge/route.js`, `src/services/backup.service.js`.
- Reporting/customers: `src/services/report.service.js`, `src/services/report-overview.service.js`, `src/services/account-data.service.js`, `src/services/accounting.service.js`, `src/lib/server/dashboard-data.js`, `src/lib/dashboard-sales-pipeline.js`, `src/lib/gst-register.js`, both customer API routes, and `src/services/customer.service.js` (Node-compatible import only).
- Settings/UI: `src/services/settings.service.js`, `src/components/SettingsWorkspace.jsx`, `src/components/SaleRetentionSettings.jsx`, `src/components/RecentSalesWorkspace.jsx`, `src/components/SaleSourceDetails.jsx`, `src/app/api/settings/sale-retention/route.js`.
- Scheduler/config/scripts: `src/app/api/cron/sale-retention/route.js`, `vercel.json`, `.env.example`, package files, `scripts/sale-retention.mjs`, `scripts/inspect-sale-retention.mjs`, `scripts/inspect-retention-activity.mjs`.
- Tests/evidence: both retention test files, existing sale-edit/product-merge/external-purchase fixture harnesses, the retention JSON artifacts, this document and root `RESUME.md`.

Prior uncommitted Sales performance, checkout and real-stock-card changes were preserved.

## Remaining practical limits and unverified checks

Production backfill, activation, live purge/storage reclamation, hosted cron execution, browser visual checks of the new Settings panel and installed Electron behavior remain unverified. No live transaction latency is claimed from fixtures. The bounded scheduler does not drain arbitrarily large backlogs in one invocation; oversized or slow daily validation can time out safely and requires migration review rather than weaker checks. Reliable historical inventory COGS and finalized day closing were not available in the existing application. Legacy backup restore on the same database preserves live permanent history; an old archive alone cannot recreate purged history on a brand-new database, and no new archive/recovery system was added. Existing dependency audit reported 10 advisories; dependency-wide remediation was not part of this retention change.
