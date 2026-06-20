import crypto from "node:crypto";
import {
  DAILY_STATUS_COMMON_STATUSES,
  DAILY_STATUS_KOOTAJ_FIELDS,
  DAILY_STATUS_PATCH_FIELDS,
  DAILY_STATUS_RELATIONSHIP_FIELDS,
} from "../../../../src/shared/daily-status-board.js";
import {
  IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
  IR_IMPORT_CUSTOMS_PHASES,
  IR_IMPORT_CUSTOMS_STEPS,
  getIranImportPhase,
  getIranImportStep,
} from "../../../../src/shared/iran-import-customs-workflow.js";
import { isShipmentTerminalStatus, normalizeShipmentStatus, shipmentStatusLabel } from "../../../../src/shared/shipment-statuses.js";
import { normalizeWorkflowDefinition } from "../../../../src/server/repositories/shipment-workflow-templates.js";
import { shipmentTimerOrderBy } from "../../../../src/server/repositories/shipment-sort.js";
import {
  getActiveShipmentFormTemplateForShipment,
  validateCustomFieldPatchForTemplate,
} from "../../../../src/server/repositories/shipment-form-templates.js";
import { requireOrganizationScope } from "../../shared/middleware/tenant.middleware.js";
import { withTransaction } from "../../db/transaction.js";
import {
  BASE_INFO_PATCH_FIELDS,
  BASE_SECTION_DEFAULTS,
  KOOTAJ_COLUMN_BY_FIELD,
  KOOTAJ_OPERATION_UPDATE_FIELDS,
  applyKootajOperationUpdates,
  baseSectionPatchFromUpdates,
  defaultV2SectionsForShipment,
} from "../shipments/kootaj/index.js";

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
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

function v2BaseSection(row) {
  return jsonObject(row.v2_sections_json?.base);
}

function v2GoodsSection(row) {
  return jsonObject(row.v2_sections_json?.goods);
}

