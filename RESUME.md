# Current task — local implementation complete

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
