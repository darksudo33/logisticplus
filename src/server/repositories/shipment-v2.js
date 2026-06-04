import crypto from "node:crypto";
import { requireOrganizationScope } from "../tenant-scope.js";
import { withTransaction } from "../transaction.js";

export const SHIPMENT_V2_SECTION_KEYS = [
  "base",
  "orderRegistration",
  "goods",
  "declarationKootaj",
  "permits",
  "payments",
  "banking",
  "notes",
];

const FLOW_TO_SHIPMENT_TYPE = {
  IMPORT_LANJ: "IMPORT_LENJ",
  IMPORT_SHIP: "IMPORT_SEA_CONTAINER",
};

function jsonObject(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return value;
}

function cleanUndefined(value) {
  if (Array.isArray(value)) return value.map(cleanUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanUndefined(item)])
  );
}

function defaultSections(overrides = {}) {
  const sections = {
    base: {},
    orderRegistration: {},
    goods: { goodsRows: [] },
    declarationKootaj: {},
    permits: {},
    payments: {},
    banking: {},
    notes: { internalNote: "" },
  };
  for (const key of SHIPMENT_V2_SECTION_KEYS) {
    sections[key] = {
      ...sections[key],
      ...jsonObject(overrides[key]),
    };
  }
  return sections;
}

function sectionsForCreate(body) {
  return defaultSections({
    base: cleanUndefined({
      shipmentTitle: body.shipmentTitle || "",
      origin: body.origin || "",
      dischargePort: body.dischargePort || "",
      deliveryPort: body.deliveryPort || "",
      consigneeName: body.consigneeName || "",
      lenjType: body.lenjType || null,
    }),
    goods: cleanUndefined({
      container20Count: body.container20Count ?? null,
      container40Count: body.container40Count ?? null,
      goodsRows: body.goodsRows || [],
    }),
  });
}

function sectionsForExistingShipment(shipment) {
  const legacy = shipment?.legacy_data || {};
  const flowCode = deriveFlowCodeFromShipment(shipment);
  return defaultSections({
    base: cleanUndefined({
      shipmentTitle: legacy.shipmentTitle || "",
      origin: shipment.origin || legacy.origin || "",
      dischargePort: legacy.dischargePort || "",
      deliveryPort: legacy.deliveryPort || shipment.destination || "",
      consigneeName: legacy.consigneeName || "",
      lenjType: flowCode === "IMPORT_LANJ" ? legacy.lenjType || null : null,
    }),
    goods: cleanUndefined({
      container20Count: legacy.container20Count ?? null,
      container40Count: legacy.container40Count ?? null,
      goodsRows: Array.isArray(legacy.goodsRows) ? legacy.goodsRows : [],
    }),
  });
}

function normalizeSections(value) {
  return defaultSections(jsonObject(value));
}

function normalizeSectionPayload(sectionKey, payload = {}) {
  const cleaned = cleanUndefined(payload);
  if (sectionKey === "goods") {
    return {
      container20Count: cleaned.container20Count ?? null,
      container40Count: cleaned.container40Count ?? null,
      goodsRows: Array.isArray(cleaned.goodsRows) ? cleaned.goodsRows : [],
    };
  }
  if (sectionKey === "notes") {
    return {
      internalNote: cleaned.internalNote || "",
    };
  }
  if (sectionKey === "base") {
    return {
      shipmentTitle: cleaned.shipmentTitle || "",
      origin: cleaned.origin || "",
      dischargePort: cleaned.dischargePort || "",
      deliveryPort: cleaned.deliveryPort || "",
      consigneeName: cleaned.consigneeName || "",
      lenjType: cleaned.lenjType || null,
    };
  }
  return {};
}

function toShipmentSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    trackingNumber: row.shipment_code || row.id,
    customerId: row.customer_id || "",
    customerName: row.customer_name || "",
    status: row.status || "PENDING",
    shipmentDirection: row.shipment_direction || "import",
    transportMode: row.transport_mode || "",
    shipmentTypeCode: row.shipment_type_code || "",
    origin: row.origin || "",
    destination: row.destination || "",
    estimatedDelivery: row.estimated_delivery_at || "",
    assignedManagerId: row.assigned_manager_id || null,
    isExitedArchived: Boolean(row.exited_archived_at),
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  };
}

function toProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    shipmentId: row.shipment_id,
    flowCode: row.flow_code,
    sections: normalizeSections(row.sections_json),
    createdById: row.created_by_id || null,
    updatedById: row.updated_by_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function composeProfileResponse({ shipment, profile }) {
  return {
    shipment: toShipmentSummary(shipment),
    profile: toProfile(profile),
  };
}

async function getShipmentRow(queryable, { organizationId, shipmentId, lock = false }) {
  const result = await queryable.query(
    `SELECT *
     FROM shipments
     WHERE id = $1
       AND organization_id = $2
       AND archived_at IS NULL
     LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [shipmentId, organizationId]
  );
  return result.rows[0] || null;
}

async function getProfileRow(queryable, { organizationId, shipmentId, lock = false }) {
  const result = await queryable.query(
    `SELECT *
     FROM shipment_v2_profiles
     WHERE shipment_id = $1
       AND organization_id = $2
     LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [shipmentId, organizationId]
  );
  return result.rows[0] || null;
}

async function getCustomerRow(queryable, { organizationId, customerId }) {
  const result = await queryable.query(
    `SELECT id, company_name, contact_name
     FROM customers
     WHERE id = $1
       AND organization_id = $2
       AND archived_at IS NULL
     LIMIT 1`,
    [customerId, organizationId]
  );
  return result.rows[0] || null;
}

function deriveFlowCodeFromShipment(shipment) {
  const legacy = shipment?.legacy_data || {};
  if (legacy.importMethod === "LENJ" || shipment?.shipment_type_code === "IMPORT_LENJ") return "IMPORT_LANJ";
  return "IMPORT_SHIP";
}

function setKnownError(error) {
  if (error?.code === "23505") {
    error.statusCode = 409;
    error.code = "SHIPMENT_CODE_EXISTS";
    error.message = "Shipment tracking number already exists.";
  }
  return error;
}

