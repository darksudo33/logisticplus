import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Check,
  Database,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Settings,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/src/components/EmptyState";
import { toEnglishDigits, toPersianDigits } from "@/src/components/ShamsiDateTimeField";
import { useCurrentUserPermissions } from "@/src/hooks/useCurrentUserPermissions";
import { ratesApi, type CurrencyMarketType, type CurrencyRate, type CurrencyRateSettings, type TariffCatalogEntry, type TariffImportPreview } from "@/src/lib/ratesApi";
import { cn } from "@/lib/utils";

const CURRENCY_CODES = ["USD", "EUR", "AED", "CNY", "TRY", "INR", "OMR", "QAR"];
const MARKET_TYPES: CurrencyMarketType[] = ["FREE_MARKET", "SANA_BUY", "SANA_SELL", "NIMA_BUY", "NIMA_SELL"];
const ADMIN_MARKET_TYPES: CurrencyMarketType[] = [...MARKET_TYPES, "MANUAL"];

const currencyMeta: Record<string, { flag: string; label: string }> = {
  USD: { flag: "🇺🇸", label: "دلار آمریکا" },
  EUR: { flag: "🇪🇺", label: "یورو" },
  AED: { flag: "🇦🇪", label: "درهم امارات" },
  CNY: { flag: "🇨🇳", label: "یوان چین" },
  INR: { flag: "🇮🇳", label: "روپیه هند" },
  TRY: { flag: "🇹🇷", label: "لیر ترکیه" },
  OMR: { flag: "🇴🇲", label: "ریال عمان" },
  QAR: { flag: "🇶🇦", label: "ریال قطر" },
};

const currencyLabels = Object.fromEntries(
  Object.entries(currencyMeta).map(([code, meta]) => [code, meta.label])
) as Record<string, string>;

const marketLabels: Record<CurrencyMarketType, string> = {
  FREE_MARKET: "بازار آزاد",
  SANA_BUY: "سنا خرید",
  SANA_SELL: "سنا فروش",
  NIMA_BUY: "نیما خرید",
  NIMA_SELL: "نیما فروش",
  MANUAL: "دستی",
};

const emptySettings: CurrencyRateSettings = {
  id: "brsapi_pro",
  provider: "brsapi_pro",
  isEnabled: true,
  autoPublishSuspicious: false,
  suspiciousChangePercent: 15,
  syncIntervalMinutes: 60,
};

type RatesAdminDiagnostics = NonNullable<Awaited<ReturnType<typeof ratesApi.getCurrencyRates>>["adminDiagnostics"]>;

