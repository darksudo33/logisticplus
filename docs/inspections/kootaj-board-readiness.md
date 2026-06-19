# Kootaj Board Readiness Inspection

Date: 2026-06-19

Scope: technical inspection only; no runtime changes or migration changes

## Executive recommendation

Implement Kootaj Board as a specialized, shipment-backed operational view over the existing Daily Status projection. Do not create a standalone spreadsheet table that duplicates shipments, customers, documents, tasks, workflow, or the current kootaj profile.

The repository is ready for a low-risk read-only Phase 1 because it already has:

- tenant-scoped shipment, customer, workflow, task, document, and commercial-card joins;
- a normalized one-to-one `shipment_kootaj_details` profile;
- grouped Daily Status DTOs and `/api/kootaj-board` read/write aliases;
- strict request validation, shipment permissions, relationship ownership checks, and audit logging;
- responsive Daily Status and canonical Shipment Detail UI patterns with Playwright coverage.

It is not ready for broad Kootaj Board editing without a field-ownership decision. `shipment_v2_profiles.sections_json` and `shipment_kootaj_details` currently contain overlapping declaration, payment, banking, notes, and base concepts. Daily Status writes kootaj columns and synchronizes only selected base values into the V2 profile, while the canonical `ShipmentDetail` UI writes most non-base sections only into V2 JSON. A second editor would increase drift unless both surfaces call one canonical write service.

Recommended sequence:

1. Ship a dedicated, read-only `/kootaj-board` page using the existing tenant-scoped projection.
2. Define and implement a canonical field-ownership/synchronization service before enabling edits.
3. Add optimistic concurrency and explicit board-only daily operational state through an additive migration.
4. Add history, export, and controlled bulk operations only after the real Excel columns and daily workflow are confirmed.

## Current architecture summary

### Backend composition

`server/src/server.js` is the composition root. It creates route dependencies and registers modular routes from `server/src/modules`. Some shared validation, workflow, audit, and compatibility services still live under `src/server`; they should be consumed through their existing boundaries rather than moved during Kootaj Board work.

Shipment routing is composed by `server/src/modules/shipments/shipment.routes.js`. It registers list, create, archive, tracking, V2 profile, workflow-step, task, detail, and operational-update routes. The shipment module also exports a small `kootaj` submodule, but that submodule currently contains field mappings/defaults rather than a complete route or repository boundary.

### Current shipment data layers

The current shipment view is assembled from several sources:

- `shipments`: canonical identity and operational fields such as shipment code, customer relationship, status, origin, destination, assignment, timers, archive state, direction, and transport mode.
- `shipment_kootaj_details`: normalized Iran import, customs, order-registration, banking, declaration, permit, payment, release, and internal-note fields; one row per organization and shipment.
- `shipment_v2_profiles`: one JSON profile per organization and shipment for V2 sections such as base, goods, declaration/kootaj, permits, payments, banking, and notes.
- `shipment_workflow_instances` and step states: active workflow, current step, customs route, progress, blockers, and workflow history.
- `tasks`: shipment-linked task counts, assignments, due dates, and task history.
- `documents`: shipment-linked document counts and visibility.
- `customers`: canonical customer relationship and code/private details.
- tenant-scoped `user_records` commercial-card compatibility records.
- `audit_logs`: append-only before/after/metadata records for important mutations.

### Daily Status projection

`server/src/modules/daily-status/daily-status.repository.js` already builds a live board row from those sources. It does not create frontend-only rows. The response groups fields into:

- `shipment`
- `customer`
- `kootaj`
- `v2Profile`
- `baseInfo`
- `commercialCard`
- `workflow`
- `tasks`
- `documents`
- `links`

The query is scoped by `s.organization_id`, excludes archived and exited shipments by default, joins every related table by both shipment/entity ID and organization ID, and orders rows using the shared shipment timer ordering.

The current list has a hard maximum/default of 50 records and no cursor or offset pagination. Search covers shipment code, allowed customer fields, kootaj identifiers, selected V2 base fields, and commercial-card labels. Filters currently cover shipment, commercial card, customs route, and shipment status.

### Existing Kootaj aliases

The backend already exposes:

- `GET /api/kootaj-board`
- `PATCH /api/kootaj-board/:shipmentId`

These are aliases of the Daily Status handlers. The frontend route `/kootaj-board` is protected but currently redirects to `/daily-status`. This is a useful compatibility base: Phase 1 can promote the reserved frontend route without inventing another backend projection.