function v2ProfileSections(row) {
  return jsonObject(row.v2_sections_json);
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function commonStatusValue(value) {
  return DAILY_STATUS_COMMON_STATUSES.includes(value) ? value : null;
}

function commercialCardStatus(card) {
  if (!card) return null;
  if (card.status) return card.status;
  const expirationTime = Date.parse(card.expirationDate || "");
  if (!Number.isFinite(expirationTime)) return null;
  const daysLeft = Math.ceil((expirationTime - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0) return "EXPIRED";
  if (daysLeft <= 30) return "EXPIRING_SOON";
  return "VALID";
}

function summarizeCommercialCard(row) {
  const card = row.commercial_card_data || null;
  const id = row.commercial_card_id || card?.id || null;
  if (!id || !card) return null;
  return {
    id,
    displayName: card.holderName || card.responsibleName || card.cardNumber || id,
    cardNumber: card.cardNumber || "",
    status: commercialCardStatus(card),
  };
}

function isLenjShipment(row, base = {}) {
  const flowCode = normalizeText(row.v2_flow_code).toUpperCase();
  const shipmentTypeCode = normalizeText(row.shipment_type_code).toUpperCase();
  const lenjType = normalizeText(base.lenjType).toUpperCase();
  return (
    flowCode === "IMPORT_LANJ" ||
    flowCode === "IMPORT_LENJ" ||
    shipmentTypeCode.includes("LENJ") ||
    shipmentTypeCode.includes("LANJ") ||
    lenjType === "MALVANI" ||
    lenjType === "TEH_LENJI"
  );
}

function composeBaseInfo(row, { commercialCard, workflow, includeCustomerPrivateDetails = true } = {}) {
  const base = v2BaseSection(row);
  const isLenj = isLenjShipment(row, base);
  const credentialLabel = isLenj ? "ملوانی" : "کارت بازرگانی";
  const credentialId = isLenj
    ? normalizeText(base.malvaniProfileId)
    : normalizeText(base.commercialCardId || commercialCard?.id || row.kootaj_commercial_card_id);
  const credentialDisplayName = isLenj
    ? normalizeText(base.malvaniDisplayName || base.malvaniProfileId)
    : normalizeText(base.commercialCardDisplayName || commercialCard?.displayName || row.kootaj_commercial_card_id);
  const customerCode = normalizeText(row.customer_code || row.customer_id);
  const customerName = customerCode;
  return {
    code: normalizeText(row.shipment_code || row.shipment_id),
    customerCode,
    customerName,
    statusText: shipmentStatusLabel(row.shipment_status),
    orderRegistrationNumber: normalizeText(base.orderRegistrationNumber || row.order_registration_number),
    origin: normalizeText(base.origin || row.origin),
    dischargePort: normalizeText(base.dischargePort),
    deliveryPort: normalizeText(base.deliveryPort || row.destination),
    consigneeName: normalizeText(base.consigneeName),
    credentialType: isLenj ? "malvani" : "commercial_card",
    credentialId,
    credentialLabel,
    credentialDisplayName,
    documentCount: numberValue(row.document_total_count),
    currentStage: normalizeText(base.currentStage || workflow?.currentStepLabel),
    updatedAt: row.v2_profile_updated_at || row.kootaj_updated_at || row.shipment_updated_at || null,
    updatedByName: normalizeText(row.v2_updated_by_name),
  };
}

function fallbackWorkflowDefinition() {
  return normalizeWorkflowDefinition({
    key: IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
    code: IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
    version: 1,
    phases: IR_IMPORT_CUSTOMS_PHASES,
    steps: IR_IMPORT_CUSTOMS_STEPS.map((step) => ({
      ...step,
      phaseKey: step.phaseId,
      stepKey: step.code,
    })),
  });
}

function workflowStepFromDefinition(definition, stepCode) {
  return (definition?.steps || []).find((step) => step.code === stepCode || step.stepKey === stepCode) || null;
}

function workflowPhaseFromDefinition(definition, phaseId) {
  return (definition?.phases || []).find((phase) => phase.id === phaseId || phase.phaseKey === phaseId) || null;
}

function summarizeWorkflow(row) {
  if (!row.workflow_id) return null;
  const definition = normalizeWorkflowDefinition(row.workflow_definition_snapshot_json) || fallbackWorkflowDefinition();
  const currentStep =
    workflowStepFromDefinition(definition, row.workflow_current_step_code) ||
    getIranImportStep(row.workflow_current_step_code);
  const currentPhase = currentStep
    ? workflowPhaseFromDefinition(definition, currentStep.phaseId || currentStep.phaseKey) ||
      getIranImportPhase(currentStep.phaseId)
    : null;
  return {
    currentPhase: currentPhase?.labelFa || currentPhase?.labelEn || "",
    currentStepCode: row.workflow_current_step_code || null,
    currentStepLabel: currentStep?.labelFa || currentStep?.labelEn || row.workflow_current_step_code || "",
    route: row.workflow_customs_route || null,
    completedCount: numberValue(row.workflow_completed_count),
    totalCount: numberValue(row.workflow_total_count),
  };
}

function sumNullable(values) {
  const numbers = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0);
}

function composeGoodsInfo(row) {
  const goods = v2GoodsSection(row);
  const goodsRows = Array.isArray(goods.goodsRows)
    ? goods.goodsRows
      .map((item) => ({
        description: normalizeText(item?.description).trim(),
        packagingType: normalizeText(item?.packagingType).trim(),
        quantity: nullableNumber(item?.quantity),
        weight: nullableNumber(item?.weight),
        cbm: nullableNumber(item?.cbm),
        pcs: nullableNumber(item?.pcs),
      }))
      .filter((item) => item.description)
    : [];
  const goodsSummary = goodsRows.map((item) => item.description).filter(Boolean).join("، ") || normalizeText(row.goods_summary);
  const packagingSummary = goodsRows.map((item) => item.packagingType).filter(Boolean).join("، ") ||
    (row.package_count ? `${row.package_count} بسته` : "");
  return {
    container20Count: nullableNumber(goods.container20Count),
    container40Count: nullableNumber(goods.container40Count),
    goodsRows,
    goodsSummary,
    packagingSummary,
    totalQuantity: sumNullable(goodsRows.map((item) => item.quantity)),
    totalWeight: sumNullable(goodsRows.map((item) => item.weight)),
    totalCbm: sumNullable(goodsRows.map((item) => item.cbm)),
    totalPcs: sumNullable(goodsRows.map((item) => item.pcs)),
  };
}

export function composeDailyStatusRow(row, { includeCustomerPrivateDetails = true } = {}) {
  const customerId = row.customer_id || null;
  const customerCode = normalizeText(row.customer_code || row.customer_id);
  const customerName = customerCode;
  const commercialCard = summarizeCommercialCard(row);
  const workflow = summarizeWorkflow(row);
  const kootajUpdatedAt = row.kootaj_updated_at || null;
  return {
    id: row.shipment_id,
    // Client-facing optimistic concurrency token for Kootaj-owned operation fields.
    kootajUpdatedAt,
    shipment: {
      id: row.shipment_id,
      code: row.shipment_code || row.shipment_id,
      status: normalizeShipmentStatus(row.shipment_status),
      origin: normalizeText(row.origin),
      destination: normalizeText(row.destination),
      shipmentTypeCode: row.shipment_type_code || "IMPORT_SEA_CONTAINER",
      shipmentDirection: row.shipment_direction || "import",
      transportMode: row.transport_mode || null,
      assignedManagerId: row.assigned_manager_id || null,
      assignedManagerName: normalizeText(row.assigned_manager_name),
      updatedAt: row.shipment_updated_at,
    },
    customer: customerName
      ? {
          id: customerId || "",
          name: customerName,
          customerCode,
        }
      : null,
    kootaj: {
      commercialCardId: row.kootaj_commercial_card_id || null,
      orderRegistrationNumber: normalizeText(row.order_registration_number),
      orderRegistrationDate: row.order_registration_date || null,
      orderRegistrationExpiryDate: row.order_registration_expiry_date || null,
      orderRegistrationStatus: row.order_registration_status || null,
      proformaNumber: normalizeText(row.proforma_number),
      proformaDate: row.proforma_date || null,
      foreignSellerName: normalizeText(row.foreign_seller_name),
      foreignSellerCode: normalizeText(row.foreign_seller_code),
      goodsIdSummary: normalizeText(row.goods_id_summary),
      hsCodeSummary: normalizeText(row.hs_code_summary),
      orderPermitStatus: row.order_permit_status || null,
      fxSourceStatus: row.fx_source_status || null,
      currencyType: normalizeText(row.currency_type),
      currencyAmount: nullableNumber(row.currency_amount),
      bankName: normalizeText(row.bank_name),
      bankTrackingNumber: normalizeText(row.bank_tracking_number),
      fxAllocationDate: row.fx_allocation_date || null,
      bankProcessStatus: row.bank_process_status || null,
      insuranceNumber: normalizeText(row.insurance_number),
      inspectionCertificateNumber: normalizeText(row.inspection_certificate_number),
      bookingNumber: normalizeText(row.booking_number),
      billOfLadingNumber: normalizeText(row.bill_of_lading_number),
      transportDocumentNumber: normalizeText(row.transport_document_number),
      preAlertDate: row.pre_alert_date || null,
      cotageNumber: normalizeText(row.cotage_number),
      customsStatus: row.customs_status || null,
      customsRoute: row.kootaj_customs_route || null,
      customsOffice: normalizeText(row.customs_office),
      declarationReference: normalizeText(row.declaration_reference),
      declarationDate: row.declaration_date || null,
      cotageDate: row.cotage_date || null,
      containerSummary: normalizeText(row.container_summary),
      goodsSummary: normalizeText(row.goods_summary),
      packageCount: nullableNumber(row.package_count),
      grossWeightKg: nullableNumber(row.gross_weight_kg),
      netWeightKg: nullableNumber(row.net_weight_kg),
      arrivalNoticeNumber: normalizeText(row.arrival_notice_number),
      arrivalDate: row.arrival_date || null,
      manifestNumber: normalizeText(row.manifest_number),
      deliveryOrderNumber: normalizeText(row.delivery_order_number),
      warehouseName: normalizeText(row.warehouse_name),
      warehouseReceiptNumber: normalizeText(row.warehouse_receipt_number),
      warehouseReceiptDate: row.warehouse_receipt_date || null,
      evaluatorName: normalizeText(row.evaluator_name),
      expertName: normalizeText(row.expert_name),
      documentControlStatus: row.document_control_status || null,
      physicalInspectionStatus: row.physical_inspection_status || null,
      physicalInspectionDate: row.physical_inspection_date || null,
      labStatus: row.lab_status || null,
      labResultDate: row.lab_result_date || null,
      tariffReviewStatus: row.tariff_review_status || null,
      valuationStatus: row.valuation_status || null,
      legalPermitStatus: row.legal_permit_status || null,
      standardPermitStatus: row.standard_permit_status || null,
      healthPermitStatus: row.health_permit_status || null,
      quarantinePermitStatus: row.quarantine_permit_status || null,
      otherPermitNotes: normalizeText(row.other_permit_notes),
      taxPaymentStatus: row.tax_payment_status || null,
      customsPaymentStatus: commonStatusValue(row.tax_payment_status),
      dutiesAmount: nullableNumber(row.duties_amount),
      taxAmount: nullableNumber(row.tax_amount),
      customsPaymentDate: row.customs_payment_date || null,
      paymentReference: normalizeText(row.payment_reference),
      cashierConfirmationStatus: row.cashier_confirmation_status || null,
      warehouseChargesStatus: row.warehouse_charges_status || null,
      terminalChargesStatus: row.terminal_charges_status || null,
      demurrageStatus: row.demurrage_status || null,
      loadingPermitNumber: normalizeText(row.loading_permit_number),
      loadingPermitDate: row.loading_permit_date || null,
      truckPlate: normalizeText(row.truck_plate),
      driverName: normalizeText(row.driver_name),
      gatePassNumber: normalizeText(row.gate_pass_number),
      exitGateStatus: row.exit_gate_status || null,
      releaseStatus: row.release_status || null,
      exitDate: row.exit_date || null,
      deliveryDate: row.delivery_date || null,
      internalNote: normalizeText(row.internal_note),
      customFields: row.custom_fields_json || {},
      updatedAt: kootajUpdatedAt,
      updatedById: row.kootaj_updated_by_id || null,
    },
    v2Profile: row.v2_profile_id
      ? {
          id: row.v2_profile_id,
          flowCode: row.v2_flow_code || null,
          sections: v2ProfileSections(row),
        }
      : null,
    baseInfo: {
      ...composeBaseInfo(row, { commercialCard, workflow, includeCustomerPrivateDetails }),
      goods: composeGoodsInfo(row),
    },
    commercialCard,
    workflow,
    tasks: {
      openCount: numberValue(row.open_task_count),
      overdueCount: numberValue(row.overdue_task_count),
      assignedUserNames: Array.isArray(row.assigned_task_user_names)
        ? row.assigned_task_user_names.filter(Boolean)
        : [],
    },
    documents: {
      totalCount: numberValue(row.document_total_count),
      customerVisibleCount: numberValue(row.customer_visible_document_count),
      missingRequiredCount: 0,
    },
    links: {
      shipmentDetailUrl: `/shipments/${encodeURIComponent(row.shipment_id)}`,
      customerDetailUrl: customerId ? `/customers/${encodeURIComponent(customerId)}` : null,
      commercialCardDetailUrl: commercialCard ? "/commercial-cards" : null,
    },
  };
}

function appendFilter(values, conditions, sql, value) {
  values.push(value);
  conditions.push(sql.replace("?", `$${values.length}`));
}

function dailyStatusQuery(filters = {}, organizationId, { includeCustomerPrivateDetails = true } = {}) {
  const values = [organizationId];
  const conditions = ["s.organization_id = $1", "s.archived_at IS NULL"];
  if (!filters.includeExited) conditions.push("s.exited_archived_at IS NULL");

  if (filters.shipmentId) appendFilter(values, conditions, "s.id = ?", filters.shipmentId);
  if (filters.commercialCardId) appendFilter(values, conditions, "k.commercial_card_id = ?", filters.commercialCardId);
  if (filters.customsRoute) appendFilter(values, conditions, "k.customs_route = ?", filters.customsRoute);
  if (filters.shipmentStatus) appendFilter(values, conditions, "s.status = ?", normalizeShipmentStatus(filters.shipmentStatus));
  if (filters.q) {
    const searchParam = `%${filters.q}%`;
    values.push(searchParam);
    const param = `$${values.length}`;
    const privateCustomerSearch = includeCustomerPrivateDetails
      ? `
      OR s.customer_name ILIKE ${param}
      OR c.company_name ILIKE ${param}
      OR c.contact_name ILIKE ${param}`
      : "";
    conditions.push(`(
      s.shipment_code ILIKE ${param}
      OR c.customer_code ILIKE ${param}
      ${privateCustomerSearch}
      OR k.cotage_number ILIKE ${param}
      OR k.customs_office ILIKE ${param}
      OR k.declaration_reference ILIKE ${param}
      OR k.order_registration_number ILIKE ${param}
      OR k.proforma_number ILIKE ${param}
      OR k.bank_tracking_number ILIKE ${param}
      OR k.bill_of_lading_number ILIKE ${param}
      OR k.manifest_number ILIKE ${param}
      OR k.payment_reference ILIKE ${param}
      OR k.truck_plate ILIKE ${param}
      OR sv2.sections_json #>> '{base,orderRegistrationNumber}' ILIKE ${param}
      OR sv2.sections_json #>> '{base,currentStage}' ILIKE ${param}
      OR sv2.sections_json #>> '{base,commercialCardDisplayName}' ILIKE ${param}
      OR sv2.sections_json #>> '{base,malvaniDisplayName}' ILIKE ${param}
      OR cards.data->>'holderName' ILIKE ${param}
      OR cards.data->>'cardNumber' ILIKE ${param}
    )`);
  }

  values.push(filters.limit || 50);
  const limitParam = `$${values.length}`;

  return {
    values,
    sql: `
      WITH commercial_cards AS (
        SELECT DISTINCT ON (organization_id, item_id)
          organization_id,
          item_id,
          data
        FROM user_records
        WHERE organization_id = $1
          AND collection = 'commercialCards'
          AND COALESCE(data->>'isArchived', 'false') <> 'true'
          AND COALESCE(data->>'archivedAt', '') = ''
        ORDER BY organization_id, item_id, updated_at DESC
      ),
      workflow_summary AS (
        SELECT
          wi.organization_id,
          wi.shipment_id,
          wi.id,
          wi.current_step_code,
          wi.customs_route,
          wi.workflow_definition_snapshot_json,
          COUNT(st.step_code) FILTER (WHERE st.is_visible = TRUE) AS total_count,
          COUNT(st.step_code) FILTER (WHERE st.is_visible = TRUE AND st.status = 'completed') AS completed_count
        FROM (
          SELECT *,
                 ROW_NUMBER() OVER (
                   PARTITION BY organization_id, shipment_id
                   ORDER BY created_at DESC
                 ) AS workflow_rank
          FROM shipment_workflow_instances
          WHERE organization_id = $1
            AND status <> 'cancelled'
        ) wi
        LEFT JOIN shipment_workflow_step_states st
          ON st.workflow_instance_id = wi.id
         AND st.organization_id = wi.organization_id
         AND st.shipment_id = wi.shipment_id
        WHERE wi.workflow_rank = 1
        GROUP BY wi.organization_id, wi.shipment_id, wi.id, wi.current_step_code, wi.customs_route, wi.workflow_definition_snapshot_json
      ),
      task_summary AS (
        SELECT
          t.organization_id,
          t.shipment_id,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(t.status, '')) NOT IN ('done', 'cancelled', 'completed')
          ) AS open_count,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(t.status, '')) NOT IN ('done', 'cancelled', 'completed')
              AND t.due_at ~ '^\\d{4}-\\d{2}-\\d{2}'
              AND t.due_at::timestamptz < NOW()
          ) AS overdue_count,
          array_remove(
            array_agg(DISTINCT COALESCE(NULLIF(assigned_task_user.name, ''), NULLIF(t.assigned_to_name, '')))
              FILTER (WHERE t.assigned_to_id IS NOT NULL OR NULLIF(t.assigned_to_name, '') IS NOT NULL),
            NULL
          ) AS assigned_user_names
        FROM tasks t
        LEFT JOIN app_users assigned_task_user
          ON assigned_task_user.id = t.assigned_to_id
         AND assigned_task_user.organization_id = t.organization_id
        WHERE t.organization_id = $1
          AND t.shipment_id IS NOT NULL
        GROUP BY t.organization_id, t.shipment_id
      ),
      document_summary AS (
        SELECT
          d.organization_id,
          d.shipment_id,
          COUNT(*) FILTER (WHERE d.archived_at IS NULL) AS total_count,
          COUNT(*) FILTER (WHERE d.archived_at IS NULL AND d.visibility = 'customer_visible') AS customer_visible_count
        FROM documents d
        WHERE d.organization_id = $1
          AND d.shipment_id IS NOT NULL
        GROUP BY d.organization_id, d.shipment_id
      )
      SELECT
        s.id AS shipment_id,
        s.shipment_code,
        s.status AS shipment_status,
        s.shipment_direction,
        s.transport_mode,
        s.shipment_type_code,
        s.origin,
        s.destination,
        s.updated_at AS shipment_updated_at,
        s.assigned_manager_id,
        assigned_manager.name AS assigned_manager_name,
        s.customer_id,
        s.customer_name,
        c.customer_code AS customer_code,
        COALESCE(c.company_name, c.contact_name, s.customer_name, s.legacy_data->>'customerName') AS customer_display_name,
        k.commercial_card_id AS kootaj_commercial_card_id,
        k.order_registration_number,
        k.order_registration_date,
        k.order_registration_expiry_date,
        k.order_registration_status,
        k.proforma_number,
        k.proforma_date,
        k.foreign_seller_name,
        k.foreign_seller_code,
        k.goods_id_summary,
        k.hs_code_summary,
        k.order_permit_status,
        k.fx_source_status,
        k.currency_type,
        k.currency_amount,
        k.bank_name,
        k.bank_tracking_number,
        k.fx_allocation_date,
        k.bank_process_status,
        k.insurance_number,
        k.inspection_certificate_number,
        k.booking_number,
        k.bill_of_lading_number,
        k.transport_document_number,
        k.pre_alert_date,
        k.cotage_number,
        k.customs_status,
        k.customs_route AS kootaj_customs_route,
        k.customs_office,
        k.declaration_reference,
        k.declaration_date,
        k.cotage_date,
        k.container_summary,
        k.goods_summary,
        k.package_count,
        k.gross_weight_kg,
        k.net_weight_kg,
        k.arrival_notice_number,
        k.arrival_date,
        k.manifest_number,
        k.delivery_order_number,
        k.warehouse_name,
        k.warehouse_receipt_number,
        k.warehouse_receipt_date,
        k.evaluator_name,
        k.expert_name,
        k.document_control_status,
        k.physical_inspection_status,
        k.physical_inspection_date,
        k.lab_status,
        k.lab_result_date,
        k.tariff_review_status,
        k.valuation_status,
        k.legal_permit_status,
        k.standard_permit_status,
        k.health_permit_status,
        k.quarantine_permit_status,
        k.other_permit_notes,
        k.tax_payment_status,
        k.duties_amount,
        k.tax_amount,
        k.customs_payment_date,
        k.payment_reference,
        k.cashier_confirmation_status,
        k.warehouse_charges_status,
        k.terminal_charges_status,
        k.demurrage_status,
        k.loading_permit_number,
        k.loading_permit_date,
        k.truck_plate,
        k.driver_name,
        k.gate_pass_number,
        k.exit_gate_status,
        k.release_status,
        k.exit_date,
        k.delivery_date,
        k.internal_note,
        k.custom_fields_json,
        k.updated_at AS kootaj_updated_at,
        k.updated_by_id AS kootaj_updated_by_id,
        sv2.id AS v2_profile_id,
        sv2.flow_code AS v2_flow_code,
        sv2.sections_json AS v2_sections_json,
        sv2.updated_at AS v2_profile_updated_at,
        v2_updated_user.name AS v2_updated_by_name,
        cards.item_id AS commercial_card_id,
        cards.data AS commercial_card_data,
        wf.id AS workflow_id,
        wf.current_step_code AS workflow_current_step_code,
        wf.customs_route AS workflow_customs_route,
        wf.workflow_definition_snapshot_json,
        wf.total_count AS workflow_total_count,
        wf.completed_count AS workflow_completed_count,
        COALESCE(ts.open_count, 0) AS open_task_count,
        COALESCE(ts.overdue_count, 0) AS overdue_task_count,
        COALESCE(ts.assigned_user_names, ARRAY[]::text[]) AS assigned_task_user_names,
        COALESCE(ds.total_count, 0) AS document_total_count,
        COALESCE(ds.customer_visible_count, 0) AS customer_visible_document_count
      FROM shipments s
      LEFT JOIN customers c
        ON c.id = s.customer_id
       AND c.organization_id = s.organization_id
       AND c.archived_at IS NULL
      LEFT JOIN shipment_kootaj_details k
        ON k.shipment_id = s.id
       AND k.organization_id = s.organization_id
      LEFT JOIN shipment_v2_profiles sv2
        ON sv2.shipment_id = s.id
       AND sv2.organization_id = s.organization_id
      LEFT JOIN app_users v2_updated_user
        ON v2_updated_user.id = COALESCE(sv2.updated_by_id, sv2.created_by_id)
       AND v2_updated_user.organization_id = s.organization_id
      LEFT JOIN commercial_cards cards
        ON cards.organization_id = s.organization_id
       AND (cards.item_id = k.commercial_card_id OR cards.data->>'id' = k.commercial_card_id)
      LEFT JOIN workflow_summary wf
        ON wf.shipment_id = s.id
       AND wf.organization_id = s.organization_id
      LEFT JOIN task_summary ts
        ON ts.shipment_id = s.id
       AND ts.organization_id = s.organization_id
      LEFT JOIN document_summary ds
        ON ds.shipment_id = s.id
       AND ds.organization_id = s.organization_id
      LEFT JOIN app_users assigned_manager
        ON assigned_manager.id = s.assigned_manager_id
       AND assigned_manager.organization_id = s.organization_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY ${shipmentTimerOrderBy("s")}
      LIMIT ${limitParam}
    `,
  };
}

export async function getDailyStatusBoardRows(queryable, { organizationId, filters = {}, includeCustomerPrivateDetails = true } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "getDailyStatusBoardRows");
  const query = dailyStatusQuery(filters, scopedOrganizationId, { includeCustomerPrivateDetails });
  const result = await queryable.query(query.sql, query.values);
  return result.rows.map((row) => composeDailyStatusRow(row, { includeCustomerPrivateDetails }));
}

