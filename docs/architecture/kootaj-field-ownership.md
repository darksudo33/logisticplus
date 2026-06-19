# Kootaj field ownership

## Executive decision

Kootaj Board Phase 2 should edit shared canonical shipment operation fields, not local duplicated board fields.

The Phase 1 board is intentionally read-only. It renders `GET /api/kootaj-board`, which is an alias of the Daily Status projection. That is the right direction: Daily Status, Kootaj Board, and Shipment Detail should continue to read and write the same shipment/operation source of truth.

Phase 2 must not introduce a spreadsheet-only persistence model. If Kootaj Board edits a field that is also visible in Shipment Detail or Daily Status, the edit must go through the same backend service or shared repository function used by the other surfaces.

## Current architecture summary

- Frontend page: `src/app/KootajBoard.tsx`
- API client: `src/lib/dailyStatusApi.ts`
- Read endpoint: `GET /api/kootaj-board`
- Backend route: Daily Status route alias handled by the same list handler as `GET /api/daily-status`
- Backend projection: `server/src/modules/daily-status/daily-status.repository.js`
- Shared field allowlist: `src/shared/daily-status-board.js`
- Request validation: `src/server/request-schemas.js`
- Canonical shipment detail UI: `src/app/ShipmentDetail.tsx`
- Shipment V2 profile API used by detail page: `src/lib/shipmentV2Api.ts`
- Shipment V2 backend: `server/src/modules/shipments/shipment-v2.routes.js` and `server/src/modules/shipments/shipment-v2.repository.js`

The current board row is a projection over existing shipment-related data:

- `shipments`
- `shipment_kootaj_details`
- `shipment_v2_profiles`
- workflow projection
- task count projection
- document count projection
- customer privacy-safe projection
- commercial card relationship/display projection

## Ownership definitions

| Ownership type | Meaning |
| --- | --- |
| Shipment canonical field | Stored on the shipment record and shared across shipment list/detail/status flows. |
| Kootaj operation profile | Stored on `shipment_kootaj_details`; operational customs/release/card fields. |
| Shipment V2 profile section | Stored in `shipment_v2_profiles.sections_json`; currently used by canonical Shipment Detail sections. |
| Derived projection | Computed from related records or multiple fields; not directly editable. |
| Relationship display | A foreign-key relationship plus safe display fields; board may edit the relationship only when validated server-side. |
| Future board history/event | Operational notes, daily follow-up state, or event history that should not overwrite canonical fields. |

## Field ownership table

This table covers every data field currently shown or used by `/kootaj-board`, including summary tiles and row controls.

