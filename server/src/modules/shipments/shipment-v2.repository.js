import crypto from "node:crypto";
import { requireOrganizationScope } from "../../shared/middleware/tenant.middleware.js";
import { withTransaction } from "../../db/transaction.js";
import {
  parseShipmentCode,
  reserveNextShipmentCode,
  resolveManualShipmentCode,
  SHIPMENT_CODE_ERRORS,
} from "../../../../src/server/shipment-codes.js";
import { assertBusinessEntityBelongsToTenant } from "../business-entities/business-entity.repository.js";
import { normalizeShipmentStatus } from "../../../../src/shared/shipment-statuses.js";
import {
  applyKootajOperationUpdates,
  hasKootajOperationUpdates,
  kootajOperationUpdatesFromShipmentV2Declaration,
} from "./kootaj/index.js";

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
    permits: { permitRows: [] },
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
      trackingNumber: body.trackingNumber || "",
      origin: body.origin || "",
      dischargePort: body.dischargePort || "",
      deliveryPort: body.deliveryPort || "",
      consigneeName: body.consigneeName || "",
      lenjType: body.lenjType || null,
      currentStage: "",
      orderRegistrationNumber: "",
      commercialCardId: null,
      commercialCardDisplayName: "",
      malvaniProfileId: null,
      malvaniDisplayName: "",
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
      trackingNumber: shipment.shipment_code || legacy.trackingNumber || "",
      origin: shipment.origin || legacy.origin || "",
      dischargePort: legacy.dischargePort || "",
      deliveryPort: legacy.deliveryPort || shipment.destination || "",
      consigneeName: legacy.consigneeName || "",
      lenjType: flowCode === "IMPORT_LANJ" ? legacy.lenjType || null : null,
      currentStage: legacy.currentStage || legacy.statusText || "",
      orderRegistrationNumber: "",
      commercialCardId: null,
      commercialCardDisplayName: "",
      malvaniProfileId: null,
      malvaniDisplayName: "",
    }),
    goods: cleanUndefined({
      container20Count: legacy.container20Count ?? null,
      container40Count: legacy.container40Count ?? null,
      goodsRows: Array.isArray(legacy.goodsRows) ? legacy.goodsRows : [],
    }),
  });
}

function normalizeSections(value) {
  const sections = defaultSections(jsonObject(value));
  if (sections.base && Object.prototype.hasOwnProperty.call(sections.base, "shipmentTitle")) {
    delete sections.base.shipmentTitle;
  }
  return sections;
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
  if (sectionKey === "declarationKootaj") {
    return {
      cotageNumber: cleaned.cotageNumber || "",
      customsRoute: cleaned.customsRoute || null,
      cotageRegistrationDate: cleaned.cotageRegistrationDate || "",
      totalValueAmount: cleaned.totalValueAmount ?? null,
      totalValueCurrency: cleaned.totalValueCurrency || "IRR",
      finalPaidAmount: cleaned.finalPaidAmount ?? null,
      finalPaidCurrency: cleaned.finalPaidCurrency || "IRR",
    };
  }
  if (sectionKey === "permits") {
    return {
      permitRows: Array.isArray(cleaned.permitRows)
        ? cleaned.permitRows
          .map((row) => ({
            permitName: String(row?.permitName || "").trim(),
            permitState: String(row?.permitState || "").trim(),
          }))
          .filter((row) => row.permitName)
        : [],
    };
  }
  if (sectionKey === "payments") {
    const customsTaxStatus = cleaned.customsTaxStatus || null;
    return {
      customsPaymentPaid: Boolean(cleaned.customsPaymentPaid),
      customsAmount: cleaned.customsAmount ?? null,
      customsAmountCurrency: cleaned.customsAmountCurrency || "IRR",
      customsDifferenceAmount: cleaned.customsDifferenceAmount ?? null,
      customsDifferenceCurrency: cleaned.customsDifferenceCurrency || "IRR",
      customsDifferencePaid: Boolean(cleaned.customsDifferencePaid),
      customsTaxStatus,
      customsTaxAmount: customsTaxStatus === "GOOD_STANDING" ? 0 : cleaned.customsTaxAmount ?? null,
      customsTaxCurrency: cleaned.customsTaxCurrency || "IRR",
      customsTaxPaid: customsTaxStatus === "GOOD_STANDING" ? false : Boolean(cleaned.customsTaxPaid),
    };
  }
  if (sectionKey === "banking") {
    return {
      bankName: cleaned.bankName || "",
      branchCode: cleaned.branchCode || "",
      branchName: cleaned.branchName || "",
      paymentInstrumentCode: cleaned.paymentInstrumentCode || "",
      sataCode: cleaned.sataCode || "",
    };
  }
  if (sectionKey === "base") {
    return {
      trackingNumber: cleaned.trackingNumber || "",
      origin: cleaned.origin || "",
      dischargePort: cleaned.dischargePort || "",
      deliveryPort: cleaned.deliveryPort || "",
      consigneeName: cleaned.consigneeName || "",
      lenjType: cleaned.lenjType || null,
      statusText: cleaned.statusText || "",
      currentStage: cleaned.currentStage || cleaned.statusText || "",
      orderRegistrationNumber: cleaned.orderRegistrationNumber || "",
      commercialCardId: cleaned.commercialCardId || null,
      commercialCardDisplayName: cleaned.commercialCardDisplayName || "",
      malvaniProfileId: cleaned.malvaniProfileId || null,
      malvaniDisplayName: cleaned.malvaniDisplayName || "",
    };
  }
  return {};
}