## Relevant existing files and modules

| Area | Current source | Relevance |
| --- | --- | --- |
| Route reservation | `src/App.tsx` | Protects `/kootaj-board` and currently redirects it to Daily Status. |
| Existing board UI | `src/app/DailyStatus.tsx` | Responsive master/detail operations page; should not be cloned wholesale. |
| Board column metadata | `src/app/dailyStatusColumns.tsx` | Reusable labels, status options, priority concepts, and read functions. |
| Board API client | `src/lib/dailyStatusApi.ts` | Existing list/get/update client for the live projection. |
| Board DTO/types | `src/types/index.ts` | `DailyStatusBoardRow`, `DailyStatusKootajProfile`, and `DailyStatusPatch`. |
| Board field constants | `src/shared/daily-status-board.js` | Allowlists, enum values, date fields, and numeric fields. |
| Daily Status routes | `server/src/modules/daily-status/daily-status.routes.js` | Authentication, permissions, aliases, audit source, and error mapping. |
| Daily Status repository | `server/src/modules/daily-status/daily-status.repository.js` | Current projection, tenant joins, transaction, validation hooks, and synchronization logic. |
| Daily Status validation | `server/src/modules/daily-status/daily-status.validation.js`, `src/server/request-schemas.js` | Strict query and patch schemas. |
| Kootaj field mapping | `server/src/modules/shipments/kootaj/*` | DB column mapping and V2 base defaults/patch helpers. |
| Canonical shipment repository | `server/src/modules/shipments/shipment.repository.js` | Shipment DTO and tenant-scoped list/detail queries. |
| Canonical shipment updates | `server/src/modules/shipments/update-operational-fields/shipment-operational.routes.js` | Existing shipment update permission, validation, and audit pattern. |
| V2 repository/routes | `server/src/modules/shipments/shipment-v2.repository.js`, `shipment-v2.routes.js` | V2 profile ownership, section writes, reference validation, and audit behavior. |
| Canonical shipment detail | `src/app/ShipmentDetail.tsx` | Canonical `/shipments/:id` UI backed by the former V2 profile sections and an overlapping editor. High-risk integration point. |
| Historical detail integration | Removed with the legacy detail page | Former embedded detail-to-board integration through Daily Status APIs; no longer the canonical shipment detail page. |
| Form field registry | `src/shared/shipment-form-fields.js` | Canonical/custom field definitions and shipment-type templates. |
| Import profile registry | `src/components/shipments/iranImportProfileFields.ts` | Existing labels, editor types, search aliases, and section definitions. |
| Customer privacy mapper | `server/src/modules/customers/customer.mapper.js` | CEO-only private detail policy and code-only DTO behavior for other users. |
| Audit implementation | `server/src/modules/audit/*`, audit functions in `src/server/db.js` | Sanitized append-only audit storage and tenant-scoped read routes. |
| RBAC contract | `tests/e2e/rbac-policy.ts` | Documents route families, permissions, and tenant scope. |
| Existing board tests | `tests/e2e/daily-status-board.spec.ts` | Best source for tenant, validation, audit, sync, mobile, and public-leakage patterns. |
| V2 tests | `tests/e2e/shipment-v2.spec.ts` | Best source for section editing, tenant isolation, currency pairs, and responsive V2 behavior. |
| Current architecture note | `docs/features/daily-status-board-mvp.md` | Explicitly defines the current board as a shipment-backed live projection. |

## Existing reusable fields and flows

### Canonical shipment fields

The following should continue to belong to `shipments` and existing shipment services:

- shipment code and Shamsi sequence metadata;
- customer relationship (`customer_id`) and stored compatibility name;
- shipment status;
- shipment direction, transport mode, and shipment type;
- origin and destination;
- assigned manager;
- priority;
- estimated delivery/free-time/timer values;
- active, exited-archive, post-exit, and full archive state.

Kootaj Board may display these fields. It should only edit them through the canonical shipment mutation/service path, not by adding duplicate board columns.

### Reusable kootaj profile fields

`shipment_kootaj_details` already supports most expected import/customs columns:

- order-registration number, dates, expiry, status, proforma, seller, goods ID, HS summary, and permit status;
- currency source/type/amount and bank tracking/process fields;
- insurance, inspection, booking, bill of lading, transport document, pre-alert, container/goods summaries, package count, and weights;
- arrival, manifest, delivery order, warehouse, and receipt fields;
- declaration reference/date, cotage number/date, customs office/status/route, evaluator/expert, inspection/lab/tariff/valuation statuses;
- legal, standard, health, and quarantine permit statuses;
- customs/tax payment data, duties/tax amounts, payment reference, and related charge statuses;
- loading permit, truck, driver, gate pass, release, exit, delivery, and internal note;
- validated custom fields from active shipment form templates;
- tenant-validated commercial-card relationship.

These fields should remain the canonical current-state home for Kootaj Board unless a deliberate migration moves a specific concept elsewhere.

### Reusable derived fields

The current projection can reuse without duplication:

- customer code and an authorized display label;
- active workflow phase, step, progress, and route;
- open/overdue task counts and assigned user names;
- total/customer-visible document counts;
- shipment timer ordering;
- shipment/customer/commercial-card detail links;
- form-template custom-field visibility and validation;
- `updated_at` and actor IDs from canonical records.

### Existing write flow

Daily Status patching already:

1. derives organization from the authenticated tenant context;
2. requires `shipments.update`;
3. parses a strict Zod schema;
4. locks the tenant-owned shipment in a transaction;
5. validates commercial-card ownership and template custom fields;
6. upserts `shipment_kootaj_details`;
7. updates selected canonical shipment fields;
8. updates or initializes the V2 base section for selected base fields;
9. returns a recomposed row;
10. writes a bounded `daily_status.update` audit event with changed fields.

This transaction is the strongest starting point for a canonical Kootaj Board write service. It should be extracted/extended rather than copied into a new page-specific repository.

## Quotation, rates, billing, and subscription naming

The remaining domains are distinct and should stay separate from Kootaj Board:

- `src/lib/subscriptionPlans.ts`: LogisticPlus product subscription catalog and plan limits.
- `server/src/modules/billing`: tenant subscriptions, platform-issued invoices, and manual payment state.
- `server/src/modules/quotations`: customer freight quotations and quotation-to-shipment conversion. The backend remains active while the UI is disabled.
- `server/src/modules/rates` and `src/app/RatesAndTariffs.tsx`: global reference currency rates and tariff catalog.

Kootaj customs amounts are shipment operational data, not product subscription pricing, billing invoices, freight quotations, or the global rate catalog. They may link to a tariff/rate reference later, but should not reuse billing tables.

There is a naming collision to resolve before the quotation UI is enabled: `QuotageManagement.tsx` and the disabled navigation label `مدیریت کوتاژ (استعلام قیمت)` use “کوتاژ” for quotation management, while the upcoming feature uses “کوتاژ” in the customs sense. The quotation surface should eventually be renamed to `QuotationManagement` and labeled as `استعلام نرخ / پیشنهاد قیمت`. This is not required for Kootaj Board Phase 1 and should be a separate PR.

## Missing data-model and contract pieces

### 1. V2/kootaj field ownership

The highest-risk gap is overlapping storage:

- V2 `declarationKootaj` stores cotage number, route, date, and monetary values in JSON.
- V2 `payments` stores customs payment booleans, amounts, currencies, difference amounts, and tax status.
- V2 `banking` stores bank/branch/payment instrument fields.
- V2 `notes` stores an internal note.
- `shipment_kootaj_details` stores overlapping cotage, route, date, payment, bank, and internal-note values.

V2 non-base section updates do not synchronize these columns. Daily Status updates do not synchronize the corresponding V2 non-base sections. Enabling Kootaj Board editing before resolving this creates last-writer ambiguity.

### 2. Customer display policy

Daily Status and shipment queries select `customer_display_name`, but DTO composers intentionally expose customer code as the name. Existing privacy tests require non-CEO users to receive code-only customer data. The business requirement to show names instead of numeric IDs therefore needs an explicit policy:

- CEO/private-detail-authorized users may receive company/contact display name plus customer code.
- other users should receive customer code, never a raw UUID when a code exists;
- if operations staff must see company names, add an explicit permission/policy change and tests rather than bypassing the privacy mapper.

### 3. Optimistic concurrency

Neither `shipment_kootaj_details` nor V2 section updates expose a row version or require an expected timestamp. Two staff members can overwrite each other’s work. A multi-user daily board needs version-based conflict detection and a visible refresh/retry flow.

### 4. Daily board-specific state and history

The current kootaj profile stores current shipment facts. It does not model a daily board entry, daily owner note, next action, attention state, follow-up time, or immutable end-of-day snapshot. Audit logs provide change history but are not an efficient daily-board reporting model.