export async function getDailyStatusBoardRow(queryable, { organizationId, shipmentId, includeCustomerPrivateDetails = true } = {}) {
  const rows = await getDailyStatusBoardRows(queryable, {
    organizationId,
    filters: { shipmentId, limit: 1, includeExited: true },
    includeCustomerPrivateDetails,
  });
  return rows[0] || null;
}

export async function assertCommercialCardBelongsToTenant(queryable, { organizationId, commercialCardId } = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "assertCommercialCardBelongsToTenant");
  if (!commercialCardId) return null;
  const result = await queryable.query(
    `SELECT item_id, data
     FROM user_records
     WHERE organization_id = $1
       AND collection = 'commercialCards'
       AND (item_id = $2 OR data->>'id' = $2)
       AND COALESCE(data->>'isArchived', 'false') <> 'true'
       AND COALESCE(data->>'archivedAt', '') = ''
     ORDER BY updated_at DESC
     LIMIT 1`,
    [scopedOrganizationId, commercialCardId]
  );
  const row = result.rows[0];
  if (!row) {
    const error = new Error("Commercial card was not found.");
    error.statusCode = 404;
    error.code = "COMMERCIAL_CARD_NOT_FOUND";
    throw error;
  }
  return row;
}

export async function assertRelatedEntityBelongsToTenant(queryable, { organizationId, entityType, entityId } = {}) {
  if (!entityId) return null;
  if (entityType === "commercialCard") {
    return assertCommercialCardBelongsToTenant(queryable, { organizationId, commercialCardId: entityId });
  }
  const error = new Error(`Unsupported daily status relationship: ${entityType}`);
  error.statusCode = 400;
  error.code = "UNSUPPORTED_RELATIONSHIP";
  throw error;
}

