# Daily Status Board MVP

## Scope

`وضعیت روزانه` is a protected operational board at `/daily-status` with `/kootaj-board` as an alias. Each row is a live projection based on one active shipment. The board does not create frontend-only rows and does not copy source-module data.

Shipment Detail exposes the same data through an inline `اطلاعات واردات، کوتاژ و ترخیص` form. That form must use `shipment_kootaj_details` through the daily-status repository/API and must not create a shipment-detail-only table, JSON cache, or duplicated frontend source. It is a structured Iran import/customs data profile, not the real workflow timeline; the actual workflow/progress UI remains separate.

## Row Architecture

Primary entity:

- `shipments`

Board-owned extension:

- `shipment_kootaj_details`

Linked source modules:

- `customers`
- Commercial Cards through tenant-scoped `user_records` collection `commercialCards`
- `shipment_workflow_instances` and workflow step states
- `tasks`
- `documents`

The board response is composed by the backend repository/composer, not ad-hoc route joins. The grouped API shape keeps source modules separate:

- `shipment`
- `customer`
- `kootaj`
- `commercialCard`
- `workflow`
- `tasks`
- `documents`
- `links`

## Board-Owned Fields

The V1 patch endpoint accepts only explicit board-owned or relationship fields. `shipment_kootaj_details` stores only Iran import/customs/kootaj profile fields plus the Commercial Card relationship and internal note:

- `commercialCardId`
- NTSW/order registration fields such as `orderRegistrationNumber`, dates/status, proforma, seller, goods ID, HS summary, and order permit status
- FX/bank fields such as `fxSourceStatus`, `currencyType`, `currencyAmount`, `bankName`, `bankTrackingNumber`, allocation date, and bank process status
- Origin and transport document fields such as insurance, inspection certificate, booking, bill of lading, transport document, pre-alert, container/goods summaries, package count, and weights
- Arrival/warehouse fields such as arrival notice/date, manifest, delivery order, warehouse name, warehouse receipt number/date
- `cotageNumber`
- `customsStatus`
- `customsRoute`
- `customsOffice`
- `declarationReference`
- declaration/kootaj dates, evaluator, expert, document control, inspection, lab, tariff, and valuation statuses
- permit fields such as legal, standard, health, quarantine, and other permit notes
- payment fields such as `customsPaymentStatus`, `dutiesAmount`, `taxAmount`, `customsPaymentDate`, `paymentReference`, cashier, warehouse, terminal, and demurrage statuses
- `releaseStatus`
- `exitDate`
- release/delivery fields such as loading permit, truck plate, driver name, gate pass, exit gate status, and delivery date
- `internalNote`

Derived fields such as customer name, shipment status, workflow step, document counts, and task counts must be edited in their source module.

Date fields are stored as nullable normalized `YYYY-MM-DD` strings. UI surfaces may display a Jalali/Persian rendering, but submitted values must normalize to the backend-safe Gregorian ISO date shape. Invalid enum values, impossible calendar dates, unknown patch fields, and negative numeric values are rejected by request validation before persistence.

## UI Layout Contract

The board is intentionally not a spreadsheet. Desktop uses a compact operations list with a selected-row detail/edit panel, and mobile uses compact cards. No normal workflow should require horizontal scrolling.

Compact list/card rows show only scan-critical fields:

- shipment code / case number
- customer
- shipment status
- current workflow step
- customs route
- cotage number
- commercial card
- exit status or customs status
- latest update
- `جزئیات / ویرایش`

Lower-priority fields such as responsible user, origin/destination, payment/release state, customs office, declaration reference, import identifiers, bank/arrival/release identifiers, summaries, exit/delivery date, and internal note remain available through each row's details/edit panel.

On Shipment Detail, the inline form follows the same split: shipment, customer, workflow, task, and document values are read-only derived fields; Commercial Card and import/customs/kootaj fields are editable. The form is RTL/Persian, rendered from the `iranImportProfileFields` registry, grouped into collapsible sections, supports partial completion, later cotage number entry, completion indicators, field search, quick single-field editing, Jalali display for ISO dates, and changed-field-only saves.

On mobile and narrow tablets, cards expose the primary status fields first and use the same details/edit panel for the complete record. The page must not create body-level horizontal overflow on desktop or mobile.

## Expandable Relationship Architecture

The board is a live projection. Shipment is the primary row, and `shipment_kootaj_details` stores only kootaj-specific fields, explicit relationship IDs, board notes/statuses, and metadata needed by this board.

Future modules that connect to `وضعیت روزانه` should provide:

- A tenant-scoped table/entity or a tenant-scoped compatibility collection.
- Safe summary fields for board display.
- An explicit relationship ID stored in `shipment_kootaj_details` or a dedicated join table.
- A relationship ownership validation helper.
- A board row summary mapper/composer section.
- An optional detail route link.
- A public tracking policy, private by default.
- Audit behavior for edits.

Future relationships must be added as explicit allowlisted fields with validation. Do not add arbitrary relationship names, arbitrary column names, or generic JSON metadata patching.

## Relationship Validation

The V1 relationship field is `commercial_card_id`. Because Commercial Cards are currently compatibility records, the validator checks `user_records` with:

- `collection = 'commercialCards'`
- matching `organization_id`
- matching `item_id` or `data.id`
- not archived when archive markers exist

Cross-tenant IDs are rejected without trusting client-supplied tenant IDs.

## Public Tracking Policy

Daily status and linked relationship internals are private by default.

Public tracking must not expose:

- kootaj fields
- commercial card data
- internal notes
- source-module internals
- tenant IDs
- tokens, hashes, payment data, audit data, storage keys, or filesystem paths

Only dedicated public-safe DTO mappers may expose selected labels later.

## Audit

`PATCH /api/daily-status/:shipmentId` records `daily_status.update` audit/change events with:

- actor from the authenticated session
- organization from trusted tenant context
- shipment resource ID
- changed field names
- bounded safe before/after values
- metadata source `daily-status`

Shipment Detail uses:

- `GET /api/shipments/:shipmentId/daily-status`
- `PATCH /api/shipments/:shipmentId/daily-status`

The Shipment Detail patch route writes the same `shipment_kootaj_details` row and records the same audit event with metadata source `shipment-detail-daily-status`. The legacy `taxPaymentStatus` alias remains accepted for compatibility; the product-facing expanded form uses `customsPaymentStatus`.

## Tests

Focused tests cover:

- grouped row shape
- session-derived tenant scope
- spoofed tenant query rejection
- unknown patch key rejection
- cross-tenant Commercial Card rejection
- valid relationship update
- audit creation
- derived task count refresh
- public tracking non-leakage
- desktop board containment
- desktop compact operations list
- mobile card layout
- row edit/save behavior
- shipment detail daily-status form refresh
- Shipment Detail field search and quick edit
- board-to-detail and detail-to-board sync
- Shipment Detail audit source
- invalid daily-status enum/date rejection
- negative number rejection
- expanded Shipment Detail import profile sections
- public non-leakage for bank tracking, payment reference, truck/driver, Commercial Card, cotage, customs office, declaration reference, and internal notes
