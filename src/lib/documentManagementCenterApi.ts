import { apiGet } from "@/src/lib/api";

export type DocumentManagementShipmentSearchResult = {
  id: string;
  trackingNumber: string;
  customerId: string;
  customerCode?: string;
  customerName: string;
  status: string;
  shipmentDirection: string;
  transportMode: string;
  shipmentTypeCode: string;
  origin: string;
  destination: string;
  profileFlowCode?: string | null;
  currentStage?: string;
  documentCount: number;
  latestDocumentAt?: string | null;
  updatedAt?: string | null;
};

export const documentManagementCenterApi = {
  searchShipments: (query: string, limit = 12) => {
    const params = new URLSearchParams({
      query,
      limit: String(limit),
    });
    return apiGet<DocumentManagementShipmentSearchResult[]>(
      `/api/documents/management-center/search?${params.toString()}`
    );
  },
};