function valueForAudit(row, field) {
  if (String(field).startsWith("baseInfo.")) {
    const key = String(field).slice("baseInfo.".length);
    if (key === "status") return row?.shipment?.status ?? null;
    return row?.baseInfo?.[key] ?? null;
  }
  if (String(field).startsWith("customFields.")) {
    const key = String(field).slice("customFields.".length);
    return row?.kootaj?.customFields?.[key] ?? null;
  }
  if (DAILY_STATUS_RELATIONSHIP_FIELDS.includes(field)) {
    return row?.commercialCard?.id || row?.kootaj?.commercialCardId || null;
  }
  if (DAILY_STATUS_KOOTAJ_FIELDS.includes(field)) {
    return row?.kootaj?.[field] ?? null;
  }
  return undefined;
}

function changedFields(before, after, updates) {
  const changed = DAILY_STATUS_PATCH_FIELDS.filter((field) => {
    if (updates[field] === undefined) return false;
    return valueForAudit(before, field) !== valueForAudit(after, field);
  });
  for (const key of Object.keys(updates.customFields || {})) {
    const auditKey = `customFields.${key}`;
    if (valueForAudit(before, auditKey) !== valueForAudit(after, auditKey)) changed.push(auditKey);
  }
  for (const field of BASE_INFO_PATCH_FIELDS) {
    if (updates.baseInfo?.[field] === undefined) continue;
    const auditKey = `baseInfo.${field}`;
    if (valueForAudit(before, auditKey) !== valueForAudit(after, auditKey)) changed.push(auditKey);
  }
  return changed;
}

