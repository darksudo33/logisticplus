# Logistic Plus Global Search

## API contract

`GET /api/search` searches authenticated operational data for the current organization.

Query params:

- `q`: required search text. Empty and one-character queries are rejected.
- `type`: optional filter. Supported values are `all`, `shipments`, `customers`, `documents`, `tasks`, `archive`, `tracking`, and `users`.
- `limit`: optional page size. Default is `20`, maximum is `50`.
- `offset`: optional pagination offset. Default is `0`.

Success response:

```json
{
  "query": "abc",
  "total": 12,
  "limit": 20,
  "offset": 0,
  "results": [
    {
      "id": "shipment-id",
      "type": "shipment",
      "title": "QA-123",
      "subtitle": "Customer · Tehran → Dubai",
      "description": "وضعیت فعلی: IN_TRANSIT",
      "url": "/shipments/shipment-id",
      "matchedFields": ["shipmentNumber"],
      "updatedAt": "2026-05-20T12:00:00.000Z"
    }
  ]
}
```

## Searchable entities

- Shipments: shipment code, legacy tracking/reference/container numbers, customer name, origin, destination, status, sender/recipient, and safe notes.
- Customers: company/contact name, phone, email, address, and visible national/tax identifiers stored in customer metadata.
- Documents: document title, file name, document type metadata, related shipment, related customer, and document version file names.
- Tasks: title, description, status, assigned user, and due date.
- Tracking: customer-enabled shipment code, public status labels/descriptions, public route, and customer-visible status events.
- Users: tenant users by name, email, role, department, and phone; only users with `users.manage` can search this type.
- Archive: archived record title, summary, customer name, entity type, and entity id; only returned for explicit `type=archive`.

## Security and isolation

- Search always requires an authenticated active user and active organization.
- Every query is scoped to the current `organization_id`.
- Legacy shipments with a missing `organization_id` are searchable only when they are owned by the current user.
- `type=all` omits entities the user cannot view. Explicitly requesting a forbidden type returns `403`.
- Archive records are excluded from `type=all` and require `type=archive`.
- Results never include password hashes, auth/session tokens, customer tracking tokens, token hashes, storage keys, raw file paths, private file URLs, or raw legacy payloads.
- Public tracking search remains separate at `/api/public/track/search` and keeps its customer-verification rules.

## Matching behavior

- Matching is case-insensitive and supports partial matches.
- Persian/Arabic variants are normalized: `ي` to `ی`, `ك` to `ک`, zero-width/non-breaking spaces are collapsed, and Persian/Arabic digits are normalized for numeric searches.
- Results are sorted by relevance first, then most recently updated records.
- Search uses bounded PostgreSQL queries with parameterized SQL and result limits. It does not load full app datasets into frontend memory.

## Diagnostics

Set `QA_SEARCH_LOGS=true` or `QA_MODE` to log sanitized search diagnostics: query length, type, limit, offset, result count, duration, and status code. Full query text, tokens, and secrets are not logged.
