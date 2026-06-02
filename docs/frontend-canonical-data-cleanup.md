# Frontend Canonical Data Cleanup

## Current Slice

The first cleanup slice moves shipment list and shipment edit workflows away from the legacy mock-store source of truth and onto canonical backend APIs.

Implemented in this slice:

- `src/lib/api.ts` centralizes JSON API calls and backend error normalization.
- `src/lib/resourceState.ts` provides a lightweight loading/error/refresh state helper without adding dependencies.
- `src/lib/shipmentApi.ts` exposes canonical shipment list/get/create/update/archive calls.
- `src/app/Shipments.tsx` now loads shipments, customers, tasks, and shipment steps from backend APIs instead of `useMockStore`.
- `src/app/ShipmentEdit.tsx` now loads a shipment from `GET /api/shipments/:id` and saves through `PATCH /api/shipments/:id/operational-fields`.
- `src/store/useMockStore.ts` no longer writes the migrated `shipments` collection through the legacy `/api/users/:id/records` bridge.

## Compatibility Boundaries

- `user_records`, `/api/users/:id/bootstrap`, and `/api/users/:id/records` remain in place for unmigrated pages.
- `src/lib/mockData.ts` remains until no frontend imports depend on mock-derived structures.
- Shipment fields without canonical columns yet, such as `containerNumber`, free-time days, customs/import references, and operational notes, are still stored in `shipments.legacy_data` through a controlled backend API. Do not let new UI write arbitrary shipment fields directly.

## Remaining Mock/Legacy Dependencies

- `Dashboard.tsx`, `ShipmentDetail.tsx`, `Archive.tsx`, `Tasks.tsx`, `Documents.tsx`, `Customers.tsx`, `QuotageManagement.tsx`, `ChequeManagement.tsx`, `Compliance.tsx`, `ChangeLog.tsx`, `UserManagement.tsx`, `Chat.tsx`, and layout/session components still read from `useMockStore`.
- Legacy write helpers such as `addShipment`, `updateShipment`, `updateShipmentStatus`, and `archiveShipment` remain for compatibility, but migrated pages must not call them.
- Browser-side fake activity log creation remains in unmigrated mock-store actions. Migrated domains should rely on backend `auditLog`.

## Next Slice

Migrate `ShipmentDetail.tsx` to canonical APIs:

- Load shipment detail from `GET /api/shipments/:id`.
- Load shipment documents from `GET /api/shipments/:id/documents`.
- Load steps and progress from `/api/shipments/:id/steps` and `/api/shipments/:id/progress`.
- Keep document upload/archive/visibility actions on canonical document APIs.
- Remove shipment detail reads from `useMockStore.shipments`, `useMockStore.documents`, `useMockStore.tasks`, and `useMockStore.customers`.

