import { apiDelete, apiGet, apiPatch, apiPost } from "@/src/lib/api";
import type { ShipmentTypeOption } from "@/src/lib/shipmentFormTemplatesApi";

export type ShipmentWorkflowTemplateStep = {
  id: string;
  templateId: string;
  phaseId: string;
  phaseKey: string;
  stepKey: string;
  catalogStepId?: string | null;
  labelFa: string;
  labelEn: string;
  publicLabel: string;
  sortOrder: number;
  isRequired: boolean;
  isVisible: boolean;
  isCustomerVisible: boolean;
  roleSuggestion?: string;
  expectedDurationHours?: number | null;
  taskPolicy?: Record<string, unknown>;
  checklist?: unknown[];
  expectedDocuments?: unknown[];
  expectedFormFields?: unknown[];
  nextStepRules?: Record<string, unknown>;
  catalogStep?: {
    id: string;
    code: string;
    titleFa: string;
    stageKey: string;
    isSystem: boolean;
    archivedAt?: string | null;
  } | null;
};

export type ShipmentWorkflowTemplatePhase = {
  id: string;
  templateId: string;
  phaseKey: string;
  labelFa: string;
  labelEn: string;
  sortOrder: number;
  isVisible: boolean;
  steps: ShipmentWorkflowTemplateStep[];
};

export type ShipmentWorkflowTemplate = {
  id: string;
  organizationId: string | null;
  code: string;
  shipmentTypeHint?: string | null;
  shipmentDirection?: string | null;
  transportMode?: string | null;
  titleFa: string;
  titleEn?: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  version: number;
  publishedAt?: string | null;
  archivedAt?: string | null;
  archivedReason?: string;
  workflowInstanceCount?: number;
  activeMappingCount?: number;
  auditEventCount?: number;
  canDelete?: boolean;
  phases: ShipmentWorkflowTemplatePhase[];
};

export type ShipmentWorkflowStepCatalogItem = {
  id: string;
  organizationId: string | null;
  code: string;
  title: string;
  titleFa: string;
  description?: string;
  category: string;
  stageKey: string;
  stageTitleFa: string;
  defaultOrder: number;
  defaultRequired: boolean;
  defaultCustomerVisible: boolean;
  defaultInternalOnly: boolean;
  defaultChecklist?: unknown[];
  defaultRequiredDocuments?: unknown[];
  defaultFormFields?: unknown[];
  metadata?: Record<string, unknown>;
  isSystem: boolean;
  archivedAt?: string | null;
};

export type ActiveShipmentWorkflowTemplate = {
  shipment: {
    id: string;
    shipmentTypeCode: string;
    shipmentDirection: string;
    transportMode: string | null;
  };
  template: ShipmentWorkflowTemplate | null;
};

export const shipmentWorkflowTemplatesApi = {
  listTypes: () => apiGet<ShipmentTypeOption[]>("/api/shipment-workflow-template-types"),
  listCatalog: (params: { q?: string; stageKey?: string; category?: string; includeArchived?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.stageKey) search.set("stageKey", params.stageKey);
    if (params.category) search.set("category", params.category);
    if (params.includeArchived) search.set("includeArchived", "true");
    const suffix = search.toString();
    return apiGet<ShipmentWorkflowStepCatalogItem[]>(`/api/shipment-workflow-step-catalog${suffix ? `?${suffix}` : ""}`);
  },
  list: (shipmentTypeCode?: string, options: { includeArchived?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (shipmentTypeCode) search.set("shipmentTypeCode", shipmentTypeCode);
    if (options.includeArchived) search.set("includeArchived", "true");
    const suffix = search.toString();
    return apiGet<ShipmentWorkflowTemplate[]>(`/api/shipment-workflow-templates${suffix ? `?${suffix}` : ""}`);
  },
  get: (id: string) => apiGet<ShipmentWorkflowTemplate>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}`),
  getForShipment: (shipmentId: string) =>
    apiGet<ActiveShipmentWorkflowTemplate>(`/api/shipments/${encodeURIComponent(shipmentId)}/workflow-template`),
  update: (id: string, body: unknown) =>
    apiPatch<ShipmentWorkflowTemplate>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}`, body),
  publish: (id: string, body: unknown) =>
    apiPatch<ShipmentWorkflowTemplate>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}/publish`, body),
  addStep: (id: string, body: unknown) =>
    apiPost<ShipmentWorkflowTemplate>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}/steps`, body),
  addStepsFromCatalog: (id: string, body: unknown) =>
    apiPost<ShipmentWorkflowTemplate>(
      `/api/shipment-workflow-templates/${encodeURIComponent(id)}/steps/from-catalog`,
      body
    ),
  updateStep: (id: string, stepId: string, body: unknown) =>
    apiPatch<ShipmentWorkflowTemplate>(
      `/api/shipment-workflow-templates/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`,
      body
    ),
  archiveStep: (id: string, stepId: string) =>
    apiDelete<ShipmentWorkflowTemplate>(
      `/api/shipment-workflow-templates/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`
    ),
  archiveTemplate: (id: string, body: unknown) =>
    apiPost<ShipmentWorkflowTemplate>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}/archive`, body),
  deleteTemplate: (id: string) =>
    apiDelete<{ id: string }>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}`),
  setShipmentTypeDefault: (shipmentTypeCode: string, templateId: string) =>
    apiPatch<{ shipmentTypeCode: string; template: ShipmentWorkflowTemplate }>(
      `/api/shipment-types/${encodeURIComponent(shipmentTypeCode)}/workflow-template`,
      { templateId }
    ),
};