| Kootaj Board field | Current DTO path | Source of truth | Editable from Kootaj Board Phase 2 | Editable from Shipment Detail | Editable from Daily Status | Derived/read-only | Audit history required | Concurrency/version required | Rule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Total rows summary | `rows.length` | Current API result set | No | No | No | Yes | No direct audit | No | Projection/UI count only. |
| Cotage registered summary | rows where `kootaj.cotageNumber` exists | `shipment_kootaj_details.cotage_number` plus current result set | No direct aggregate edit | No direct aggregate edit | No direct aggregate edit | Yes | Audit underlying cotage edits | Yes, on underlying cotage edits | Aggregate must stay derived. |
| Open tasks summary | sum of `tasks.openCount` | `tasks` table/status projection | No | No | No | Yes | Audit task mutations in task module | Yes, in task module | Board must not write task counts. |
| Blocked summary | `kootaj.customsStatus` / `kootaj.releaseStatus` | `shipment_kootaj_details` status fields | No direct aggregate edit | No direct aggregate edit | No direct aggregate edit | Yes | Audit underlying status edits | Yes, on underlying status edits | Aggregate must stay derived. |
| Search text | query param `q` | UI/API query only | No | No | No | Yes | No | No | Filter control, not shipment data. |
| Shipment status filter | query param `shipmentStatus` | UI/API query only | No | No | No | Yes | No | No | Filter control, not shipment data. |
| Customs route filter | query param `customsRoute` | UI/API query only | No | No | No | Yes | No | No | Filter control, not shipment data. |
| Shipment/reference number | `shipment.code`, fallback `baseInfo.code` | Shipment canonical identity/reference field | No for Phase 2 | Yes, only through Shipment Detail base workflow if supported | No recommended Phase 2 edit | No | Yes, if ever edited | Yes | Treat as identity/reference. Do not edit from board unless a dedicated shipment reference flow exists. |
| Shipment detail link | `links.shipmentDetailUrl`, fallback `/shipments/:id` | Route derived from shipment id | No | No | No | Yes | No | No | Link must always target canonical `/shipments/:id`. |
| Customer label | `customer.name`, `baseInfo.customerName`, `customer.customerCode`, `baseInfo.customerCode`, `customer.id` | Customer DTO privacy-safe projection | No | No, except customer module/relationship flows | No | Yes for board | Audit in customer/customer relationship module | Yes in owning module | Display only. Do not bypass customer DTO privacy rules. |
| Customer secondary code | `customer.customerCode`, `baseInfo.customerCode` | Customer DTO privacy-safe projection | No | No | No | Yes | No direct audit | No | Display only. |
| Origin | `shipment.origin`, fallback `baseInfo.origin` | Shipment canonical route field; V2 base mirrors/extends it | Defer for Phase 2 unless shared service handles route writes | Yes, via Shipment Detail base if exposed/supported | Yes, via Daily Status `baseInfo.origin` | No | Yes | Yes | If editable later, write through the shared shipment operation service. |
| Destination/delivery port | `shipment.destination`, fallback `baseInfo.deliveryPort` / `baseInfo.dischargePort` | Shipment canonical destination plus V2 base port fields | Defer for Phase 2 unless shared service handles route writes | Yes, via Shipment Detail base if exposed/supported | Yes, via Daily Status `baseInfo.deliveryPort` / `baseInfo.dischargePort` | No | Yes | Yes | Avoid splitting destination and port semantics across pages. |
| Customs route | `kootaj.customsRoute`, fallback `workflow.route` | `shipment_kootaj_details.customs_route`; workflow route is fallback/derived | Yes | Yes, currently through Shipment Detail `declarationKootaj.customsRoute` | Yes | No when stored; fallback is derived | Yes | Yes | Phase 2 should edit the stored Kootaj/customs route through a shared service and keep Shipment Detail consistent. |
| Shipment status | `shipment.status` | Shipment canonical status | Defer for initial Phase 2 | Yes, via Shipment Detail base status | Yes, via Daily Status `baseInfo.status` | No | Yes | Yes | Status can affect timers/workflow. Keep out of the first editable Kootaj subset unless status-transition rules are reused exactly. |
| Latest operational status | `kootaj.customsStatus`, `kootaj.releaseStatus`, fallback `workflow.currentStepLabel` / `baseInfo.currentStage` | Stored Kootaj statuses plus workflow/base projections | Partially yes: customs/release statuses only | Not currently for customs/release statuses; `currentStage` from detail base | Yes | Composite display is derived | Yes for stored status edits | Yes | Display combines multiple owners. Edits must target the specific underlying field, not the label string. |
| Customs status | `kootaj.customsStatus` | `shipment_kootaj_details.customs_status` | Yes | No current direct field in Shipment Detail | Yes | No | Yes | Yes | Recommended Phase 2 editable field. |
| Release status | `kootaj.releaseStatus` | `shipment_kootaj_details.release_status` | Yes | No current direct field in Shipment Detail | Yes | No | Yes | Yes | Recommended Phase 2 editable field. |
| Workflow phase | `workflow.currentPhase` | Workflow state/projection | No | No direct profile edit | No direct profile edit | Yes | Audit workflow transitions in workflow module | Yes in workflow module | Use workflow APIs/events, not board field overwrites. |
| Workflow current step label | `workflow.currentStepLabel` | Workflow state/projection | No | No direct profile edit | No direct profile edit | Yes | Audit workflow transitions in workflow module | Yes in workflow module | Display only on board. |
| Current stage fallback | `baseInfo.currentStage` | V2 base section / Daily Status base projection | Yes, if shared service owns it | Yes | Yes | No | Yes | Yes | Can be included after customs fields if the shared service updates V2/base consistently. |
| Cotage number | `kootaj.cotageNumber` | `shipment_kootaj_details.cotage_number`; Shipment Detail also stores/edits `declarationKootaj.cotageNumber` | Yes | Yes | Yes | No | Yes | Yes | Recommended Phase 2 editable field, but only after unifying Kootaj and Shipment Detail writes through one service. |
| Commercial card display | `commercialCard.displayName`, `holderName`, `cardNumber`, `status` | Commercial card record plus Kootaj relationship | No direct display edit | No direct display edit | No direct display edit | Yes | Audit in commercial card module for display changes | Yes in owning module | Display text is read-only. |
| Commercial card relationship | `kootaj.commercialCardId`, `commercialCard.id` | `shipment_kootaj_details.commercial_card_id` validated against tenant commercial cards | Yes | Yes, via Shipment Detail base `commercialCardId` | Yes | No | Yes | Yes | Board may edit relationship only through server-side tenant validation. |
| Open task count | `tasks.openCount` | Task projection | No | No | No | Yes | Audit task create/status changes | Yes in task module | Count must remain derived. |
| Overdue task count | `tasks.overdueCount` | Task projection | No | No | No | Yes | Audit task due/status changes | Yes in task module | Count must remain derived. |
| Assigned task user names | `tasks.assignedUserNames` | Task assignment projection | No | No | No | Yes | Audit task assignment changes | Yes in task module | Display only; do not expose broader user data. |
| Document total count | `documents.totalCount`, fallback `baseInfo.documentCount` | Document projection | No | No | No | Yes | Audit document upload/archive/delete in document module | Yes in document module | Count must remain derived. |
| Customer-visible document count | `documents.customerVisibleCount` | Document visibility projection | No | No | No | Yes | Audit document visibility changes | Yes in document module | Board must not write visibility counts. |
| Missing required document count | `documents.missingRequiredCount` | Future document requirement projection; currently not a true editable field | No | No | No | Yes | Audit underlying document/requirement changes | Yes in owning module | Needs a real document requirement model before it can be meaningful. |
| Last updated timestamp | `kootaj.updatedAt`, `baseInfo.updatedAt`, `shipment.updatedAt` | Latest timestamp from Kootaj/V2/shipment records | No | No | No | Yes | Audit underlying field edits | No direct edit | Display only. |
| Last updated user | `baseInfo.updatedByName`, `kootaj.updatedById` | V2 updater display or Kootaj updater id | No | No | No | Yes | Audit underlying field edits | No direct edit | Display only. Kootaj updater display may need a safe user-name join later. |

