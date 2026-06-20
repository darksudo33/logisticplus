import React from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Clock3,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  Ship,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ApiError } from "@/src/lib/api";
import {
  customsStatusOptions,
  labelForOption,
  releaseStatusOptions,
  routeOptions,
} from "@/src/app/dailyStatusColumns";
import { kootajBoardApi, type DailyStatusListFilters } from "@/src/lib/dailyStatusApi";
import { shipmentStatusLabel, SHIPMENT_STATUS_OPTIONS } from "@/src/shared/shipment-statuses.js";
import { useAppStore } from "@/src/store/useAppStore";
import type { DailyStatusBoardRow } from "@/src/types";

const ALL_VALUE = "ALL";
const BOARD_LIMIT = 50;
const NO_VALUE = "__none";
const KOOTAJ_CONFLICT_MESSAGE = "اطلاعات این ردیف توسط کاربر دیگری تغییر کرده است. صفحه را به‌روزرسانی کردیم، دوباره بررسی کنید.";

type KootajEditDraft = {
  cotageNumber: string;
  customsRoute: string;
  customsStatus: string;
  releaseStatus: string;
};

function safeTestId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function customerLabel(row: DailyStatusBoardRow) {
  return (
    row.customer?.name ||
    row.baseInfo.customerName ||
    row.customer?.customerCode ||
    row.baseInfo.customerCode ||
    row.customer?.id ||
    "بدون مشتری"
  );
}

function customerSecondary(row: DailyStatusBoardRow) {
  const code = row.customer?.customerCode || row.baseInfo.customerCode || "";
  return code && code !== customerLabel(row) ? code : "";
}

function shipmentRoute(row: DailyStatusBoardRow) {
  const origin = row.shipment.origin || row.baseInfo.origin;
  const destination = row.shipment.destination || row.baseInfo.deliveryPort || row.baseInfo.dischargePort;
  return [origin, destination].filter(Boolean).join(" ← ") || "مسیر ثبت نشده";
}

function customsRouteLabel(row: DailyStatusBoardRow) {
  return labelForOption(routeOptions, row.kootaj.customsRoute || row.workflow?.route) || "ثبت نشده";
}

function latestOperationalStatus(row: DailyStatusBoardRow) {
  const values = [
    labelForOption(customsStatusOptions, row.kootaj.customsStatus),
    labelForOption(releaseStatusOptions, row.kootaj.releaseStatus),
    row.workflow?.currentStepLabel,
    row.baseInfo.currentStage,
  ].filter(Boolean);
  return values.slice(0, 2).join(" · ") || "وضعیت روزانه ثبت نشده";
}

