# Kootaj Excel column map

## Purpose

This document maps Kootaj/customs operation fields and the likely staff Excel-style operational columns to existing LogisticPlus data ownership before any new Kootaj fields are added.

There is no standalone Kootaj Board page. Daily Status is the operational board surface, and Shipment Detail is the canonical detail surface. The actual customer Excel workbook is not present in the repository, so this map uses the Daily Status projection and canonical Shipment Detail fields as the source inventory. Any column whose exact Excel label, meaning, or workflow timing is not proven from the app is marked for client confirmation.

## Current implemented Kootaj fields

Kootaj/customs fields currently read through `GET /api/daily-status` and the Shipment Detail daily-status projection.

Current visible fields:

- Shipment/reference number: `shipment.code`, fallback `baseInfo.code`
- Customer display: `customer.name`, `baseInfo.customerName`, `customer.customerCode`, `baseInfo.customerCode`, or safe fallback id
- Shipment route: `shipment.origin` and `shipment.destination`, with base fallbacks
- Customs route display: `kootaj.customsRoute`, fallback `workflow.route`
- Shipment status: `shipment.status`
- Latest operational status: `kootaj.customsStatus`, `kootaj.releaseStatus`, `workflow.currentStepLabel`, `baseInfo.currentStage`
- Cotage number: `kootaj.cotageNumber`
- Commercial card display: `commercialCard.displayName`
- Task counts: `tasks.openCount`, `tasks.overdueCount`
- Document counts: `documents.customerVisibleCount`, `documents.totalCount`
- Last updated display: `kootaj.updatedAt`, `baseInfo.updatedAt`, `shipment.updatedAt`, plus updater display/id
- Canonical shipment detail link: `links.shipmentDetailUrl` or `/shipments/:id`
- Summary tiles: current result count, cotage-filled count, open task sum, blocked row count

Current filters:

- Search: `q`
- Shipment status: `shipmentStatus`
- Customs route: `customsRoute`

## Fields currently editable through shared operation surfaces

There is no standalone Kootaj Board edit surface. Daily Status and Shipment Detail use shared shipment operation data for Kootaj/customs fields.

- `cotageNumber`
- `cotageDate`
- `customsRoute`
- `customsOffice`
- `declarationReference`
- `customsStatus`
- `releaseStatus`

## Fields currently read-only from the operational board

- Customer labels/codes/ids
- Shipment/reference number
- Shipment detail links
- Origin/destination/ports
- Shipment status
- Workflow phase/current step/current stage
- Commercial card display
- Task counts and assignee names
- Document counts
- Last updated timestamp/user display
- Summary tile counts
- Search and filter controls

## Excel/business column mapping