async function validateBaseSectionReferences(queryable, { organizationId, payload = {} } = {}) {
  if (payload.commercialCardId) {
    await assertBusinessEntityBelongsToTenant(queryable, {
      organizationId,
      entityType: "commercial_card",
      entityId: payload.commercialCardId,
    });
  }
  if (payload.malvaniProfileId) {
    await assertBusinessEntityBelongsToTenant(queryable, {
      organizationId,
      entityType: "malvani",
      entityId: payload.malvaniProfileId,
    });
  }
}

function toShipmentSummary(row, { includeCustomerPrivateDetails = true } = {}) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  const customerCode = row.customer_code || legacy.customerCode || legacy.customer_code || row.customer_id || legacy.customerId || "";
  return {
    id: row.id,
    trackingNumber: row.shipment_code || row.id,
    customerId: row.customer_id || "",
    customerCode,
    customerName: customerCode,
    status: normalizeShipmentStatus(row.status),
    timerStartedAt: row.timer_started_at || null,
    timerDeadlineAt: row.timer_deadline_at || null,
    timerCompletedAt: row.timer_completed_at || null,
    timerRemovedAt: row.timer_removed_at || null,
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

function composeProfileResponse({ shipment, profile, includeCustomerPrivateDetails = true }) {
  const shipmentSummary = toShipmentSummary(shipment, { includeCustomerPrivateDetails });
  const profileSummary = toProfile(profile);
  if (shipmentSummary && profileSummary?.sections?.base) {
    profileSummary.sections.base = {
      ...profileSummary.sections.base,
      trackingNumber: shipmentSummary.trackingNumber,
    };
  }
  return {
    shipment: shipmentSummary,
    profile: profileSummary,
  };
}

async function getShipmentRow(queryable, { organizationId, shipmentId, lock = false }) {
  const result = await queryable.query(
    `SELECT
       s.*,
       c.customer_code,
       COALESCE(c.company_name, c.contact_name, s.customer_name, s.legacy_data->>'customerName') AS customer_display_name
     FROM shipments s
     LEFT JOIN customers c
       ON c.id = s.customer_id
      AND c.organization_id = s.organization_id
      AND c.archived_at IS NULL
     WHERE s.id = $1
       AND s.organization_id = $2
       AND s.archived_at IS NULL
     LIMIT 1${lock ? " FOR UPDATE OF s" : ""}`,
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
    `SELECT id, customer_code, company_name, contact_name
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
    error.message = SHIPMENT_CODE_ERRORS.duplicate;
  }
  return error;
}

export async function createShipmentV2Record(pool, {
  organizationId,
  ownerUserId,
  actorUserId,
  body,
  canUseExistingCode = false,
  includeCustomerPrivateDetails = true,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "createShipmentV2Record");
  try {
    const created = await withTransaction(pool, async (client) => {
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
      let codeParts;
      if (body.codeMode === "existing") {
        if (!canUseExistingCode) {
          const error = new Error("Existing shipment code entry is restricted.");
          error.code = "FORBIDDEN";
          error.statusCode = 403;
          throw error;
        }
        codeParts = await resolveManualShipmentCode(client, {
          organizationId: scopedOrganizationId,
          shipmentCode: body.trackingNumber,
        });
      } else {
        codeParts = await reserveNextShipmentCode(client, {
          organizationId: scopedOrganizationId,
        });
      }
      const shipmentCode = codeParts.shipmentCode;
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
           shamsi_year, shamsi_date, shamsi_sequence,
           shipment_direction, transport_mode, shipment_type_code,
           origin, destination, legacy_data, created_by_id, updated_at
         )
          VALUES ($1, $2, $3, $4, $5, $6, 'LOADING', $7, $8, $9, 'import', 'sea', $10, $11, $12, $13::jsonb, $14, NOW())
         RETURNING *`,
        [
          shipmentId,
          scopedOrganizationId,
          ownerUserId,
          shipmentCode,
          body.customerId,
          customerName,
          codeParts.shamsiYear,
          codeParts.shamsiDate,
          codeParts.shamsiSequence,
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
        shipment: {
          ...shipmentResult.rows[0],
          customer_code: customer.customer_code,
          customer_display_name: customerName,
        },
        profile: profileResult.rows[0],
        includeCustomerPrivateDetails,
      });
    });
    return created;
  } catch (error) {
    throw setKnownError(error);
  }
}

