# India GST compliance audit — 10 September 2026

## Overall GST Compliance Score

**35/100 for readiness to issue GST documents as a registered supplier. Final classification: D — Not safe for GST production billing.**

**Your business is currently unregistered**, as confirmed during this audit. That changes present applicability: do not collect GST; use ordinary commercial invoices. Missing IRN, HSN-based tax invoices and GSTR exports are conditional future gaps, not evidence that your current unregistered business is breaking those requirements. Section 32 prohibits GST collection by unregistered suppliers. [CBIC CGST Act, section 32](https://cbic-gst.gov.in/hindi/CGST-bill-e.html).

The app has a working GST-disabled calculation path and defaults GST to disabled. Its actual saved settings and issued invoices were **not examined in a live database**, so current operational compliance is **UNKNOWN**, not certified. Whether you are required to register also remains **UNKNOWN**: state, PAN-level turnover, supply mix and interstate activity were not supplied. Needs CA/GST practitioner verification under sections 22–24 and applicable exemptions. Being unregistered does not itself establish exemption from registration.

The score is an engineering assessment, not a statutory certification: registration/document eligibility 5/15; invoice fields and numbering 4/20; calculations and place of supply 10/25; snapshots/lifecycle/audit 12/20; reconciliation/reporting 4/20. Conditional IRP, e-way integration and service-specific features receive no separate penalty. Individual failures below determine readiness, regardless of score.

### Scope and evidence limits

- Inspected commit `016bd400fa47ef94261291d690fdfc1569256240`, with a clean initial Git working tree. Reviewed models, actual mounted Sales workspace/checkout, receipt/reprint renderer, settings, products, customers, sales and purchase services, reports, authorization and backup restore.
- `npm.cmd test`: **118 passed, 0 failed**. Several existing tests intentionally assert forced tax modes and cart-wide rates; passing them does not establish legal correctness.
- Added [reproduce.mjs](./reproduce.mjs) and [results.json](./results.json): **24 read-only assertions** against actual pure functions or source structure. Assertions labelled BUG confirm observed defects. Credit-note/cancellation scenarios are source capability checks, not successful transaction tests.
- No application changes, data inserts, database connections, production probes, real GSTIN verification, IRP submissions, restore operations, printer tests or browser-rendered invoice inspections were performed. No lint/build claim is made for this audit. Synthetic values exist only in the local audit probe, not business records.
- Current official references were searched on the audit date. Some CBIC full-page opens failed; indexed official text and official PDFs were used. The available consolidated Rules PDF is explicitly dated June 2021, so later requirements are cross-checked separately below. This is not a claim that every later Gazette amendment has been exhaustively consolidated.

## Critical Legal Issues

Applicability tags: **NOW** = relevant to current unregistered operation; **REGISTERED** = must resolve before using normal GST billing; **CONDITIONAL** = depends on the indicated transaction/business. Severity describes the consequence when applicable.

### F01 — Registration is a switch, not an enforceable tax status

**Severity: Critical. Applicability: NOW.** Requirement: prevent unregistered collection; distinguish regular, composition and inactive registration. `validateSettings` requires a syntactically plausible GSTIN and matching state when enabling GST, which is a useful partial safeguard. However there is no registration status or effective interval. The audit fixture passes validation despite empty legal name/address; it is not a verified registration. Sales POST reads raw Settings and calculates from `gst.enabled` without revalidating registration. Existing/restored invalid settings can therefore reach calculation. Evidence: [settings validation][settings], [sales POST][sales], lines 328–331 and 873; [GST context][gst], lines 4–12.

Fix: an explicit unregistered profile must prohibit output GST server-side, independently of display settings. Require authorized transition to regular registration with legal identity, state, effective dates and recorded verification evidence. Do not infer active status from regex or require an online API as the only possible verification process. Verify forged settings and stale/restored configuration are rejected before stock/payment commit. [Section 32](https://cbic-gst.gov.in/hindi/CGST-bill-e.html).

### F02 — Invoice numbers violate the GST length limit

**Severity: Critical. Applicability: REGISTERED.** `nextDocumentNumber` emits `INV-20260910120000-001`: **22 characters**, versus Rule 46(b)'s maximum of 16. Prefix validation also does not restrict the full identifier to permitted characters. Evidence: [number generator][numbers], lines 11–17; [settings][settings], line 33; [sales][sales], lines 804–820. A format setting exists but is ignored by issuance.

Fix: keep transactional allocation but use a validated series such as `INV/26-27/000001` (16 characters). Scope counter and uniqueness to supplier registration, financial year and series; migrate by opening a documented new series, preserving issued identifiers. Never renumber historical documents automatically. Verify prefix length/characters, overflow, April rollover, rollback and concurrent allocation. [Rule 46(b)](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001).

### F03 — Receipt omits identity and required tax particulars

**Severity: Critical. Applicability: REGISTERED; supplier identity also matters NOW.** `ThermalReceipt` prints a fixed Oushadhi logo instead of the stored supplier name/legalName. It omits customer GSTIN, billing/shipping address and place of supply despite some being snapshotted. `showOnInvoice=false` suppresses supplier GSTIN, HSN and tax breakdown while tax can still be charged; COMPACT prints only aggregate GST. Component tax rates and line taxable values are not printed. Evidence: [receipt][receipt], lines 43–95; [logo][logo], lines 7–16.

Fix: a separate mandatory document section must render persisted supplier identity, applicable recipient details, tax bases and component rates/amounts; presentation preferences may affect optional detail only. Render an ordinary commercial invoice for the current business. Test saved invoice fixtures with mixed rates, registered recipients and all presentation modes, including real print pagination. [Rule 46](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001), [CGST section 33](https://cbic-gst.gov.in/hindi/CGST-bill-e.html).

### F04 — Place of supply is effectively hard-coded at checkout

**Severity: Critical. Applicability: REGISTERED.** `SalesCheckoutHostV2` line 61 sets place of supply to the store state and submits it at line 386. Customer addresses/GSTIN do not determine it. POST accepts any two digits (including `99`) and defaults missing input to seller state. `gstContext` accepts forced INTERSTATE/INTRASTATE settings overriding the state comparison. There is no service rule, bill-to/ship-to basis, SEZ distinction or UTGST. Evidence: [checkout][checkout], [sales][sales] lines 666–668, [GST engine][gst] lines 2–12; purchase determination is independently hard-coded in [purchase service][purchase], line 29.

Fix: store supply facts and derive POS server-side using the applicable rule; reject ambiguous/unsupported transactions. An authorized exception needs a reason and audit event, not a global force switch. Add CGST+UTGST for applicable UTs; UTs with legislatures must not all be treated identically. Verify ordinary interstate goods, B2B third-party delivery, B2C differing addresses, SEZ and services independently.

Goods movement/delivery, third-party bill-to/ship-to, no-movement goods and special cases require IGST section 10 reasoning. Since 1 October 2023, section 10(1)(ca) addresses supplies to unregistered recipients; Circular 209 clarifies delivery address takes precedence where billing and delivery differ. Services have distinct section 12 rules, with section 13 relevant to cross-border cases. [IGST Act](https://cbic-gst.gov.in/hindi/IGST-bill-e.html), [Circular 209/03/2024, 26 June 2024](https://gstcouncil.gov.in/sites/default/files/2024-09/circular-no-209-03-2024.pdf), [current section 12 text](https://taxinformation.cbic.gov.in/content-page/explore-act/1000620/1000001). Historical Act pages are not relied on for subsequent POS amendments.

### F05 — Cart/default mode can overwrite verified product rates; mixes lack classification

**Severity: Critical. Applicability: REGISTERED.** `effectiveRate` replaces every taxable line rate in CART mode or when product-specific rates are disabled. A test with ₹1,000 at 5% plus ₹1,000 at 18% produces ₹100 GST using cart rate 5%, instead of ₹230. MIX always has blank HSN, taxable=true and the default rate; the checkout HSN guard explicitly excludes MIX. Evidence: [GST engine][gst] lines 15–20; [sales][sales] lines 392–409 and 652–664.

Fix: resolve a verified, dated classification per supply. Permit a common rate only where all lines actually share that rate. Give custom mixtures an approved final-product/composite/mixed-supply treatment, including packaging and any separate goods. Ingredient rates cannot by themselves determine the final product's rate. Free same/different-product wholesale schemes also need classification review, not an assumption that every free line is exempt. [CGST Act sections 2 and 8](https://cbic-gst.gov.in/hindi/CGST-bill-e.html). Exact medicine, oil, soap and mixture classification **Needs CA/GST practitioner verification** against product composition, licensing, HSN and effective notifications. No product rate was inferred from its name.

### F06 — Item discounts are moved between tax rates; allocation can exceed discount

**Severity: High. Applicability: NOW for amount integrity; REGISTERED for tax effect.** `calculateDiscount` computes line discounts but `calculateSalePricing` passes only the combined amount to `calculateGstInvoice`, which proportionally redistributes it to all lines. A ₹100 discount intended only for the 5% item in a two-item ₹1,000/₹1,000 cart produces tax ₹218.50 instead of ₹225. Eligibility exclusions can also be lost. Four ₹0.01 lines with ₹0.02 discount receive ₹0.03 allocated discount and total ₹0.01 instead of ₹0.02: non-final allocations ignore the remaining balance. Evidence: [pricing][pricing], `calculateDiscount`, `calculateSalePricing`; [GST engine][gst], `calculateGstInvoice`.

Fix: apply each item discount to its own base, then allocate only eligible invoice discounts using integer-paise largest-remainder allocation and a strict remaining cap. Persist per-line discounts. Verify mixed rates, exempt exclusions, tiny values, permutations and sum invariants. Invoice-time discounts affect taxable value when properly recorded. [Section 15](https://taxinformation.cbic.gov.in/content-page/explore-act/1000284/1000001).

### F07 — Checkout preview and authoritative pricing differ

**Severity: High. Applicability: NOW and REGISTERED.** Checkout has its own discount/rounding implementation and does not pass `gstPriceMode` per line. A ₹105 inclusive 5% product in an exclusive-price store is previewed at ₹110.25; the server calculates ₹105. It also ignores several shared rounding settings and automatic discounts. Server rejects mismatching payment totals, which helps integrity but can block checkout. Evidence: [checkout][checkout], lines 152–204; [sales][sales], lines 688–737 and 795–796; [pricing][pricing].

Fix: make UI and server consume the same pricing contract, including product price mode, line discounts, payment-scope rounding and automatic discounts. Prefer a server quote validated again at finalization. Verify cash, split payment and wholesale credit. This is a reproduced implementation inconsistency, not an independent legal rule.

### F08 — Sales reports omit unpaid/partial issued invoices

**Severity: Critical. Applicability: NOW for sales completeness; REGISTERED for reporting.** `loadSales` queries only `paymentStatus:"PAID"`. Wholesale credit creates an issued Sale with UNPAID. Therefore sales/wholesale reports can omit real supplies. Receipt/payment accounting should track collections separately from the sales register. Reports also call saved directory customers REGISTERED regardless of GST status. Evidence: [reports][reports], lines 23–34; [sales][sales], lines 830–892; [customer snapshot][customerSnapshot], lines 19–56.

Fix: base supply reporting on document status/supply date, independent of settlement, and keep cash reports separate. Derive B2B/B2C from actual registration status. Verify unpaid and partial invoices appear exactly once and subsequent receipts do not create duplicate taxable turnover. [CGST time-of-supply framework](https://cbic-gst.gov.in/hindi/CGST-bill-e.html), [GST returns offline guide](https://tutorial.gst.gov.in/downloads/invoiceuploadofflineutility.pdf).

### F09 — No sales correction/cancellation document lifecycle

**Severity: High. Applicability: REGISTERED when corrections/returns occur; recommended NOW.** There is no sale document status, cancellation reason, credit/debit note model or endpoint. `/api/sales/[id]` is GET-only. This is **not** evidence of ordinary sale hard-delete: no issued-sale DELETE/PATCH route was found. Purchase cancellation and expense voiding exist but are not sales GST credit notes. Evidence: [Sale model][models], lines 15–17 and 50–57; [sale detail endpoint][saleDetail].

Fix: distinguish payment status from DRAFT/FINALIZED/CANCELLED, preserve issued numbers and original snapshots, and issue linked credit/debit documents with tax adjustments and reasons. Separate physical return, refund, commercial credit and GST adjustment. Do not simply cancel an already supplied/reported invoice to erase tax. Verify cumulative returns, correct original-rate reversal, payment/outstanding reversal, stock reversal and reporting period treatment. [Section 34](https://taxinformation.cbic.gov.in/content-page/explore-act/1000304/1000001), [Rule 53 and document rules](https://gstcouncil.gov.in/sites/default/files/2024-04/01062021-cgst-rules-2017-part-a-rules.pdf).

### F10 — Historical snapshots exist, but audit/restore protections are incomplete

**Severity: High. Applicability: recommended NOW; REGISTERED record integrity.** Sales persist supplier/customer/product tax snapshots, a substantial strength. However product GST edits and customer GSTIN edits lack field-change history. Settings PATCH saves first and writes audit afterward without one transaction, truncates changes to 200, and legacy admin PUT bypasses that history/cache path. Restore deletes and replaces all mapped collections, including sales, counters and logs, from an older archive. The safety backup preserves a recovery copy, but the active register can lose later issued documents. The process-local restore flag only prevents another restore in that process, not concurrent sales across workers. Evidence: [settings][settings], lines 38–40; [settings routes][settingsRoutes], line 8; [product update][products], lines 80–93; [customer routes][customerRoutes], lines 24–36; [restore][backup], line 45.

Fix: append audited before/after events atomically, preserve issued documents/high-water marks through recovery, introduce a persistent maintenance lock and reconciliation step, and retain independent archived records. Do not disable disaster recovery. A restored counter can reuse sequence suffixes; full timestamped identifiers also lose any absolute non-reuse guarantee after rollback/clock reuse. No actual duplicate or restore was executed. Verify recovery in an isolated database with later-issued invoices and simultaneous writes. [Rule 56(8)](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000149/1000001).

### F11 — Purchase GST headers and components disagree

**Severity: High. Applicability: NOW for supplier-cost accuracy; CONDITIONAL for future ITC.** `calculatePurchaseTotals` reports a ₹105 inclusive 5% purchase as taxable ₹105 plus GST ₹5, rather than taxable ₹100. A pre-tax ₹100 discount on ₹1,000 at 18% leaves GST ₹180 and total ₹1,080 instead of ₹162/₹1,062. CGST and SGST are both rounded from half: GST ₹0.05 becomes ₹0.03+₹0.03. It accepts taxType NONE with a positive GST rate, creating unclassified tax. Additional charges lack their own tax treatment. Evidence: [purchase calculations][purchaseCalc], lines 5–27; [purchase service][purchase], lines 29 and 42–46.

Fix: reconcile received supplier-invoice bases/tax heads explicitly; distinguish invoice-time taxable discounts from commercial after-tax adjustments. Use one line/header calculation and exact residual allocation. Recording supplier GST is legitimate even for your unregistered business; it must not imply you can claim ITC or collect output GST. Verify supplier invoice examples, discounted/exclusive/inclusive costs and odd-paise totals. [Valuation section 15](https://taxinformation.cbic.gov.in/content-page/explore-act/1000284/1000001). ITC eligibility requires separate legal checks; this POS does not provide them.

## Missing Requirements

All references in the evidence column are exact source locations or the named full schema/function reviewed for absence. Mixed Settings objects can technically hold arbitrary data; that is not implemented validation/workflow support.

| Requirement | Status / applicability | Evidence and smallest fix |
|---|---|---|
| Explicit UNREGISTERED mode preventing output GST | Mandatory now safeguard; partial | F01; persist registration status and enforce on sales POST |
| Legal name / trade name / registered address | Stored, validation incomplete | Settings defaults line 10; require appropriate identity before registered finalization; fix receipt F03 |
| State / state code | Partial | Settings validated against GST_STATES; transaction POS accepts any two digits; F04 |
| GSTIN syntax/state agreement | Partial PASS for supplier Settings PATCH | Settings lines 5–6,33; checksum/active verification absent |
| PAN and turnover profile | Conditional; missing | Settings defaults/model; needed for applicability assessment, not a universal separate invoice PAN field |
| Financial year / effective registration dates | Conditional; missing | Global counter and createdAt only; add dated registration and supply/invoice dates |
| Tax-inclusive/exclusive product pricing | Implemented server; FAIL end-to-end | GST engine; checkout F07 |
| Composition status and permitted declaration | Conditional; missing | No composition mode; must prevent separate tax collection and use Bill of Supply |
| Tax Invoice / Bill of Supply / invoice-cum-bill of supply | Conditional; missing distinction | Generic Invoice only; add document type and permitted issuance rules |
| Credit Note / Debit Note | Conditional; missing | F09; original links, reason, number/date, bases and every tax head |
| Receipt Voucher / Refund Voucher / advance adjustment | Conditional; missing | Sale payments are immediate settlement, not advance documents |
| Revised invoices after effective registration | Conditional; missing | No registration interval or revised-document references |
| Reverse-charge flag / accounting / self-invoice / payment voucher | Conditional; missing | Sales/purchase models lack it; enable only for notified transactions |
| HSN/SAC required digits / reporting | Conditional; partial | Product validation accepts any 2–8 digits; no turnover-aware rule, service discriminator or HSN report |
| Product rate effective history / classification evidence | Recommended implementation; needed for reliable dated treatment | Single current rate only; add effective intervals and approved notification reference |
| Exempt / nil / zero-rated / non-GST categories | Conditional; missing distinction | taxable/gstExempt/rate=0 collapse different legal classes |
| UTGST and cess | Conditional; missing | taxType enum and tax totals only CGST/SGST/IGST; verify actual commodity/date cess applicability before enabling |
| E-invoicing fields and IRP workflow | Future/conditional | No IRN, acknowledgement, QR, payload or integration; details below |
| E-way bill / transport / dispatch metadata | Future/conditional | No EWB number/date, vehicle/transporter/mode/dispatch schema |
| GST returns, HSN/tax-head reconciliation | Conditional; missing | Generic reports only; F08 and reporting matrix below |
| Immutable document archive and complete change log | Recommended now; conditional statutory record duty | F10; retain originals and electronic edit/delete history |
| Signature / IT Act electronic-invoice basis | Conditional; missing/unknown | No signature support or documented exemption basis in receipt |
| Export/SEZ endorsements, currency and LUT/payment route | Conditional; missing | No supported export/SEZ document model |

Composition suppliers cannot collect tax separately and must use the appropriate supply document; Rule 5(1)(f) requires the composition declaration. Rule 46A allows a combined invoice/bill for taxable and exempt supplies to an unregistered recipient. Voucher rules depend on advances and refunds, not every cash checkout. Normal goods advances have relief under Notification 66/2017; services can differ. [CGST document/composition rules](https://gstcouncil.gov.in/sites/default/files/2024-04/01062021-cgst-rules-2017-part-a-rules.pdf), [Notification 66/2017](https://gstcouncil.gov.in/node/3993).

Reverse charge is not automatic merely because a supplier is unregistered. Apply notified categories and recipient conditions under the amended law. [Current section 9](https://taxinformation.cbic.gov.in/content-page/explore-act/1000278/1000001).

### E-invoicing and e-way applicability

**Not a present requirement for your unregistered output invoices.** Verified published e-invoicing threshold: aggregate turnover **exceeding ₹5 crore**, in any preceding FY from 2017–18, effective **1 August 2023**, for covered registered suppliers/documents. It generally covers B2B/export invoices and relevant credit/debit notes, not ordinary B2C IRNs. Exempt categories include specified financial/insurance suppliers, GTA, passenger transport, multiplex admission, SEZ units, government departments and local authorities; a SEZ developer is not the same as an exempt SEZ unit. Verify exact entity exemption on onboarding. [Notification 10/2023](https://www.gstcouncil.gov.in/node/4365), [IRP applicability](https://einvoice6.gst.gov.in/content/einvoice-mandate/), [GST Council exemption overview](https://gstcouncil.gov.in/sites/default/files/gst-knowledge/Overview-of-GST.pdf).

The IRP's **30-day reporting restriction for AATO ₹10 crore and above** applies from **1 April 2025**, including credit/debit notes. Add dated thresholds, eligibility evidence, stable payload hash/idempotency, IRN, AckNo/AckDt, signed QR/JSON, retry/error states and separate IRP cancellation status. A PDF alone is not an e-invoice. [IRP implementation advisory](https://einvoice6.gst.gov.in/content/einvoice-mandate/).

Direct API integration is optional if an external IRP workflow reliably supplies validated IRN/QR data before issuing a covered invoice. Rule 48(5) consequences make a missing IRN serious when mandated. [Rule 48](https://gstcouncil.gov.in/sites/default/files/2024-04/01062021-cgst-rules-2017-part-a-rules.pdf). B2C dynamic QR and Rule 46(s) exemption declarations are separate conditional checks, not interchangeable with IRN QR. The published B2C dynamic-QR threshold is turnover above ₹500 crore, effective 1 December 2020, with exemptions and payment-reference concessions; it is not applicable to your current unregistered billing. [CBIC Circular 156/12/2021](https://www.gstcouncil.gov.in/sites/default/files/2024-06/156-12-2021_20gst_20circular.pdf). Rule 46(s) declaration applicability and wording should be checked against the effective rule when onboarding an exempt high-turnover supplier; no such declaration is implemented. [Notification adding Rule 46(s)](https://taxinformation.cbic.gov.in/view-pdf/1009417/ENG/Notifications).

E-way obligations generally concern movement of goods with consignment value exceeding ₹50,000, with exemptions, certain below-threshold cases and state-specific conditions. They can matter even when dealing with unregistered parties. Transport facts are unknown here, so applicability is **UNKNOWN/CONDITIONAL**, not automatically absent because you are unregistered. An external portal workflow can comply without an in-app API. Add document/dispatch/delivery, transporter, vehicle/mode, EWB number/date/validity/status if needed. [Official e-way FAQ](https://docs.ewaybillgst.gov.in/html/faq_new.html).

## GST Calculation Review

Rates below are synthetic arithmetic inputs, not recommendations for your products. Source: [GST engine][gst], [pricing][pricing], and [recorded probes](./results.json).

| Required scenario | Expected | Actual / verdict |
|---|---|---|
| 1. Intrastate | ₹1,000 × 18% = ₹180; CGST ₹90 + SGST ₹90; total ₹1,180 | PASS pure function with explicit valid state |
| 2. Interstate | ₹1,000 × 18% = IGST ₹180; total ₹1,180 | PASS explicit POS function; FAIL actual UI determination (F04) |
| 3. Multiple rates | ₹1,000 at 5% + ₹1,000 at 18% = ₹230 tax; ₹2,230 total | PASS PRODUCT mode with overrides; FAIL CART/common default (₹100 tax) |
| 4. Inclusive | ₹1,180 / 1.18 = ₹1,000 base + ₹180 tax | PASS engine; price-mode preview FAIL (F07) |
| 5. Exclusive | ₹1,000 + ₹180 = ₹1,180 | PASS engine |
| 6. Discounted item | ₹1,000 less ₹100 at 18% = base ₹900, tax ₹162, total ₹1,062 | PASS single-line invoice discount; FAIL multi-rate item discount, F06 |
| 7. Exempt | ₹1,000, zero GST | PASS zero calculation; MISSING legal exemption classification/document/report |
| 8. Credit note | Return ₹100 base at original 18% → reduction ₹118; CGST/SGST ₹9 each or IGST ₹18 | MISSING model/workflow; no transaction executed |
| 9. Cancelled invoice | Retain number/original; record cancellation and lawful ledger/report effect | MISSING sales lifecycle; no transaction executed |
| 10. B2B | Same arithmetic under correct POS, registered recipient particulars | FAIL document and registration/POS controls; customer GSTIN absent from print |
| 11. B2C | GSTIN optional; POS/address capture where applicable | PASS no GSTIN requirement; FAIL delivered interstate/high-value address workflow |
| Current unregistered sale | ₹1,000 sale = ₹1,000, no output GST | PASS with gst.enabled=false; live settings UNKNOWN |

Additional findings: item-only 5% discount example should total ₹2,125 but totals ₹2,118.50; four-paise allocation example totals one paisa rather than two; purchase tax defects are reproduced in F11. Negative sale line amounts are clamped by the GST helper, so negative lines cannot serve as a credit-note implementation.

`Number` plus EPSILON and two-decimal rounding reduces some floating-point artifacts but is not a decimal-safe contract. The audit demonstrates allocation/splitting defects; it does not attribute every discrepancy to binary floating point. Use exact decimal quantities/rates and integer minor-unit allocation, retaining precise unit prices before line rounding. Require sum(line discounts)=document discount, sum(line bases)=taxable total, sum(heads)=tax total, and base+tax+adjustments=payable. Sale splitting preserves total by assigning residual to SGST, but repeated odd-paise lines bias CGST upward; adopt a documented consistent reconciliation policy. Statutory tax-payable rounding should not be confused with arbitrary per-invoice rounding presets; the current code supports custom steps and payment-specific rounding without a separate GST-liability reconciliation.

### Product quantities and mixtures

The normal sale route recalculates quantity × server product price (lines 580–645), rather than accepting a client tax total. Proportional loose price is package price / package size, rounded to six decimals in [product validation][productValidation], lines 17–21. Therefore a ₹200/100 ml package gives ₹2/ml and 25 ml gives ₹50 before the selected tax treatment. 250 g at ₹0.40/g and 0.25 kg at ₹400/kg both mean ₹100 only if inputs and rates use consistent units. There is no automatic litre unit in the schema; use ml conversion explicitly, and retain invoice UQC mapping.

Count-based products use a separate loose unit/conversion and whole-number guard ([inventory helpers][inventory], lines 1–3; sales lines 592–609). Five tablets at ₹2/tablet means ₹10, not a weight-derived count. Stock conversion has existing tests, but no live count-on-open, litre/kg entry or mixed-product checkout was exercised. MIX ingredient totals use each ingredient's base quantity × loose price, then packaging, but final GST classification is missing (F05). The TIERS product setting normalizes a proportional loose rate; the standard sale route does not resolve priceTiers. Either implement the promised tier price consistently or constrain the feature before relying on its taxable value.

## Database Review

| Snapshot/data | Verdict | Exact evidence / action |
|---|---|---|
| Supplier name/legalName/address/GSTIN/state | PASS storage, FAIL requiredness/rendering | Sales 843–850; Sale schema line 17; fix F03 |
| Customer name/address/GSTIN/billing/shipping | PASS storage for supplied customer values | buildCustomerSnapshot 64–81; schema additions line 54; require applicable fields |
| Product description/HSN/unit/quantity/unit price/rate/tax | PASS snapshot path | Sales 625–645,724–736; item schema line 15; old rates not recalculated on reprint |
| Per-line discount and component rates | MISSING persisted explicit breakdown | GST helper computes values; sale assignment omits them; add snapshots |
| POS | PASS storage, FAIL determination | Sale placeOfSupply; F04 |
| Cess/UTGST/RCM/exemption basis/service code | MISSING | Complete item/Sale definitions, lines 15–17 |
| Invoice date versus supply date/FY/registration interval | PARTIAL | createdAt only; new fields required for dated legal treatment |
| Unique invoice/counter indexes | PASS declared; deployed index UNKNOWN | Sale line 17; DocumentCounter line 35; inspect live indexes safely before certification |
| Immutable finalization/correction references | MISSING | Sale model lacks lifecycle/immutability controls |
| Actual historical data quality | UNKNOWN | No live data inspected; query missing snapshots and mismatched totals without rewriting records |

Recommended additive model shape (design only; not installed):

```js
RegistrationProfile = {
  status: 'UNREGISTERED | REGULAR | COMPOSITION | INACTIVE',
  legalName, tradeName, gstin, pan, registeredAddress, stateCode,
  effectiveFrom, effectiveTo, verificationEvidence,
  turnoverByFinancialYear, legalRuleVersion
};
GstDocument = {
  documentType, status, supplierRegistrationId, financialYear, series, sequence,
  number, invoiceDate, supplyDate, finalizedAt, createdBy,
  supplierSnapshot, recipientSnapshot: { registrationStatus, gstin, billing, shipping },
  supplyContext: { goodsOrServices, placeOfSupply, ruleBasis, sez, export },
  lines: [{ description, hsnSac, uqc, quantity, unitPrice, priceMode,
    gross, itemDiscount, allocatedCartDiscount, taxableValue,
    classification, rateVersion, cgstRate, sgstRate, utgstRate, igstRate,
    cgst, sgst, utgst, igst, cessRate, cessAmount }],
  totals, reverseCharge, originalDocumentRefs, adjustmentReason,
  cancellation: { at, by, reason },
  einvoice: { required, status, irn, ackNumber, ackDate, signedQr,
    signedJson, originalPayload, payloadHash, errors, cancelledAt },
  transport: { dispatch, delivery, mode, transporterId, vehicleNumber,
    ewayBillNumber, date, validUntil, status }
};
DocumentEvent = { documentId, actorId, at, action, reason, before, after };
```

Use distinct fiscal-document and payment ledgers, append-only events, an idempotency key for retried checkout, unique supplier/FY/type-series/sequence constraints, and versioned templates/calculation rules. Snapshot data does not require copying current masters at reprint. Preserve legacy missing fields as unknown; do not backfill them from today's masters and claim historical accuracy.

Customer GSTIN validation is only a regex in `src/services/customer.service.js:8`: it checks 15-character structure and a PAN-shaped portion, but accepts any two-digit state and an entity character of `0`. Supplier validation is stricter on the entity character and checks a known state plus GSTIN prefix agreement when enabled. Neither implements checksum, PAN identity verification or active GST registration lookup. Customer state is not separately stored/validated. Fix the shared syntax/state/checksum validator, record declared registration status and verification date/source, and distinguish verification failure from API unavailability. Checksum correctness still would not prove the number belongs to the customer or is active.

## Invoice Review

This matrix assesses a **registered-supplier invoice**. It is conditional for your present unregistered business. Rule 46 is the field baseline; digit rules and signature exemptions are separate. [Rule 46](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001), [HSN Notification 78/2020](https://gstcouncil.gov.in/sites/default/files/2024-05/notfctn-78-central-tax-english-2020.pdf).

| Field | Verdict | Evidence / fix |
|---|---|---|
| Supplier legal name | FAIL | Receipt 49 fixed logo; render stored legalName/name |
| Supplier address | FAIL requiredness; conditional rendering exists | Receipt 50; settings allow blank; validate |
| Supplier GSTIN | FAIL can be hidden | Receipt 44,52; require in appropriate registered document |
| Unique invoice number | FAIL legal format; uniqueness mechanism present | Receipt 58; F02 |
| Invoice date | PASS basic output | Receipt 59 createdAt; timezone implicit in browser, pin IST for consistent date |
| Customer name | CONDITIONAL | Receipt 63; walk-in fallback cannot replace required named recipient |
| Billing address | MISSING print | Receipt 57–69; snapshot has it |
| Customer GSTIN/UIN | MISSING print/UIN support | Receipt 57–69; GSTIN exists in snapshot |
| State and state code | MISSING print | Supplier state/POS saved; recipient state not structured |
| Place of supply | MISSING print | Receipt entire metadata; F04 |
| Shipping/delivery address | MISSING print | Stored optional shippingAddress unused |
| Goods description | PASS | Receipt 74, snapshotted item.name |
| Service description / SAC | CONDITIONAL, missing service workflow | Generic goods/MIX only |
| HSN | FAIL applicability enforcement | Receipt 75 conditional; blank dash permitted; MIX bypass |
| Quantity | PASS ordinary goods; partial MIX display | Receipt itemDescription 23–40; render explicit final mix quantity |
| Unit/UQC | CONDITIONAL/partial | Human units present; no standardized UQC mapping |
| Unit price | PASS ordinary goods; partial MIX display | Receipt 23–40; MIX ingredients have quantities, no explicit final unit price |
| Discount | PASS aggregate output, FAIL allocation evidence | Receipt 83; F06 |
| Taxable value | FAIL | Detailed aggregate only, absent COMPACT; no line values |
| GST rate | FAIL complete tax-head presentation | Combined line rate only at 75 |
| CGST rate and amount | FAIL | Aggregate amount in detailed mode; component rate absent |
| SGST rate and amount | FAIL | Same; cannot represent UTGST |
| UTGST rate and amount | CONDITIONAL, MISSING | No model/renderer path |
| IGST rate and amount | FAIL | Aggregate conditional amount; component rate/line table absent |
| Cess | CONDITIONAL, MISSING | No model/renderer path; verify product/date applicability |
| Total invoice value | PASS arithmetic output; calculations have identified failures | Receipt 95 |
| Reverse-charge indication | MISSING | No flag or printed yes/no |
| Signature/digital signature | CONDITIONAL | No mechanism; electronic exception not established merely by HTML printing |
| IRN / signed QR | CONDITIONAL, MISSING | No IRP fields or print path |
| Document heading / applicable declarations | MISSING distinction | Generic Invoice; composition/export/IRP-exempt declarations absent |

For a registered supplier's ordinary B2C tax invoice, ₹50,000-or-more taxable supply triggers recipient/address details; below that, requested details and special rules still matter. Do not require GSTIN from unregistered buyers. Electronic signature relief requires the applicable IT Act conditions; absence of a handwritten signature is not automatically a defect in every electronic invoice. [Current Rule 46 text](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001), [signature amendment context](https://gstcouncil.gov.in/sites/default/files/Agenda/55th_meeting_agenda_compressed_1.pdf).

### Invoice numbering and historical reprints

| Control | Verdict / evidence |
|---|---|
| Atomic sequence allocation | PASS source: counter $inc within sales transaction; numbers 15–16, sales 284–911 |
| Duplicate prevention | PARTIAL: unique indexes declared; live indexes/concurrency not tested |
| Consecutive series | FAIL: priorInvoices maximum spans wholesale and retail, so another prefix can force gaps; timestamp creates changing middle portion |
| Financial-year rollover | Missing explicit FY scope; global sequence continues. Continuing across years is not itself prohibited; annual reset/FY printed in number is not compulsory |
| Silent reset from nextNumber | No use of nextNumber in issuance found; prefix changes/reset/restore still need traceability |
| Deleted-number reuse | No ordinary sale delete endpoint; restore destroys the general guarantee (F10) |
| Cancelled numbers retained | MISSING cancellation lifecycle |
| Old product/customer changes | Snapshots preserve main invoice data. Cashier print prefers live populated actor name at receipt 60; use snapshot first |
| Template changes | Current logo/template changes can affect old reprints; store template version or immutable rendered artifact if exact reproduction is required |

## Security/Audit Review

| Action | Verdict and evidence | Targeted fix / verification |
|---|---|---|
| Anonymous sale creation/settings edits | PASS source gates, runtime UNKNOWN | requireSession in sales 266/settings routes 7; live RBAC probe pending |
| GSTIN/registration settings changes | PARTIAL | settings.edit permits them; no dedicated registration approval; add controlled transitions |
| Product GST changes | PARTIAL | products.edit gate, product update accepts rates without audit; add tax-maintenance scope/events |
| Customer GSTIN changes | PARTIAL | customers.edit; F10; cashier role includes customer editing; retain attributed before/after |
| Arbitrary client tax/total | PASS server recalculates normal product tax and matches payments | Sales 620–645,688–796; verify crafted request in isolated DB |
| Client POS/mixture price | FAIL business validation | Any two-digit POS accepted; packagingPrice supplied by client, F04/F05; validate policy and price authority |
| Issued invoice number or tax edit/delete | No ordinary mutation endpoint found | Sale detail GET-only; no schema immutable protection against future code/direct DB/restore |
| Cancel / credit / debit permissions | MISSING feature | Dedicated permissions needed when adding lifecycle |
| Created by/time | PASS schema/persistence | Sale actorId, timestamps; stock references within transaction |
| Modified by/time/reason | PARTIAL | timestamps do not capture before/after or actor; append document events |
| GST rate/customer GSTIN/number change events | FAIL completeness | Product/customer updates and legacy Settings PUT lack matching audit events |
| Restore and retained history | FAIL robust issued-document preservation | F10; administrator authorization alone is not archival integrity |

No unauthenticated exploit or live permission bypass is claimed. Most risks are permitted users performing inadequately validated actions. Encryption/backups do not make the active fiscal ledger append-only. Registered-person records must retain electronic change history; retention under section 36 generally extends 72 months from the annual-return due date, longer in specified proceedings. Implement retention/legal-hold policy rather than automatic short-period deletion. [Rule 56](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000149/1000001), [CGST Act section 36](https://taxinformation.cbic.gov.in/content-page/explore-act/1000306/1000001).

## GST Returns and Reports

| Output | Verdict | Evidence / action |
|---|---|---|
| Sales register | FAIL complete coverage | reports loadSales PAID filter; F08 |
| GST aggregate | PARTIAL | salesReport tax/taxable fields; no complete fiscal register |
| CGST/SGST/IGST summaries | MISSING dedicated reports | REPORT_PERMISSIONS line 15 and getReport dispatch line 61; stored heads could support them |
| UTGST/cess summaries | MISSING data and reports | Models and dispatch |
| HSN/SAC and rate-wise summaries | MISSING | Same dispatch; add snapshot grouping by code/rate/UQC/POS/category |
| B2B/B2C | FAIL legal classification | WALK_IN/REGISTERED or RETAIL/WHOLESALE are directory/sales modes |
| Credit/debit/cancelled documents | MISSING | No sale adjustment lifecycle |
| Taxable/exempt/nil/zero/non-GST | MISSING reliable segregation | Boolean flags and zero rate insufficient |
| GSTR export/reconciliation | MISSING | Generic CSV is not mapped GSTR data; pageRows CSV cap is 10,000 |
| GST return filing | NOT IMPLEMENTED | No GST filing connector; do not describe exports as filing |

HSN digit rule under Notification 78/2020, effective **1 April 2021**: preceding-FY aggregate turnover up to ₹5 crore requires four digits, with the notification's exemption for supplies to unregistered recipients; above ₹5 crore requires six. Validate actual HSN/SAC classification and current master entries rather than accepting any 2–8 digits. Return reporting is a separate duty: the GST Portal introduced separate B2B/B2C HSN reporting and required document-series Table 13 from the May 2025 period. [Notification 78/2020](https://gstcouncil.gov.in/sites/default/files/2024-05/notfctn-78-central-tax-english-2020.pdf), [GSTN May 2025 advisory](https://tutorial.gst.gov.in/downloads/news/updated_advisory_hsn_table12_25042025.pdf).

The official offline guide uses interstate B2C invoice value **over ₹1 lakh** for B2CL from August 2024 (rather than the older ₹2.5 lakh). Store POS and recipient status correctly, then apply the effective reporting-period rule. Current register lacks sufficient data for reliable GSTR preparation without enrichment and corrections. [GST Portal offline guide](https://tutorial.gst.gov.in/downloads/invoiceuploadofflineutility.pdf).

### Current-law uncertainties requiring professional verification

- The CBIC section 15 page includes Finance Act 2026 post-supply discount wording but explicitly marks commencement **yet to be notified**. Section 34 shows the corresponding pending insertion. Do not activate new post-supply discount treatment from the substituted text alone. Verify the actual commencement notification at implementation; the app presently supports neither regime. [Section 15 amendment note](https://taxinformation.cbic.gov.in/content-page/explore-act/1000284/1000001), [section 34 amendment note](https://taxinformation.cbic.gov.in/content-page/explore-act/1000304/1000001).
- GST credit-note reporting for output-tax adjustment has a deadline generally of 30 November following the supply FY or the annual-return filing date, whichever is earlier, with further adjustment conditions. A commercial refund after that does not automatically entitle a GST reduction. Keep document date, original supply FY, adjustment eligibility and reporting period separately. [Current section 34(2)](https://taxinformation.cbic.gov.in/content-page/explore-act/1000304/1000001).
- The old Settings presets `[0,3,5,12,18,28]` are not a current legal rate catalogue. Custom rates are allowed, so the app is not technically limited to these. Official 2025/2026 updates include new rate/valuation treatment; dated classification must drive selection. No current product rate or cess exemption is certified by this audit. [GST Council September 2025 guidance](https://www.gstcouncil.gov.in/sites/default/files/2025-09/faq_0.pdf), [IRP 2026 valuation/rate updates](https://einvoice6.gst.gov.in/content/einvoice-mandate/).
- Registration obligation, any applicable state-specific e-way rule, mixture/free-scheme classification, electronic signature exemption, future B2C dynamic QR applicability and any product/date cess liability: **Needs CA/GST practitioner verification**. No unsupported rate or compulsory feature is inferred from the name Oushadhi or Ayurvedic medicine.

## Final Classification

**D — Not safe for GST production billing.** That conclusion applies to using this application to issue/collect/report GST as a registered supplier.

For your **current unregistered business**, ordinary billing with GST disabled has a verified zero-tax calculation path, but operational compliance remains **UNKNOWN** until saved settings, actual receipts and registration liability are checked. It would be incorrect to classify you as violating e-invoicing or GST invoice-field rules simply because you are currently unregistered.

## Priority Fix Plan

### P0 — Must fix before the relevant production use

1. **Current business:** verify saved GST is disabled; enforce UNREGISTERED server-side. Preserve and review any prior bills that show GST without silently editing them. Obtain professional advice if such collection occurred; this audit did not establish that it did.
2. **Current billing integrity:** fix discount allocation (F06), checkout/server mismatch (F07), omission of credit sales (F08), purchase reconciliation (F11), and correct supplier identity on receipts.
3. **Before any GST billing:** replace invalid numbering, implement mandatory invoice rendering, resolve POS from facts, remove unjustified rate overrides, and block unclassified mixes.
4. **Before relying on recovered fiscal records:** protect post-backup invoices/counters and reconcile restore results; do not perform a production restore as a test.

### P1 — Must fix for GST compliance when applicable

Add registration/document eligibility, dated tax classification, HSN/SAC/UQC checks, complete snapshots, independent document/payment lifecycle, credit/debit/cancellation workflows, tax-head reports and statutory export data. Add composition, reverse-charge, UTGST and exempt/zero-rated support only when those scenarios are offered. Required IRN/QR support is P0/P1 if the future business meets the mandate, not universally P3.

### P2 — Important improvements

Use exact-decimal arithmetic and invariant checks, dedicated tax permissions, atomic audit events, idempotent checkout, long-term archive/retention, versioned print templates and complete paginated exports. Verify live unique indexes and transactional concurrency in staging, then test all legal document fixtures in the browser and on the actual printer.

### P3 — Future/optional features

Direct IRP/e-way APIs, live GSTIN lookup, GST filing integration and service/export-specific workflows if the business expands. An external compliant process may meet some obligations; do not make optional APIs a prerequisite for today's unregistered cash sales.

Targeted code direction: extend existing pricing/snapshot/transaction services instead of rewriting the app. Keep invoice identifiers and past tax snapshots untouched. New tests should assert legal scenarios and accounting invariants, not merely current forced-mode behavior. No production repair or application patch has been applied by this audit.

[settings]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/services/settings.service.js:33
[settingsRoutes]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/app/api/settings/route.js:7
[sales]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/app/api/sales/route.js:264
[saleDetail]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/app/api/sales/[id]/route.js:7
[gst]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/services/gst.service.js:1
[pricing]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/services/pricing.service.js:71
[numbers]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/services/document-number.service.js:11
[receipt]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/components/ThermalReceiptPrinter.jsx:43
[logo]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/components/branding/OushadhiLogo.jsx:7
[checkout]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/components/SalesCheckoutHostV2.jsx:61
[purchase]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/services/purchase.service.js:29
[purchaseCalc]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/lib/purchase-calculations.js:5
[reports]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/services/report.service.js:23
[customerSnapshot]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/lib/sale-customer.js:64
[models]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/models/index.js:15
[products]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/services/product.service.js:80
[customerRoutes]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/app/api/customers/[id]/route.js:24
[backup]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/services/backup.service.js:45
[productValidation]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/lib/product-validation.js:17
[inventory]: /D:/Next.js/Projects/Oushadi-POS/oushadi-pos/src/services/inventory.service.js:1