| Excel/business column name | Current app field/API field if exists | Source of truth | Current status | Should be editable from Kootaj? | Should be visible in Shipment Detail? | Needs history/audit? | Needs migration? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shipment/reference number | `shipment.code`, `baseInfo.code` | `shipments.shipment_code` | Implemented/read-only | No | Yes | Yes if ever changed | No | Identity field. Keep out of board edits. |
| Canonical shipment link | `links.shipmentDetailUrl` | Derived route from shipment id | Implemented/read-only | No | N/A | No | No | Must stay `/shipments/:id`. |
| Customer name/code | `customer.name`, `customer.customerCode`, `baseInfo.customerCode` | Customer DTO/projection | Implemented/read-only | No | Yes | In customer module only | No | Must use privacy-safe projection. |
| Origin | `shipment.origin`, `baseInfo.origin` | `shipments.origin` plus V2 base mirror | Implemented/read-only | Later, only through shared shipment service | Yes | Yes | No | Requires clear route semantics with ports. |
| Destination / delivery port | `shipment.destination`, `baseInfo.deliveryPort` | `shipments.destination` plus V2 base mirror | Implemented/read-only | Later, only through shared shipment service | Yes | Yes | No | Do not split destination vs delivery port without client confirmation. |
| Discharge port | `baseInfo.dischargePort` | `shipment_v2_profiles.sections_json.base.dischargePort` | Projection/read-only | Client confirmation first | Yes | Yes | No | Not shown as its own Kootaj column yet. |
| Shipment status | `shipment.status` | `shipments.status` | Implemented/read-only | Not yet | Yes | Yes | No | Status changes affect workflow; use existing transition path only. |
| Current stage | `baseInfo.currentStage` | V2 base section, workflow fallback | Projection/read-only | Not next | Yes | Yes | No | Needs ownership decision between manual stage and workflow step. |
| Workflow phase | `workflow.currentPhase` | Workflow projection | Implemented/read-only | No | Yes if useful | Workflow module | No | Derived; edit workflow through workflow APIs only. |
| Workflow current step | `workflow.currentStepLabel` | Workflow projection | Implemented/read-only | No | Yes | Workflow module | No | Derived label, not a writable board field. |
| Customs route | `kootaj.customsRoute` | `shipment_kootaj_details.customs_route` | Implemented/editable | Yes | Yes | Yes | No | Already editable. Shipment Detail syncs compatible V2 route values. |
| Cotage number | `kootaj.cotageNumber` | `shipment_kootaj_details.cotage_number` | Implemented/editable | Yes | Yes | Yes | No | Already editable. |
| Customs status | `kootaj.customsStatus` | `shipment_kootaj_details.customs_status` | Implemented/editable | Yes | Yes, display-only | Yes | No | Already editable from board; displayed in Shipment Detail. |
| Release status | `kootaj.releaseStatus` | `shipment_kootaj_details.release_status` | Implemented/editable | Yes | Yes, display-only | Yes | No | Already editable from board; displayed in Shipment Detail. |
| Commercial card display | `commercialCard.displayName`, `commercialCard.cardNumber`, `commercialCard.status` | Commercial card record projection | Implemented/read-only | No | Yes | In commercial card module | No | Display only. |
| Commercial card relationship | `kootaj.commercialCardId`, `commercialCard.id` | `shipment_kootaj_details.commercial_card_id` | API/projection exists, Kootaj read-only | Safe next after UI/validation review | Yes | Yes | No | Existing tenant validation exists in Daily Status path. Needs client confirmation before board edit. |
| Order registration number | `kootaj.orderRegistrationNumber`, `baseInfo.orderRegistrationNumber` | `shipment_kootaj_details.order_registration_number`, V2 base mirror | Projection/read-only | Safe next candidate | Yes | Yes | No | Existing field. Avoid duplicate writes; use shared update path. |
| Order registration date | `kootaj.orderRegistrationDate` | `shipment_kootaj_details.order_registration_date` | Projection/read-only | Safe after date UX confirmed | Yes if operationally useful | Yes | No | Use shared Shamsi/date pattern, not native Gregorian UI. |
| Order registration expiry date | `kootaj.orderRegistrationExpiryDate` | `shipment_kootaj_details.order_registration_expiry_date` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Needs reminder/expiry behavior decision. |
| Order registration status | `kootaj.orderRegistrationStatus` | `shipment_kootaj_details.order_registration_status` | Projection/read-only | Safe after status meaning confirmed | Yes if operationally useful | Yes | No | Existing enum-style common status. |
| Proforma number | `kootaj.proformaNumber` | `shipment_kootaj_details.proforma_number` | Projection/read-only | Safe after client confirmation | Yes | Yes | No | Plain text operational identifier. |
| Proforma date | `kootaj.proformaDate` | `shipment_kootaj_details.proforma_date` | Projection/read-only | Client confirmation first | Yes if useful | Yes | No | Date input must use app date pattern. |
| Foreign seller name | `kootaj.foreignSellerName` | `shipment_kootaj_details.foreign_seller_name` | Projection/read-only | Client confirmation first | Yes if commercial users need it | Yes | No | May contain business-sensitive vendor data. |
| Foreign seller code | `kootaj.foreignSellerCode` | `shipment_kootaj_details.foreign_seller_code` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Confirm exact Excel meaning. |
| Goods id summary | `kootaj.goodsIdSummary` | `shipment_kootaj_details.goods_id_summary` | Projection/read-only | Client confirmation first | Possibly | Yes | No | May overlap with V2 goods rows. |
| HS code summary | `kootaj.hsCodeSummary` | `shipment_kootaj_details.hs_code_summary` | Projection/read-only | Safe after client confirmation | Yes if clearance users need it | Yes | No | Existing text field; confirm one or multiple HS codes. |
| Order permit status | `kootaj.orderPermitStatus` | `shipment_kootaj_details.order_permit_status` | Projection/read-only | Safe after status workflow confirmed | Yes if used | Yes | No | Existing common status. |
| FX source status | `kootaj.fxSourceStatus` | `shipment_kootaj_details.fx_source_status` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Banking/payment ownership must be clear. |
| Currency type | `kootaj.currencyType` | `shipment_kootaj_details.currency_type` | Projection/read-only | Not alone | Yes if amount shown | Yes | No | Currency must stay paired with amount. |
| Currency amount | `kootaj.currencyAmount` | `shipment_kootaj_details.currency_amount` | Projection/read-only | Not alone | Yes if shown | Yes | No | Monetary/value amount; require explicit currency display/edit. |
| Bank name | `kootaj.bankName` | `shipment_kootaj_details.bank_name` | Projection/read-only | Client confirmation first | Yes if banking section uses it | Yes | No | May overlap Shipment Detail banking section. |
| Bank tracking number | `kootaj.bankTrackingNumber` | `shipment_kootaj_details.bank_tracking_number` | Projection/read-only | Safe after client confirmation | Yes if useful | Yes | No | Existing searchable identifier. |
| FX allocation date | `kootaj.fxAllocationDate` | `shipment_kootaj_details.fx_allocation_date` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Date field. |
| Bank process status | `kootaj.bankProcessStatus` | `shipment_kootaj_details.bank_process_status` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Existing common status. |
| Insurance number | `kootaj.insuranceNumber` | `shipment_kootaj_details.insurance_number` | Projection/read-only | Client confirmation first | Yes if documents/permits need it | Yes | No | Existing text field. |
| Inspection certificate number | `kootaj.inspectionCertificateNumber` | `shipment_kootaj_details.inspection_certificate_number` | Projection/read-only | Client confirmation first | Yes if permits section uses it | Yes | No | Existing text field. |
| Booking number | `kootaj.bookingNumber` | `shipment_kootaj_details.booking_number` | Projection/read-only | Safe after client confirmation | Yes | Yes | No | Existing transport identifier. |
| Bill of lading number | `kootaj.billOfLadingNumber` | `shipment_kootaj_details.bill_of_lading_number` | Projection/read-only | Safe after client confirmation | Yes | Yes | No | Existing transport identifier. |
| Transport document number | `kootaj.transportDocumentNumber` | `shipment_kootaj_details.transport_document_number` | Projection/read-only | Client confirmation first | Yes | Yes | No | Confirm overlap with bill of lading. |
| Pre-alert date | `kootaj.preAlertDate` | `shipment_kootaj_details.pre_alert_date` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Date field. |
| Customs office | `kootaj.customsOffice` | `shipment_kootaj_details.customs_office` | Implemented/editable | Yes | Yes, display-only | Yes | No | Uses the shared Kootaj update path and row version. |
| Declaration reference | `kootaj.declarationReference` | `shipment_kootaj_details.declaration_reference` | Implemented/editable | Yes | Yes, display-only | Yes | No | Uses the shared Kootaj update path and row version. |
| Declaration date | `kootaj.declarationDate` | `shipment_kootaj_details.declaration_date` | Projection/read-only | Safe after date UX confirmed | Yes | Yes | No | Date field. |
| Cotage date | `kootaj.cotageDate` | `shipment_kootaj_details.cotage_date` | Implemented/editable | Yes | Yes; synchronized with the declaration section | Yes | No | Uses the shared Shamsi date control and Kootaj row version. |
| Container summary | `kootaj.containerSummary`, `baseInfo.goods.container20Count`, `baseInfo.goods.container40Count` | Kootaj field plus V2 goods projection | Projection/read-only | Client confirmation first | Yes | Yes | No | Avoid duplicating structured V2 goods/container data. |
| Goods summary | `kootaj.goodsSummary`, `baseInfo.goods.goodsSummary` | Kootaj field plus V2 goods projection | Projection/read-only | Client confirmation first | Yes | Yes | No | Confirm whether Excel value is free text or structured goods rows. |
| Package count | `kootaj.packageCount`, `baseInfo.goods.totalQuantity` | `shipment_kootaj_details.package_count`, V2 goods projection | Projection/read-only | Client confirmation first | Yes | Yes | No | Numeric; may overlap goods rows. |
| Gross weight kg | `kootaj.grossWeightKg`, `baseInfo.goods.totalWeight` | `shipment_kootaj_details.gross_weight_kg`, V2 goods projection | Projection/read-only | Client confirmation first | Yes | Yes | No | Numeric; confirm unit and source. |
| Net weight kg | `kootaj.netWeightKg` | `shipment_kootaj_details.net_weight_kg` | Projection/read-only | Client confirmation first | Yes | Yes | No | Numeric; confirm unit. |
| Arrival notice number | `kootaj.arrivalNoticeNumber` | `shipment_kootaj_details.arrival_notice_number` | Projection/read-only | Client confirmation first | Yes if used | Yes | No | Existing text field. |
| Arrival date | `kootaj.arrivalDate` | `shipment_kootaj_details.arrival_date` | Projection/read-only | Client confirmation first | Yes | Yes | No | Date field; may overlap shipment ETA/actual delivery. |
| Manifest number | `kootaj.manifestNumber` | `shipment_kootaj_details.manifest_number` | Projection/search exists, Kootaj read-only | Safe after client confirmation | Yes | Yes | No | Existing searchable identifier. |
| Delivery order number | `kootaj.deliveryOrderNumber` | `shipment_kootaj_details.delivery_order_number` | Projection/read-only | Safe after client confirmation | Yes | Yes | No | Existing text field. |
| Warehouse name | `kootaj.warehouseName` | `shipment_kootaj_details.warehouse_name` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Existing text field. |
| Warehouse receipt number | `kootaj.warehouseReceiptNumber` | `shipment_kootaj_details.warehouse_receipt_number` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Existing text field. |
| Warehouse receipt date | `kootaj.warehouseReceiptDate` | `shipment_kootaj_details.warehouse_receipt_date` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Date field. |
| Evaluator name | `kootaj.evaluatorName` | `shipment_kootaj_details.evaluator_name` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Confirm whether free text or user/reference. |
| Expert name | `kootaj.expertName` | `shipment_kootaj_details.expert_name` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Confirm whether free text or user/reference. |
| Document control status | `kootaj.documentControlStatus` | `shipment_kootaj_details.document_control_status` | Projection/read-only | Safe after status workflow confirmed | Yes if operationally useful | Yes | No | Existing common status. |
| Physical inspection status | `kootaj.physicalInspectionStatus` | `shipment_kootaj_details.physical_inspection_status` | Projection/read-only | Safe after status workflow confirmed | Yes if operationally useful | Yes | No | Existing common status. |
| Physical inspection date | `kootaj.physicalInspectionDate` | `shipment_kootaj_details.physical_inspection_date` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Date field. |
| Lab status | `kootaj.labStatus` | `shipment_kootaj_details.lab_status` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Existing common status. |
| Lab result date | `kootaj.labResultDate` | `shipment_kootaj_details.lab_result_date` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Date field. |
| Tariff review status | `kootaj.tariffReviewStatus` | `shipment_kootaj_details.tariff_review_status` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Existing common status. |
| Valuation status | `kootaj.valuationStatus` | `shipment_kootaj_details.valuation_status` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Existing common status. |
| Legal permit status | `kootaj.legalPermitStatus` | `shipment_kootaj_details.legal_permit_status` | Projection/read-only | Client confirmation first | Yes if permits section uses it | Yes | No | Existing common status. |
| Standard permit status | `kootaj.standardPermitStatus` | `shipment_kootaj_details.standard_permit_status` | Projection/read-only | Client confirmation first | Yes if permits section uses it | Yes | Yes? | May need document requirement linkage before becoming useful. |
| Health permit status | `kootaj.healthPermitStatus` | `shipment_kootaj_details.health_permit_status` | Projection/read-only | Client confirmation first | Yes if permits section uses it | Yes | Yes? | May need document requirement linkage before becoming useful. |
| Quarantine permit status | `kootaj.quarantinePermitStatus` | `shipment_kootaj_details.quarantine_permit_status` | Projection/read-only | Client confirmation first | Yes if permits section uses it | Yes | Yes? | May need document requirement linkage before becoming useful. |
| Other permit notes | `kootaj.otherPermitNotes` | `shipment_kootaj_details.other_permit_notes` | Projection/read-only | Not as simple overwrite if daily notes are required | Yes if useful | Yes | Maybe | Use history rows if staff need note timeline. |
| Tax payment status | `kootaj.taxPaymentStatus` | `shipment_kootaj_details.tax_payment_status` | Projection/read-only | Client confirmation first | Yes if payments section uses it | Yes | No | Existing enum includes `paid`. |
| Customs payment status | `kootaj.customsPaymentStatus` | Normalized from `tax_payment_status` in projection | Projection/read-only | No separate edit | Yes if shown | Audit tax payment owner | No | Projection currently derives from tax payment status. Do not create a duplicate status. |
| Duties amount | `kootaj.dutiesAmount` | `shipment_kootaj_details.duties_amount` | Projection/read-only | Not before currency/value rules | Yes if payments section uses it | Yes | Maybe | Amount-only field; needs explicit currency strategy before UI edit. |
| Tax amount | `kootaj.taxAmount` | `shipment_kootaj_details.tax_amount` | Projection/read-only | Not before currency/value rules | Yes if payments section uses it | Yes | Maybe | Amount-only field; needs explicit currency strategy before UI edit. |
| Customs payment date | `kootaj.customsPaymentDate` | `shipment_kootaj_details.customs_payment_date` | Projection/read-only | Client confirmation first | Yes if payments section uses it | Yes | No | Date field. |
| Payment reference | `kootaj.paymentReference` | `shipment_kootaj_details.payment_reference` | Projection/search exists, Kootaj read-only | Client confirmation first | Yes if payments section uses it | Yes | No | Existing searchable identifier. |
| Cashier confirmation status | `kootaj.cashierConfirmationStatus` | `shipment_kootaj_details.cashier_confirmation_status` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Existing common status. |
| Warehouse charges status | `kootaj.warehouseChargesStatus` | `shipment_kootaj_details.warehouse_charges_status` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Existing common status. |
| Terminal charges status | `kootaj.terminalChargesStatus` | `shipment_kootaj_details.terminal_charges_status` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Existing common status. |
| Demurrage status | `kootaj.demurrageStatus` | `shipment_kootaj_details.demurrage_status`; demurrage module may also exist | Projection/read-only | Client confirmation first | Yes if operationally useful | Yes | No | Confirm whether this should use demurrage module instead. |
| Loading permit number | `kootaj.loadingPermitNumber` | `shipment_kootaj_details.loading_permit_number` | Projection/read-only | Safe after client confirmation | Yes | Yes | No | Existing text field. |
| Loading permit date | `kootaj.loadingPermitDate` | `shipment_kootaj_details.loading_permit_date` | Projection/read-only | Safe after date UX confirmed | Yes | Yes | No | Date field. |
| Truck plate | `kootaj.truckPlate` | `shipment_kootaj_details.truck_plate` | Projection/search exists, Kootaj read-only | Safe after client confirmation | Yes if exit section uses it | Yes | No | Existing text field. |
| Driver name | `kootaj.driverName` | `shipment_kootaj_details.driver_name` | Projection/read-only | Client confirmation first | Possibly | Yes | No | Personal data; keep tenant-internal only. |
| Gate pass number | `kootaj.gatePassNumber` | `shipment_kootaj_details.gate_pass_number` | Projection/read-only | Safe after client confirmation | Yes | Yes | No | Existing text field. |
| Exit gate status | `kootaj.exitGateStatus` | `shipment_kootaj_details.exit_gate_status` | Projection/read-only | Safe after status workflow confirmed | Yes | Yes | No | Existing common status. |
| Exit date | `kootaj.exitDate` | `shipment_kootaj_details.exit_date` | Projection/read-only | Safe after date UX confirmed | Yes | Yes | No | May interact with `EXITED`/archive flow; confirm before edit. |
| Delivery date | `kootaj.deliveryDate` | `shipment_kootaj_details.delivery_date` | Projection/read-only | Client confirmation first | Yes | Yes | No | May overlap shipment actual delivery. |
| Internal note | `kootaj.internalNote` | `shipment_kootaj_details.internal_note` | Projection/read-only | Not as current-state overwrite for daily notes | Yes if internal | Yes | Maybe | For daily board note/history, prefer event rows. |
| Custom form fields | `kootaj.customFields` | `shipment_kootaj_details.custom_fields_json` plus active form template | Projection/read-only | Only through template-aware UI | Yes if template field is canonical | Yes | No for existing JSONB, maybe for indexes | Do not add ad-hoc Kootaj columns without template validation. |
| Task open count | `tasks.openCount` | Task projection | Implemented/read-only | No | Yes if useful | Task module | No | Derived count. |
| Task overdue count | `tasks.overdueCount` | Task projection | Implemented/read-only | No | Yes if useful | Task module | No | Derived count. |
| Task assignees | `tasks.assignedUserNames` | Task assignment projection | API/read-only | No | Yes if useful | Task module | No | Avoid exposing broader user data. |
| Document total count | `documents.totalCount`, `baseInfo.documentCount` | Document projection | Implemented/read-only | No | Yes | Document module | No | Derived count. |
| Customer-visible document count | `documents.customerVisibleCount` | Document projection | Implemented/read-only | No | Yes if useful | Document module | No | Derived count. |
| Missing required document count | `documents.missingRequiredCount` | Placeholder projection currently `0` | Projection/read-only | No | Later | Document/template module | Yes | Requires real requirement model before use. |
| Last updated timestamp | `kootaj.updatedAt`, `baseInfo.updatedAt`, `shipment.updatedAt` | Latest source timestamps | Implemented/read-only | No | Yes | Underlying edit audit | No | Derived display. |
| Last updated user | `baseInfo.updatedByName`, `kootaj.updatedById` | V2 updater name or Kootaj updater id | Implemented/read-only | No | Yes | Underlying edit audit | Maybe | User-name display for Kootaj updater may need safe join. |
| Kootaj row version | `kootajUpdatedAt` | `shipment_kootaj_details.updated_at` | API/read-only | No direct edit | No | No direct audit | No | Version marker for future guarded inline edits. |
| Daily follow-up note | No dedicated field; `kootaj.internalNote` exists | Not decided | Missing | Yes, if client needs daily note | Maybe as history | Yes | Yes | Should be history/event rows, not overwriting one note. |
| Follow-up owner/reminder | No dedicated field | Not decided | Missing | Client confirmation first | Maybe | Yes | Yes | Use tasks if it is actionable work; otherwise board event/reminder model. |
| Attention/pinned flag | No dedicated field | Not decided | Missing | Client confirmation first | Maybe | Yes | Yes | Add only if staff need board triage. |
| Exact Excel snapshot/export state | No dedicated field | Not decided | Missing | No normal edit | No | Yes | Yes | Only build snapshot table if staff need historical Excel exports. |
| Pricing/payment product features | Removed feature area | Out of scope | Out-of-scope | No | No | No | No | Do not reintroduce removed pricing/payment modules through Kootaj. |
| SMS/Hamyar fields | Removed feature area | Out of scope | Out-of-scope | No | No | No | No | Do not reintroduce removed integrations. |

