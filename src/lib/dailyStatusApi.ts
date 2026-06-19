import { ApiError, apiGet, apiPatch } from "@/src/lib/api";
import type { DailyStatusBoardRow, DailyStatusPatch } from "@/src/types";

export type DailyStatusListFilters = Partial<{
  q: string;
  shipmentId: string;
  commercialCardId: string;
  customsRoute: string;
  shipmentStatus: string;
  limit: number;
}>;

function dailyStatusQuery(filters: DailyStatusListFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const dailyStatusApi = {
  list(filters: DailyStatusListFilters = {}) {
    return apiGet<DailyStatusBoardRow[]>(`/api/daily-status${dailyStatusQuery(filters)}`);
  },
  async getForShipment(shipmentId: string) {
    try {
      return await apiGet<DailyStatusBoardRow>(`/api/shipments/${encodeURIComponent(shipmentId)}/daily-status`);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const rows = await dailyStatusApi.list({ shipmentId, limit: 1 });
      if (rows[0]) return rows[0];
      throw error;
    }
  },
  update(shipmentId: string, patch: DailyStatusPatch) {
    return apiPatch<DailyStatusBoardRow>(`/api/daily-status/${encodeURIComponent(shipmentId)}`, patch);
  },
  async updateFromShipmentDetail(shipmentId: string, patch: DailyStatusPatch) {
    try {
      return await apiPatch<DailyStatusBoardRow>(`/api/shipments/${encodeURIComponent(shipmentId)}/daily-status`, patch);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      return dailyStatusApi.update(shipmentId, patch);
    }
  },
};

export const kootajBoardApi = {
  list(filters: DailyStatusListFilters = {}) {
    return apiGet<DailyStatusBoardRow[]>(`/api/kootaj-board${dailyStatusQuery(filters)}`);
  },
};