function shipmentDetailUrl(row: DailyStatusBoardRow) {
  return row.links.shipmentDetailUrl || `/shipments/${encodeURIComponent(row.shipment.id)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "ثبت نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function lastUpdatedText(row: DailyStatusBoardRow) {
  const updatedAt = row.kootaj.updatedAt || row.baseInfo.updatedAt || row.shipment.updatedAt;
  const actor = row.baseInfo.updatedByName || row.kootaj.updatedById || "";
  return actor ? `${formatDateTime(updatedAt)} · ${actor}` : formatDateTime(updatedAt);
}

function draftFromRow(row: DailyStatusBoardRow): KootajEditDraft {
  return {
    cotageNumber: row.kootaj.cotageNumber || "",
    customsRoute: row.kootaj.customsRoute || "",
    customsStatus: row.kootaj.customsStatus || "",
    releaseStatus: row.kootaj.releaseStatus || "",
  };
}

function nullableSelectValue(value: string) {
  return value === NO_VALUE ? "" : value;
}

function patchValue(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-black text-foreground">{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  testId,
  value,
  onChange,
  children,
}: {
  label: string;
  testId: string;
  value?: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-[11px] font-black text-muted-foreground">
      {label}
      <select
        value={value || ALL_VALUE}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-input bg-background px-3 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
        data-testid={testId}
      >
        {children}
      </select>
    </label>
  );
}

function KootajDesktopRow({
  canEdit,
  onEdit,
  row,
}: {
  canEdit: boolean;
  onEdit: (row: DailyStatusBoardRow) => void;
  row: DailyStatusBoardRow;
}) {
  const testId = safeTestId(row.id);
  return (
    <div
      role="row"
      className="grid min-w-0 grid-cols-[minmax(86px,0.8fr)_minmax(104px,0.95fr)_minmax(116px,1.05fr)_minmax(86px,0.75fr)_minmax(132px,1.1fr)_minmax(104px,0.85fr)_minmax(88px,0.72fr)_minmax(118px,0.95fr)_56px] items-center gap-2 border-t border-border px-3 py-3 text-xs"
      data-testid={`kootaj-board-row-${testId}`}
    >
      <div className="min-w-0">
        <Link
          to={shipmentDetailUrl(row)}
          className="inline-flex max-w-full items-center gap-1 truncate font-black text-primary hover:underline"
          data-testid={`kootaj-board-row-link-${testId}`}
        >
          <span className="truncate">{row.shipment.code || row.baseInfo.code}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </Link>
      </div>
      <div className="min-w-0">
        <p className="truncate font-black text-foreground">{customerLabel(row)}</p>
        {customerSecondary(row) ? <p className="truncate text-[10px] font-bold text-muted-foreground">{customerSecondary(row)}</p> : null}
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold text-foreground">{shipmentRoute(row)}</p>
        <p className="truncate text-[10px] font-bold text-muted-foreground">{customsRouteLabel(row)}</p>
      </div>
      <div className="min-w-0">
        <Badge variant="outline" className="max-w-full truncate px-2 py-1 text-[10px] font-black">
          {shipmentStatusLabel(row.shipment.status)}
        </Badge>
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 font-bold text-foreground">{latestOperationalStatus(row)}</p>
        {row.workflow?.currentPhase ? <p className="truncate text-[10px] font-bold text-muted-foreground">{row.workflow.currentPhase}</p> : null}
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold text-foreground">{row.kootaj.cotageNumber || "بدون کوتاژ"}</p>
        <p className="truncate text-[10px] font-bold text-muted-foreground">{row.commercialCard?.displayName || "کارت ثبت نشده"}</p>
      </div>
      <div className="min-w-0">
        <p className="font-bold text-foreground">{row.tasks.openCount} باز / {row.tasks.overdueCount} دیرکرد</p>
        <p className="text-[10px] font-bold text-muted-foreground">{row.documents.customerVisibleCount}/{row.documents.totalCount} سند</p>
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-[11px] font-bold text-muted-foreground">{lastUpdatedText(row)}</p>
      </div>
      <div className="flex justify-end">
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg px-2 text-[10px] font-black"
            onClick={() => onEdit(row)}
            data-testid={`kootaj-board-edit-${testId}`}
          >
            <Pencil className="ml-1 h-3.5 w-3.5" />
            ویرایش
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function KootajMobileCard({
  canEdit,
  onEdit,
  row,
}: {
  canEdit: boolean;
  onEdit: (row: DailyStatusBoardRow) => void;
  row: DailyStatusBoardRow;
}) {
  const testId = safeTestId(row.id);
  return (
    <Card className="overflow-hidden" data-testid={`kootaj-board-mobile-card-${testId}`}>
      <CardContent className="p-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={shipmentDetailUrl(row)}
              className="inline-flex max-w-full items-center gap-1 truncate text-sm font-black text-primary hover:underline"
              data-testid={`kootaj-board-mobile-row-link-${testId}`}
            >
              <span className="truncate">{row.shipment.code || row.baseInfo.code}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </Link>
            <p className="mt-1 truncate text-xs font-bold text-muted-foreground">{customerLabel(row)}</p>
          </div>
          <Badge variant="outline" className="shrink-0 px-2 py-1 text-[10px] font-black">
            {shipmentStatusLabel(row.shipment.status)}
          </Badge>
        </div>

        <div className="mt-3 grid gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <RouteIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-bold">{shipmentRoute(row)} · {customsRouteLabel(row)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-bold">{latestOperationalStatus(row)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-[10px] font-bold text-muted-foreground">کوتاژ</p>
              <p className="mt-1 truncate font-black">{row.kootaj.cotageNumber || "ثبت نشده"}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-[10px] font-bold text-muted-foreground">وظایف / اسناد</p>
              <p className="mt-1 truncate font-black">{row.tasks.openCount} / {row.documents.totalCount}</p>
            </div>
          </div>
          <p className="text-[11px] font-bold text-muted-foreground">{lastUpdatedText(row)}</p>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full rounded-lg text-xs font-black"
              onClick={() => onEdit(row)}
              data-testid={`kootaj-board-mobile-edit-${testId}`}
            >
              <Pencil className="ml-1 h-3.5 w-3.5" />
              ویرایش وضعیت کوتاژ
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function KootajEditDialog({
  draft,
  open,
  row,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: KootajEditDraft;
  open: boolean;
  row: DailyStatusBoardRow | null;
  saving: boolean;
  onChange: (field: keyof KootajEditDraft, value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && !saving) onClose();
    }}>
      <DialogContent className="sm:max-w-xl" dir="rtl" data-testid="kootaj-board-edit-dialog">
        <DialogHeader>
          <DialogTitle className="text-base font-black">ویرایش وضعیت کوتاژ</DialogTitle>
          <DialogDescription className="text-xs font-bold leading-6">
            فقط شماره کوتاژ، مسیر گمرکی، وضعیت گمرکی و وضعیت ترخیص قابل ویرایش هستند.
            سایر اطلاعات از محموله، مشتری، اسناد و وظایف به‌صورت خواندنی نمایش داده می‌شود.
          </DialogDescription>
        </DialogHeader>

        {row ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs font-bold text-muted-foreground">
            <span className="text-foreground">{row.shipment.code || row.baseInfo.code}</span>
            <span className="mx-2">·</span>
            <span>{customerLabel(row)}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Label className="grid gap-1 text-xs font-black">
            شماره کوتاژ
            <Input
              value={draft.cotageNumber}
              onChange={(event) => onChange("cotageNumber", event.target.value)}
              className="h-10 rounded-lg text-xs font-bold"
              maxLength={120}
              data-testid="kootaj-board-cotage-input"
            />
          </Label>

          <Label className="grid gap-1 text-xs font-black">
            مسیر گمرکی
            <select
              value={draft.customsRoute || NO_VALUE}
              onChange={(event) => onChange("customsRoute", nullableSelectValue(event.target.value))}
              className="h-10 rounded-lg border border-input bg-background px-3 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
              data-testid="kootaj-board-customs-route-select"
            >
              <option value={NO_VALUE}>ثبت نشده</option>
              {routeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Label>

          <Label className="grid gap-1 text-xs font-black">
            وضعیت گمرکی
            <select
              value={draft.customsStatus || NO_VALUE}
              onChange={(event) => onChange("customsStatus", nullableSelectValue(event.target.value))}
              className="h-10 rounded-lg border border-input bg-background px-3 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
              data-testid="kootaj-board-customs-status-select"
            >
              <option value={NO_VALUE}>ثبت نشده</option>
              {customsStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Label>

          <Label className="grid gap-1 text-xs font-black">
            وضعیت ترخیص
            <select
              value={draft.releaseStatus || NO_VALUE}
              onChange={(event) => onChange("releaseStatus", nullableSelectValue(event.target.value))}
              className="h-10 rounded-lg border border-input bg-background px-3 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
              data-testid="kootaj-board-release-status-select"
            >
              <option value={NO_VALUE}>ثبت نشده</option>
              {releaseStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-lg text-xs font-black"
            onClick={onClose}
            disabled={saving}
            data-testid="kootaj-board-cancel-edit"
          >
            انصراف
          </Button>
          <Button
            type="button"
            className="rounded-lg text-xs font-black"
            onClick={onSave}
            disabled={saving}
            data-testid="kootaj-board-save-edit"
          >
            {saving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
            ذخیره تغییرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KootajBoard() {
  const currentUser = useAppStore((state) => state.currentUser);
  const [rows, setRows] = React.useState<DailyStatusBoardRow[]>([]);
  const [filters, setFilters] = React.useState<DailyStatusListFilters>({ limit: BOARD_LIMIT });
  const [searchText, setSearchText] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editingRow, setEditingRow] = React.useState<DailyStatusBoardRow | null>(null);
  const [editDraft, setEditDraft] = React.useState<KootajEditDraft>({
    cotageNumber: "",
    customsRoute: "",
    customsStatus: "",
    releaseStatus: "",
  });
  const [savingEdit, setSavingEdit] = React.useState(false);
  const userPermissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
  const canEditKootaj = userPermissions.includes("shipments.update") || userPermissions.includes("platform.admin");

  const loadRows = React.useCallback(async (nextFilters: DailyStatusListFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await kootajBoardApi.list(nextFilters);
      setRows(data);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "بارگیری برد کوتاژ ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadRows({ ...filters, q: searchText.trim() || undefined, limit: BOARD_LIMIT });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filters, searchText, loadRows]);

  const setFilterValue = (key: keyof DailyStatusListFilters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value === ALL_VALUE ? undefined : value,
      limit: BOARD_LIMIT,
    }));
  };

  const clearFilters = () => {
    setSearchText("");
    setFilters({ limit: BOARD_LIMIT });
  };

  const refreshRows = () => loadRows({ ...filters, q: searchText.trim() || undefined, limit: BOARD_LIMIT });
  const openEditDialog = (row: DailyStatusBoardRow) => {
    setEditingRow(row);
    setEditDraft(draftFromRow(row));
  };
  const closeEditDialog = () => {
    if (savingEdit) return;
    setEditingRow(null);
    setEditDraft({
      cotageNumber: "",
      customsRoute: "",
      customsStatus: "",
      releaseStatus: "",
    });
  };
  const saveEdit = async () => {
    if (!editingRow) return;
    setSavingEdit(true);
    try {
      const updated = await kootajBoardApi.update(editingRow.id, {
        cotageNumber: patchValue(editDraft.cotageNumber),
        customsRoute: editDraft.customsRoute || null,
        customsStatus: editDraft.customsStatus || null,
        releaseStatus: editDraft.releaseStatus || null,
        expectedKootajUpdatedAt: editingRow.kootajUpdatedAt || null,
      });
      setRows((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingRow(null);
      setEditDraft(draftFromRow(updated));
      toast.success("وضعیت کوتاژ بروزرسانی شد.");
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 409 && saveError.code === "KOOTAJ_VERSION_CONFLICT") {
        toast.error(KOOTAJ_CONFLICT_MESSAGE);
        setEditingRow(null);
        await refreshRows();
        return;
      }
      if (saveError instanceof ApiError && saveError.status === 403) {
        toast.error("شما مجوز ویرایش وضعیت کوتاژ را ندارید.");
        return;
      }
      toast.error(saveError instanceof Error ? saveError.message : "ذخیره وضعیت کوتاژ ناموفق بود.");
    } finally {
      setSavingEdit(false);
    }
  };
  const hasFilters = Boolean(searchText || filters.shipmentStatus || filters.customsRoute);
  const withCotage = rows.filter((row) => row.kootaj.cotageNumber).length;
  const blockedRows = rows.filter((row) => row.kootaj.customsStatus === "blocked" || row.kootaj.releaseStatus === "blocked").length;
  const openTasks = rows.reduce((sum, row) => sum + row.tasks.openCount, 0);

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-background p-3 text-foreground md:p-4 lg:p-6" dir="rtl" data-testid="kootaj-board-page">
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-4">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Ship className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black tracking-normal text-foreground">برد کوتاژ</h1>
                <p className="mt-1 text-xs font-bold text-muted-foreground">
                  نمای عملیاتی محموله‌ها، وضعیت روزانه، اسناد و وظایف با ویرایش محدود فیلدهای کوتاژ
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[560px]">
            <SummaryTile label="ردیف‌ها" value={rows.length} />
            <SummaryTile label="کوتاژ ثبت‌شده" value={withCotage} />
            <SummaryTile label="وظایف باز" value={openTasks} />
            <SummaryTile label="متوقف" value={blockedRows} />
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-3 shadow-sm" data-testid="kootaj-board-toolbar">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_150px_auto_auto] lg:items-end">
            <label className="grid min-w-0 gap-1 text-[11px] font-black text-muted-foreground">
              جستجو
              <span className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="شماره محموله، مشتری، کوتاژ، اظهارنامه یا کارت بازرگانی"
                  className="h-10 rounded-lg pr-9 text-xs font-bold"
                  data-testid="kootaj-board-search"
                />
              </span>
            </label>

            <FilterSelect
              label="وضعیت محموله"
              testId="kootaj-board-shipment-status-filter"
              value={filters.shipmentStatus}
              onChange={(value) => setFilterValue("shipmentStatus", value)}
            >
              <option value={ALL_VALUE}>همه وضعیت‌ها</option>
              {SHIPMENT_STATUS_OPTIONS.map((option: { value: string; label: string }) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="مسیر گمرکی"
              testId="kootaj-board-customs-route-filter"
              value={filters.customsRoute}
              onChange={(value) => setFilterValue("customsRoute", value)}
            >
              <option value={ALL_VALUE}>همه مسیرها</option>
              {routeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </FilterSelect>

            <Button type="button" variant="outline" className="h-10 rounded-lg text-xs font-black" onClick={clearFilters} disabled={!hasFilters}>
              پاکسازی
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-lg text-xs font-black" onClick={refreshRows} disabled={loading} data-testid="kootaj-board-refresh">
              <RefreshCw className={loading ? "ml-1 h-4 w-4 animate-spin" : "ml-1 h-4 w-4"} />
              بروزرسانی
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs font-bold text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100" data-testid="kootaj-board-readonly-notice">
          <span className="block">در این فاز فقط شماره کوتاژ، مسیر گمرکی، وضعیت گمرکی و وضعیت ترخیص قابل ویرایش هستند. مشتری، شماره محموله، مسیر، شمارش وظایف/اسناد و زمان آخرین بروزرسانی خواندنی می‌مانند.</span>
        </section>

        {error ? (
          <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center" data-testid="kootaj-board-error-state">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
            <p className="text-sm font-black text-foreground">بارگیری برد کوتاژ ناموفق بود</p>
            <p className="mt-2 text-xs font-bold text-muted-foreground">{error}</p>
            <Button type="button" className="mt-4 rounded-lg text-xs font-black" onClick={refreshRows}>
              تلاش دوباره
            </Button>
          </section>
        ) : loading && rows.length === 0 ? (
          <section className="rounded-xl border border-border bg-card p-8 text-center text-sm font-bold text-muted-foreground" data-testid="kootaj-board-loading-state">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            در حال بارگیری برد کوتاژ
          </section>
        ) : rows.length === 0 ? (
          <section className="rounded-xl border border-border bg-card p-8 text-center" data-testid="kootaj-board-empty-state">
            <p className="text-sm font-black text-foreground">ردیفی برای نمایش وجود ندارد</p>
            <p className="mt-2 text-xs font-bold text-muted-foreground">
              فیلترها را تغییر دهید یا بعد از ثبت محموله‌های عملیاتی دوباره تلاش کنید.
            </p>
          </section>
        ) : (
          <>
            <section className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block" role="table" aria-label="برد کوتاژ" data-testid="kootaj-board-table">
              <div role="row" className="grid min-w-0 grid-cols-[minmax(86px,0.8fr)_minmax(104px,0.95fr)_minmax(116px,1.05fr)_minmax(86px,0.75fr)_minmax(132px,1.1fr)_minmax(104px,0.85fr)_minmax(88px,0.72fr)_minmax(118px,0.95fr)_56px] gap-2 bg-muted/60 px-3 py-2 text-[11px] font-black text-muted-foreground">
                <div role="columnheader">محموله</div>
                <div role="columnheader">مشتری</div>
                <div role="columnheader"><RouteIcon className="ml-1 inline h-3.5 w-3.5" />مسیر</div>
                <div role="columnheader">وضعیت</div>
                <div role="columnheader"><ShieldCheck className="ml-1 inline h-3.5 w-3.5" />آخرین وضعیت</div>
                <div role="columnheader">کوتاژ / کارت</div>
                <div role="columnheader"><ListChecks className="ml-1 inline h-3.5 w-3.5" />وظایف / اسناد</div>
                <div role="columnheader"><Clock3 className="ml-1 inline h-3.5 w-3.5" />آخرین بروزرسانی</div>
                <div role="columnheader">عملیات</div>
              </div>
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <KootajDesktopRow row={row} canEdit={canEditKootaj} onEdit={openEditDialog} />
                </React.Fragment>
              ))}
            </section>

            <section className="grid gap-3 lg:hidden" data-testid="kootaj-board-mobile-list">
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <KootajMobileCard row={row} canEdit={canEditKootaj} onEdit={openEditDialog} />
                </React.Fragment>
              ))}
            </section>
          </>
        )}

        <footer className="grid gap-2 text-[11px] font-bold text-muted-foreground sm:grid-cols-3">
          <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />اسناد از همان projection وضعیت روزانه خوانده می‌شود.</span>
          <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" />وظایف از وضعیت عملیاتی محموله مشتق می‌شود.</span>
          <span className="inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" />جزئیات کامل در /shipments/:id باقی می‌ماند.</span>
        </footer>
      </div>

      <KootajEditDialog
        draft={editDraft}
        open={Boolean(editingRow)}
        row={editingRow}
        saving={savingEdit}
        onChange={(field, value) => setEditDraft((current) => ({ ...current, [field]: value }))}
        onClose={closeEditDialog}
        onSave={saveEdit}
      />
    </div>
  );
}
