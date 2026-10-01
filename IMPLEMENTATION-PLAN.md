# Accountants implementation plan

Progress for the approved service-first and small-retail roadmap. Existing work was preserved; the repository was clean before implementation.

## Phase 0 — Stabilize data and access

- [x] Confirm and record the starting worktree state; it was clean.
- [x] Fix the `three` TypeScript declarations and verify typecheck/build on Node 22 and Node 24.
- [x] Replace browser-supplied arbitrary SQL with authenticated, typed server operations; disable raw SQLite migration uploads in production.
- [x] Move login, first-admin setup, session validation, and logout to the server using secure HTTP-only cookies; restrict setup to an empty user store and sensitive operations to admins.
- [x] Replace manual invoice customer text with an inline walk-in customer record and a valid customer ID.
- [x] Add incremental SQLite migrations and snapshots before migration, import, and restore; keep existing backup formats readable.
- [x] Add automated coverage for invoice, payment, check, return, inventory, backup export/import, and legacy backup parsing.

**Acceptance:** Unauthenticated requests cannot access accounting data, invoice customers are validated, and typecheck/build pass on Node 22 and Node 24.

## Phase 1 — Quotes, projects, and attachments

- [x] Add numbered quotes with customer, line items, validity date, and draft/issued/accepted/rejected/converted states.
- [x] Convert an accepted quote to one linked sales invoice draft; repeated conversion returns the same invoice and preserves quote history.
- [x] Add projects with customer, title, status, due date, agreed amount, notes, linked documents, and direct-cost reporting.
- [x] Link project costs to existing money transactions without duplicating accounting entries.
- [x] Store PDF and image attachments outside SQLite beside the database; serve downloads only to authenticated users.
- [x] Convert uploaded images server-side to WebP up to 1024×1024 and create thumbnails; cap PDF uploads at 25 MB and validate file signatures/content.
- [x] Package accounting data and attachment files together; check ZIP expansion limits before inflating, validate files before restore, and roll back newly installed files if database restore fails.
- [x] Add searchable quote and project views with status filters and project details.

## Phase 2 — Receivables and service UX

- [x] Add optional invoice due dates and installment schedules; retain partial-payment behavior.
- [x] Show upcoming and overdue receivables, partially paid invoices, projects awaiting approval, and low-stock links on the dashboard.
- [x] Add three-step fast service entry, reusable line presets, inline customer creation, validation beside fields, and invoice review before finalization.
- [x] Add date, balance, settlement, and overdue filters to invoice lists.
- [x] Add project income/direct-cost/profit reporting and explain how project profit is calculated.
- [ ] Extend field-adjacent validation consistently across every existing form and verify error recovery manually.

## Phase 3 — Minimum retail workflow

- [x] Add unique SKU/barcode, category, and active/archive state to products.
- [x] Add optional customer/group price lists while retaining base buy/sell prices.
- [x] Add a quick-sale cart with barcode/search entry, quantity, discount, customer selection, and optional receipt flow.
- [x] Route quick sales through existing invoices, inventory, and accounting posting rules.
- [x] Make low-stock warnings actionable and add sales-by-product/category exports to CSV and Excel.
- [x] Test multi-item sales, partial payment, stock deduction, insufficient stock, and returns.

## Phase 4 — Online release readiness

- [x] Document Node.js deployment with durable storage for SQLite and attachment files.
- [x] Add application-side HTTPS/session expectations, upload limits, and a guard against placing data under `public`; document reverse-proxy configuration.
- [x] Document off-host scheduled ZIP backups and a staging restore drill.
- [x] Clarify in the UI that document entry requires the server to be running; offline writes are unsupported.
- [x] Keep database and attachment access behind server interfaces so managed storage can be added later.
- [ ] Deploy on the selected online host, configure its HTTPS/proxy, and run the off-host restore drill; no host has been provided yet.

## Shared data and verification requirements

- [x] Extend accounting types, APIs, and migrations for quotes, projects, installments, product identifiers/categories/pricing, and attachment metadata.
- [x] Keep attachment bytes out of JSON; include them as separate files in backup archives.
- [x] Preserve atomic invoice/stock/accounting posting; quotes and projects alone do not post entries or change stock.
- [x] Cover duplicate quote conversion, partial payment, insufficient stock, returns, invalid uploads, ZIP backup/restore, and legacy backup parsing.
- [x] Add dedicated automated tests for overdue dashboard calculations and failed restore rollback.
- [x] Run final typecheck, tests, production build, dependency audit, and whitespace checks.

