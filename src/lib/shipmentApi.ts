import { Shipment } from "@/src/types";
import { apiGet, apiPatch, apiPost } from "./api";

export type PostExitStatus = "needs_follow_up" | "in_progress" | "settled" | "closed";

export type ExitedShipment = Shipment & {
  customerDisplayName?: string;
  cotageNumber?: string;
  declarationReference?: string;
  exitDate?: string;
  releaseStatus?: string;
  customsStatus?: string;
  assignedManagerName?: string;
  lastUpdatedAt?: string;
};

export type ExitedShipmentsFilters = {
  q?: string;
  customerId?: string;
  shipmentTypeCode?: string;
  exitDateFrom?: string;
  exitDateTo?: string;
  postExitStatus?: PostExitStatus;
  assignedManagerId?: string;
  limit?: number;
};

export type ShipmentMutation = Partial<
  Pick<
    Shipment,
    | "trackingNumber"
    | "containerNumber"
    | "customerId"
    | "customerName"
    | "origin"
    | "destination"
    | "status"
    | "shipmentDirection"
    | "transportMode"
    | "shipmentTypeCode"
    | "estimatedDelivery"
    | "actualDelivery"
    | "freeTimeDays"
  >
> & {
  notes?: string;
  containerCount?: number;
  grossWeightKg?: number;
  weight?: number;
  customsDeclarationNumber?: string;
  customsStatus?: string;
  importPermitNumber?: string;
  assignedManagerId?: string;
};

export const shipmentApi = {
  list: () => apiGet<Shipment[]>("/api/shipments"),
  listExited: (filters: ExitedShipmentsFilters = {}) => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        search.set(key, String(value));
      }
    });
    const query = search.toString();
    return apiGet<ExitedShipment[]>(`/api/shipments/exited${query ? `?${query}` : ""}`);
  },
  get: (id: string) => apiGet<Shipment>(`/api/shipments/${encodeURIComponent(id)}`),
  create: (shipment: ShipmentMutation) => apiPost<Shipment>("/api/shipments", shipment),
  updateOperationalFields: (id: string, updates: ShipmentMutation) =>
    apiPatch<Shipment>(`/api/shipments/${encodeURIComponent(id)}/operational-fields`, updates),
  archive: (id: string) => apiPost(`/api/archive/shipment/${encodeURIComponent(id)}`),
  moveToExitedArchive: (id: string, body: { reason?: string | null } = {}) =>
    apiPost<Shipment>(`/api/shipments/${encodeURIComponent(id)}/exited-archive`, body),
  restoreFromExitedArchive: (id: string) =>
    apiPost<Shipment>(`/api/shipments/${encodeURIComponent(id)}/exited-restore`),
  updatePostExit: (
    id: string,
    updates: {
      postExitStatus?: PostExitStatus;
      postExitNote?: string | null;
      postExitFollowUpAt?: string | null;
    }
  ) => apiPatch<Shipment>(`/api/shipments/${encodeURIComponent(id)}/post-exit`, updates),
};