export async function getShipmentV2Profile(pool, { organizationId, shipmentId, includeCustomerPrivateDetails = true } = {}) {
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
  return composeProfileResponse({ shipment, profile, includeCustomerPrivateDetails });
}

export async function initializeShipmentV2Profile(pool, {
  organizationId,
  shipmentId,
  actorUserId,
  includeCustomerPrivateDetails = true,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "initializeShipmentV2Profile");
  const initialized = await withTransaction(pool, async (client) => {
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
    if (existing) return composeProfileResponse({ shipment, profile: existing, includeCustomerPrivateDetails });

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
      includeCustomerPrivateDetails,
    });
  });
  return initialized;
}

export async function updateShipmentV2Section(pool, {
  organizationId,
  shipmentId,
  sectionKey,
  actorUserId,
  payload,
  canEditShipmentCode = false,
  includeCustomerPrivateDetails = true,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateShipmentV2Section");
  try {
    const updated = await withTransaction(pool, async (client) => {
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

    const before = composeProfileResponse({ shipment, profile, includeCustomerPrivateDetails });
    let normalizedPayload = payload;
    let nextShipmentCodeParts = null;
    if (sectionKey === "base") {
      await validateBaseSectionReferences(client, {
        organizationId: scopedOrganizationId,
        payload,
      });
      if (Object.prototype.hasOwnProperty.call(payload, "trackingNumber")) {
        const normalizedTrackingNumber = String(payload.trackingNumber || "").trim();
        if (normalizedTrackingNumber && normalizedTrackingNumber !== shipment.shipment_code) {
          if (!canEditShipmentCode) {
            const error = new Error("Existing shipment code entry is restricted.");
            error.code = "FORBIDDEN";
            error.statusCode = 403;
            throw error;
          }
          nextShipmentCodeParts = await resolveManualShipmentCode(client, {
            organizationId: scopedOrganizationId,
            shipmentCode: normalizedTrackingNumber,
            excludeShipmentId: shipmentId,
          });
          normalizedPayload = {
            ...payload,
            trackingNumber: nextShipmentCodeParts.shipmentCode,
          };
        } else if (!normalizedTrackingNumber) {
          parseShipmentCode(normalizedTrackingNumber);
        }
      }
    }
    const nextSections = {
      ...normalizeSections(profile.sections_json),
      [sectionKey]: normalizeSectionPayload(sectionKey, normalizedPayload),
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

    if (sectionKey === "declarationKootaj") {
      const kootajOperationUpdates = kootajOperationUpdatesFromShipmentV2Declaration(normalizedPayload);
      if (hasKootajOperationUpdates(kootajOperationUpdates)) {
        await applyKootajOperationUpdates(client, {
          organizationId: scopedOrganizationId,
          shipmentId,
          actorUserId,
          shipmentRow: shipment,
          updates: kootajOperationUpdates,
          syncShipmentV2Profile: false,
        });
      }
    }

    let nextShipment = shipment;
    const shipmentColumns = ["updated_at = NOW()"];
    const shipmentValues = [shipmentId, scopedOrganizationId];
    const addShipmentColumn = (column, value) => {
      shipmentValues.push(value);
      shipmentColumns.push(`${column} = $${shipmentValues.length}`);
    };
    if (sectionKey === "base") {
      if (Object.prototype.hasOwnProperty.call(payload, "trackingNumber")) {
        if (nextShipmentCodeParts) {
          addShipmentColumn("shipment_code", nextShipmentCodeParts.shipmentCode);
          addShipmentColumn("shamsi_year", nextShipmentCodeParts.shamsiYear);
          addShipmentColumn("shamsi_date", nextShipmentCodeParts.shamsiDate);
          addShipmentColumn("shamsi_sequence", nextShipmentCodeParts.shamsiSequence);
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, "origin")) addShipmentColumn("origin", payload.origin || null);
      if (Object.prototype.hasOwnProperty.call(payload, "deliveryPort")) addShipmentColumn("destination", payload.deliveryPort || null);
      if (Object.prototype.hasOwnProperty.call(payload, "status")) addShipmentColumn("status", normalizeShipmentStatus(payload.status));
    }
    const shipmentResult = await client.query(
      `UPDATE shipments
       SET ${shipmentColumns.join(", ")}
       WHERE id = $1
         AND organization_id = $2
       RETURNING *`,
      shipmentValues
    );
    nextShipment = shipmentResult.rows[0]
      ? {
          ...shipmentResult.rows[0],
          customer_code: shipment.customer_code,
          customer_display_name: shipment.customer_display_name,
        }
      : shipment;

    return {
      before,
      after: composeProfileResponse({
        shipment: nextShipment,
        profile: profileResult.rows[0],
        includeCustomerPrivateDetails,
      }),
      changedSection: sectionKey,
    };
  });
    return updated;
  } catch (error) {
    throw setKnownError(error);
  }
}

export function shipmentV2AuditSnapshot(response) {
  if (!response?.profile) return null;
  return {
    shipmentId: response.profile.shipmentId,
    flowCode: response.profile.flowCode,
    sections: response.profile.sections,
  };
}
