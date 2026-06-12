# Shipment Type Form Templates

## Purpose

Shipment forms now adapt to the shipment type. This lets LogisticPlus keep one shipment workflow while showing the right operational fields for import sea containers, lenj imports, bulk cargo, air cargo, and land truck imports.

The feature is designed for production data safety:

- Existing shipment and Kootaj data is preserved when a shipment type changes.
- Public tracking stays allowlisted and does not expose template fields or custom values.
- Admin changes are tenant-scoped and audited.
- System templates are copied into an organization-specific template before the first edit.

## Shipment Types

The V1 catalog is defined in `src/shared/shipment-form-fields.js`:

- `IMPORT_SEA_CONTAINER`
- `IMPORT_LENJ`
- `IMPORT_SEA_BULK`
- `IMPORT_AIR_CARGO`
- `IMPORT_LAND_TRUCK`

Each type has a direction and transport mode. New and edited shipments store:

- `shipment_direction`
- `transport_mode`
- `shipment_type_code`

## Canonical And Custom Fields

Canonical fields are registered in code and map to trusted app data, such as shipment, workflow, document, task, commercial card, or `shipment_kootaj_details` fields.

Custom fields are admin-created per template and stored in `shipment_kootaj_details.custom_fields_json`. V1 supports:

- text
- textarea
- number
- date
- select

Custom fields are validated server-side against the active template before saving. Unknown fields, invalid dates, negative numbers, and invalid select options are rejected.

## Admin Behavior

Admins with `shipment_forms.manage` can manage templates at `/admin/shipment-form-templates`.

Supported V1 actions:

- Edit template title, description, and active status.
- Add canonical fields.
- Add custom fields.
- Rename field labels and helper text.
- Toggle visibility, required, important, Shipment Detail, Daily Status, and Create Shipment surfaces.
- Reorder fields.
- Archive fields from the form.

Archiving removes a field from the active form template only. It does not delete existing shipment values.

## Runtime Behavior

Create Shipment:

- The user selects a shipment type.
- The shipment stores type metadata.
- The dialog previews important/create-surface fields for the selected template.

Shipment Edit:

- The user can change shipment type.
- The app warns that changing type changes the active form template but preserves previous Kootaj/custom data.

Shipment Detail and Daily Status:

- Both read the active template for the shipment type.
- Both render canonical and custom fields from the template.
- Both save custom fields through the daily status API.

## Privacy

Template definitions and `custom_fields_json` are private by default.

Public tracking responses still use the existing allowlisted DTO and do not include:

- template ids or template metadata
- custom field keys
- custom field values
- Kootaj/private operational fields

## Schema And Migrations

Migration `20260603160000_shipment_form_templates.sql` adds:

- shipment type metadata columns on `shipments`
- `custom_fields_json` on `shipment_kootaj_details`
- `shipment_form_templates`
- `shipment_form_template_sections`
- `shipment_form_template_fields`
- indexes and uniqueness constraints
- default system templates
- `shipment_forms.manage` permission

The migration is additive and does not drop existing data.

## V1 Tradeoffs

Custom fields use JSONB because the customer workflow needs admin-controlled field definitions before the final product data model is fully known. Canonical fields still map to first-class columns or module data where those fields already exist.

This avoids creating tables or columns for every temporary customer-specific field while preserving a migration path: high-value custom fields can later be promoted to canonical columns without losing existing JSONB values.

## V2 Candidates

- More shipment types, including export and transit templates.
- Field-level permission controls.
- Template version history with restore.
- More section management from the admin UI.
- Required-field enforcement by workflow step.
- Promoting frequently used custom fields into canonical fields.