Do not put arbitrary board fields into the existing `metadata` JSON patch. Add explicit fields or a dedicated table after the real Excel columns are approved.

### 5. Pagination and stable large-board behavior

The current API returns at most 50 rows. There is no cursor, total count, page metadata, or `updatedSince` support. A production board needs stable server-side pagination and indexes matching the final filters/sorts.

### 6. Payment/currency semantics

`customsPaymentStatus` and the legacy `taxPaymentStatus` currently map to the same `tax_payment_status` column. V2 uses a different, richer payment shape. Duties and tax amounts in `shipment_kootaj_details` do not have explicit paired currency columns, while V2 amounts do. The final schema must preserve explicit currency beside every monetary value.

### 7. Operational metadata gaps

Useful board data is incomplete or inconsistent:

- `documents.missingRequiredCount` is currently hardcoded to zero;
- kootaj updates expose `updatedById` but not a reliable kootaj updater display name;
- blockers are not summarized in the board DTO;
- there is no dedicated board permission or assigned-only visibility mode;
- audit insertion occurs after the domain transaction, so mutation and audit are not atomic.

## Canonical versus board-specific writes

| Field/domain | Recommended owner | Kootaj Board behavior |
| --- | --- | --- |
| Shipment code, customer relationship, status, origin, destination, manager, timer | `shipments` through shipment service | Display; mutations call canonical shipment service. |
| Current workflow step, blockers, workflow route | workflow module | Display; mutations call workflow service. Do not write an independent workflow state. |
| Cotage/declaration/order/bank/permit/release facts | `shipment_kootaj_details` | Canonical current-state read/write. |
| Goods row detail and V2-only presentation data | `shipment_v2_profiles` until normalized | Display through an adapter; do not duplicate in board storage. |
| Overlapping V2/kootaj fields | one canonical field registry and synchronization service | Block broad editing until ownership/backfill is defined. |
| Customer name/code | customer module/privacy mapper | Read-only, policy-filtered display. |
| Documents and required-document status | documents/form-template modules | Read-only summary and links. |
| Tasks, owner, due date | tasks module | Read-only summary; create/update via task APIs. |
| Commercial card/Malvani relationship | business-entity compatibility module | Explicit allowlisted relationship with tenant ownership validation. |
| Daily attention, next action, follow-up, per-day note | future board-entry table | Board-specific and shipment-linked; never copied into `shipments`. |
| Historical change trail | `audit_logs`; optional immutable daily snapshots | Audit every write; snapshot only if reporting requirements justify it. |

## Recommended database design (no migration in this inspection)

### Keep the current-state profile

Retain `shipment_kootaj_details` as the one-to-one canonical current import/customs profile. Do not create a second wide table containing the same shipment and kootaj columns.

A future additive migration should consider:

- `row_version BIGINT NOT NULL DEFAULT 1`, incremented on every profile write;
- a distinct `customs_payment_status` after defining safe backfill semantics from `tax_payment_status`;
- `duties_currency` and `tax_currency`, with constrained currency codes;
- indexes for the final board filters, likely `(organization_id, customs_route, updated_at DESC)`, `(organization_id, customs_status, updated_at DESC)`, and `(organization_id, release_status, updated_at DESC)`;
- an updater join/index only if query measurements justify it.

### Add board-only daily state only when confirmed

If the Excel workflow includes daily operational annotations that are not shipment facts, use a narrow table such as `shipment_kootaj_board_entries`:

- `id`
- `organization_id`
- `shipment_id`
- `operational_date DATE`
- `attention_status`
- `next_action`
- `follow_up_at TIMESTAMPTZ`
- `owner_user_id`
- `note`
- `row_version BIGINT`
- `created_by_id`, `updated_by_id`
- `created_at`, `updated_at`

Recommended constraints/indexes:

- unique `(organization_id, shipment_id, operational_date)`;
- all tenant-owned foreign keys include organization-aware repository checks;
- `(organization_id, operational_date, updated_at DESC)`;
- `(organization_id, owner_user_id, follow_up_at)` for active follow-up views;
- constrained enums and note length;
- Gregorian `DATE` storage with shared Shamsi UI rendering.

This table must not copy customer name, shipment status, cotage number, documents, tasks, or other canonical fields.

### Optional immutable snapshots

Only add `shipment_kootaj_board_snapshots` if users must reconstruct/export exactly what the board showed on a past date. Store an allowlisted server-generated snapshot, organization/shipment/date, schema version, and creator timestamp. Snapshots are reporting artifacts, never a write source. Existing audit logs remain the field-level change history.

