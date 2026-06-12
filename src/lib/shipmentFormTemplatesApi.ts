import { apiDelete, apiGet, apiPatch, apiPost } from "@/src/lib/api";

export type ShipmentTypeOption = {
  code: string;
  labelFa: string;
  direction: "import" | "export" | "transit" | "domestic";
  transportMode: "sea" | "air" | "land" | "rail";
  description?: string;
};

export type ShipmentFormTemplateField = {
  id: string;
  templateId: string;
  sectionId: string;
  fieldKey: string;
  fieldSource: "canonical" | "custom";
  fieldType: "text" | "textarea" | "number" | "date" | "select" | "commercialCard" | "readonly";
  labelFa: string;
  helperText?: string;
  placeholder?: string;
  sortOrder: number;
  isVisible: boolean;
  isRequired: boolean;
  isImportant: boolean;
  showInShipmentDetail: boolean;
  showInDailyStatus: boolean;
  showInCreateForm: boolean;
  validationJson?: Record<string, unknown>;
  optionsJson?: Array<{ value: string; label: string }>;
  canonical?: {
    labelEn?: string;
    sourceEntity?: string;
    apiFieldName?: string;
    editable?: boolean;
    aliases?: string[];
    publicVisibility?: string;
  } | null;
};

export type ShipmentFormTemplateSection = {
  id: string;
  templateId: string;
  sectionKey: string;
  titleFa: string;
  description?: string;
  sortOrder: number;
  isCollapsedByDefault: boolean;
  fields: ShipmentFormTemplateField[];
};

export type ShipmentFormTemplate = {
  id: string;
  organizationId: string | null;
  code: string;
  shipmentTypeCode: string;
  titleFa: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  version: number;
  sections: ShipmentFormTemplateSection[];
};

export type ActiveShipmentFormTemplate = {
  shipment: {
    id: string;
    shipmentTypeCode: string;
    shipmentDirection: string;
    transportMode: string | null;
  };
  template: ShipmentFormTemplate | null;
};

export type CanonicalShipmentFormField = {
  key: string;
  labelFa: string;
  labelEn?: string;
  sourceEntity?: string;
  apiFieldName?: string;
  fieldType: ShipmentFormTemplateField["fieldType"];
  options?: Array<{ value: string; label: string }>;
  editable?: boolean;
  aliases?: string[];
};

export const shipmentFormTemplatesApi = {
  listTypes: () => apiGet<ShipmentTypeOption[]>("/api/shipment-types"),
  list: (shipmentTypeCode?: string) =>
    apiGet<ShipmentFormTemplate[]>(
      `/api/shipment-form-templates${shipmentTypeCode ? `?shipmentTypeCode=${encodeURIComponent(shipmentTypeCode)}` : ""}`
    ),
  get: (id: string) => apiGet<ShipmentFormTemplate>(`/api/shipment-form-templates/${encodeURIComponent(id)}`),
  getForShipment: (shipmentId: string) =>
    apiGet<ActiveShipmentFormTemplate>(`/api/shipments/${encodeURIComponent(shipmentId)}/form-template`),
  listCanonicalFields: () => apiGet<CanonicalShipmentFormField[]>("/api/shipment-form-canonical-fields"),
  create: (body: unknown) => apiPost<ShipmentFormTemplate>("/api/shipment-form-templates", body),
  update: (id: string, body: unknown) => apiPatch<ShipmentFormTemplate>(`/api/shipment-form-templates/${encodeURIComponent(id)}`, body),
  addField: (id: string, body: unknown) => apiPost<ShipmentFormTemplate>(`/api/shipment-form-templates/${encodeURIComponent(id)}/fields`, body),
  updateField: (id: string, fieldId: string, body: unknown) =>
    apiPatch<ShipmentFormTemplate>(
      `/api/shipment-form-templates/${encodeURIComponent(id)}/fields/${encodeURIComponent(fieldId)}`,
      body
    ),
  archiveField: (id: string, fieldId: string) =>
    apiDelete<ShipmentFormTemplate>(`/api/shipment-form-templates/${encodeURIComponent(id)}/fields/${encodeURIComponent(fieldId)}`),
};
