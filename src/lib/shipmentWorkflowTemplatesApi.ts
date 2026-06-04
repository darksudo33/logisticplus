import { apiDelete, apiGet, apiPatch, apiPost } from "@/src/lib/api";
import type { ShipmentTypeOption } from "@/src/lib/shipmentFormTemplatesApi";

export type ShipmentWorkflowTemplateStep = {
  id: string;
  templateId: string;
  phaseId: string;
  phaseKey: string;
  stepKey: string;
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
  expectedDocuments?: unknown[];
  expectedFormFields?: unknown[];
  nextStepRules?: Record<string, unknown>;
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
  phases: ShipmentWorkflowTemplatePhase[];
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
  list: (shipmentTypeCode?: string) =>
    apiGet<ShipmentWorkflowTemplate[]>(
      `/api/shipment-workflow-templates${shipmentTypeCode ? `?shipmentTypeCode=${encodeURIComponent(shipmentTypeCode)}` : ""}`
    ),
  get: (id: string) => apiGet<ShipmentWorkflowTemplate>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}`),
  getForShipment: (shipmentId: string) =>
    apiGet<ActiveShipmentWorkflowTemplate>(`/api/shipments/${encodeURIComponent(shipmentId)}/workflow-template`),
  update: (id: string, body: unknown) =>
    apiPatch<ShipmentWorkflowTemplate>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}`, body),
  publish: (id: string, body: unknown) =>
    apiPatch<ShipmentWorkflowTemplate>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}/publish`, body),
  addStep: (id: string, body: unknown) =>
    apiPost<ShipmentWorkflowTemplate>(`/api/shipment-workflow-templates/${encodeURIComponent(id)}/steps`, body),
  updateStep: (id: string, stepId: string, body: unknown) =>
    apiPatch<ShipmentWorkflowTemplate>(
      `/api/shipment-workflow-templates/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`,
      body
    ),
  archiveStep: (id: string, stepId: string) =>
    apiDelete<ShipmentWorkflowTemplate>(
      `/api/shipment-workflow-templates/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`
    ),
  setShipmentTypeDefault: (shipmentTypeCode: string, templateId: string) =>
    apiPatch<{ shipmentTypeCode: string; template: ShipmentWorkflowTemplate }>(
      `/api/shipment-types/${encodeURIComponent(shipmentTypeCode)}/workflow-template`,
      { templateId }
    ),
};