## Fields that should remain read-only

- Shipment/reference number and route links
- Customer labels, customer codes, and fallback ids
- Commercial card display text/card number/status
- Shipment status until status-transition ownership is explicitly reused
- Workflow phase/current step/current stage labels
- Task counts, overdue counts, and assignee projections
- Document counts and missing-required count
- Last updated timestamp/user display
- Summary tile counts
- Search/filter controls
- Any value derived from multiple modules

## Fields safe to add next

The previously recommended low-risk fields are now implemented through the shared Kootaj update path:

1. `customsOffice`
2. `declarationReference`
3. `cotageDate`

No additional Kootaj field should become editable without client confirmation of its Excel meaning and owner.

Close alternates after client confirmation:

- `declarationDate`
- `orderRegistrationNumber`
- `bookingNumber`
- `billOfLadingNumber`

## Fields requiring client confirmation

Confirm exact Excel labels, column order, and workflow meaning before implementing:

- Origin vs discharge port vs delivery port
- Current stage vs workflow step
- Commercial card relationship editing from the board
- Order registration status/date/expiry behavior
- Proforma/vendor fields
- Goods/container/package/weight fields and whether they duplicate V2 goods rows
- Banking/FX fields and whether finance users own them
- Permit statuses and whether document requirements should drive them
- Duties/tax amount currency rules
- Demurrage status ownership
- Exit/delivery dates and whether they should change shipment status/archive behavior
- Internal notes vs daily note history
- Follow-up owners, reminders, pinned flags, or exact Excel snapshots

