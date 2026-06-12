import { apiGet, apiPatch, apiPost } from "./api";

export type CurrencyMarketType =
  | "FREE_MARKET"
  | "SANA_BUY"
  | "SANA_SELL"
  | "NIMA_BUY"
  | "NIMA_SELL"
  | "MANUAL";

export type CurrencyRate = {
  id?: string | null;
  snapshotId?: string | null;
  currencyCode: string;
  marketType: CurrencyMarketType;
  provider: string;
  providerSymbol?: string;
  nameFa?: string;
  nameEn?: string;
  price: number;
  buyRate?: number | null;
  sellRate?: number | null;
  unit: string;
  providerDate?: string;
  providerTime?: string;
  providerUnix?: number | null;
  changeValue?: number | null;
  changePercent?: number | null;
  status?: string;
  suspicious?: boolean;
  previousPrice?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CurrencyRateSettings = {
  id: string;
  provider: string;
  isEnabled: boolean;
  autoPublishSuspicious: boolean;
  suspiciousChangePercent: number;
  syncIntervalMinutes: number;
  lastSyncAt?: string | null;
  lastSyncStatus?: string;
  lastSyncError?: string;
  updatedAt?: string | null;
};

export type CurrencyRatesPayload = {
  settings: CurrencyRateSettings;
  rates: CurrencyRate[];
  adminDiagnostics?: {
    endpoint: string;
    section: string;
    keyConfigured: boolean;
    syncEnabled: boolean;
    autoPublish: boolean;
    syncIntervalMinutes: number;
  };
};

export type TariffCatalogEntry = {
  id: string;
  importId?: string | null;
  tariffCode: string;
  titleFa: string;
  titleEn?: string;
  category?: string;
  chapter?: string;
  unit?: string;
  dutyRate?: string;
  taxRate?: string;
  restrictions?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string | null;
  importSourceFileName?: string;
  importSourceDate?: string;
};

export type TariffImportPreview = {
  valid: boolean;
  errors: string[];
  rowCount: number;
  sampleRows: Array<{
    tariffCode: string;
    titleFa: string;
    titleEn?: string;
    category?: string;
    chapter?: string;
    unit?: string;
    dutyRate?: string;
    taxRate?: string;
    restrictions?: string;
    notes?: string;
  }>;
};

export type TariffImportResult = {
  importId: string;
  mode: "replace" | "append";
  rowCount: number;
  activeRowCount: number;
};

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export const ratesApi = {
  getCurrencyRates: () => apiGet<CurrencyRatesPayload>("/api/rates/currency"),
  getSnapshots: (params: { status?: string; currencyCode?: string; marketType?: string; limit?: number } = {}) =>
    apiGet<CurrencyRate[]>(`/api/rates/currency/snapshots${buildQuery(params)}`),
  syncCurrencyRates: () => apiPost<{ published: number; pendingReview: number; received: number }>("/api/rates/currency/sync"),
  saveManualRate: (body: {
    currencyCode: string;
    marketType: CurrencyMarketType;
    price: number;
    buyRate?: number | null;
    sellRate?: number | null;
    unit?: string;
    note?: string;
  }) => apiPost<CurrencyRate>("/api/rates/currency/manual", body),
  updateSettings: (body: Partial<{
    isEnabled: boolean;
    autoPublishSuspicious: boolean;
    suspiciousChangePercent: number;
    syncIntervalMinutes: number;
  }>) => apiPatch<CurrencyRateSettings>("/api/rates/currency/settings", body),
  reviewSnapshot: (id: string, body: { decision: "approve" | "reject"; note?: string }) =>
    apiPost<CurrencyRate>(`/api/rates/currency/snapshots/${encodeURIComponent(id)}/review`, body),
  searchTariffs: (params: { q?: string; limit?: number } = {}) =>
    apiGet<TariffCatalogEntry[]>(`/api/rates/tariffs${buildQuery(params)}`),
  getTariff: (id: string) => apiGet<TariffCatalogEntry>(`/api/rates/tariffs/${encodeURIComponent(id)}`),
  previewTariffImport: (file: File, body: { mode: "replace" | "append"; sourceDate?: string }) => {
    const form = new FormData();
    form.set("file", file);
    form.set("mode", body.mode);
    form.set("dryRun", "true");
    if (body.sourceDate) form.set("sourceDate", body.sourceDate);
    return apiPost<TariffImportPreview>("/api/rates/tariffs/import", form);
  },
  importTariffs: (file: File, body: { mode: "replace" | "append"; sourceDate?: string }) => {
    const form = new FormData();
    form.set("file", file);
    form.set("mode", body.mode);
    form.set("dryRun", "false");
    if (body.sourceDate) form.set("sourceDate", body.sourceDate);
    return apiPost<TariffImportResult>("/api/rates/tariffs/import", form);
  },
};