export function dailyStatusAuditSnapshot(row, fields) {
  return fields.reduce((acc, field) => {
    acc[field] = valueForAudit(row, field);
    return acc;
  }, {});
}

export async function updateDailyStatusRow(pool, {
  organizationId,
  shipmentId,
  actorUserId,
  updates = {},
  expectedKootajUpdatedAt,
  includeCustomerPrivateDetails = true,
} = {}) {
  const scopedOrganizationId = requireOrganizationScope(organizationId, "updateDailyStatusRow");
  return withTransaction(pool, async (client) => {
    const baseInfoUpdates = jsonObject(updates.baseInfo);
    const hasBaseInfoUpdates = Object.keys(baseInfoUpdates).some((key) => baseInfoUpdates[key] !== undefined);
    const kootajUpdates = { ...updates };
    if (hasBaseInfoUpdates && hasOwn(baseInfoUpdates, "orderRegistrationNumber") && kootajUpdates.orderRegistrationNumber === undefined) {
      kootajUpdates.orderRegistrationNumber = baseInfoUpdates.orderRegistrationNumber;
    }

    const shipment = await client.query(
      `SELECT id, shipment_code, status, shipment_type_code, origin, destination, timer_started_at, timer_completed_at
       FROM shipments
       WHERE id = $1
         AND organization_id = $2
         AND archived_at IS NULL
       FOR UPDATE`,
      [shipmentId, scopedOrganizationId]
    );
    if (!shipment.rows[0]) return null;
    const shipmentRow = shipment.rows[0];

    if (kootajUpdates.commercialCardId !== undefined && kootajUpdates.commercialCardId !== null) {
      await assertRelatedEntityBelongsToTenant(client, {
        organizationId: scopedOrganizationId,
        entityType: "commercialCard",
        entityId: kootajUpdates.commercialCardId,
      });
    }

    let customFieldPatch = {};
    if (kootajUpdates.customFields !== undefined) {
      const activeTemplate = await getActiveShipmentFormTemplateForShipment(client, {
        organizationId: scopedOrganizationId,
        shipmentId,
      });
      if (!activeTemplate?.template) {
        const error = new Error("Active shipment form template was not found.");
        error.statusCode = 404;
        error.code = "SHIPMENT_FORM_TEMPLATE_NOT_FOUND";
        throw error;
      }
      customFieldPatch = validateCustomFieldPatchForTemplate(activeTemplate.template, kootajUpdates.customFields);
    }

    const before = await getDailyStatusBoardRow(client, {
      organizationId: scopedOrganizationId,
      shipmentId,
      includeCustomerPrivateDetails,
    });

    await applyKootajOperationUpdates(client, {
      organizationId: scopedOrganizationId,
      shipmentId,
      actorUserId,
      shipmentRow,
      updates: kootajUpdates,
      expectedKootajUpdatedAt,
      syncShipmentV2Profile: true,
    });

    await client.query(
      `INSERT INTO shipment_kootaj_details (
         id, organization_id, shipment_id, updated_by_id
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, shipment_id) DO NOTHING`,
      [crypto.randomUUID(), scopedOrganizationId, shipmentId, actorUserId || null]
    );

    const columns = [];
    const values = [scopedOrganizationId, shipmentId];
    const writtenColumns = new Set();
    const operationUpdateFields = new Set(KOOTAJ_OPERATION_UPDATE_FIELDS);
    for (const [field, column] of Object.entries(KOOTAJ_COLUMN_BY_FIELD)) {
      if (kootajUpdates[field] === undefined) continue;
      if (operationUpdateFields.has(field)) continue;
      if (writtenColumns.has(column)) continue;
      values.push(kootajUpdates[field]);
      columns.push(`${column} = $${values.length}`);
      writtenColumns.add(column);
    }
    if (Object.keys(customFieldPatch).length > 0) {
      values.push(JSON.stringify(customFieldPatch));
      columns.push(`custom_fields_json = custom_fields_json || $${values.length}::jsonb`);
    }
    values.push(actorUserId || null);
    columns.push(`updated_by_id = $${values.length}`);
    columns.push("updated_at = NOW()");

    await client.query(
      `UPDATE shipment_kootaj_details
       SET ${columns.join(", ")}
       WHERE organization_id = $1
         AND shipment_id = $2`,
      values
    );

    if (hasBaseInfoUpdates) {
      const shipmentColumns = [];
      const shipmentValues = [shipmentId, scopedOrganizationId];
      const addShipmentColumn = (column, value) => {
        shipmentValues.push(value);
        shipmentColumns.push(`${column} = $${shipmentValues.length}`);
      };

      if (hasOwn(baseInfoUpdates, "status")) {
        const nextStatus = normalizeShipmentStatus(baseInfoUpdates.status);
        addShipmentColumn("status", nextStatus);
        const wasTerminal = isShipmentTerminalStatus(shipmentRow.status);
        const isTerminal = isShipmentTerminalStatus(nextStatus);
        if (isTerminal && !wasTerminal && shipmentRow.timer_started_at && !shipmentRow.timer_completed_at) {
          addShipmentColumn("timer_completed_at", new Date().toISOString());
        } else if (!isTerminal && wasTerminal) {
          addShipmentColumn("timer_completed_at", null);
        }
      }
      if (hasOwn(baseInfoUpdates, "origin")) addShipmentColumn("origin", trimNullableText(baseInfoUpdates.origin));
      if (hasOwn(baseInfoUpdates, "deliveryPort")) addShipmentColumn("destination", trimNullableText(baseInfoUpdates.deliveryPort));

      if (shipmentColumns.length) {
        await client.query(
          `UPDATE shipments
           SET ${shipmentColumns.join(", ")},
               updated_at = NOW()
           WHERE id = $1
             AND organization_id = $2`,
          shipmentValues
        );
      }

      const baseSectionPatch = baseSectionPatchFromUpdates(baseInfoUpdates);
      if (Object.keys(baseSectionPatch).length) {
        const profile = await client.query(
          `SELECT id, flow_code, sections_json
           FROM shipment_v2_profiles
           WHERE shipment_id = $1
             AND organization_id = $2
           LIMIT 1
           FOR UPDATE`,
          [shipmentId, scopedOrganizationId]
        );

        const existingProfile = profile.rows[0] || null;
        const nextSections = existingProfile
          ? jsonObject(existingProfile.sections_json)
          : defaultV2SectionsForShipment({
              ...shipmentRow,
              origin: hasOwn(baseInfoUpdates, "origin") ? trimNullableText(baseInfoUpdates.origin) : shipmentRow.origin,
              destination: hasOwn(baseInfoUpdates, "deliveryPort") ? trimNullableText(baseInfoUpdates.deliveryPort) : shipmentRow.destination,
            });
        nextSections.base = {
          ...BASE_SECTION_DEFAULTS,
          ...jsonObject(nextSections.base),
          ...baseSectionPatch,
        };

        if (existingProfile) {
          await client.query(
            `UPDATE shipment_v2_profiles
             SET sections_json = $3::jsonb,
                 updated_by_id = $4,
                 updated_at = NOW()
             WHERE shipment_id = $1
               AND organization_id = $2`,
            [shipmentId, scopedOrganizationId, JSON.stringify(nextSections), actorUserId || null]
          );
        } else {
          await client.query(
            `INSERT INTO shipment_v2_profiles (
               id, organization_id, shipment_id, flow_code, sections_json, created_by_id, updated_by_id, updated_at
             )
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6, NOW())`,
            [
              crypto.randomUUID(),
              scopedOrganizationId,
              shipmentId,
              String(shipmentRow.shipment_type_code || "").toUpperCase().includes("LENJ") ? "IMPORT_LANJ" : "IMPORT_SHIP",
              JSON.stringify(nextSections),
              actorUserId || null,
            ]
          );
        }
      }
    }

    const after = await getDailyStatusBoardRow(client, {
      organizationId: scopedOrganizationId,
      shipmentId,
      includeCustomerPrivateDetails,
    });
    return {
      before,
      after,
      changedFields: changedFields(before, after, { ...kootajUpdates, baseInfo: baseInfoUpdates }),
    };
  });
}
