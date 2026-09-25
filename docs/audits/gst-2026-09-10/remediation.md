# GST remediation — 10 September 2026

## Outcome and scope

The user confirmed the business is currently **unregistered**. The application now defaults to an unregistered supplier profile and rejects attempts to collect output GST without a validated regular-registration configuration. This is a repository remediation, not a legal certificate or a 100/100 assessment. Whether the business is required to register remains unknown: state, turnover and supply activities have not been confirmed.

The original `audit.md`, `results.json` and `reproduce.mjs` describe the pre-remediation findings. They are retained as historical evidence. The old reproduction script deliberately asserts the old defects; use the current regression tests to verify the corrected behavior.

## Implemented controls

| Control | Repository evidence | Verification and limits |
| --- | --- | --- |
| Registration status, GSTIN checksum/state, effective dates and collection guard | `src/lib/gst-compliance.js`, `src/services/settings.service.js`, `src/app/api/sales/route.js`, `src/components/SettingsWorkspace.jsx` | Regression tests cover unregistered, composition and regular configuration. GSTIN checksum does not verify live registration with the GST Portal. |
| Authoritative domestic place of supply | `resolveSupply` in `src/lib/gst-compliance.js`, sales POST, `SalesCheckoutHostV2.jsx` | Counter/delivery, recipient address and interstate cases tested. Unsupported special supplies are rejected. Seller/recipient declarations still need truthful business data. |
| Per-product rates and consistent discounts | `src/services/gst.service.js`, `src/services/pricing.service.js`, `src/lib/money.js` | Tests cover mixed rates, inclusive/exclusive values, eligible line discounts, paise conservation and odd-paise component splits. Legacy cart-rate overrides no longer determine GST. |
| Financial-year invoice numbering | `src/services/document-number.service.js` | Prefix and series rules produce up to 16 characters; IST year boundary and shared series counter tested. Existing invoices are not renumbered. |
| Invoice snapshots and output | `src/models/index.js`, sales POST, `ThermalReceiptPrinter.jsx` | Registration, supply, date and tax fields persist with the invoice; receipt uses saved supplier/customer data and prints document heading, POS and component breakdown. Mongoose tests cover property access and immutable total/number/type. Physical print and pagination remain unverified. |
| Retry protection | `src/lib/checkout-request.js`, `src/lib/fiscal-integrity.js`, sales POST | Same-actor/payload retry checks, transaction recheck and partial unique request-key index. Browser helper tests cover network failure, truncated response and changed-payload rejection. Live concurrent checkout not exercised. |
| Fiscal restore protection | `src/services/backup.service.js`, `src/lib/fiscal-integrity.js`, `FiscalGuard` model | Rejects archives that omit/change existing invoices; retains audit history and counter high-water marks. Pure integrity comparisons tested; no live restore performed. Raw database administrators can bypass application controls. |
| Audited master/settings changes | Settings service, customer PATCH, product update/bulk routes | Transactional audit entries and backend settings permissions added. This is not a complete external tamper-evident audit archive. |
| Supplier purchase GST | `src/lib/purchase-calculations.js`, `src/services/purchase.service.js`, `src/components/PurchaseForm.jsx` | Shared totals distribute supplier discounts before tax; purchase display no longer depends on the buyer collecting output GST. Tests cover tax components/charges. Supplier invoice classification and input-credit eligibility are not independently verified. |
| Invoice and HSN registers | `src/lib/gst-register.js`, `src/services/report.service.js`, `ReportsWorkspace.jsx` | Snapshot rows include unpaid invoices and GSTIN-based B2B classification; cancelled documents are excluded from HSN aggregates. Legacy/UQC gaps flagged. These are review exports, not certified GSTR upload files. |

## Configured database: read-only findings

`node --env-file=.env.local scripts/check-fiscal-data.mjs` used the raw MongoDB driver without model initialization or writes. It found:

- GST currently disabled; registration status not yet recorded; no supplier GSTIN recorded.
- 25 invoices, including 5 with `gstEnabled: true`.
- 9 invoices missing a supplier or customer header snapshot.
- All 25 existing invoice numbers exceed 16 characters. The Rule 46 limit concerns GST tax invoices; this fact alone does not make an unregistered commercial invoice unlawful.
- Existing unique invoice-number and document-counter indexes; no deployed request-key index or fiscal-guard collection at inspection time.

These counts can overlap. The GST-enabled flag alone does not establish actual tax collection, payment or filing. Historical documents were not rewritten, deleted or fabricated. Reconcile originals and amounts with the business's tax adviser before deciding whether any correction or statutory action is needed.

## Remaining requirements for a clean assessment

1. Confirm registration liability from actual state, PAN-level turnover and transactions. Being currently unregistered does not establish an exemption from registration.
2. Review the five GST-enabled historical documents and missing snapshots against original records. Never backfill historical facts from today's masters without evidence.
3. Deploy the application and verify the unique request-key/counter/guard indexes. Exercise concurrent checkout and uncertain-response retries against an isolated replica-set database. Model initialization is awaited by sales issuance; production index privileges/configuration still require deployment verification.
4. Perform browser checkout/reprint tests for retail, wholesale, walk-in, saved/new customers, credit/split payments and supported tax modes; test long thermal receipts and a restore rehearsal in isolation.
5. Complete statutory credit/debit-note and cancellation/return workflows before claiming support for invoice adjustments. Lifecycle fields are not a completed adjustment workflow.
6. Verify product HSN, statutory UQC, classification/rate and effective dates against actual goods. The register flags incomplete UQC; it is not a filing-ready HSN return.
7. Implement and verify IRP/e-invoice, applicable QR/e-way-bill and filing integrations if business facts make them applicable. Current applicability gates reject certain unsupported registered-supplier scenarios; they do not generate these documents.
8. Obtain specialist rules and workflow support before using exports, SEZ, reverse charge, services, bill-to/ship-to, registered custom mixes or free schemes. Those pathways are deliberately restricted in the new fiscal validation.

## Validation

- `npm.cmd test`: **146 passed, 0 failed**.
- `npm.cmd run lint`: **0 errors**, two existing warnings in `ExpensesWorkspace.jsx`.
- `npm.cmd run build`: production compilation and route generation passed.
- Read-only database inspection completed as described above.
- No deployment, live checkout writes, customer communications, historical data repair or live restore was performed.

Relevant legal sources retained with the original audit include [CGST Rule 46](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001) and [Circular 209/3/2024 on place of supply](https://gstcouncil.gov.in/node/4989). Requirements remain conditional on the business and transaction facts; this implementation does not replace a tax professional's legal review.
