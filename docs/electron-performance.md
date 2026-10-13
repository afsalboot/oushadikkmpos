# Actual Electron benchmark

This file preserves the hosted before-change benchmark. The completed local production build, IndexedDB restoration and Electron/Chrome after-change measurements are in [sales-cache-performance.md](sales-cache-performance.md).

Measured using the real unpackaged desktop 0.1.1 client with Electron 44.4.5 / Chromium 152, loading the configured production URL, https://oushadikkmpos.vercel.app. This is a development launch of the actual desktop shell, not a benchmark of the installed executable. The source and installed clients use the same hosted origin; installer-launch timings can differ.

| Check | Result |
| --- | --- |
| Process launch to hosted login page ready, successful authenticated benchmark run | 6,313.02 ms; earlier startup samples ranged from 2,008.68 to 8,793.50 ms |
| Hosted navigation DOMContentLoaded, first run | 1,184.20 ms |
| Hosted navigation load event, first run | 1,391.40 ms |
| Hosted navigation response start, first run | 829.40 ms |
| Captured Electron auth-status GET, first run | 513.74 ms; HTTP 200 |
| Hosted new Sales index route availability, separate unauthenticated Node GET | HTTP 401 JSON in 629 ms; availability remains unverified because the dynamic product-detail handler can also return 401 before validating an ID |
| First Sales opening, observed route + paint-frame wait | 34,859.70 ms; unusually long outlier, cause not isolated |
| Return to Sales from Customers, four repeats | 2,531.80-2,587.20 ms; median 2,555.50 ms |
| Product search, five runs | 1,671.50-3,155.40 ms; median 1,709.50 ms |
| Product search after the first run | 1,671.50-1,747.00 ms; median 1,698.45 ms |
| HTTP product requests per search | One on every run |
| Sales-index requests captured | Zero |
| Product API requests per Sales/search/clear cycle | Three on every run |
| Local production-build Electron launch to login ready | 1,158.05–1,263.31 ms; local auth-status GET 96.70–175.53 ms |
| Desktop smoke | Passed: hosted load, title-bar color and reserved content area |
| Desktop tests | 9 passed |
| Lint / whitespace | Zero lint errors, three existing warnings; diff check passed |

The authenticated benchmark completed five Sales/search/clear/Customers cycles after the user signed in manually. Return-navigation and search currently take seconds in the hosted client. Every search went through `/api/products`, and returning to Sales fetched products again. No index fetch appeared in the captured traffic, despite capture being enabled before login. This demonstrates that the local-index/cache path was not active in this measured session; it does not independently identify the hosted build revision or why that path was inactive.

The initial 34.86-second opening includes route navigation and waiting for two animation frames. It must not be treated as a typical product API duration: the corresponding product request took 2.31 seconds, settings took 6.21 seconds, and dashboard had taken 9.80 seconds. Server-rendered route requests and browser visibility/frame scheduling were not separately captured, so the remainder is unexplained. The four subsequent openings were consistently 2.53-2.59 seconds. No meaningful p95 is established with this sample count.

For full-page product reads, server timings repeatedly show product query at roughly 1.38-1.42 seconds, batch query at 0.29-0.30 seconds, and authentication at about 0.21-0.22 seconds after warm-up. Product API end-to-end times are usually 2.20-2.49 seconds. Search API times after the first search are 1.39-1.47 seconds; the UI measurement also includes debounce and rendering. This supports server waits as a major repeat-interaction cost. It does not measure isolated Electron overhead or React card-render CPU time.

Startup measurements stop when the document is complete and the login inputs are present. They include process launch and readiness polling, and are not the time to authenticated dashboard/Sales usability. The first local attempt hit a database DNS timeout; retrying the local server with network access produced the successful results above. Local startup checks were signed out; local authenticated Sales performance remains unverified. Final repeats used direct Electron spawning to verify process cleanup; initial runs used the desktop launcher.

`electron-hosted-measurements.json` contains the completed authenticated five-cycle run and its renderer/version/API measurements. No credentials, cookie values, product names, customer data or response bodies are included. API timings are for requests captured after the debugger attached; early startup requests may not be captured. The earlier unauthenticated 401 probe cannot prove Sales-index endpoint availability. Failed sign-in-wait attempts are stored separately and do not replace the completed benchmark.

The normal-profile launches exited before debugger attachment; using an isolated benchmark profile allowed the app to start. This does not establish the cause of the normal-profile exits. Benchmark profiles avoid interfering with the installed app, and therefore do not reuse its login cookies.

The added `--benchmark` mode applies only to unpackaged diagnostic launches. It creates an isolated temporary profile, stays hidden by default, and disables scheduled backups. `--benchmark-visible` opens the diagnostic window for manual sign-in. The collector intercepts renderer traffic and blocks non-GET/HEAD/OPTIONS methods, except the existing login POST routes when explicitly running `--interactive`. It does not create sales, adjust stock, refund, print, or configure backups. Production/packaged application behavior is unchanged.

To reproduce the benchmark, close the previous diagnostic window and run from the project root:

```powershell
node scripts/profile-electron.mjs --interactive
```

Sign in only in the Electron window labelled SPEED TEST. The collector then waits for idle prefetch and records five Sales opening → search → clear → Customers cycles, including product-request counts. It writes `docs/electron-hosted-measurements.json`. The script currently requires Customers access for repeated return-navigation cycles; lack of that link limits the run. No barcode or checkout actions are performed. With no sign-in within fifteen minutes it writes a failure report and exits.

For local measurements, run the production Next.js server with `NEXT_DIST_DIR=.next-sales-hybrid`, then use `node scripts/profile-electron.mjs --local --interactive`. The local server/database connection must work first. Failure reports are saved separately and must not be treated as speed measurements.