### Migration strategy for a later phase

- Add new columns/tables in a new forward migration; never edit the existing Daily Status, V2, or Hamyar migrations.
- Backfill nullable/new fields in bounded, idempotent steps.
- Add constraints only after backfill validation.
- Keep old readers working during rollout.
- Do not drop overlapping V2 JSON keys until all writers use the canonical service and production data has been verified.

## API design proposal

### Phase 1 read API

Promote the existing alias while preserving Daily Status compatibility:

`GET /api/kootaj-board`

Suggested query contract:

- `q`
- `shipmentStatus`
- `customsRoute`
- `customerId`
- `assignedManagerId`
- `attentionStatus` after board-entry storage exists
- `updatedSince`
- `cursor`
- `limit` with a bounded maximum

Suggested response:

```json
{
  "ok": true,
  "data": {
    "rows": [],
    "page": { "nextCursor": null, "hasMore": false },
    "capabilities": { "canView": true, "canUpdate": false }
  }
}
```

Keep the existing grouped row DTO. Add `customer.displayName` only through the approved privacy policy, `rowVersion` when available, and server-provided capabilities rather than duplicating client permission logic.

### Detail and mutation API

Recommended later endpoints:

- `GET /api/kootaj-board/:shipmentId`
- `PATCH /api/kootaj-board/:shipmentId`
- `GET /api/kootaj-board/:shipmentId/history?cursor=...`
- `PUT /api/kootaj-board/:shipmentId/days/:operationalDate` for explicit board-only daily state, if required

Mutation requests should contain an allowlisted patch plus `expectedVersion`. Return `409 KOOTAJ_ROW_CONFLICT` with the current row/version when stale. Do not accept `organizationId`, arbitrary field names, SQL column names, or generic relationship metadata from the client.

### Service boundary

Create one domain service that:

- locks the tenant-owned shipment/profile;
- validates all related IDs in the same tenant;
- routes canonical shipment/workflow writes to their owning services;
- writes kootaj-owned fields;
- synchronizes or removes ambiguity for overlapping V2 fields;
- increments row version;
- returns the recomposed row;
- records a sanitized audit event with source `kootaj-board` and changed field names.

Daily Status and canonical `ShipmentDetail` should call the same service for overlapping fields. Route aliases should remain thin.

Bulk update/import endpoints should be deferred. If later added, each row must be independently tenant-scoped, validated, version-checked, audited, and reported as success/failure; never trust a workbook-supplied organization ID.

## Frontend page and component proposal

### Page structure

Create a dedicated `KootajBoard` page for `/kootaj-board`, but reuse the existing DTO, API projection, field/status registries, shared date field, badges, and links.

Recommended layout:

- RTL page header with row counts and blocked/follow-up summaries;
- debounced search and compact filters;
- desktop priority-column list plus selected-row details drawer/panel;
- mobile compact cards and a full-screen/sheet detail editor;
- customer display name as the primary label when authorized, customer code as secondary, and no raw UUID fallback unless no business identifier exists;
- direct links to canonical `/shipments/:id`, customer detail when authorized, documents, tasks, and commercial card;
- explicit loading, empty, error, save, stale-conflict, and permission states;
- no body-level horizontal scrolling.

An Excel-like workflow does not require an HTML spreadsheet. Preserve fast scanning with compact rows, wrapping, priority columns, section drawers, and keyboard-friendly editing. Do not render every available field as a permanently visible column.

### Component boundaries

Prefer small new components rather than copying `DailyStatus.tsx`:

- `KootajBoardPage`
- `KootajBoardToolbar`
- `KootajBoardRow`
- `KootajBoardMobileCard`
- `KootajBoardDetailsPanel`
- `KootajFieldEditor` backed by the existing field registry
- `KootajConflictDialog`

Keep server data in page-local/query state. Do not add another large global store slice or use the mock/store compatibility bridge as the source of truth.

### Editing rollout

Phase 1 should be read-only. Later editing should support:

- explicit edit/save/cancel;
- changed-field-only patches;
- per-row pending state;
- optimistic-concurrency conflicts;
- shared Shamsi date inputs;
- explicit currency selectors beside every amount;
- server validation messages mapped to fields;
- no optimistic success toast before the server returns the recomposed canonical row.

## Relationship to Daily Status

