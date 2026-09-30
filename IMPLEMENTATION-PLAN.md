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

## Verification record

- Node 22.23.3 and Node 24.21.0: `npm run typecheck`, `npm run test`, and `npm run build` passed on both.
- Tests: 4 files, 14 tests passed, including ZIP expansion limits and failed-restore rollback.
- `npm audit`: 0 vulnerabilities after updating PostCSS.
- Production smoke test: root page returned 200, first-run auth reported no users, and anonymous accounting API access returned 401.
- Remote-host deployment, HTTPS setup, and off-host restore have not been run because no host is selected.