## Recommended Phase 2 editable subset

Start with fields that are operational, visible on the current board, already tenant-scoped, and already represented by Daily Status/Kootaj profile allowlists.

Recommended first editable subset:

1. `cotageNumber`
2. `customsRoute`
3. `customsStatus`
4. `releaseStatus`
5. `commercialCardId`
6. `baseInfo.currentStage`, only if the shared service updates the canonical base/V2 projection used by Shipment Detail

Do not start Phase 2 by editing broad shipment identity, customer identity, route semantics, workflow state, task counts, or document counts.

## Fields that must remain read-only

These fields should stay read-only on Kootaj Board:

- shipment/reference number
- shipment detail link
- customer label, customer code, and customer id fallback
- commercial card display text/card number/status
- workflow phase and current step label
- task open/overdue counts
- task assigned user names
- document total/customer-visible/missing-required counts
- summary tile counts
- latest updated timestamp/user display
- search and filter controls

Shipment status should also remain out of the first editable Kootaj subset because existing status changes can affect shipment timers and workflow expectations. If it is added later, it must use the exact same transition path as Daily Status/Shipment Detail.

## Fields requiring a new DB column or table before editing

No migration should be added in the read-only architecture pass, but Phase 2 should plan for these needs before enabling writes:

- A version/concurrency field for `shipment_kootaj_details`, such as `row_version`, or a documented `updated_at` compare-and-swap rule.
- A board-specific history/event table if the product needs daily operational notes, follow-up owners, reminders, pinned attention flags, or per-day board comments.
- A real document requirement model before `missingRequiredCount` can become more than a projection placeholder.
- Safe updater display support for Kootaj changes if the UI should show user names instead of `updatedById`.
- Explicit currency columns for any future monetary fields exposed on Kootaj Board. Amount-only fields must not be introduced.

