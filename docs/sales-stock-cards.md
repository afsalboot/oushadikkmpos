# Actual stock on Sales cards

Sales cards now show stock quantities instead of “Select to check stock,” including uncached search results. The stock label is a compact snapshot calculated by MongoDB grouping inventory batches and the same `formatPhysicalStock()` used by full selling details. No catalogue request is needed to display or search these labels once the cache is ready.

The exact pictured SKU, `PRD-6AB8D0B0522E6D1D2D7429D6`, was checked read-only: **₹145, 1 Jar** at the verification snapshot. A different, similarly named ₹272 SKU has 5 Jars; the browser/Electron screenshots captured that variant. No product prices were edited. Quantities can change with normal live sales.

Changed application files:

- `src/services/sales-index.service.js`: bounded inventory aggregation returns only sealed/open totals per visible product; the index carries a stock label, not selling/batch detail. Revision hashes now include inventory updates and batch deletions.
- `src/lib/sales-search.js`: includes display-only stock labels and the few fields required for existing box/package/loose-unit formatting.
- `src/app/api/products/sales-index/route.js`: index format/ETag version 2 invalidates old metadata-only responses.
- `src/lib/sales-resources.js`: upgrades legacy persisted indexes once, persists authoritative label refreshes, refreshes affected index-only cards after successful writes, and invalidates older selling details when stock changes. Failed writes do not subtract stock. Existing scope/epoch/permission protections remain.
- `src/components/SalesWorkspaceModern.jsx`: renders the stock label directly. Older cache entries briefly show “Loading stock…” until upgraded. Choosing a card still obtains full authoritative selling details before pricing or checkout.

Stock formatting preserves boxes plus individual packages and count-based loose units. Page size remains 50; metadata remains bounded to 10,000 products. This retains one application cache and native IndexedDB. The index's stock labels refresh with the existing background/focus process and targeted successful-write refresh; this is a cached physical-stock display, not a promise of instantaneous updates from every other live client. Server checkout still validates current stock and expiry.

Verification:

- **All 2,099 stock labels match the existing product service**, compared through bounded 50-product reads: [parity report](sales-stock-label-verification.json).
- **376 application tests passed**, production build passed, lint has zero errors and the same three existing warnings. New fixtures cover compact stock aggregation, zero/package/box/count labels, inventory revision changes, old-cache upgrades, persistence, targeted write refresh and stale-detail invalidation.
- Actual production build tested in the native Electron shell and normal Chrome browser, five cycles per action, with financial writes blocked: [Electron samples](stock-cards-electron-local-measurements.json), [Chrome samples](stock-cards-browser-local-measurements.json).
- Both native clients displayed actual stock on an index-only product card, with no placeholder and zero product requests during that search. [Electron card](stock-cards-electron-card.png), [Chrome card](stock-cards-browser-card.png). These screenshots show the ₹272 variant, not the exact pictured ₹145 SKU; the latter's exact stock/price is separately verified in the parity report.

Five-sample paint medians:

| Action | Electron | Chrome | Product requests per sample |
| --- | ---: | ---: | ---: |
| Sales open/return | 29.4 ms | 52.4 ms | 0 |
| Local search | 5.6 ms | 5.7 ms | 0 |
| Clear search | 11.1 ms | 24.5 ms | 0 |
| Fresh cached addition | 17.5 ms | 37.5 ms | 0 |

The stock-bearing index is 795,481 JSON bytes for 2,099 products in the service report; five full-read samples were 443.18, 198.12, 250.42, 212.78 and 213.68 ms, including database transport. Cold-load results depend on transport/cache state. The prior metadata-only performance report is preserved as an earlier baseline; these stock-card reports describe the new payload.

Data safety evidence:

- [Before fingerprints](sales-stock-before-fingerprint.json), [after fingerprints](sales-stock-after-fingerprint.json), [read-only activity evidence](sales-stock-concurrent-activity.json).
- **Fingerprints do not match exactly for this follow-up.** Between the snapshots, sales increased from 552 to 553 and stock transactions from 3,005 to 3,006; batch contents changed. Products match exactly, including prices. Store/database identity also matches.
- Read-only timestamp/link inspection found one new sale at `2026-10-14T06:32:33.070Z` and one corresponding stock transaction at `06:32:33.276Z`. The originating client was not independently identified. The benchmark reports record no financial write requests; the local server and renderer both blocked financial writes. No transaction was created, paid, refunded, printed or rolled back by the benchmark, and no live backup or seed was run. The observed differences are reported without undoing live activity.
- Owned local server and temporary Electron/Chrome profiles were closed and removed. User profiles and existing installations were preserved.

This is a **local implementation**. Nothing was deployed and no installer was rebuilt. The hosted/installed Electron application continues to use the hosted web version until a separately authorized deployment.

Reproduction commands (PowerShell; sign in only inside the app):

```powershell
npm.cmd test
npm.cmd run lint
$env:NEXT_DIST_DIR = '.next-sales-stock'
npm.cmd run build
node scripts/verify-sales-stock-labels.mjs --stock-card-sku=PRD-6AB8D0B0522E6D1D2D7429D6
node scripts/fingerprint-pos-data.mjs --output=docs/sales-stock-recheck-before.json
$env:POS_BENCHMARK_READ_ONLY = '1'
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
```

In another terminal:

```powershell
node scripts/profile-electron.mjs --local --interactive --compare-browser --stock-cards --report-tag=stock-cards
```

Afterward, stop only that local server with Ctrl+C and compare:

```powershell
node scripts/fingerprint-pos-data.mjs --output=docs/sales-stock-recheck-after.json --compare=docs/sales-stock-recheck-before.json
```

Use only this checkout's environment and preserve earlier reports if running another comparison. The optional stock-card screen check selects a name-matched uncached card; exact-SKU service verification distinguishes similarly named products.