function normalizeNumberInput(value: string) {
  const normalized = toEnglishDigits(value).replace(/[,\s]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "ثبت نشده";
  return toPersianDigits(Number(value).toLocaleString("en-US"));
}

function formatDateTime(value?: string | null) {
  if (!value) return "ثبت نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toPersianDigits(value);
  return date.toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "۰ بایت";
  if (bytes >= 1024 * 1024) return `${toPersianDigits((bytes / 1024 / 1024).toFixed(1))} مگابایت`;
  if (bytes >= 1024) return `${toPersianDigits(Math.round(bytes / 1024))} کیلوبایت`;
  return `${toPersianDigits(bytes)} بایت`;
}

function FlagIcon({ code }: { code: string }) {
  switch (code) {
    case "USD":
      return (
        <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-[2px] border border-border" aria-hidden="true">
          <rect width="28" height="20" fill="#fff" />
          {Array.from({ length: 7 }).map((_, index) => (
            <rect key={index} y={index * 3} width="28" height="1.5" fill="#b91c1c" />
          ))}
          <rect width="11" height="9" fill="#1d4ed8" />
        </svg>
      );
    case "EUR":
      return (
        <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-[2px] border border-border" aria-hidden="true">
          <rect width="28" height="20" fill="#1d4ed8" />
          {Array.from({ length: 12 }).map((_, index) => {
            const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
            const cx = 14 + Math.cos(angle) * 5.4;
            const cy = 10 + Math.sin(angle) * 5.4;
            return <circle key={index} cx={cx} cy={cy} r="0.8" fill="#facc15" />;
          })}
        </svg>
      );
    case "AED":
      return (
        <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-[2px] border border-border" aria-hidden="true">
          <rect width="28" height="20" fill="#fff" />
          <rect width="7" height="20" fill="#dc2626" />
          <rect x="7" width="21" height="6.67" fill="#16a34a" />
          <rect x="7" y="6.67" width="21" height="6.66" fill="#fff" />
          <rect x="7" y="13.33" width="21" height="6.67" fill="#111827" />
        </svg>
      );
    case "CNY":
      return (
        <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-[2px] border border-border" aria-hidden="true">
          <rect width="28" height="20" fill="#dc2626" />
          <path d="M7 4.5l.9 1.9 2.1.3-1.5 1.4.4 2.1L7 9.2 5.1 10.2l.4-2.1L4 6.7l2.1-.3z" fill="#facc15" />
        </svg>
      );
    case "INR":
      return (
        <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-[2px] border border-border" aria-hidden="true">
          <rect width="28" height="6.67" fill="#f59e0b" />
          <rect y="6.67" width="28" height="6.66" fill="#fff" />
          <rect y="13.33" width="28" height="6.67" fill="#16a34a" />
          <circle cx="14" cy="10" r="2.2" fill="none" stroke="#1d4ed8" strokeWidth="1.1" />
        </svg>
      );
    case "TRY":
      return (
        <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-[2px] border border-border" aria-hidden="true">
          <rect width="28" height="20" fill="#dc2626" />
          <circle cx="12" cy="10" r="4.1" fill="#fff" />
          <circle cx="13.4" cy="10" r="3.2" fill="#dc2626" />
          <polygon points="17,10 18.1,10.7 17.6,9.5 18.6,8.8 17.3,8.8 16.9,7.7 16.5,8.8 15.2,8.8 16.2,9.5 15.7,10.7" fill="#fff" />
        </svg>
      );
    case "OMR":
      return (
        <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-[2px] border border-border" aria-hidden="true">
          <rect width="28" height="20" fill="#fff" />
          <rect width="7" height="20" fill="#dc2626" />
          <rect x="7" width="21" height="6.67" fill="#dc2626" />
          <rect x="7" y="6.67" width="21" height="6.66" fill="#fff" />
          <rect x="7" y="13.33" width="21" height="6.67" fill="#15803d" />
        </svg>
      );
    case "QAR":
      return (
        <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-[2px] border border-border" aria-hidden="true">
          <rect width="28" height="20" fill="#8b1d3a" />
          <polygon points="0,0 7,0 11,2 7,4 11,6 7,8 11,10 7,12 11,14 7,16 11,18 7,20 0,20" fill="#fff" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-[2px] border border-border" aria-hidden="true">
          <rect width="28" height="20" fill="#cbd5e1" />
        </svg>
      );
  }
}

function rateKey(currencyCode: string, marketType: string) {
  return `${currencyCode}:${marketType}`;
}

function statusBadge(settings: CurrencyRateSettings) {
  if (settings.lastSyncStatus === "failed") {
    return <Badge className="border-rose-500/20 bg-rose-500/10 text-rose-700">خطای همگام‌سازی</Badge>;
  }
  if (!settings.isEnabled) {
    return <Badge className="border-slate-500/20 bg-slate-500/10 text-slate-700">غیرفعال</Badge>;
  }
  return <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700">فعال</Badge>;
}

function unavailableLabel(marketType?: CurrencyMarketType, proUnavailable = false) {
  if (proUnavailable && marketType && marketType !== "FREE_MARKET") return "نیازمند Pro";
  return "ناموجود";
}

function RateChip({ rate, marketType, proUnavailable = false }: { rate?: CurrencyRate; marketType: CurrencyMarketType; proUnavailable?: boolean }) {
  if (!rate) {
    return (
      <Badge
        variant="outline"
        data-testid="rate-unavailable-chip"
        className="inline-flex h-7 min-w-20 justify-center rounded-md border-dashed bg-muted/30 px-2 text-[11px] font-black text-muted-foreground"
      >
        {unavailableLabel(marketType, proUnavailable)}
      </Badge>
    );
  }

  return (
    <div className="flex min-w-28 flex-col gap-1">
      <span className="text-sm font-black tabular-nums text-foreground" dir="ltr">{formatNumber(rate.price)}</span>
      <span className="text-[10px] font-bold text-muted-foreground">{rate.provider === "manual" ? "دستی" : "BRSAPI"}</span>
    </div>
  );
}

function ChangeCell({ rate }: { rate?: CurrencyRate }) {
  if (!rate || rate.changePercent === null || rate.changePercent === undefined) {
    return <span className="text-xs font-bold text-muted-foreground">بدون تغییر</span>;
  }
  const positive = Number(rate.changePercent || 0) > 0;
  const negative = Number(rate.changePercent || 0) < 0;
  return (
    <span className={cn("text-xs font-black", positive && "text-emerald-600", negative && "text-rose-600")} dir="ltr">
      {positive ? "+" : ""}{toPersianDigits(rate.changePercent)}%
    </span>
  );
}

function currencyLatestUpdate(rates: Array<CurrencyRate | undefined>) {
  const timestamps = rates
    .map((rate) => rate?.updatedAt || rate?.createdAt)
    .filter(Boolean)
    .map((value) => new Date(String(value)).getTime())
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function CurrencyIdentity({ code }: { code: string }) {
  const meta = currencyMeta[code];
  return (
    <div className="flex min-w-36 items-center gap-3">
      <FlagIcon code={code} />
      <div className="min-w-0">
        <p className="font-mono text-sm font-black text-foreground" dir="ltr">{code}</p>
        <p className="truncate text-xs font-bold text-muted-foreground">{meta?.label || code}</p>
      </div>
    </div>
  );
}

function CurrencyRatesGrid({ rates, proUnavailable = false }: { rates: CurrencyRate[]; proUnavailable?: boolean }) {
  const rateMap = useMemo(() => {
    const map = new Map<string, CurrencyRate>();
    rates.forEach((rate) => map.set(rateKey(rate.currencyCode, rate.marketType), rate));
    return map;
  }, [rates]);

  return (
    <div className="space-y-3" data-testid="currency-rates-grid">
      <Card className="hidden rounded-lg md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-4 text-right text-xs font-black">ارز</TableHead>
                {MARKET_TYPES.map((marketType) => (
                  <TableHead key={marketType} className="text-right text-xs font-black">{marketLabels[marketType]}</TableHead>
                ))}
                <TableHead className="text-right text-xs font-black">تغییر</TableHead>
                <TableHead className="text-right text-xs font-black">آخرین بروزرسانی</TableHead>
                <TableHead className="text-right text-xs font-black">وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CURRENCY_CODES.map((currencyCode) => {
                const rowRates = MARKET_TYPES.map((marketType) => rateMap.get(rateKey(currencyCode, marketType)));
                const freeRate = rateMap.get(rateKey(currencyCode, "FREE_MARKET"));
                const latestUpdate = currencyLatestUpdate(rowRates);
                const hasAnyRate = rowRates.some(Boolean);
                return (
                  <TableRow key={currencyCode} data-testid={`currency-row-${currencyCode}`} className="hover:bg-primary/5">
                    <TableCell className="px-4 py-3">
                      <CurrencyIdentity code={currencyCode} />
                    </TableCell>
                    {MARKET_TYPES.map((marketType) => (
                      <TableCell key={marketType} className="py-3">
                        <RateChip rate={rateMap.get(rateKey(currencyCode, marketType))} marketType={marketType} proUnavailable={proUnavailable} />
                      </TableCell>
                    ))}
                    <TableCell className="py-3"><ChangeCell rate={freeRate} /></TableCell>
                    <TableCell className="py-3 text-xs font-bold text-muted-foreground">{formatDateTime(latestUpdate)}</TableCell>
                    <TableCell className="py-3">
                      <Badge className={cn("rounded-md text-[11px] font-black", hasAnyRate ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" : "border-slate-500/20 bg-slate-500/10 text-slate-600")}>
                        {hasAnyRate ? "نرخ موجود" : "در انتظار نرخ"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-2 md:hidden">
        {CURRENCY_CODES.map((currencyCode) => {
          const freeRate = rateMap.get(rateKey(currencyCode, "FREE_MARKET"));
          const rowRates = MARKET_TYPES.map((marketType) => rateMap.get(rateKey(currencyCode, marketType)));
          return (
            <Card key={currencyCode} data-testid={`currency-card-${currencyCode}`} className="rounded-lg">
              <CardContent className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <CurrencyIdentity code={currencyCode} />
                  <ChangeCell rate={freeRate} />
                </div>
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <p className="text-[11px] font-black text-muted-foreground">بازار آزاد</p>
                  <div className="mt-1">
                    <RateChip rate={freeRate} marketType="FREE_MARKET" proUnavailable={proUnavailable} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {MARKET_TYPES.filter((marketType) => marketType !== "FREE_MARKET").map((marketType) => (
                    <div key={marketType} className="min-w-0 rounded-md border border-border bg-background p-2">
                      <p className="mb-1 truncate text-[10px] font-black text-muted-foreground">{marketLabels[marketType]}</p>
                      <RateChip rate={rateMap.get(rateKey(currencyCode, marketType))} marketType={marketType} proUnavailable={proUnavailable} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {formatDateTime(currencyLatestUpdate(rowRates))}</span>
                  <span>{rowRates.some(Boolean) ? "نرخ موجود" : "در انتظار نرخ"}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

type ManualForm = {
  currencyCode: string;
  marketType: CurrencyMarketType;
  price: string;
  buyRate: string;
  sellRate: string;
  note: string;
};

const emptyManualForm: ManualForm = {
  currencyCode: "USD",
  marketType: "FREE_MARKET",
  price: "",
  buyRate: "",
  sellRate: "",
  note: "",
};

export default function RatesAndTariffs() {
  const { isPlatformAdmin } = useCurrentUserPermissions();
  const [activeTab, setActiveTab] = useState<"rates" | "tariffs">("rates");
  const [settings, setSettings] = useState<CurrencyRateSettings>(emptySettings);
  const [adminDiagnostics, setAdminDiagnostics] = useState<RatesAdminDiagnostics | null>(null);
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [pendingRates, setPendingRates] = useState<CurrencyRate[]>([]);
  const [currencyLoading, setCurrencyLoading] = useState(true);
  const [currencyError, setCurrencyError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualForm, setManualForm] = useState<ManualForm>(emptyManualForm);
  const [settingsDraft, setSettingsDraft] = useState(emptySettings);
  const [savingManual, setSavingManual] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [tariffQuery, setTariffQuery] = useState("");
  const [tariffs, setTariffs] = useState<TariffCatalogEntry[]>([]);
  const [tariffLoading, setTariffLoading] = useState(false);
  const [tariffError, setTariffError] = useState("");
  const [selectedTariff, setSelectedTariff] = useState<TariffCatalogEntry | null>(null);
  const [tariffFile, setTariffFile] = useState<File | null>(null);
  const [tariffMode, setTariffMode] = useState<"replace" | "append">("replace");
  const [tariffSourceDate, setTariffSourceDate] = useState("");
  const [tariffPreview, setTariffPreview] = useState<TariffImportPreview | null>(null);
  const [tariffUploading, setTariffUploading] = useState(false);

  const loadRates = React.useCallback(async () => {
    setCurrencyLoading(true);
    setCurrencyError("");
    try {
      const payload = await ratesApi.getCurrencyRates();
      setSettings(payload.settings);
      setSettingsDraft(payload.settings);
      setRates(payload.rates);
      setAdminDiagnostics(payload.adminDiagnostics || null);
    } catch (error) {
      setCurrencyError(error instanceof Error ? error.message : "خطا در دریافت نرخ‌ها");
    } finally {
      setCurrencyLoading(false);
    }
  }, []);

  const loadPendingRates = React.useCallback(async () => {
    if (!isPlatformAdmin) {
      setPendingRates([]);
      return;
    }
    try {
      setPendingRates(await ratesApi.getSnapshots({ status: "pending_review", limit: 20 }));
    } catch (error) {
      console.error("Could not load pending rates.", error);
    }
  }, [isPlatformAdmin]);

  const searchTariffs = React.useCallback(async (query = "") => {
    setTariffLoading(true);
    setTariffError("");
    try {
      setTariffs(await ratesApi.searchTariffs({ q: query, limit: 50 }));
    } catch (error) {
      setTariffError(error instanceof Error ? error.message : "خطا در جستجوی تعرفه‌ها");
    } finally {
      setTariffLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRates();
  }, [loadRates]);

  useEffect(() => {
    void loadPendingRates();
  }, [loadPendingRates]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchTariffs(tariffQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTariffs, tariffQuery]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await ratesApi.syncCurrencyRates();
      toast.success(`همگام‌سازی انجام شد: ${toPersianDigits(result.published || 0)} نرخ منتشر شد`);
      await loadRates();
      await loadPendingRates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "همگام‌سازی ناموفق بود");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveManual = async () => {
    const price = normalizeNumberInput(manualForm.price);
    if (!price || price <= 0) {
      toast.error("مبلغ نرخ را درست وارد کنید.");
      return;
    }
    setSavingManual(true);
    try {
      await ratesApi.saveManualRate({
        currencyCode: manualForm.currencyCode,
        marketType: manualForm.marketType,
        price,
        buyRate: normalizeNumberInput(manualForm.buyRate),
        sellRate: normalizeNumberInput(manualForm.sellRate),
        unit: "IRR",
        note: manualForm.note,
      });
      toast.success("نرخ دستی ثبت شد.");
      setManualOpen(false);
      setManualForm(emptyManualForm);
      await loadRates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت نرخ دستی ناموفق بود");
    } finally {
      setSavingManual(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const updated = await ratesApi.updateSettings({
        isEnabled: settingsDraft.isEnabled,
        autoPublishSuspicious: settingsDraft.autoPublishSuspicious,
        suspiciousChangePercent: settingsDraft.suspiciousChangePercent,
        syncIntervalMinutes: settingsDraft.syncIntervalMinutes,
      });
      setSettings(updated);
      setSettingsDraft(updated);
      toast.success("تنظیمات نرخ‌ها ذخیره شد.");
      setSettingsOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره تنظیمات ناموفق بود");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleReview = async (snapshot: CurrencyRate, decision: "approve" | "reject") => {
    if (!snapshot.id && !snapshot.snapshotId) return;
    try {
      await ratesApi.reviewSnapshot(String(snapshot.id || snapshot.snapshotId), { decision });
      toast.success(decision === "approve" ? "نرخ تایید شد." : "نرخ رد شد.");
      await loadRates();
      await loadPendingRates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بررسی نرخ ناموفق بود");
    }
  };

  const handleTariffPreview = async () => {
    if (!tariffFile) {
      toast.error("فایل تعرفه را انتخاب کنید.");
      return;
    }
    setTariffUploading(true);
    try {
      const preview = await ratesApi.previewTariffImport(tariffFile, { mode: tariffMode, sourceDate: tariffSourceDate });
      setTariffPreview(preview);
      toast[preview.valid ? "success" : "error"](preview.valid ? "فایل آماده ورود است." : "فایل نیاز به اصلاح دارد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "اعتبارسنجی فایل ناموفق بود");
    } finally {
      setTariffUploading(false);
    }
  };

  const handleTariffImport = async () => {
    if (!tariffFile) {
      toast.error("فایل تعرفه را انتخاب کنید.");
      return;
    }
    setTariffUploading(true);
    try {
      const result = await ratesApi.importTariffs(tariffFile, { mode: tariffMode, sourceDate: tariffSourceDate });
      toast.success(`${toPersianDigits(result.activeRowCount)} ردیف تعرفه وارد شد.`);
      setTariffPreview(null);
      setTariffFile(null);
      await searchTariffs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ورود فایل تعرفه ناموفق بود");
    } finally {
      setTariffUploading(false);
    }
  };

  const proUnavailable = Boolean(settings.lastSyncError?.includes("پلن BRSAPI") || settings.lastSyncError?.includes("اعتبار کلید"));
  const adminWarning = useMemo(() => {
    if (!isPlatformAdmin) return "";
    if (adminDiagnostics && !adminDiagnostics.keyConfigured) return "کلید BRSAPI در تنظیمات سرور ثبت نشده است";
    if (proUnavailable) return "دسترسی BRSAPI برای برخی نرخ‌های Pro فعال نیست. نرخ‌های موجود نمایش داده می‌شوند.";
    if (settings.lastSyncStatus === "failed" && settings.lastSyncError) return settings.lastSyncError;
    return "";
  }, [adminDiagnostics, isPlatformAdmin, proUnavailable, settings.lastSyncError, settings.lastSyncStatus]);

  return (
    <div className="app-page space-y-5 font-sans text-foreground" dir="rtl" data-testid="rates-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-normal text-foreground">نرخ‌ها و تعرفه‌ها</h1>
          <p className="mt-1 text-sm font-bold leading-6 text-muted-foreground">نرخ ارزهای کاری، سنا و نیما، و کاتالوگ تعرفه گمرکی.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusBadge(settings)}
          {isPlatformAdmin && (
            <>
              <Button variant="outline" className="h-10 rounded-lg text-xs font-black" onClick={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
                تنظیمات
              </Button>
              <Button variant="outline" className="h-10 rounded-lg text-xs font-black" onClick={() => setManualOpen(true)}>
                <Save className="h-4 w-4" />
                نرخ دستی
              </Button>
              <Button className="h-10 rounded-lg text-xs font-black" onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                همگام‌سازی Pro
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "rates" | "tariffs")} className="w-full flex-col">
        <TabsList className="w-full justify-start overflow-x-auto bg-muted/60 sm:w-fit">
          <TabsTrigger value="rates" className="min-w-28 text-xs font-black">نرخ ارز</TabsTrigger>
          <TabsTrigger value="tariffs" className="min-w-28 text-xs font-black">تعرفه‌ها</TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-[11px] font-black text-muted-foreground">آخرین همگام‌سازی</p>
                  <p className="mt-2 text-sm font-black">{formatDateTime(settings.lastSyncAt)}</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-[11px] font-black text-muted-foreground">حد هشدار تغییر</p>
                  <p className="mt-2 text-sm font-black">{toPersianDigits(settings.suspiciousChangePercent)}٪</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-[11px] font-black text-muted-foreground">بررسی مشکوک</p>
                  <p className="mt-2 text-sm font-black">{settings.autoPublishSuspicious ? "انتشار خودکار" : "نیازمند تایید"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-[11px] font-black text-muted-foreground">وضعیت منبع</p>
                  <p className="mt-2 truncate text-sm font-black">{settings.lastSyncStatus === "failed" ? "دارای هشدار" : (settings.isEnabled ? "BRSAPI Pro" : "غیرفعال")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {adminWarning && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold leading-6 text-amber-900">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p>{adminWarning}</p>
                  {adminDiagnostics && (
                    <div className="mt-2 grid gap-2 text-[11px] font-bold text-amber-900/80 sm:grid-cols-2">
                      <div className="rounded-md bg-white/45 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-[0.08em]">Endpoint</div>
                        <div className="mt-1 break-all font-mono" dir="ltr">{adminDiagnostics.endpoint}</div>
                      </div>
                      <div className="rounded-md bg-white/45 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-[0.08em]">Section</div>
                        <div className="mt-1 font-mono" dir="ltr">{adminDiagnostics.section}</div>
                      </div>
                      <div className="rounded-md bg-white/45 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-[0.08em]">Key</div>
                        <div className="mt-1">{adminDiagnostics.keyConfigured ? "ثبت شده" : "ثبت نشده"}</div>
                      </div>
                      <div className="rounded-md bg-white/45 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-[0.08em]">Worker</div>
                        <div className="mt-1">{adminDiagnostics.syncEnabled ? "فعال" : "غیرفعال"}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {currencyLoading ? (
            <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-card">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : currencyError ? (
            <EmptyState icon={AlertTriangle} title="نرخ‌ها دریافت نشد" description={currencyError} compact />
          ) : (
            <CurrencyRatesGrid rates={rates} proUnavailable={proUnavailable} />
          )}

          {isPlatformAdmin && pendingRates.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-black">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  نرخ‌های نیازمند تایید
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingRates.map((rate) => (
                  <div key={String(rate.id || rate.snapshotId)} className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-black">{currencyLabels[rate.currencyCode] || rate.currencyCode} - {marketLabels[rate.marketType]}</p>
                      <p className="mt-1 text-xs font-bold text-muted-foreground">
                        نرخ جدید {formatNumber(rate.price)}، نرخ قبلی {formatNumber(rate.previousPrice)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-9 rounded-lg text-xs font-black" onClick={() => handleReview(rate, "approve")}>
                        <Check className="h-4 w-4" />
                        تایید
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 rounded-lg text-xs font-black" onClick={() => handleReview(rate, "reject")}>
                        <X className="h-4 w-4" />
                        رد
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tariffs" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="space-y-2">
                  <Label htmlFor="tariff-search" className="text-xs font-black">جستجوی کد یا شرح تعرفه</Label>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="tariff-search"
                      value={tariffQuery}
                      onChange={(event) => setTariffQuery(event.target.value)}
                      className="h-11 rounded-lg bg-background pr-10 text-sm font-bold"
                      placeholder="مثلا ۸۵۰۴ یا شرح کالا"
                    />
                  </div>
                </div>
                <Button variant="outline" className="h-11 rounded-lg text-xs font-black" onClick={() => searchTariffs()}>
                  <Search className="h-4 w-4" />
                  جستجو
                </Button>
              </div>
            </CardContent>
          </Card>

          {isPlatformAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-black">
                  <Upload className="h-5 w-5 text-primary" />
                  ورود کاتالوگ تعرفه
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_auto_auto] lg:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="tariff-file" className="text-xs font-black">فایل CSV یا XLSX</Label>
                    <Input
                      id="tariff-file"
                      type="file"
                      accept=".csv,.xlsx"
                      className="h-11 rounded-lg bg-background text-xs font-bold"
                      onChange={(event) => {
                        setTariffFile(event.target.files?.[0] || null);
                        setTariffPreview(null);
                      }}
                    />
                    {tariffFile && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] font-bold text-muted-foreground">
                        <FileSpreadsheet className="h-4 w-4 text-primary" />
                        <span className="min-w-0 truncate">{tariffFile.name}</span>
                        <Badge variant="outline" className="rounded-md text-[10px]">{formatFileSize(tariffFile.size)}</Badge>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black">روش ورود</Label>
                    <Select value={tariffMode} onValueChange={(value) => setTariffMode(value as "replace" | "append")}>
                      <SelectTrigger className="h-11 w-full rounded-lg bg-background text-xs font-black">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card text-foreground" dir="rtl">
                        <SelectItem value="replace">جایگزینی امن</SelectItem>
                        <SelectItem value="append">افزودن/به‌روزرسانی</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tariff-source-date" className="text-xs font-black">تاریخ منبع</Label>
                    <Input
                      id="tariff-source-date"
                      value={tariffSourceDate}
                      onChange={(event) => setTariffSourceDate(event.target.value)}
                      className="h-11 rounded-lg bg-background text-xs font-bold"
                      placeholder="۱۴۰۵/۰۳"
                    />
                  </div>
                  <Button variant="outline" className="h-11 rounded-lg text-xs font-black" onClick={handleTariffPreview} disabled={tariffUploading}>
                    {tariffUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    اعتبارسنجی
                  </Button>
                  <Button className="h-11 rounded-lg text-xs font-black" onClick={handleTariffImport} disabled={tariffUploading || !tariffPreview?.valid}>
                    <Database className="h-4 w-4" />
                    ثبت کاتالوگ
                  </Button>
                </div>
                {tariffPreview && (
                  <div className={cn("rounded-lg border p-3", tariffPreview.valid ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5")}>
                    <p className="text-sm font-black">
                      {tariffPreview.valid ? `${toPersianDigits(tariffPreview.rowCount)} ردیف آماده ورود است.` : "خطاهای فایل"}
                    </p>
                    {!tariffPreview.valid && (
                      <div className="mt-2 space-y-1 text-xs font-bold text-rose-700">
                        {tariffPreview.errors.map((error) => <p key={error}>{error}</p>)}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tariffLoading ? (
            <div className="flex min-h-48 items-center justify-center rounded-lg border border-border bg-card">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : tariffError ? (
            <EmptyState icon={AlertTriangle} title="تعرفه‌ها دریافت نشد" description={tariffError} compact />
          ) : tariffs.length === 0 ? (
            <EmptyState icon={FileSpreadsheet} title="تعرفه‌ای پیدا نشد" description="با کد تعرفه، عنوان کالا یا دسته‌بندی جستجو کنید." compact />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tariffs.map((tariff) => (
                <button
                  key={tariff.id}
                  type="button"
                  onClick={() => setSelectedTariff(tariff)}
                  className="min-w-0 rounded-lg border border-border bg-card p-4 text-right transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant="outline" className="shrink-0 font-mono text-xs" dir="ltr">{tariff.tariffCode}</Badge>
                    <span className="min-w-0 text-sm font-black leading-6 text-foreground">{tariff.titleFa}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs font-bold leading-6 text-muted-foreground">{tariff.category || tariff.chapter || tariff.titleEn || "بدون دسته‌بندی"}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-muted-foreground">
                    <span>واحد: {tariff.unit || "ثبت نشده"}</span>
                    <span>حقوق: {tariff.dutyRate || "ثبت نشده"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>ثبت نرخ دستی</DialogTitle>
            <DialogDescription>برای اصلاح سریع یا fallback، نرخ دستی با ممیزی ذخیره می‌شود.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-black">ارز</Label>
              <Select value={manualForm.currencyCode} onValueChange={(value) => setManualForm((current) => ({ ...current, currencyCode: value }))}>
                <SelectTrigger className="h-10 w-full rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card text-foreground" dir="rtl">
                  {CURRENCY_CODES.map((code) => <SelectItem key={code} value={code}>{currencyLabels[code]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black">بازار</Label>
              <Select value={manualForm.marketType} onValueChange={(value) => setManualForm((current) => ({ ...current, marketType: value as CurrencyMarketType }))}>
                <SelectTrigger className="h-10 w-full rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card text-foreground" dir="rtl">
                  {ADMIN_MARKET_TYPES.map((marketType) => <SelectItem key={marketType} value={marketType}>{marketLabels[marketType]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-price" className="text-xs font-black">نرخ</Label>
              <Input id="manual-price" value={manualForm.price} onChange={(event) => setManualForm((current) => ({ ...current, price: event.target.value }))} className="h-10 rounded-lg" inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-note" className="text-xs font-black">یادداشت</Label>
              <Input id="manual-note" value={manualForm.note} onChange={(event) => setManualForm((current) => ({ ...current, note: event.target.value }))} className="h-10 rounded-lg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>لغو</Button>
            <Button onClick={handleSaveManual} disabled={savingManual}>
              {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تنظیمات منبع نرخ</DialogTitle>
            <DialogDescription>کلید Pro در متغیر محیطی سرور نگهداری می‌شود و اینجا نمایش داده نمی‌شود.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-lg border border-border p-3 text-xs font-black">
              فعال بودن BRSAPI
              <input type="checkbox" checked={settingsDraft.isEnabled} onChange={(event) => setSettingsDraft((current) => ({ ...current, isEnabled: event.target.checked }))} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-border p-3 text-xs font-black">
              انتشار خودکار مشکوک
              <input type="checkbox" checked={settingsDraft.autoPublishSuspicious} onChange={(event) => setSettingsDraft((current) => ({ ...current, autoPublishSuspicious: event.target.checked }))} />
            </label>
            <div className="space-y-2">
              <Label className="text-xs font-black">حد تغییر مشکوک ٪</Label>
              <Input value={String(settingsDraft.suspiciousChangePercent)} onChange={(event) => setSettingsDraft((current) => ({ ...current, suspiciousChangePercent: normalizeNumberInput(event.target.value) ?? current.suspiciousChangePercent }))} className="h-10 rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black">فاصله همگام‌سازی دقیقه</Label>
              <Input value={String(settingsDraft.syncIntervalMinutes)} onChange={(event) => setSettingsDraft((current) => ({ ...current, syncIntervalMinutes: normalizeNumberInput(event.target.value) ?? current.syncIntervalMinutes }))} className="h-10 rounded-lg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>لغو</Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedTariff)} onOpenChange={(open) => !open && setSelectedTariff(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          {selectedTariff && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTariff.tariffCode}</DialogTitle>
                <DialogDescription>{selectedTariff.titleFa}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {[
                  ["عنوان انگلیسی", selectedTariff.titleEn],
                  ["دسته", selectedTariff.category],
                  ["فصل", selectedTariff.chapter],
                  ["واحد", selectedTariff.unit],
                  ["حقوق ورودی", selectedTariff.dutyRate],
                  ["مالیات", selectedTariff.taxRate],
                  ["محدودیت‌ها", selectedTariff.restrictions],
                  ["یادداشت", selectedTariff.notes],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-background p-3">
                    <p className="text-[11px] font-black text-muted-foreground">{label}</p>
                    <p className="mt-2 text-sm font-bold leading-6">{value || "ثبت نشده"}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
