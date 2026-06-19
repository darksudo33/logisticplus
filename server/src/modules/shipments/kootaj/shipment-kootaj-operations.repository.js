import crypto from "node:crypto";
import { requireOrganizationScope } from "../../../shared/middleware/tenant.middleware.js";
import { KOOTAJ_COLUMN_BY_FIELD } from "./shipment-kootaj.repository.js";
import { defaultV2SectionsForShipment } from "./shipment-kootaj.service.js";

export const KOOTAJ_OPERATION_UPDATE_FIELDS = [
  "cotageNumber",
  "customsRoute",
  "customsStatus",
  "releaseStatus",
];

const KOOTAJ_OPERATION_UPDATE_FIELD_SET = new Set(KOOTAJ_OPERATION_UPDATE_FIELDS);

const DAILY_TO_SHIPMENT_V2_CUSTOMS_ROUTE = {
  green: "GREEN",
  yellow: "YELLOW",
  red: "RED",
};

const SHIPMENT_V2_TO_DAILY_CUSTOMS_ROUTE = {
  GREEN: "green",
  YELLOW: "yellow",
  RED: "red",
};

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function jsonObject(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return value;
}

function trimNullableText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function hasAnyField(value) {
  return Object.keys(value || {}).length > 0;
}

function kootajOperationDbValue(field, value) {
  if (field === "cotageNumber") return trimNullableText(value);
  return value ?? null;
}

function shipmentV2FlowCodeForShipment(shipment = {}) {
  return String(shipment.shipment_type_code || "").toUpperCase().includes("LENJ")
    ? "IMPORT_LANJ"
    : "IMPORT_SHIP";
}

export function pickKootajOperationUpdates(updates = {}) {
  return Object.fromEntries(
    KOOTAJ_OPERATION_UPDATE_FIELDS
      .filter((field) => hasOwn(updates, field))
      .map((field) => [field, updates[field]])
  );
}

export function hasKootajOperationUpdates(updates = {}) {
  return KOOTAJ_OPERATION_UPDATE_FIELDS.some((field) => hasOwn(updates, field));
}

export function shipmentV2RouteFromDailyStatusRoute(route) {
  if (route === null || route === undefined || route === "") return null;
  return DAILY_TO_SHIPMENT_V2_CUSTOMS_ROUTE[route] ?? undefined;
}

export function dailyStatusRouteFromShipmentV2Route(route) {
  if (route === null || route === undefined || route === "") return null;
  return SHIPMENT_V2_TO_DAILY_CUSTOMS_ROUTE[route] ?? undefined;
}

export function kootajOperationUpdatesFromShipmentV2Declaration(payload = {}) {
  const updates = {};
  if (hasOwn(payload, "cotageNumber")) updates.cotageNumber = trimNullableText(payload.cotageNumber);
  if (hasOwn(payload, "customsRoute")) {
    const mappedRoute = dailyStatusRouteFromShipmentV2Route(payload.customsRoute);
    // DIRECT_CARRIAGE has no current Daily Status/Kootaj enum equivalent, so Phase 2A
    // deliberately leaves the Kootaj customs route unchanged instead of storing an invalid value.
    if (mappedRoute !== undefined) updates.customsRoute = mappedRoute;
  }
  return updates;
}

async function syncShipmentV2DeclarationFromKootaj(queryable, {
  organizationId,
  shipmentId,
  actorUserId,
  shipmentRow,
  updates,
} = {}) {
  const v2DeclarationPatch = {};
  if (hasOwn(updates, "cotageNumber")) v2DeclarationPatch.cotageNumber = trimNullableText(updates.cotageNumber) || "";
  if (hasOwn(updates, "customsRoute")) {
    const mappedRoute = shipmentV2RouteFromDailyStatusRoute(updates.customsRoute);
    if (mappedRoute !== undefined) v2DeclarationPatch.customsRoute = mappedRoute;
  }
  if (!hasAnyField(v2DeclarationPatch)) return false;

  const profileResult = await queryable.query(
    `SELECT id, flow_code, sections_json
     FROM shipment_v2_profiles
     WHERE shipment_id = $1
       AND organization_id = $2
     LIMIT 1
     FOR UPDATE`,
    [shipmentId, organizationId]
  );
  const profile = profileResult.rows[0] || null;
  const existingSections = profile ? jsonObject(profile.sections_json) : defaultV2SectionsForShipment(shipmentRow || {});
  const nextSections = {
    ...existingSections,
    declarationKootaj: {
      ...jsonObject(existingSections.declarationKootaj),
      ...v2DeclarationPatch,
    },
  };

  if (profile) {
    await queryable.query(
      `UPDATE shipment_v2_profiles
       SET sections_json = $3::jsonb,
           updated_by_id = $4,
           updated_at = NOW()
       WHERE shipment_id = $1
         AND organization_id = $2`,
      [shipmentId, organizationId, JSON.stringify(nextSections), actorUserId || null]
    );
    return true;
  }

  if (!shipmentRow) return false;
  await queryable.query(
    `INSERT INTO shipment_v2_profiles (
       id, organization_id, shipment_id, flow_code, sections_json, created_by_id, updated_by_id, updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6, NOW())`,
    [
      crypto.randomUUID(),
      organizationId,
      shipmentId,
      shipmentV2FlowCodeForShipment(shipmentRow),
      JSON.stringify(nextSections),
      actorUserId || null,
    ]
  );
  return true;
}

export async function applyKootajOperationUpdates(queryable, {
  organizationId,
  shipmentId,
  actorUserId,
  shipmentRow,
  updates = {},
  syncShipmentV2Profile = true,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "applyKootajOperationUpdates");
  const operationUpdates = pickKootajOperationUpdates(updates);
  if (!hasAnyField(operationUpdates)) return [];

  // Phase 2A concurrency limitation: shipment_kootaj_details has updated_at but no
  // client-facing expectedVersion/row_version yet. This shared path serializes writes
  // with row locks and audit logs; optimistic conflict detection should be added before
  // inline multi-user editing is exposed in the Kootaj Board UI.
  await queryable.query(
    `INSERT INTO shipment_kootaj_details (
       id, organization_id, shipment_id, updated_by_id
     )
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, shipment_id) DO NOTHING`,
    [crypto.randomUUID(), scopedOrganizationId, shipmentId, actorUserId || null]
  );

  await queryable.query(
    `SELECT shipment_id
     FROM shipment_kootaj_details
     WHERE organization_id = $1
       AND shipment_id = $2
     FOR UPDATE`,
    [scopedOrganizationId, shipmentId]
  );

  const values = [scopedOrganizationId, shipmentId];
  const columns = [];
  for (const [field, value] of Object.entries(operationUpdates)) {
    if (!KOOTAJ_OPERATION_UPDATE_FIELD_SET.has(field)) continue;
    const column = KOOTAJ_COLUMN_BY_FIELD[field];
    if (!column) continue;
    values.push(kootajOperationDbValue(field, value));
    columns.push(`${column} = $${values.length}`);
  }
  if (columns.length) {
    values.push(actorUserId || null);
    columns.push(`updated_by_id = $${values.length}`);
    columns.push("updated_at = NOW()");
    await queryable.query(
      `UPDATE shipment_kootaj_details
       SET ${columns.join(", ")}
       WHERE organization_id = $1
         AND shipment_id = $2`,
      values
    );
  }

  if (syncShipmentV2Profile) {
    await syncShipmentV2DeclarationFromKootaj(queryable, {
      organizationId: scopedOrganizationId,
      shipmentId,
      actorUserId,
      shipmentRow,
      updates: operationUpdates,
    });
  }

  return Object.keys(operationUpdates);
}
