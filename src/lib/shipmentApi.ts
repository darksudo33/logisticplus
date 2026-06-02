import { Shipment } from "@/src/types";
import { apiGet, apiPatch, apiPost } from "./api";

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
  get: (id: string) => apiGet<Shipment>(`/api/shipments/${encodeURIComponent(id)}`),
  create: (shipment: ShipmentMutation) => apiPost<Shipment>("/api/shipments", shipment),
  updateOperationalFields: (id: string, updates: ShipmentMutation) =>
    apiPatch<Shipment>(`/api/shipments/${encodeURIComponent(id)}/operational-fields`, updates),
  archive: (id: string) => apiPost(`/api/archive/shipment/${encodeURIComponent(id)}`),
};