Daily Status already behaves as a general operational board and is the correct backend foundation. Kootaj Board should be a specialized presentation, not a separate source.

Recommended relationship:

- both pages read the same composed shipment-backed rows;
- both pages use the same canonical write service when editing is enabled;
- Daily Status keeps its current route, behavior, compact list, and detail panel;
- Kootaj Board emphasizes customs/order/payment/release fields and later daily board annotations;
- the existing `/api/kootaj-board` aliases remain compatible;
- changes from either page appear immediately on the other after refresh/revalidation;
- no `daily_status` database table is needed.

The existing `docs/features/daily-status-board-mvp.md` contract should be treated as the baseline: board rows are live shipment projections and linked-module values are derived rather than copied.

## Relationship to ShipmentDetail

`/shipments/:id` now renders the canonical `ShipmentDetail` page backed by the former V2 profile sections. Compatibility routes such as `/shipments/:id/legacy` and `/shipments/:id/v2` should redirect to the canonical URL instead of rendering separate detail pages.

`ShipmentDetail` already edits overlapping base, declaration, permit, payment, banking, and note sections. Its base updates synchronize selected canonical shipment fields, but its non-base updates remain V2 JSON-only. Kootaj Board cannot safely become another full editor until this drift is resolved.

Recommended integration:

1. Do not broadly refactor `src/app/ShipmentDetail.tsx` during read-only Phase 1.
2. Link every board row to `/shipments/:id`.
3. After the canonical write service exists, add a compact Kootaj summary/open-board action to Shipment Detail rather than embedding another large form.
4. Move overlapping detail section writes behind the shared service one section at a time, with bidirectional E2E assertions.
5. Keep goods rows and genuinely V2-only fields in V2 until a deliberate normalization migration exists.

## Tenant, security, validation, permission, and audit requirements

### Tenant isolation

- Derive organization from the authenticated session only.
- Reject client-supplied tenant selectors through the existing tenant-conflict middleware.
- Include `organization_id` in every shipment, profile, board-entry, customer, user, workflow, task, document, and relationship read/write condition.
- Return 403/404 for cross-tenant access without confirming that another tenant’s record exists.
- Validate commercial card, Malvani profile, owner user, customer, and any future relationship server-side.

### Permissions

Read-only Phase 1 can use `shipments.view_all`, matching Daily Status. Before editing, decide whether `shipments.update` is sufficient or whether enterprise separation requires:

- `kootaj_board.view`
- `kootaj_board.update`
- `kootaj_board.export`

If dedicated permissions are added, update forward migrations/seeds, role grants, admin UI, route policy tests, and production seed verification together. Do not silently broaden seeded roles.

### Customer privacy

Use the customer mapper policy. Never expose phone, email, address, referrer, notes, or private company/contact names to users who currently receive code-only customer DTOs. Any decision to show company names to operations roles must be explicit and covered by `customer-privacy.spec.ts`.

### Validation

- Continue strict Zod schemas with unknown-key rejection.
- Normalize dates to real Gregorian ISO dates server-side; render/edit with the shared Shamsi UI.
- Constrain enum values and non-negative numbers both in request validation and database checks.
- Pair all monetary values with explicit currencies.
- Bound text, array, page-size, and bulk-operation sizes.
- Validate expected row version for writes.

### Audit

Every mutation should record:

- authenticated actor and trusted organization;
- action such as `kootaj_board.update`;
- shipment resource ID;
- source surface;
- changed field names;
- sanitized bounded before/after values;
- request ID, IP, and user agent through existing request context;
- conflict/rejection behavior without storing sensitive payloads.

For stronger enterprise guarantees, make domain mutation and audit insertion atomic or use an outbox. The current route-level audit call occurs after the data transaction and can leave a successful write without its audit if audit insertion fails.

### Public data

Kootaj fields, board notes, commercial-card details, payment values, internal task/document state, and audit data remain private. Do not extend public tracking DTOs as part of this feature.

## E2E test plan

Copy patterns from `daily-status-board.spec.ts`, `shipment-v2.spec.ts`, `shipment-canonical-data.spec.ts`, `customer-privacy.spec.ts`, `audit-logging.spec.ts`, `security.spec.ts`, and `tests/e2e/rbac-policy.ts`.

### Phase 1 read-only coverage