## Fields that should use history/event rows instead of direct overwrites

Use event/history rows for:

- daily follow-up notes
- staff handoff notes
- next-action/reminder flags
- workflow step transitions
- task assignment/status changes
- document upload/archive/visibility changes
- any audit-heavy operational checkpoint that staff need to review historically

Direct overwrites are acceptable only for current-state profile fields like cotage number or current customs/release status, and only when audit history captures before/after values.

## API design rule

Kootaj Board and Shipment Detail edits must call the same backend service or shared repository function.

Recommended shape:

- Introduce a shared operation update service, for example `updateShipmentOperationFields`.
- Reuse it from:
  - `PATCH /api/kootaj-board/:shipmentId`
  - `PATCH /api/daily-status/:shipmentId`
  - Shipment Detail section updates that overlap with Kootaj operation fields
- Keep field validation server-side and allowlisted.
- Derive tenant scope from the authenticated user; never trust client-supplied `organizationId`.
- Emit audit metadata with:
  - source surface: `kootaj-board`, `daily-status`, or `shipment-detail`
  - shipment id
  - changed field names
  - before/after values where safe
  - actor id

The frontend should not know whether a field is stored in `shipments`, `shipment_kootaj_details`, or `shipment_v2_profiles`. That storage decision belongs to the backend service.

## Tenant, privacy, and display rules

- All reads and writes must be scoped by `organization_id` from the authenticated session.
- Customer names must come from existing safe DTO/projection rules.
- Kootaj Board must not join or fetch private customer fields directly to improve labels.
- If the current user is not allowed to see private customer details, show customer code or the privacy-safe customer label only.
- Commercial card relationships must be validated against the same organization before save.
- Commercial card display should be allowlisted to operationally necessary fields only.
- Task assignee names and document counts must remain projections from their owning modules.
- Public tracking DTO rules are unrelated and must not be reused to expose internal board data.

## Concurrency rule

Editable Phase 2 requests must include an expected version for the row or the specific field group being edited.

Minimum rule:

1. Client reads a board row with version metadata.
2. Client sends the patch with `expectedVersion`.
3. Server locks the shipment/profile row inside the transaction.
4. Server compares the expected version with the current version.
5. If changed, return `409 Conflict` with the current safe row projection.
6. If unchanged, apply the allowlisted patch, increment/update version metadata, and audit the change.

Do not allow blind last-write-wins updates for staff-facing operational board fields.

## E2E test requirements for Phase 2

Phase 2 tests should prove two-way consistency:

- Editing `cotageNumber` from Kootaj Board appears in Shipment Detail.
- Editing `cotageNumber` from Shipment Detail appears in Kootaj Board.
- Editing `customsRoute`, `customsStatus`, or `releaseStatus` from Kootaj Board appears in Daily Status.
- Editing the same overlapping field from Daily Status appears in Kootaj Board.
- Editing `commercialCardId` validates tenant ownership and updates all projections.
- Customer display remains privacy-safe for users without private customer access.
- Task/document counts remain read-only and cannot be changed through board editing controls.
- Audit log records the edit source and changed field names.
- Concurrent edits return a conflict instead of silently overwriting another staff member's change.

## Phase 2 implementation guardrails

- Keep `/kootaj-board` connected to the Daily Status projection.
- Do not create `kootaj_board_rows` as a duplicate spreadsheet table.
- Do not add editable controls for derived counts or display labels.
- Do not add route-specific business logic in the React page.
- Add the shared backend write service before wiring frontend edit controls.
- Add migrations only when the write design requires version/history support.
- Preserve canonical `/shipments/:id` as the detail route for all board row links.