export async function createShipmentV2Record(pool, {
  organizationId,
  ownerUserId,
  actorUserId,
  body,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createShipmentV2Record");
  try {
    return await withTransaction(pool, async (client) => {
      const customer = await getCustomerRow(client, {
        organizationId: scopedOrganizationId,
        customerId: body.customerId,
      });
      if (!customer) {
        const error = new Error("Shipment customer was not found.");
        error.code = "CUSTOMER_NOT_FOUND";
        error.statusCode = 404;
        throw error;
      }

      const shipmentId = crypto.randomUUID();
      const profileId = crypto.randomUUID();
      const shipmentCode = String(body.trackingNumber || `LP-${Date.now()}`).trim();
      const shipmentTypeCode = FLOW_TO_SHIPMENT_TYPE[body.flowCode] || "IMPORT_SEA_CONTAINER";
      const customerName = customer.company_name || customer.contact_name || "";
      const legacyData = {
        trackingNumber: shipmentCode,
        customerId: body.customerId,
        customerName,
        shipmentTypeCode,
        shipmentDirection: "import",
        transportMode: "sea",
      };

      const shipmentResult = await client.query(
        `INSERT INTO shipments (
           id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
           shipment_direction, transport_mode, shipment_type_code,
           origin, destination, legacy_data, created_by_id, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'import', 'sea', $7, $8, $9, $10::jsonb, $11, NOW())
         RETURNING *`,
        [
          shipmentId,
          scopedOrganizationId,
          ownerUserId,
          shipmentCode,
          body.customerId,
          customerName,
          shipmentTypeCode,
          body.origin || null,
          body.deliveryPort || null,
          JSON.stringify(legacyData),
          actorUserId || ownerUserId,
        ]
      );

      const profileResult = await client.query(
        `INSERT INTO shipment_v2_profiles (
           id, organization_id, shipment_id, flow_code, sections_json, created_by_id, updated_by_id, updated_at
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6, NOW())
         RETURNING *`,
        [
          profileId,
          scopedOrganizationId,
          shipmentId,
          body.flowCode,
          JSON.stringify(sectionsForCreate(body)),
          actorUserId || ownerUserId,
        ]
      );

      return composeProfileResponse({
        shipment: shipmentResult.rows[0],
        profile: profileResult.rows[0],
      });
    });
  } catch (error) {
    throw setKnownError(error);
  }
}

export async function getShipmentV2Profile(pool, { organizationId, shipmentId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getShipmentV2Profile");
  const shipment = await getShipmentRow(pool, {
    organizationId: scopedOrganizationId,
    shipmentId,
  });
  if (!shipment) return null;
  const profile = await getProfileRow(pool, {
    organizationId: scopedOrganizationId,
    shipmentId,
  });
  return composeProfileResponse({ shipment, profile });
}

export async function initializeShipmentV2Profile(pool, {
  organizationId,
  shipmentId,
  actorUserId,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "initializeShipmentV2Profile");
  return withTransaction(pool, async (client) => {
    const shipment = await getShipmentRow(client, {
      organizationId: scopedOrganizationId,
      shipmentId,
      lock: true,
    });
    if (!shipment) return null;

    const existing = await getProfileRow(client, {
      organizationId: scopedOrganizationId,
      shipmentId,
      lock: true,
    });
    if (existing) return composeProfileResponse({ shipment, profile: existing });

    const profileResult = await client.query(
      `INSERT INTO shipment_v2_profiles (
         id, organization_id, shipment_id, flow_code, sections_json, created_by_id, updated_by_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6, NOW())
       RETURNING *`,
      [
        crypto.randomUUID(),
        scopedOrganizationId,
        shipmentId,
        deriveFlowCodeFromShipment(shipment),
        JSON.stringify(sectionsForExistingShipment(shipment)),
        actorUserId,
      ]
    );

    return composeProfileResponse({
      shipment,
      profile: profileResult.rows[0],
    });
  });
}

export async function updateShipmentV2Section(pool, {
  organizationId,
  shipmentId,
  sectionKey,
  actorUserId,
  payload,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateShipmentV2Section");
  return withTransaction(pool, async (client) => {
    const shipment = await getShipmentRow(client, {
      organizationId: scopedOrganizationId,
      shipmentId,
      lock: true,
    });
    if (!shipment) return null;

    const profile = await getProfileRow(client, {
      organizationId: scopedOrganizationId,
      shipmentId,
      lock: true,
    });
    if (!profile) {
      const error = new Error("Shipment V2 profile has not been initialized.");
      error.code = "SHIPMENT_V2_PROFILE_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }

    const before = composeProfileResponse({ shipment, profile });
    const nextSections = {
      ...normalizeSections(profile.sections_json),
      [sectionKey]: normalizeSectionPayload(sectionKey, payload),
    };

    const profileResult = await client.query(
      `UPDATE shipment_v2_profiles
       SET sections_json = $3::jsonb,
           updated_by_id = $4,
           updated_at = NOW()
       WHERE shipment_id = $1
         AND organization_id = $2
       RETURNING *`,
      [shipmentId, scopedOrganizationId, JSON.stringify(nextSections), actorUserId]
    );

    let nextShipment = shipment;
    if (sectionKey === "base") {
      const columns = [];
      const values = [shipmentId, scopedOrganizationId];
      const addColumn = (column, value) => {
        values.push(value);
        columns.push(`${column} = $${values.length}`);
      };
      if (Object.prototype.hasOwnProperty.call(payload, "origin")) addColumn("origin", payload.origin || null);
      if (Object.prototype.hasOwnProperty.call(payload, "deliveryPort")) addColumn("destination", payload.deliveryPort || null);
      if (columns.length) {
        const shipmentResult = await client.query(
          `UPDATE shipments
           SET ${columns.join(", ")},
               updated_at = NOW()
           WHERE id = $1
             AND organization_id = $2
           RETURNING *`,
          values
        );
        nextShipment = shipmentResult.rows[0] || shipment;
      }
    }

    return {
      before,
      after: composeProfileResponse({
        shipment: nextShipment,
        profile: profileResult.rows[0],
      }),
      changedSection: sectionKey,
    };
  });
}

export function shipmentV2AuditSnapshot(response) {
  if (!response?.profile) return null;
  return {
    shipmentId: response.profile.shipmentId,
    flowCode: response.profile.flowCode,
    sections: response.profile.sections,
  };
}