- protected `/kootaj-board` route renders for an authorized user;
- anonymous users redirect to login;
- API requires `shipments.view_all`;
- tenant A cannot list or open tenant B rows;
- spoofed `organizationId` is rejected;
- `/api/kootaj-board` and `/api/daily-status` return equivalent canonical values during compatibility;
- customer display follows CEO/non-CEO privacy rules and avoids numeric-only IDs where a permitted name/code exists;
- shipment, document, customer, task, and commercial-card links target the canonical pages;
- search and filters are tenant-scoped;
- desktop and mobile pages have no body-level horizontal overflow;
- loading, empty, and API-error states render useful actions;
- public tracking payload still excludes kootaj and board internals.

### Editing coverage for later phases

- strict unknown-key, enum, impossible date, negative amount, missing currency, and relationship validation;
- board-to-Daily Status and Daily Status-to-board synchronization;
- board-to-ShipmentDetail and ShipmentDetail-to-board synchronization for every overlapping canonical field;
- canonical shipment status/origin/destination updates flow through shipment APIs and timer behavior remains correct;
- workflow route updates use the workflow service;
- stale `expectedVersion` returns 409 and does not overwrite the newer row;
- save/cancel/success/error/conflict UI behavior;
- permission matrix for view/update/export;
- audit event source, changed fields, before/after values, redaction, and tenant-scoped audit reads;
- task/document derived counts refresh without copying data;
- cursor pagination does not duplicate or skip records under stable sorting;
- migration verification on fresh and current-schema test databases;
- daily entry uniqueness and history/snapshot behavior if those tables are added.

## High-risk files to avoid heavily modifying

- `src/server/db.js`: large legacy aggregate and shared audit/permission compatibility layer.
- `server/src/server.js`: large composition root; only add narrow dependency wiring.
- `src/app/DailyStatus.tsx`: large working board with merged customer changes and extensive UI coverage.
- `src/app/ShipmentDetail.tsx`: canonical detail page with many section editors; integrate incrementally.
- `src/store/useAppStore.ts` and `src/store/useMockStore.ts`: large state/compatibility surfaces; do not make Kootaj Board dependent on bootstrap state.
- `src/server/request-schemas.js`: central compatibility export; prefer a modular schema with a narrow re-export if architecture permits.
- `src/shared/shipment-form-fields.js`: broad canonical registry used by templates and multiple shipment types.
- `db/schema.sql` and `db/migrations/*`: update schema only with a new forward migration in an implementation phase; never rewrite history.

## Risks and rollback plan

| Risk | Mitigation | Rollback |
| --- | --- | --- |
| V2 and kootaj values diverge | Read-only first; define ownership and shared service before edits; add bidirectional tests. | Disable editing/feature flag; retain canonical rows and Daily Status. |
| Customer private names leak | Reuse privacy mapper and permission-aware DTO; test CEO and employee responses. | Revert to customer code-only display without schema rollback. |
| Concurrent staff overwrite rows | Add row version and 409 conflict handling before multi-user edits. | Disable edits; reads remain available. |
| Wide board causes horizontal scrolling | Priority columns, wrapping, detail panel, and mobile cards; viewport E2E. | Hide lower-priority columns or revert route to Daily Status. |
| Large query slows under production volume | Cursor pagination, matching indexes, query-plan measurement, bounded filters. | Reduce page size/filters; keep existing Daily Status endpoint. |
| Audit gap after successful write | Move audit into transaction/outbox in the write-service phase. | Disable new mutations; data remains intact. |
| Migration/backfill ambiguity | Additive nullable rollout, idempotent backfill, verification before constraints. | Leave new columns/tables unused; never drop existing data. |
| Navigation or route instability | Feature flag the new page and preserve `/daily-status`. | Restore `/kootaj-board` redirect in one frontend change. |
| Excel columns are misunderstood | Obtain a sanitized workbook/column dictionary before board-specific schema. | Keep Phase 1 read-only and make no data migration. |

No destructive rollback should be required. New database structures must be additive, and existing V2-profile/kootaj data should remain readable until production verification is complete.

## Recommended implementation phases

### Phase 1 — Read-only specialized board

- Create a dedicated `/kootaj-board` page behind a feature flag.
- Reuse `GET /api/kootaj-board` and the grouped Daily Status DTO.
- Apply the existing customer privacy policy while preferring permitted display name/code over raw ID.
- Add focused search/filter, canonical links, loading/error/empty states, and responsive no-overflow UI.
- Add route/RBAC/tenant/privacy/public-leakage/mobile E2E coverage.
- Do not add editing or migrations.

### Phase 2 — Canonical ownership and write service