## Fields that should not be built yet

- Missing required document count editing; it needs a real requirement model.
- Direct task/document count editing; counts are derived from owning modules.
- Broad shipment status editing from Kootaj; status transitions must reuse existing shipment/workflow rules.
- Monetary fields without explicit currency strategy beside every amount.
- Daily note/history as a single overwrite field if staff need a timeline.
- New board-only duplicate copies of shipment/customer/document/task fields.
- Removed SMS, Hamyar, pricing, or payment-module behavior.

## Recommended Phase 3 field expansion order

1. Completed: Kootaj customs-details edit group `customsOffice`, `declarationReference`, `cotageDate`.
2. Add transport identifiers only after client confirmation: `bookingNumber`, `billOfLadingNumber`, `manifestNumber`, `deliveryOrderNumber`.
3. Add date/status companions using shared date/status controls: `declarationDate`, `documentControlStatus`, `physicalInspectionStatus`, `loadingPermitNumber`, `loadingPermitDate`.
4. Add commercial card relationship editing only after confirming board users should change it from the Excel workflow.
5. Add daily notes/follow-up only with a history/event design, not as a duplicated spreadsheet cell.

Each expansion should keep the same rule: Daily Status and Shipment Detail must write through the same backend service/repository path for overlapping Kootaj/customs fields.
