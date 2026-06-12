import type {
  ShipmentV2FlowCode,
  ShipmentV2GoodsRow,
  ShipmentV2LenjType,
  ShipmentV2ProfileResponse,
  ShipmentV2SectionKey,
  ShipmentV2SectionPayload,
} from "@/src/types";
import { apiGet, apiPatch, apiPost } from "./api";

export type ShipmentV2CreateInput = {
  flowCode: ShipmentV2FlowCode;
  codeMode?: "new" | "existing";
  trackingNumber?: string;
  customerId: string;
  origin: string;
  dischargePort: string;
  deliveryPort: string;
  consigneeName?: string;
  lenjType?: ShipmentV2LenjType | null;
  container20Count?: number;
  container40Count?: number;
  goodsRows?: ShipmentV2GoodsRow[];
};

export const shipmentV2Api = {
  create: (body: ShipmentV2CreateInput) =>
    apiPost<ShipmentV2ProfileResponse>("/api/shipments/v2", body),
  get: (shipmentId: string) =>
    apiGet<ShipmentV2ProfileResponse>(`/api/shipments/${encodeURIComponent(shipmentId)}/v2-profile`),
  initialize: (shipmentId: string) =>
    apiPost<ShipmentV2ProfileResponse>(`/api/shipments/${encodeURIComponent(shipmentId)}/v2-profile/init`),
  updateSection: <TSectionKey extends ShipmentV2SectionKey>(
    shipmentId: string,
    sectionKey: TSectionKey,
    payload: ShipmentV2SectionPayload
  ) =>
    apiPatch<ShipmentV2ProfileResponse>(
      `/api/shipments/${encodeURIComponent(shipmentId)}/v2-profile/sections/${encodeURIComponent(sectionKey)}`,
      payload
    ),
};
