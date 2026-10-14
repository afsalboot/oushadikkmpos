# Sale edit fetch performance — 2026-10-14

The reported `/api/sales/6acf7732f9711956440254db?edit=true` request spent 32.7 seconds in application code. The route loaded every active visible product, hidden billed products and their inventory batches before returning the editable bill.

Read-only measurements on the configured database reproduced the bottleneck:

| Read | Before | After |
| --- | ---: | ---: |
| Sale lookup, including cashier population | 150 ms | 145 ms |
| Initial edit data after sale lookup | 30,158 ms | 197 ms |
| Products in initial edit response | 2,110 | 1 |
| Initial serialized data | 3,888,021 bytes | 4,982 bytes |
| First browsing page, fetched separately | Included in full catalogue | 1,103 ms / 50 products |

These are service measurements, excluding connection setup, authentication, proxy, HTTP transfer and browser rendering. The initial optimized read including sale lookup was 342 ms. A second optimized run measured 149 ms for the sale, 180 ms for edit data and 1,149 ms for the first browsing page. Timings vary with network/database load.

## Implementation

- Initial `edit=true` returns only the products needed to reconstruct every billed line and mixture ingredient, plus the existing sale/customer payload. Active hidden billed products remain supported; inactive/missing billed products retain the existing unavailable-product behavior.
- `edit=true&view=products` fetches a maximum of 50 products per page. Search, categories, mix/loose filters and stock filters run on the server. Opened-stock filtering includes returned loose allocations. Low-stock membership retains the original editor's physical-stock calculation.
- Both reads require admin access and an eligible paid commercial sale. Modern bills reuse saved allocations; legacy bills read the stock transaction ledger. Product rows receive credited stock without any database writes. Edit mutations and their transaction/version checks remain in the existing checkout path.
- Browse results are kept out of the ordinary Sales product cache. Overlapping requests use the existing shared GET fetch implementation; completed financial reads are not cached. Abandoned page responses cannot overwrite the current page.
- `Server-Timing` exposes auth, connection, sale, product, batch, count and serialization measurements. Structured logging remains opt-in with `POS_PERFORMANCE_LOG=1`.

## Verification

- `npm.cmd test`: 409 passed, zero failures/skips, including seven new sale-edit read tests.
- `npm.cmd run lint`: zero errors, three existing warnings.
- `NEXT_DIST_DIR=.next-sale-edit npm.cmd run build`: passed, leaving the normal development build directory alone.
- `git diff --check`: passed.
- Read-only billed-cart parity on the reported sale: passed for all returned cart fields other than non-POS metadata/batch payload fields.
- No production database writes, index creation, deployment or actual sale edit submission performed. Browser navigation, responsive layout, scanner and hosted HTTP timing remain unverified.

Measurements: `docs/sale-edit-before.json` and `docs/sale-edit-after.json`.

Read-only reproduction commands:

```powershell
node scripts/profile-sale-edit.mjs --baseline --output=docs/sale-edit-before.json
node scripts/profile-sale-edit.mjs --output=docs/sale-edit-after.json
node scripts/profile-sale-edit.mjs --parity
```