- Produce an explicit field ownership map from the approved Excel columns.
- Create one shipment/kootaj write service used by Kootaj Board, Daily Status, and overlapping Shipment Detail section mutations.
- Resolve `customsRoute`, payment status, monetary currency, notes, and date ownership.
- Keep legacy API aliases but make routes thin.
- Add bidirectional synchronization and audit tests.

### Phase 3 — Concurrency and board-only daily state

- Add a forward-safe migration for row version, missing currency/status semantics, required indexes, and only confirmed board-entry fields.
- Add 409 conflict handling and UI refresh/retry.
- Add daily entry/history behavior only if confirmed by the workbook/workflow.
- Run fresh/current migration verification and backfill checks.

### Phase 4 — Controlled editing

- Enable changed-field-only editing for a small allowlist.
- Add shared Shamsi/currency editors, save/cancel/error/conflict states, and permission checks.
- Add a compact Shipment Detail summary/open-board integration without broadly refactoring the page.

### Phase 5 — Scale and operational reporting

- Add cursor pagination, measured indexes, saved filters, and optional export.
- Add immutable daily snapshots only if historical exact-view reporting is required.
- Add controlled bulk import/update only after row-level validation, audit, idempotency, and partial-failure UX are designed.

## Exact next Codex prompt for Phase 1 implementation

```text
You are working in the LogisticPlus repo on main.

Goal:
Implement Phase 1 of Kootaj Board as a read-only, shipment-backed operational page. Do not add editing or migrations.

Read first:
- docs/inspections/kootaj-board-readiness.md
- docs/features/daily-status-board-mvp.md
- server/src/modules/daily-status/*
- src/lib/dailyStatusApi.ts
- src/types/index.ts DailyStatus types
- tests/e2e/daily-status-board.spec.ts

Rules:
1. Keep /daily-status behavior unchanged.
2. Do not broadly refactor ShipmentDetail.
3. Do not edit historical migrations or legacy compatibility files.
4. Reuse GET /api/kootaj-board and the existing grouped Daily Status DTO; do not create duplicate storage or a second backend projection.
5. Do not add Kootaj Board write endpoints or enable PATCH from the new page.
6. Preserve tenant scope, shipments.view_all permission, customer privacy, and public tracking non-leakage.
7. Use only the privacy-filtered customer label/code already returned by the DTO; never fetch private customer data client-side. Prefer the returned name when present, then customer code, and use an opaque ID only as a last fallback.
8. Keep the UI Persian RTL, compact, responsive, and free of body-level horizontal scrolling.

Tasks:
1. Add a KOOTAJ_BOARD_UI_ENABLED feature flag enabled for this phase.
2. Create a dedicated lazy-loaded src/app/KootajBoard.tsx page for /kootaj-board and replace the redirect in src/App.tsx.
3. Reuse existing API/types/status options and small shared UI primitives. Do not copy DailyStatus.tsx wholesale.
4. Show scan-critical fields: shipment code, permitted customer display, shipment status, workflow step, customs route, cotage number, commercial card, open/overdue tasks, document count, and last update.
5. Add debounced search, shipment-status/customs-route filters, refresh, loading, empty, and error states.
6. Link each row to /shipments/:id and expose existing safe customer/document/task links where the DTO supports them.
7. Use priority columns plus a detail panel on desktop and compact cards on mobile; no horizontal page overflow.
8. Add a focused tests/e2e/kootaj-board.spec.ts covering protected access, tenant-safe API alias use, customer privacy-safe display, canonical shipment links, empty/error states where practical, and desktop/mobile no-overflow behavior.
9. Add /api/kootaj-board to tests/e2e/rbac-policy.ts as an own-organization shipments.view_all route.

Validation:
- npm run lint
- npm run build
- npm run test:e2e:setup
- npx playwright test tests/e2e/kootaj-board.spec.ts tests/e2e/daily-status-board.spec.ts tests/e2e/customer-privacy.spec.ts
- git diff --check

Deliver:
- files changed
- checks and exact results
- confirmation that no migrations, edits, or runtime changes to Daily Status/ShipmentDetail were introduced
- migration/deployment notes
```

## Inspection conclusion

The repository already contains most of the backend foundation for Kootaj Board. The safest product move is to expose that foundation through a dedicated read-only route first, validate the real staff workflow and workbook columns, then unify overlapping writers before adding edits. A new spreadsheet clone or broad ShipmentDetail refactor would create avoidable data drift and should not be the starting point.