## Defaults and exclusions

- Single-user use today; reference online deployment is one Node.js server with durable disk. The final host is not selected.
- PDF and lightweight images are stored in-app; large source design files remain external. Image optimization starts server-side; client-side compression remains optional later work.
- New UI follows the existing style and can be redesigned later.
- Full POS shifts/cash drawer, multiple warehouses/transfers, and writing documents while the server is down are out of scope.

## Previous milestone verification (before financial-hardening addendum)

- Node 22.23.3 and Node 24.21.0: `npm run typecheck`, `npm run test`, and `npm run build` passed on both.
- Tests: 4 files, 14 tests passed, including ZIP expansion limits and failed-restore rollback.
- `npm audit`: 0 vulnerabilities after updating PostCSS.
- Production smoke test: root page returned 200, first-run auth reported no users, and anonymous accounting API access returned 401.
- Remote-host deployment, HTTPS setup, and off-host restore have not been run because no host is selected.

## Addendum — Financial correctness and release preparation

### Phase 1 — Reliable financial posting

- [x] Replace ordinary whole-state writes with typed server commands carrying a unique `commandId` and `expectedRevision`; replay returns the original response.
- [x] Validate invoice, return, payment, check, stock, journal balance, references, and final-document transitions on the server; keep full-state replacement admin-only for import/restore.
- [x] Commit data changes, revision advance, and idempotency response in one SQLite transaction; apply the same revision check to import, restore, clear, and attachment upload.
- [x] Save a quick sale and its optional receipt as one atomic store command, including stock and journal entries.
- [x] Wait for server persistence before reporting finalization/printing or closing payment, customer, product, quote, and project forms; preserve entered form values on errors.
- [x] Reserve pending checks against the receivable balance without counting them as collected; reject an additional receipt that would exceed the available amount.

### Phase 2 — Receivables, project profit, and restore

- [x] Allocate effective receipts to installments by due date, reduce the latest installments first for returns, and use invoice `dueDate` when no schedule exists.
- [x] Show receivables by installment and due status; pending checks are excluded from collected amounts.
- [x] Calculate project estimate from finalized sales after returns and tax, direct posted expenses, and net sold-goods cost; show effective receipts separately and label the estimate clearly.
- [x] Store new snapshots as full data-and-attachment archives; preserve old JSON snapshots as data-only and stop restore when referenced attachment bytes are missing.
- [x] Route ZIP and snapshot restore through validation and guarded attachment installation; remove newly installed files if the database transaction fails.
- [x] Reject JSON-only backups that reference attachments and reject manager imports when referenced attachment files are absent or invalid.

### Phase 3 — Form UX and exports

- [ ] Map every customer, product, invoice, payment, check, quote, and project validation error to its individual field; finish manual error-recovery review. Several forms now show inline error summaries and quote row errors, but field-by-field coverage is not complete.
- [x] Allow an inventory product on a quote and preserve its `productId` through conversion.
- [x] Add editable quantity, price, line discount, and cash/card receipt choice to quick sale, with client and server validation.
- [x] Generate real `.xlsx` files with `fflate` OOXML and retain formula-injection protection for user-entered cells.
- [x] Update README session-cookie and backup guidance.

### Phase 4 — Tests and online release

- [x] Cover duplicate commands, stale revisions, invalid journals, pending-check over-receipt, atomic retail sale, installment allocation, returns, old backup normalization, missing attachments, snapshot restore, and rollback paths.
- [ ] Exercise authenticated browser flows, including network failure and form preservation. The app's first-run page was smoke-checked on an isolated temporary database; authentication and the financial forms were not driven in the browser.
- [ ] Run the final suite on both Node 22 and Node 24. Node 24.21.0 is installed and has passed; no Node 22 executable is available in this environment.
- [ ] Deploy with HTTPS and durable storage, test access from a second device, and run an off-host backup restore on a separate environment; the host has not been selected.

### Latest verification

- 2026-10-01, Node 24.21.0: profile updates were tested against a legacy zero-quantity invoice and negative stock, including client hydration and linked-profile protection; `typecheck`, all 30 tests across 8 files, and production build passed.
- Node 24.21.0: final `npm run check` passed after the backup-compatibility changes; `typecheck`, all 26 tests across 7 files, and production build are green.
- Node 24.19.0: `npm run typecheck` and all 26 tests also passed.
- Browser smoke test reached the first-run admin setup page on an isolated temporary data directory; the temporary server and data were removed afterward.
