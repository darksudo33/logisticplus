# Commercial Cards and Malvani Profiles

## Product Shape

Commercial Cards remain the existing legal/business card records used by Shipment Detail and Daily Status. They are still stored through the compatibility `user_records` collection named `commercialCards`.

Malvani profiles are operational profiles for lenj/lanchi work. They store captain and lenj information and live beside Commercial Cards because users use them in a similar workflow, but they are not public tracking records and are not legal Commercial Cards.

The Commercial Cards page now has two RTL sections:

- `کارت‌های بازرگانی`
- `ملوانی`

## Data Model

`malvani_profiles` is a canonical tenant-scoped table with archive support:

- `organization_id`
- display/captain/lenj fields
- active status: `ACTIVE`, `INACTIVE`, `NEEDS_REVIEW`
- note
- created/updated actor fields
- `archived_at`

`business_entity_contacts` is a reusable tenant-scoped contact table for:

- `commercial_card`
- `malvani`

Each contact supports custom name, role/title, phone number, optional label, optional note, primary flag, sort order, and archive state. The database enforces at most one active primary contact per entity.

Commercial Card extra contacts are also embedded into the existing `commercialCards` compatibility record for this V1 so the current bootstrap/Daily Status/Shipment Detail flow is not disrupted. The protected contacts API still validates commercial card ownership through the tenant-scoped `user_records` collection.

## API Behavior

Protected Malvani APIs:

- `GET /api/malvani-profiles`
- `POST /api/malvani-profiles`
- `GET /api/malvani-profiles/:id`
- `PATCH /api/malvani-profiles/:id`
- `DELETE /api/malvani-profiles/:id`

Protected contact APIs:

- `GET /api/business-entity-contacts?entityType=&entityId=`
- `POST /api/business-entity-contacts`
- `PATCH /api/business-entity-contacts/:id`
- `DELETE /api/business-entity-contacts/:id`

Deletes archive records. Tenant scope is derived from the authenticated session. Client-supplied tenant identifiers are rejected by the tenant guard or strict request validation.

## Permissions

V1 follows the current Commercial Cards page access model: authenticated tenant users who can access the protected application can use this area. No new permission key was added so existing customer workflows are not silently blocked.

Future releases can introduce a dedicated permission such as `business_entities.manage` or `malvani.manage` once the product has a settled role policy for this area.

## Public Tracking Safety

Malvani profiles and business entity contacts are internal-only.

Public tracking must not expose:

- captain phone numbers
- extra contact numbers
- Malvani profile fields
- contact notes
- internal profile/contact status

The public tracking DTO remains allowlisted and tests assert that Malvani/contact data does not leak.

## Archive Behavior

Malvani profiles and contacts are archived through `archived_at`.

Commercial Card archive in V1 marks the compatibility card record with `isArchived` and `archivedAt`; it no longer hard-deletes the card from persistence. Active selectors hide archived cards from new choices while existing linked rows can still display their historical label.

## V2 Ideas

- Link Malvani profiles directly to `IMPORT_LENJ` and `EXPORT_LENJ` shipment templates.
- Add permit/checklist tracking per captain and lenj.
- Add expiration reminders for lenj/captain documents.
- Add duplicate phone detection across business contacts.
- Add contact import/export.
