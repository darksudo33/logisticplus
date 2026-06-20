import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Anchor,
  ArrowRight,
  CreditCard,
  ExternalLink,
  FileCheck2,
  FileText,
  Landmark,
  Loader2,
  NotebookText,
  Package,
  RotateCw,
  Save,
  Ship,
  ShieldCheck,
  TimerReset,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  customsStatusOptions,
  labelForOption,
  releaseStatusOptions,
} from "@/src/app/dailyStatusColumns";
import { ApiError, apiGet } from "@/src/lib/api";
import { businessEntitiesApi } from "@/src/lib/businessEntitiesApi";
import { getShamsiDatePart, parseShamsiDateTimeValue, ShamsiDateTimeField, toEnglishDigits, toPersianDigits } from "@/src/components/ShamsiDateTimeField";
import { ShipmentChatPanel } from "@/src/components/shipments/ShipmentChatPanel";
import { ShipmentDocumentsPanel } from "@/src/components/shipments/ShipmentDocumentsPanel";
import { dailyStatusApi } from "@/src/lib/dailyStatusApi";
import { shipmentApi } from "@/src/lib/shipmentApi";
import { shipmentV2Api } from "@/src/lib/shipmentV2Api";
import {
  isShipmentTerminalStatus,
  SHIPMENT_STATUS_OPTIONS,
  shipmentStatusLabel,
} from "@/src/shared/shipment-statuses.js";
import { useAppDataStore } from "@/src/store/useAppStore";
import type {
  CommercialCard,
  BusinessEntityContact,
  Customer,
  DailyStatusBoardRow,
  MalvaniProfile,
  Shipment,
  ShipmentV2BankingSection,
  ShipmentDocument,
  ShipmentV2BaseSection,
  ShipmentV2CurrencyCode,
  ShipmentV2CustomsRoute,
  ShipmentV2DeclarationKootajSection,
  ShipmentV2FlowCode,
  ShipmentV2GoodsRow,
  ShipmentV2GoodsSection,
  ShipmentV2NotesSection,
  ShipmentV2PermitRow,
  ShipmentV2PermitsSection,
  ShipmentV2CustomsTaxStatus,
  ShipmentV2PaymentsSection,
  ShipmentV2ProfileResponse,
  ShipmentV2SectionKey,
  ShipmentV2SectionPayload,
  ShipmentV2ShipmentSummary,
  User,
} from "@/src/types";

type EditableSectionProps = {
  canUpdate: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
  isEditing: boolean;
  testIdPrefix: string;
};

const sectionDefinitions: Array<{
  key: ShipmentV2SectionKey;
  title: string;
  icon: typeof Package;
}> = [
  { key: "base", title: "اطلاعات پایه", icon: Package },
  { key: "goods", title: "مشخصات کالا", icon: Ship },
  { key: "declarationKootaj", title: "اظهار و کوتاژ", icon: FileText },
  { key: "permits", title: "مجوز ها", icon: ShieldCheck },
  { key: "payments", title: "پرداخت ها", icon: CreditCard },
  { key: "banking", title: "اطلاعات بانکی", icon: Landmark },
  { key: "notes", title: "یادداشت ها", icon: NotebookText },
];

const flowLabels: Record<ShipmentV2FlowCode, string> = {
  IMPORT_LANJ: "واردات → لنج",
  IMPORT_SHIP: "واردات → کشتی",
};

const customsRouteLabels: Record<ShipmentV2CustomsRoute, string> = {
  GREEN: "سبز",
  YELLOW: "زرد",
  RED: "قرمز",
  DIRECT_CARRIAGE: "حمل یکسره",
};

const currencyLabels: Record<ShipmentV2CurrencyCode, string> = {
  EUR: "یورو",
  CNY: "یوان",
  USD: "دلار",
  AED: "درهم",
  IRR: "ریال",
};

const customsTaxStatusLabels: Record<ShipmentV2CustomsTaxStatus, string> = {
  PAYABLE: "نیاز به پرداخت",
  GOOD_STANDING: "خوش حسابی",
};

const currencyOptions: ShipmentV2CurrencyCode[] = ["EUR", "CNY", "USD", "AED", "IRR"];
const customsRouteOptions: ShipmentV2CustomsRoute[] = ["GREEN", "YELLOW", "RED", "DIRECT_CARRIAGE"];
const customsTaxStatusOptions: ShipmentV2CustomsTaxStatus[] = ["PAYABLE", "GOOD_STANDING"];
const compactSelectClassName =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-[11px] font-bold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 sm:text-xs";
const permitNameSuggestions = [
  "استاندارد",
  "بهداشت",
  "قرنطینه دامی",
  "دامپزشکی",
  "جهاد کشاورزی",
  "محیط زیست",
  "قرنطینه نباتی",
  "انرژی اتمی",
  "کنوانسیون بازل - محیط زیست",
  "مخرب اوزون",
  "قابلیت انفجار - وزارت دفاع و پشتیبانی نیروهای مسلح",
  "نفت",
  "وزارت امور خارجه - سلاح‌های شیمیایی",
  "تجهیزات پزشکی",
  "ممنوع",
  "ممنوعیت محصولات حیوانات حرام‌گوشت یا ذبح غیراسلامی",
  "بانک مرکزی",
  "فرهنگ و ارشاد اسلامی",
  "کانون پرورش فکری کودکان و نوجوانان",
  "نظارت بر دخانیات",
  "ارتباطات و فناوری اطلاعات",
  "میراث فرهنگی",
  "امور اقتصادی و دارایی",
  "وزارت صنعت، معدن و تجارت / صمت",
  "ماهی غیرزینتی برای اصلاح نژاد، تکثیر و پرورش",
  "بذر و نباتات دست‌ورزی‌شده / تغییر ژنتیکی",
  "ممنوعیت محصولات غیرشرعی",
  "ممنوعیت فرآورده‌های خون و حیوانات حرام‌گوشت",
  "ممنوعیت پوست، چرم، پشم و مو از حیوانات حرام‌گوشت یا ذبح غیراسلامی",
  "کاغذ دارای علامت رسمی دولتی / واترمارک",
  "لباس و اشیاء مستعمل - گواهی بهداشت",
  "کالاهای سرماساز و کمپرسورهای دارای CFC11 و CFC12",
  "اقلام نظامی و انتظامی",
  "پرنده‌های بدون سرنشین / پهپاد",
  "سازمان هواپیمایی کشوری",
  "فیلم‌های سینمایی",
  "خودرو، کامیون، موتورسیکلت و ماشین‌آلات راهسازی مشمول قانون خودرو",
];

function displayValue(value?: string | number | null) {
  if (value === undefined || value === null || value === "") return "ثبت نشده";
  return String(value);
}

function optionalNumber(value: string) {
  const trimmed = toEnglishDigits(value)
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".")
    .trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberDraftValue(value?: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

type GoodsDraftRow = Omit<ShipmentV2GoodsRow, "quantity" | "weight" | "cbm" | "pcs"> & {
  id: string;
  quantity: string;
  weight: string;
  cbm: string;
  pcs: string;
};

type DeclarationDraft = Omit<ShipmentV2DeclarationKootajSection, "totalValueAmount" | "finalPaidAmount"> & {
  totalValueAmount: string;
  finalPaidAmount: string;
};

type PaymentsDraft = Omit<ShipmentV2PaymentsSection, "customsAmount" | "customsDifferenceAmount" | "customsTaxAmount"> & {
  customsAmount: string;
  customsDifferenceAmount: string;
  customsTaxAmount: string;
};

function declarationDraftFromData(data: ShipmentV2DeclarationKootajSection = {}): DeclarationDraft {
  return {
    ...data,
    totalValueAmount: numberDraftValue(data.totalValueAmount),
    finalPaidAmount: numberDraftValue(data.finalPaidAmount),
  };
}

function paymentsDraftFromData(data: ShipmentV2PaymentsSection = {}): PaymentsDraft {
  return {
    ...data,
    customsAmount: numberDraftValue(data.customsAmount),
    customsDifferenceAmount: numberDraftValue(data.customsDifferenceAmount),
    customsTaxAmount: numberDraftValue(data.customsTaxAmount),
  };
}

type GoodsMetricKey = "quantity" | "weight" | "cbm" | "pcs";

function sumGoodsMetric(rows: Array<Partial<Record<GoodsMetricKey, string | number | null | undefined>>>, key: GoodsMetricKey) {
  const values = rows
    .map((row) => {
      const value = row[key];
      return typeof value === "string" ? optionalNumber(value) : value;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function formatGoodsMetric(value: number | null) {
  if (value === null) return "ثبت نشده";
  return value.toLocaleString("fa-IR", { maximumFractionDigits: 6 });
}

function sumContainerCount(goods: ShipmentV2GoodsSection) {
  const values = [goods.container20Count, goods.container40Count].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function GoodsTotalsRow({
  rows,
  testIdPrefix,
}: {
  rows: Array<Partial<Record<GoodsMetricKey, string | number | null | undefined>>>;
  testIdPrefix: string;
}) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5" data-testid={`${testIdPrefix}-total`}>
      <p className="text-[10px] font-black text-primary">مجموع</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          ["تعداد", "quantity"],
          ["وزن", "weight"],
          ["CBM", "cbm"],
          ["PCS", "pcs"],
        ].map(([label, key]) => (
          <div key={key} className="min-w-0 rounded-md bg-background/80 px-2 py-1" data-testid={`${testIdPrefix}-total-${key}`}>
            <p className="truncate text-[9px] font-black text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate text-[11px] font-black text-foreground">{formatGoodsMetric(sumGoodsMetric(rows, key as GoodsMetricKey))}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatShamsiDateTime(value?: string | null) {
  if (!value) return "ثبت نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ثبت نشده";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function resolveUserName(userId: string | null | undefined, users: User[], currentUser: User | null) {
  if (!userId) return "نامشخص";
  if (currentUser?.id === userId) return currentUser.name;
  return users.find((user) => user.id === userId)?.name || "نامشخص";
}

function displayMoneyValue(amount?: number | null, currency?: ShipmentV2CurrencyCode) {
  if (amount === undefined || amount === null) return "ثبت نشده";
  return `${amount.toLocaleString("fa-IR")} ${currencyLabels[currency || "IRR"]}`;
}

function displayShamsiDate(value?: string | null) {
  const datePart = getShamsiDatePart(value || undefined);
  return datePart ? toPersianDigits(datePart) : "ثبت نشده";
}

function normalizePermitSearchTerm(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("fa-IR")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ");
}

function getPermitSuggestions(value: string) {
  const query = normalizePermitSearchTerm(value);
  if (!query) return [];
  return permitNameSuggestions
    .filter((permitName) => normalizePermitSearchTerm(permitName).includes(query))
    .slice(0, 5);
}

function normalizeCredentialSearchTerm(value: string) {
  return normalizePermitSearchTerm(value);
}

function commercialCardDisplayName(card?: CommercialCard | null) {
  if (!card) return "";
  return card.holderName || card.cardNumber || "";
}

function commercialCardDescription(card: CommercialCard) {
  return [card.cardNumber, card.responsibleName].filter(Boolean).join(" • ");
}

function malvaniDisplayName(profile?: MalvaniProfile | null) {
  if (!profile) return "";
  return profile.displayName || profile.captainName || profile.lenjName || "";
}

function malvaniDescription(profile: MalvaniProfile) {
  return [profile.captainName, profile.lenjName, profile.lenjRegistrationNumber].filter(Boolean).join(" • ");
}

function activeBusinessContacts(contacts?: Array<{ archivedAt?: string | null }>) {
  return (contacts || []).filter((contact) => !contact.archivedAt);
}

function isActiveCustomerShipment(shipment: Shipment) {
  return !shipment.isArchived && !shipment.isExitedArchived && !isShipmentTerminalStatus(shipment.status);
}

const malvaniActiveStatusLabels: Record<MalvaniProfile["activeStatus"], string> = {
  ACTIVE: "فعال",
  INACTIVE: "غیرفعال",
  NEEDS_REVIEW: "نیازمند بررسی",
};

function HeaderRouteProgress({
  steps,
}: {
  steps: Array<{ key: string; label: string; value?: string | number | null }>;
}) {
  return (
    <div data-testid="shipment-v2-route-progress" className="rounded-xl border border-border bg-muted/20 px-3 py-3">
      <ol className="relative grid grid-cols-3 gap-1">
        <span className="absolute right-[16.66%] left-[16.66%] top-3 h-0.5 rounded-full bg-primary/25" aria-hidden="true" />
        {steps.map((step, index) => (
          <li
            key={step.key}
            data-testid={`shipment-v2-route-step-${step.key}`}
            className="relative z-10 flex min-w-0 flex-col items-center text-center"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-background text-[10px] font-black text-primary shadow-sm">
              {(index + 1).toLocaleString("fa-IR")}
            </span>
            <span className="mt-1 w-full truncate text-[10px] font-black text-muted-foreground">{step.label}</span>
            <span className="mt-0.5 w-full truncate text-[11px] font-black text-foreground" dir="auto">{displayValue(step.value)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SectionCard({
  sectionKey,
  title,
  icon: Icon,
  children,
}: {
  sectionKey: ShipmentV2SectionKey;
  title: string;
  icon: typeof Package;
  children: React.ReactNode;
}) {
  return (
    <Card className="relative rounded-xl border-border bg-card shadow-sm" data-testid={`shipment-v2-section-${sectionKey}`}>
      <CardHeader className="border-b border-border/60 p-3 pl-20 sm:p-4 sm:pl-28">
        <CardTitle className="flex items-center gap-2 text-xs font-black sm:text-sm">
          <Icon className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">{children}</CardContent>
    </Card>
  );
}

function SectionActions({ canUpdate, isSaving, isEditing, onEdit, onCancel, onSave, testIdPrefix }: EditableSectionProps) {
  if (!canUpdate) return null;
  return (
    <div className="absolute left-3 top-2.5 z-10 flex justify-start gap-1.5 sm:left-4 sm:top-3">
      {isEditing ? (
        <>
          <Button type="button" variant="outline" data-testid={`${testIdPrefix}-cancel`} className="h-7 rounded-md px-2.5 text-[10px] font-black sm:h-8 sm:px-3 sm:text-[11px]" onClick={onCancel} disabled={isSaving}>
            <X className="ml-1 h-3 w-3" />
            انصراف
          </Button>
          <Button type="button" data-testid={`${testIdPrefix}-save`} className="h-7 rounded-md px-2.5 text-[10px] font-black sm:h-8 sm:px-3 sm:text-[11px]" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="ml-1 h-3 w-3 animate-spin" /> : <Save className="ml-1 h-3 w-3" />}
            ذخیره
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" data-testid={`${testIdPrefix}-edit`} className="h-7 rounded-md px-3 text-[10px] font-black sm:h-8 sm:text-[11px]" onClick={onEdit}>
          ویرایش
        </Button>
      )}
    </div>
  );
}

function BaseInfoCard({
  label,
  testId,
  children,
  className = "",
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-testid={testId} className={`min-w-0 rounded-lg border border-border bg-muted/20 p-2.5 sm:p-3 ${className}`}>
      <p className="truncate text-[9px] font-black leading-4 text-muted-foreground sm:text-[10px]">{label}</p>
      <div className="mt-0.5 min-h-4 min-w-0 break-words text-[11px] font-black leading-5 text-foreground sm:text-xs">{children}</div>
    </div>
  );
}

function formatTimerDate(value?: string | null) {
  if (!value) return "ثبت نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("fa-IR-u-ca-persian", { dateStyle: "short", timeStyle: "short" });
}

function formatTimerDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    days ? `${toPersianDigits(days)} روز` : "",
    hours ? `${toPersianDigits(hours)} ساعت` : "",
    !days && minutes ? `${toPersianDigits(minutes)} دقیقه` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" و ") : "کمتر از یک دقیقه";
}

function ShipmentTimerPanel({
  shipment,
  canUpdate,
  onShipmentUpdate,
}: {
  shipment: ShipmentV2ShipmentSummary;
  canUpdate: boolean;
  onShipmentUpdate: (shipment: Partial<ShipmentV2ShipmentSummary>) => void;
}) {
  const [deadlineDraft, setDeadlineDraft] = React.useState(shipment.timerDeadlineAt || "");
  const [now, setNow] = React.useState(() => Date.now());
  const [isSaving, setIsSaving] = React.useState(false);
  const deadlineMs = shipment.timerDeadlineAt ? new Date(shipment.timerDeadlineAt).getTime() : NaN;
  const startedMs = shipment.timerStartedAt ? new Date(shipment.timerStartedAt).getTime() : NaN;
  const completedMs = shipment.timerCompletedAt ? new Date(shipment.timerCompletedAt).getTime() : NaN;
  const hasActiveDeadline = Number.isFinite(deadlineMs);
  const isCompleted = Number.isFinite(completedMs);
  const comparisonMs = isCompleted ? completedMs : now;
  const remainingMs = hasActiveDeadline ? deadlineMs - comparisonMs : 0;
  const elapsedMs = Number.isFinite(startedMs) ? Math.max(0, comparisonMs - startedMs) : 0;
  const overdue = hasActiveDeadline && remainingMs < 0 && !isCompleted;

  React.useEffect(() => {
    setDeadlineDraft(shipment.timerDeadlineAt || "");
  }, [shipment.timerDeadlineAt]);

  React.useEffect(() => {
    if (!hasActiveDeadline || isCompleted) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [hasActiveDeadline, isCompleted]);

  const saveDeadline = async () => {
    const parsed = parseShamsiDateTimeValue(deadlineDraft);
    if (!parsed) {
      toast.error("زمان پایان تایمر را با تقویم شمسی وارد کنید.");
      return;
    }
    setIsSaving(true);
    try {
      const updated = await shipmentApi.updateOperationalFields(shipment.id, {
        timerDeadlineAt: parsed.toISOString(),
      });
      onShipmentUpdate(updated);
      toast.success("تایمر محموله بروزرسانی شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بروزرسانی تایمر ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeDeadline = async () => {
    setIsSaving(true);
    try {
      const updated = await shipmentApi.updateOperationalFields(shipment.id, {
        timerDeadlineAt: null,
      });
      onShipmentUpdate(updated);
      toast.success("تایمر فعال حذف شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف تایمر ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card data-testid="shipment-v2-timer-panel" className="rounded-xl border-border bg-card shadow-sm">
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <TimerReset className="h-4 w-4 text-primary" />
              <p className="text-xs font-black text-foreground sm:text-sm">تایمر محموله</p>
              {isCompleted ? (
                <Badge className="border-none bg-emerald-500/10 text-[10px] font-black text-emerald-700">تکمیل شده</Badge>
              ) : overdue ? (
                <Badge className="border-none bg-rose-500/10 text-[10px] font-black text-rose-700">عقب‌افتاده</Badge>
              ) : hasActiveDeadline ? (
                <Badge className="border-none bg-primary/10 text-[10px] font-black text-primary">فعال</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] font-black">بدون تایمر</Badge>
              )}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <BaseInfoCard label="مهلت پایان" testId="shipment-v2-timer-deadline-display">
                {formatTimerDate(shipment.timerDeadlineAt)}
              </BaseInfoCard>
              <BaseInfoCard label={overdue ? "تاخیر" : "زمان باقی‌مانده"} testId="shipment-v2-timer-remaining">
                {hasActiveDeadline ? formatTimerDuration(Math.abs(remainingMs)) : "ثبت نشده"}
              </BaseInfoCard>
              <BaseInfoCard label="زمان سپری‌شده" testId="shipment-v2-timer-elapsed">
                {Number.isFinite(startedMs) ? formatTimerDuration(elapsedMs) : "ثبت نشده"}
              </BaseInfoCard>
              <BaseInfoCard label="مدت تکمیل" testId="shipment-v2-timer-completed-duration">
                {isCompleted && Number.isFinite(startedMs) ? formatTimerDuration(completedMs - startedMs) : "ثبت نشده"}
              </BaseInfoCard>
            </div>
          </div>
          {canUpdate ? (
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:w-[520px]">
              <ShamsiDateTimeField
                value={deadlineDraft}
                onChange={setDeadlineDraft}
                showTime
                className="min-w-0"
                triggerClassName="h-9 rounded-lg text-[11px] font-bold"
              />
              <Button
                type="button"
                data-testid="shipment-v2-timer-save"
                className="h-9 rounded-lg px-3 text-[11px] font-black"
                onClick={() => void saveDeadline()}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Save className="ml-1 h-3.5 w-3.5" />}
                {hasActiveDeadline ? "تنظیم" : "ثبت تایمر"}
              </Button>
              <Button
                type="button"
                data-testid="shipment-v2-timer-remove"
                variant="outline"
                className="h-9 rounded-lg px-3 text-[11px] font-black"
                onClick={() => void removeDeadline()}
                disabled={isSaving || !hasActiveDeadline}
              >
                حذف
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DialogFactRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-2.5 py-2">
      <span className="shrink-0 text-[10px] font-black text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-left text-[11px] font-black text-foreground" dir="auto">{displayValue(value)}</span>
    </div>
  );
}

function CompactContactList({
  contacts,
  emptyText,
  testId,
}: {
  contacts: BusinessEntityContact[];
  emptyText: string;
  testId: string;
}) {
  const activeContacts = activeBusinessContacts(contacts) as BusinessEntityContact[];
  if (!activeContacts.length) {
    return (
      <div data-testid={testId} className="rounded-lg border border-dashed border-border bg-muted/20 px-2.5 py-2 text-[11px] font-bold text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div data-testid={testId} className="grid gap-1.5">
      {activeContacts.map((contact) => (
        <div key={contact.id} className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
            <p className="min-w-0 break-words text-[11px] font-black text-foreground">{contact.contactName}</p>
            {contact.isPrimary ? (
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[9px] font-black">
                اصلی
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-muted-foreground">
            {contact.roleTitle ? <span>{contact.roleTitle}</span> : null}
            <span dir="ltr">{contact.phoneNumber}</span>
            {contact.phoneLabel ? <span>{contact.phoneLabel}</span> : null}
          </div>
          {contact.note ? <p className="mt-1 text-[10px] font-bold leading-4 text-muted-foreground">{contact.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

function BaseSection({
  data,
  goodsData,
  shipment,
  flowCode,
  customer,
  shipments,
  commercialCards,
  malvaniProfiles,
  isMalvaniLoading,
  documentCount,
  isDocumentCountLoading,
  updatedAt,
  updatedByName,
  canUpdate,
  isSaving,
  onSave,
}: {
  data: ShipmentV2BaseSection;
  goodsData: ShipmentV2GoodsSection;
  shipment: ShipmentV2ShipmentSummary;
  flowCode: ShipmentV2FlowCode;
  customer: Customer | null;
  shipments: Shipment[];
  commercialCards: CommercialCard[];
  malvaniProfiles: MalvaniProfile[];
  isMalvaniLoading: boolean;
  documentCount: number | null;
  isDocumentCountLoading: boolean;
  updatedAt?: string | null;
  updatedByName: string;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (payload: ShipmentV2BaseSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const draftData = React.useMemo<ShipmentV2BaseSection>(
    () => ({
      ...data,
      trackingNumber: data.trackingNumber || shipment.trackingNumber,
      status: data.status || shipment.status,
    }),
    [data, shipment.status, shipment.trackingNumber]
  );
  const [draft, setDraft] = React.useState<ShipmentV2BaseSection>(draftData);
  const [activeCredentialSearch, setActiveCredentialSearch] = React.useState(false);
  const [viewingCredential, setViewingCredential] = React.useState<"commercial_card" | "malvani" | null>(null);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = React.useState(false);
  const isLanjFlow = flowCode === "IMPORT_LANJ";
  const credentialLabel = isLanjFlow ? "ملوانی" : "کارت بازرگانی";
  const documentCountText = isDocumentCountLoading
    ? "در حال دریافت"
    : documentCount === null
      ? "در دسترس نیست"
      : documentCount.toLocaleString("fa-IR");
  const displayStatus = shipmentStatusLabel(shipment.status);
  const customerIdentifier = customer?.customerCode || customer?.code || shipment.customerCode || shipment.customerId || shipment.customerName || "";
  const totalQuantity = sumGoodsMetric(goodsData.goodsRows || [], "quantity");
  const totalContainerCount = sumContainerCount(goodsData);

  React.useEffect(() => {
    if (!isEditing) setDraft(draftData);
  }, [draftData, isEditing]);

  const updateDraft = (key: keyof ShipmentV2BaseSection, value: string | null) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateDraftFields = (updates: Partial<ShipmentV2BaseSection>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };

  const updateNumericDraft = (key: keyof ShipmentV2BaseSection, value: string) => {
    updateDraft(key, value.replace(/\D/g, ""));
  };

  const activeCommercialCards = React.useMemo(
    () => commercialCards.filter((card) => !card.isArchived && !card.archivedAt),
    [commercialCards]
  );
  const linkedCommercialCard = React.useMemo(
    () => activeCommercialCards.find((card) => card.id === data.commercialCardId) || null,
    [activeCommercialCards, data.commercialCardId]
  );
  const linkedMalvaniProfile = React.useMemo(
    () => malvaniProfiles.find((profile) => profile.id === data.malvaniProfileId && !profile.archivedAt) || null,
    [malvaniProfiles, data.malvaniProfileId]
  );
  const activeCustomerShipments = React.useMemo(() => {
    const byCustomer = shipments.filter((item) => item.customerId === shipment.customerId && isActiveCustomerShipment(item));
    const hasCurrentShipment = byCustomer.some((item) => item.id === shipment.id);
    if (hasCurrentShipment || isShipmentTerminalStatus(shipment.status) || shipment.isExitedArchived) return byCustomer;
    return [
      {
        id: shipment.id,
        trackingNumber: shipment.trackingNumber,
        containerNumber: "",
        customerId: shipment.customerId,
        customerName: customerIdentifier,
        origin: shipment.origin,
        destination: shipment.destination,
        status: shipment.status,
        shipmentDirection: shipment.shipmentDirection,
        transportMode: shipment.transportMode,
        shipmentTypeCode: shipment.shipmentTypeCode,
        createdAt: shipment.createdAt || "",
        estimatedDelivery: shipment.estimatedDelivery || "",
        freeTimeDays: 0,
        isExitedArchived: shipment.isExitedArchived,
        updatedAt: shipment.updatedAt || undefined,
      } satisfies Shipment,
      ...byCustomer,
    ];
  }, [shipment, shipments]);
  const credentialInputValue = isLanjFlow ? draft.malvaniDisplayName || "" : draft.commercialCardDisplayName || "";
  const credentialDisplayName = isLanjFlow
    ? malvaniDisplayName(linkedMalvaniProfile) || data.malvaniDisplayName || ""
    : commercialCardDisplayName(linkedCommercialCard) || data.commercialCardDisplayName || "";
  const credentialSuggestions = React.useMemo(() => {
    if (!activeCredentialSearch) return [];
    const query = normalizeCredentialSearchTerm(credentialInputValue);
    if (!query) return [];
    if (isLanjFlow) {
      return malvaniProfiles
        .filter((profile) => !profile.archivedAt)
        .filter((profile) =>
          normalizeCredentialSearchTerm(
            [
              profile.displayName,
              profile.captainName,
              profile.lenjName,
              profile.lenjRegistrationNumber,
              profile.homePort,
            ].filter(Boolean).join(" ")
          ).includes(query)
        )
        .slice(0, 5)
        .map((profile) => ({
          id: profile.id,
          label: malvaniDisplayName(profile),
          description: malvaniDescription(profile),
          kind: "malvani" as const,
          record: profile,
        }));
    }
    return activeCommercialCards
      .filter((card) =>
        normalizeCredentialSearchTerm(
          [
            card.holderName,
            card.cardNumber,
            card.nationalId,
            card.responsibleName,
          ].filter(Boolean).join(" ")
        ).includes(query)
      )
      .slice(0, 5)
      .map((card) => ({
        id: card.id,
        label: commercialCardDisplayName(card),
        description: commercialCardDescription(card),
        kind: "commercial_card" as const,
        record: card,
      }));
  }, [activeCommercialCards, activeCredentialSearch, credentialInputValue, isLanjFlow, malvaniProfiles]);

  const handleCredentialInputChange = (value: string) => {
    if (isLanjFlow) {
      updateDraftFields({
        malvaniDisplayName: value,
        malvaniProfileId: null,
      });
      return;
    }
    updateDraftFields({
      commercialCardDisplayName: value,
      commercialCardId: null,
    });
  };

  const selectCredentialSuggestion = (suggestion: (typeof credentialSuggestions)[number]) => {
    if (suggestion.kind === "malvani") {
      updateDraftFields({
        malvaniProfileId: suggestion.id,
        malvaniDisplayName: suggestion.label,
      });
    } else {
      updateDraftFields({
        commercialCardId: suggestion.id,
        commercialCardDisplayName: suggestion.label,
      });
    }
    setActiveCredentialSearch(false);
  };

  const handleSave = () => {
    const nextDraft: ShipmentV2BaseSection = {
      ...draft,
      trackingNumber: (draft.trackingNumber || shipment.trackingNumber || "").trim(),
      orderRegistrationNumber: (draft.orderRegistrationNumber || "").trim(),
      commercialCardDisplayName: (draft.commercialCardDisplayName || "").trim(),
      malvaniDisplayName: (draft.malvaniDisplayName || "").trim(),
    };
    if (!nextDraft.trackingNumber) {
      toast.error("کد محموله را وارد کنید.");
      return;
    }
    if (isLanjFlow) {
      nextDraft.commercialCardId = null;
      nextDraft.commercialCardDisplayName = "";
    } else {
      nextDraft.malvaniProfileId = null;
      nextDraft.malvaniDisplayName = "";
    }
    onSave(nextDraft);
    setActiveCredentialSearch(false);
    setIsEditing(false);
  };

  return (
    <>
      <div className="space-y-2.5">
        {isEditing ? (
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] font-bold text-muted-foreground sm:text-xs">کد محموله / شماره پرونده</Label>
              <Input
                data-testid="shipment-v2-base-tracking-number-input"
                className="h-8 rounded-lg text-left font-mono text-[11px] font-bold sm:h-9 sm:text-xs"
                dir="ltr"
                value={draft.trackingNumber || ""}
                onChange={(event) => updateDraft("trackingNumber", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground sm:text-xs">وضعیت محموله</Label>
              <select
                data-testid="shipment-v2-base-status-select"
                className={compactSelectClassName}
                value={draft.status || shipment.status}
                onChange={(event) => updateDraft("status", event.target.value)}
              >
                {SHIPMENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground sm:text-xs">مرحله فعلی</Label>
              <textarea
                data-testid="shipment-v2-base-current-stage-input"
                className="min-h-16 w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 text-[11px] font-bold leading-5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-20 sm:px-3 sm:text-xs sm:leading-6"
                value={draft.currentStage || ""}
                onChange={(event) => updateDraft("currentStage", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground sm:text-xs">شماره ثبت سفارش</Label>
              <Input
                data-testid="shipment-v2-base-order-registration-number-input"
                className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                inputMode="numeric"
                value={draft.orderRegistrationNumber || ""}
                onChange={(event) => updateNumericDraft("orderRegistrationNumber", event.target.value)}
              />
            </div>
            <div className="relative space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] font-bold text-muted-foreground sm:text-xs">{credentialLabel}</Label>
              <Input
                data-testid="shipment-v2-base-business-credential-input"
                className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                value={credentialInputValue}
                placeholder={isMalvaniLoading && isLanjFlow ? "در حال دریافت ملوانی‌ها" : `جستجو و انتخاب ${credentialLabel}`}
                onFocus={() => setActiveCredentialSearch(true)}
                onBlur={() => window.setTimeout(() => setActiveCredentialSearch(false), 120)}
                onChange={(event) => {
                  handleCredentialInputChange(event.target.value);
                  setActiveCredentialSearch(true);
                }}
              />
              {credentialSuggestions.length ? (
                <div
                  data-testid="shipment-v2-base-business-credential-suggestions"
                  className="absolute right-0 left-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl"
                >
                  {credentialSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.kind}-${suggestion.id}`}
                      type="button"
                      data-testid={`shipment-v2-base-business-credential-suggestion-${index}`}
                      className="block w-full rounded-md px-2 py-1.5 text-right text-[11px] font-bold leading-5 text-popover-foreground hover:bg-muted"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCredentialSuggestion(suggestion)}
                    >
                      <span className="block truncate">{suggestion.label}</span>
                      {suggestion.description ? (
                        <span className="block truncate text-[10px] text-muted-foreground">{suggestion.description}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid grid-flow-row-dense grid-cols-2 gap-2 lg:grid-cols-3">
            <BaseInfoCard label="کد محموله" testId="shipment-v2-base-code">
              <span className="block break-all text-left font-mono text-[10px] leading-5 sm:text-xs" dir="ltr">{displayValue(shipment.trackingNumber)}</span>
            </BaseInfoCard>
            <BaseInfoCard label="مشتری" testId="shipment-v2-base-customer">
              <button
                type="button"
                data-testid="shipment-v2-base-customer-button"
                className="inline-flex max-w-full items-center gap-1 rounded-md text-right text-[11px] font-black text-primary underline-offset-4 hover:underline sm:text-xs"
                onClick={() => setIsCustomerDialogOpen(true)}
              >
                <span className="truncate">{displayValue(customerIdentifier)}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </button>
            </BaseInfoCard>
            <BaseInfoCard label="وضعیت" testId="shipment-v2-base-status">
              {displayValue(displayStatus)}
            </BaseInfoCard>
            <BaseInfoCard label="مرحله فعلی" testId="shipment-v2-base-current-stage">
              <p className="whitespace-pre-wrap">{displayValue(data.currentStage)}</p>
            </BaseInfoCard>
            <BaseInfoCard label="شماره ثبت سفارش" testId="shipment-v2-base-order-registration-number">
              <span dir="ltr">{displayValue(data.orderRegistrationNumber)}</span>
            </BaseInfoCard>
            <BaseInfoCard label={credentialLabel} testId="shipment-v2-base-business-credential">
              {(isLanjFlow ? linkedMalvaniProfile : linkedCommercialCard) ? (
                <button
                  type="button"
                  data-testid="shipment-v2-base-business-credential-button"
                  className="inline-flex max-w-full items-center gap-1 rounded-md text-right text-[11px] font-black text-primary underline-offset-4 hover:underline sm:text-xs"
                  onClick={() => setViewingCredential(isLanjFlow ? "malvani" : "commercial_card")}
                >
                  <span className="truncate">{credentialDisplayName}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </button>
              ) : (
                displayValue(credentialDisplayName)
              )}
            </BaseInfoCard>
            <BaseInfoCard label="تعداد اسناد" testId="shipment-v2-base-document-count">
              {documentCountText}
            </BaseInfoCard>
            <BaseInfoCard label="تعداد کالا" testId="shipment-v2-base-total-quantity">
              {formatGoodsMetric(totalQuantity)}
            </BaseInfoCard>
            {!isLanjFlow ? (
              <BaseInfoCard label="تعداد کانتینر" testId="shipment-v2-base-total-container-count">
                {formatGoodsMetric(totalContainerCount)}
              </BaseInfoCard>
            ) : null}
            <BaseInfoCard label="آخرین به روز رسانی" testId="shipment-v2-base-last-update" className="col-span-2 lg:col-span-3">
              <p>{formatShamsiDateTime(updatedAt)}</p>
              <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">توسط {updatedByName}</p>
            </BaseInfoCard>
          </div>
        )}
        <SectionActions
          canUpdate={canUpdate}
          isSaving={isSaving}
          isEditing={isEditing}
          testIdPrefix="shipment-v2-base"
          onEdit={() => setIsEditing(true)}
          onCancel={() => {
            setDraft(draftData);
            setActiveCredentialSearch(false);
            setIsEditing(false);
          }}
          onSave={handleSave}
        />
      </div>

      <Dialog open={Boolean(viewingCredential)} onOpenChange={(open) => !open && setViewingCredential(null)}>
        <DialogContent
          data-testid="shipment-v2-base-business-credential-dialog"
          className="max-h-[90vh] overflow-y-auto rounded-xl border-border bg-card p-4 text-right text-foreground sm:max-w-xl"
          dir="rtl"
        >
          {viewingCredential === "commercial_card" && linkedCommercialCard ? (
            <>
              <DialogHeader className="gap-1 border-b border-border/60 pb-3">
                <DialogTitle className="flex items-center gap-2 text-sm font-black">
                  <CreditCard className="h-4 w-4 text-primary" />
                  {commercialCardDisplayName(linkedCommercialCard)}
                </DialogTitle>
                <DialogDescription className="text-right text-[11px] font-bold text-muted-foreground">
                  اطلاعات کارت بازرگانی لینک شده به محموله
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <DialogFactRow label="شماره کارت" value={linkedCommercialCard.cardNumber} />
                <DialogFactRow label="تاریخ صدور" value={displayShamsiDate(linkedCommercialCard.issueDate)} />
                <DialogFactRow label="تاریخ انقضا" value={displayShamsiDate(linkedCommercialCard.expirationDate)} />
                <DialogFactRow label="شناسه ملی" value={linkedCommercialCard.nationalId || "ثبت نشده"} />
                <DialogFactRow label="اسناد" value={toPersianDigits(linkedCommercialCard.documents?.length || 0)} />
                {linkedCommercialCard.description ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
                    <p className="text-[10px] font-black text-muted-foreground">توضیحات</p>
                    <p className="mt-1 text-[11px] font-bold leading-5 text-foreground">{linkedCommercialCard.description}</p>
                  </div>
                ) : null}
                <div className="pt-1">
                  <p className="mb-1.5 text-[10px] font-black text-muted-foreground">مخاطبین</p>
                  <CompactContactList
                    contacts={(linkedCommercialCard.contacts || []) as BusinessEntityContact[]}
                    emptyText="مخاطبی برای این کارت ثبت نشده است."
                    testId="shipment-v2-base-business-credential-contacts"
                  />
                </div>
              </div>
            </>
          ) : null}
          {viewingCredential === "malvani" && linkedMalvaniProfile ? (
            <>
              <DialogHeader className="gap-1 border-b border-border/60 pb-3">
                <DialogTitle className="flex items-center gap-2 text-sm font-black">
                  <Anchor className="h-4 w-4 text-primary" />
                  {malvaniDisplayName(linkedMalvaniProfile)}
                </DialogTitle>
                <DialogDescription className="text-right text-[11px] font-bold text-muted-foreground">
                  اطلاعات ملوانی لینک شده به محموله
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <DialogFactRow label="نام ناخدا" value={linkedMalvaniProfile.captainName} />
                <DialogFactRow label="نام لنج" value={linkedMalvaniProfile.lenjName} />
                <DialogFactRow label="شماره/شناسه لنج" value={linkedMalvaniProfile.lenjRegistrationNumber} />
                <DialogFactRow label="نوع لنج" value={linkedMalvaniProfile.lenjType || "ثبت نشده"} />
                <DialogFactRow label="بندر اصلی" value={linkedMalvaniProfile.homePort || "ثبت نشده"} />
                <DialogFactRow label="وضعیت" value={malvaniActiveStatusLabels[linkedMalvaniProfile.activeStatus] || linkedMalvaniProfile.activeStatus} />
                {linkedMalvaniProfile.note ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
                    <p className="text-[10px] font-black text-muted-foreground">یادداشت</p>
                    <p className="mt-1 text-[11px] font-bold leading-5 text-foreground">{linkedMalvaniProfile.note}</p>
                  </div>
                ) : null}
                <div className="pt-1">
                  <p className="mb-1.5 text-[10px] font-black text-muted-foreground">مخاطبین</p>
                  <CompactContactList
                    contacts={(linkedMalvaniProfile.contacts || []) as BusinessEntityContact[]}
                    emptyText="مخاطبی برای این ملوانی ثبت نشده است."
                    testId="shipment-v2-base-business-credential-contacts"
                  />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
        <DialogContent
          data-testid="shipment-v2-base-customer-dialog"
          className="max-h-[90vh] overflow-y-auto rounded-xl border-border bg-card p-4 text-right text-foreground sm:max-w-xl"
          dir="rtl"
        >
          <DialogHeader className="gap-1 border-b border-border/60 pb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-black">
              <Package className="h-4 w-4 text-primary" />
              {customerIdentifier || "مشتری"}
            </DialogTitle>
            <DialogDescription className="text-right text-[11px] font-bold text-muted-foreground">
              شناسه مشتری و محموله‌های فعال
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <DialogFactRow label="کد مشتری" value={customerIdentifier} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground">محموله‌های فعال</p>
            {activeCustomerShipments.length ? (
              <div data-testid="shipment-v2-base-customer-active-shipments" className="grid gap-1.5">
                {activeCustomerShipments.map((item) => (
                  <Link
                    key={item.id}
                    to={`/shipments/${item.id}`}
                    className="group rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-right hover:border-primary/50 hover:bg-primary/5"
                    onClick={() => setIsCustomerDialogOpen(false)}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-[11px] font-black text-primary" dir="ltr">
                        {item.trackingNumber}
                      </span>
                      <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[9px] font-black">
                        {shipmentStatusLabel(item.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-[10px] font-bold text-muted-foreground">
                      {displayValue(item.origin)} → {displayValue(item.destination)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div data-testid="shipment-v2-base-customer-active-shipments" className="rounded-lg border border-dashed border-border bg-muted/20 px-2.5 py-2 text-[11px] font-bold text-muted-foreground">
                محموله فعال برای این مشتری ثبت نشده است.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GoodsSection({
  data,
  flowCode,
  canUpdate,
  isSaving,
  onSave,
}: {
  data: ShipmentV2GoodsSection;
  flowCode: ShipmentV2FlowCode;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (payload: ShipmentV2GoodsSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [container20Count, setContainer20Count] = React.useState("");
  const [container40Count, setContainer40Count] = React.useState("");
  const [rows, setRows] = React.useState<GoodsDraftRow[]>([]);
  const showContainerCounts = flowCode === "IMPORT_SHIP";

  const resetDraft = React.useCallback(() => {
    setContainer20Count(data.container20Count === null || data.container20Count === undefined ? "" : String(data.container20Count));
    setContainer40Count(data.container40Count === null || data.container40Count === undefined ? "" : String(data.container40Count));
    const goodsRows = data.goodsRows || [];
    setRows(
      goodsRows.length
        ? goodsRows.map((row, index) => ({
          ...row,
          id: `goods-${index}-${row.description}`,
          quantity: numberDraftValue(row.quantity),
          weight: numberDraftValue(row.weight),
          cbm: numberDraftValue(row.cbm),
          pcs: numberDraftValue(row.pcs),
        }))
        : [{ id: "goods-empty", description: "", packagingType: "", quantity: "", weight: "", cbm: "", pcs: "" }]
    );
  }, [data]);

  React.useEffect(() => {
    if (!isEditing) resetDraft();
  }, [isEditing, resetDraft]);

  const updateRow = (rowId: string, updates: Partial<GoodsDraftRow>) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...updates } : row)));
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      { id: `goods-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, description: "", packagingType: "", quantity: "", weight: "", cbm: "", pcs: "" },
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== rowId);
      return next.length ? next : [{ id: "goods-empty", description: "", packagingType: "", quantity: "", weight: "", cbm: "", pcs: "" }];
    });
  };

  const handleSave = () => {
    const goodsRows = rows
      .map((row) => ({
        description: row.description.trim(),
        packagingType: (row.packagingType || "").trim(),
        quantity: optionalNumber(row.quantity),
        weight: optionalNumber(row.weight),
        cbm: optionalNumber(row.cbm),
        pcs: optionalNumber(row.pcs),
      }))
      .filter((row) => row.description);
    onSave({
      container20Count: showContainerCounts ? optionalNumber(container20Count) : null,
      container40Count: showContainerCounts ? optionalNumber(container40Count) : null,
      goodsRows,
    });
    setIsEditing(false);
  };

  const savedRows = data.goodsRows || [];

  return (
    <div className="space-y-2.5">
      {isEditing ? (
        <div className="space-y-2.5">
          {showContainerCounts ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">کانتینر ۲۰ فوت</Label>
                <Input className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs" inputMode="decimal" value={container20Count} onChange={(event) => setContainer20Count(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">کانتینر ۴۰ فوت</Label>
                <Input className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs" inputMode="decimal" value={container40Count} onChange={(event) => setContainer40Count(event.target.value)} />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-black text-muted-foreground sm:text-xs">ردیف‌های کالا</p>
              <Button type="button" variant="outline" className="h-7 rounded-md px-2.5 text-[10px] font-black sm:h-8 sm:text-[11px]" onClick={addRow} data-testid="shipment-v2-goods-add">
                افزودن کالا
              </Button>
            </div>
            {rows.map((row, index) => (
              <div key={row.id} className="rounded-lg border border-border bg-muted/20 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black text-muted-foreground">کالای {(index + 1).toLocaleString("fa-IR")}</p>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:text-red-600" onClick={() => removeRow(row.id)} aria-label={`حذف کالای ${index + 1}`}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  data-testid={`shipment-v2-goods-row-${index}-description`}
                  className="mt-1.5 h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                  placeholder="شرح کالا"
                  value={row.description}
                  onChange={(event) => updateRow(row.id, { description: event.target.value })}
                />
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                  <Input data-testid={`shipment-v2-goods-row-${index}-quantity`} className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs" inputMode="decimal" placeholder="تعداد" value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: event.target.value })} />
                  <Input data-testid={`shipment-v2-goods-row-${index}-weight`} className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs" inputMode="decimal" placeholder="وزن" value={row.weight} onChange={(event) => updateRow(row.id, { weight: event.target.value })} />
                  <Input data-testid={`shipment-v2-goods-row-${index}-cbm`} className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs" inputMode="decimal" placeholder="CBM" value={row.cbm} onChange={(event) => updateRow(row.id, { cbm: event.target.value })} />
                  <Input data-testid={`shipment-v2-goods-row-${index}-pcs`} className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs" inputMode="decimal" placeholder="PCS" value={row.pcs} onChange={(event) => updateRow(row.id, { pcs: event.target.value })} />
                  <Input
                    data-testid={`shipment-v2-goods-row-${index}-packaging`}
                    className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs"
                    placeholder="بسته بندی"
                    value={row.packagingType || ""}
                    onChange={(event) => updateRow(row.id, { packagingType: event.target.value })}
                  />
                </div>
              </div>
            ))}
            <GoodsTotalsRow rows={rows} testIdPrefix="shipment-v2-goods" />
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {showContainerCounts ? (
            <div className="grid grid-cols-2 gap-2">
              <BaseInfoCard label="کانتینر ۲۰ فوت" testId="shipment-v2-goods-container20">
                {displayValue(data.container20Count)}
              </BaseInfoCard>
              <BaseInfoCard label="کانتینر ۴۰ فوت" testId="shipment-v2-goods-container40">
                {displayValue(data.container40Count)}
              </BaseInfoCard>
            </div>
          ) : null}
          {savedRows.length ? (
            <div className="space-y-2">
              {savedRows.map((row, index) => (
                <div key={`${row.description}-${index}`} className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                      {(index + 1).toLocaleString("fa-IR")}
                    </span>
                    <p className="min-w-0 flex-1 break-words font-black leading-5 text-foreground">{row.description}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                    {[
                      ["تعداد", row.quantity],
                      ["وزن", row.weight],
                      ["CBM", row.cbm],
                      ["PCS", row.pcs],
                      ["بسته بندی", row.packagingType],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded-md bg-background/80 px-2 py-1">
                        <p className="truncate text-[9px] font-black text-muted-foreground">{label}</p>
                        <p className="mt-0.5 truncate text-[11px] font-black text-foreground">{displayValue(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <GoodsTotalsRow rows={savedRows} testIdPrefix="shipment-v2-goods" />
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-2.5 text-[11px] font-bold leading-5 text-muted-foreground">
              <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>هنوز کالایی در ثبت نشده است.</span>
            </div>
          )}
        </div>
      )}
      <SectionActions
        canUpdate={canUpdate}
        isSaving={isSaving}
        isEditing={isEditing}
        testIdPrefix="shipment-v2-goods"
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          resetDraft();
          setIsEditing(false);
        }}
        onSave={handleSave}
      />
    </div>
  );
}

function DeclarationKootajSection({
  data,
  canUpdate,
  dailyStatusRow,
  isSaving,
  onSave,
}: {
  data: ShipmentV2DeclarationKootajSection;
  canUpdate: boolean;
  dailyStatusRow: DailyStatusBoardRow | null;
  isSaving: boolean;
  onSave: (payload: ShipmentV2DeclarationKootajSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<DeclarationDraft>(() => declarationDraftFromData(data || {}));

  React.useEffect(() => {
    if (!isEditing) setDraft(declarationDraftFromData(data || {}));
  }, [data, isEditing]);

  const updateDraft = (updates: Partial<DeclarationDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };

  const routeLabel = data.customsRoute ? customsRouteLabels[data.customsRoute] : "";
  const customsStatusLabel = labelForOption(customsStatusOptions, dailyStatusRow?.kootaj.customsStatus);
  const releaseStatusLabel = labelForOption(releaseStatusOptions, dailyStatusRow?.kootaj.releaseStatus);
  const totalCurrency = draft.totalValueCurrency || data.totalValueCurrency || "IRR";
  const finalPaidCurrency = draft.finalPaidCurrency || data.finalPaidCurrency || "IRR";

  return (
    <div className="space-y-2.5">
      {isEditing ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">شماره کوتاژ</Label>
            <Input
              data-testid="shipment-v2-declaration-cotage-number"
              className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
              inputMode="numeric"
              value={draft.cotageNumber || ""}
              onChange={(event) => updateDraft({ cotageNumber: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">مسیر گمرکی</Label>
            <select
              data-testid="shipment-v2-declaration-customs-route"
              className={compactSelectClassName}
              value={draft.customsRoute || ""}
              onChange={(event) => updateDraft({ customsRoute: (event.target.value || null) as ShipmentV2CustomsRoute | null })}
            >
              <option value="">ثبت نشده</option>
              {customsRouteOptions.map((option) => (
                <option key={option} value={option}>
                  {customsRouteLabels[option]}
                </option>
              ))}
            </select>
          </div>
          <div data-testid="shipment-v2-declaration-cotage-date" className="space-y-1.5">
            <ShamsiDateTimeField
              id="shipment-v2-declaration-cotage-date-field"
              label="تاریخ ثبت کوتاژ"
              value={draft.cotageRegistrationDate || ""}
              onChange={(cotageRegistrationDate) => updateDraft({ cotageRegistrationDate })}
              showTime={false}
              triggerClassName="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">ارزش کل</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-1.5">
              <Input
                data-testid="shipment-v2-declaration-total-value"
                className="h-8 min-w-0 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                inputMode="decimal"
                value={draft.totalValueAmount}
                onChange={(event) => updateDraft({ totalValueAmount: event.target.value })}
              />
              <select
                data-testid="shipment-v2-declaration-total-currency"
                className={compactSelectClassName}
                value={totalCurrency}
                onChange={(event) => updateDraft({ totalValueCurrency: event.target.value as ShipmentV2CurrencyCode })}
              >
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>
                    {currencyLabels[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">مبلغ نهایی پرداختی</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-1.5">
              <Input
                data-testid="shipment-v2-declaration-final-paid"
                className="h-8 min-w-0 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                inputMode="decimal"
                value={draft.finalPaidAmount}
                onChange={(event) => updateDraft({ finalPaidAmount: event.target.value })}
              />
              <select
                data-testid="shipment-v2-declaration-final-paid-currency"
                className={compactSelectClassName}
                value={finalPaidCurrency}
                onChange={(event) => updateDraft({ finalPaidCurrency: event.target.value as ShipmentV2CurrencyCode })}
              >
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>
                    {currencyLabels[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          <BaseInfoCard label="شماره کوتاژ" testId="shipment-v2-declaration-cotage-number-value">
            {displayValue(data.cotageNumber)}
          </BaseInfoCard>
          <BaseInfoCard label="مسیر گمرکی" testId="shipment-v2-declaration-customs-route-value">
            {displayValue(routeLabel)}
          </BaseInfoCard>
          <BaseInfoCard label="تاریخ ثبت کوتاژ" testId="shipment-v2-declaration-cotage-date-value">
            {displayShamsiDate(data.cotageRegistrationDate)}
          </BaseInfoCard>
          <BaseInfoCard label="ارزش کل" testId="shipment-v2-declaration-total-value-value">
            {displayMoneyValue(data.totalValueAmount, data.totalValueCurrency)}
          </BaseInfoCard>
          <BaseInfoCard label="مبلغ نهایی پرداختی" testId="shipment-v2-declaration-final-paid-value" className="col-span-2 lg:col-span-1">
            {displayMoneyValue(data.finalPaidAmount, data.finalPaidCurrency)}
          </BaseInfoCard>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <BaseInfoCard label="وضعیت گمرکی" testId="shipment-v2-declaration-customs-status-value">
          {displayValue(customsStatusLabel)}
        </BaseInfoCard>
        <BaseInfoCard label="وضعیت ترخیص / خروج" testId="shipment-v2-declaration-release-status-value">
          {displayValue(releaseStatusLabel)}
        </BaseInfoCard>
      </div>
      <SectionActions
        canUpdate={canUpdate}
        isSaving={isSaving}
        isEditing={isEditing}
        testIdPrefix="shipment-v2-declaration"
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setDraft(declarationDraftFromData(data || {}));
          setIsEditing(false);
        }}
        onSave={() => {
          onSave({
            ...draft,
            totalValueAmount: optionalNumber(draft.totalValueAmount),
            totalValueCurrency: draft.totalValueCurrency || "IRR",
            finalPaidAmount: optionalNumber(draft.finalPaidAmount),
            finalPaidCurrency: draft.finalPaidCurrency || "IRR",
          });
          setIsEditing(false);
        }}
      />
    </div>
  );
}

function PermitsSection({
  data,
  canUpdate,
  isSaving,
  onSave,
}: {
  data: ShipmentV2PermitsSection;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (payload: ShipmentV2PermitsSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [rows, setRows] = React.useState<Array<ShipmentV2PermitRow & { id: string }>>([]);
  const [activeRowId, setActiveRowId] = React.useState<string | null>(null);

  const resetDraft = React.useCallback(() => {
    const permitRows = data.permitRows || [];
    setRows(
      permitRows.length
        ? permitRows.map((row, index) => ({ ...row, id: `permit-${index}-${row.permitName}` }))
        : [{ id: "permit-empty", permitName: "", permitState: "" }]
    );
  }, [data]);

  React.useEffect(() => {
    if (!isEditing) resetDraft();
  }, [isEditing, resetDraft]);

  const updateRow = (rowId: string, updates: Partial<ShipmentV2PermitRow>) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...updates } : row)));
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      { id: `permit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, permitName: "", permitState: "" },
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== rowId);
      return next.length ? next : [{ id: "permit-empty", permitName: "", permitState: "" }];
    });
  };

  const handleSave = () => {
    const permitRows = rows
      .map((row) => ({
        permitName: row.permitName.trim(),
        permitState: (row.permitState || "").trim(),
      }))
      .filter((row) => row.permitName);
    onSave({ permitRows });
    setActiveRowId(null);
    setIsEditing(false);
  };

  const savedRows = data.permitRows || [];

  return (
    <div className="space-y-2.5">
      {isEditing ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-black text-muted-foreground sm:text-xs">ردیف‌های مجوز</p>
            <Button type="button" variant="outline" data-testid="shipment-v2-permits-add" className="h-7 rounded-md px-2.5 text-[10px] font-black sm:h-8 sm:text-[11px]" onClick={addRow}>
              افزودن مجوز
            </Button>
          </div>
          {rows.map((row, index) => {
            const suggestions = activeRowId === row.id ? getPermitSuggestions(row.permitName) : [];
            return (
              <div key={row.id} className="rounded-lg border border-border bg-muted/20 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black text-muted-foreground">مجوز {(index + 1).toLocaleString("fa-IR")}</p>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:text-red-600" onClick={() => removeRow(row.id)} aria-label={`حذف مجوز ${index + 1}`}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
                  <div className="relative">
                    <Input
                      data-testid={`shipment-v2-permit-row-${index}-name`}
                      className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                      placeholder="نام مجوز"
                      value={row.permitName}
                      onFocus={() => setActiveRowId(row.id)}
                      onBlur={() => window.setTimeout(() => setActiveRowId((current) => (current === row.id ? null : current)), 120)}
                      onChange={(event) => {
                        updateRow(row.id, { permitName: event.target.value });
                        setActiveRowId(row.id);
                      }}
                    />
                    {suggestions.length ? (
                      <div
                        data-testid={`shipment-v2-permit-row-${index}-suggestions`}
                        className="absolute right-0 left-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl"
                      >
                        {suggestions.map((suggestion, suggestionIndex) => (
                          <button
                            key={suggestion}
                            type="button"
                            data-testid={`shipment-v2-permit-row-${index}-suggestion-${suggestionIndex}`}
                            className="block w-full rounded-md px-2 py-1.5 text-right text-[11px] font-bold leading-5 text-popover-foreground hover:bg-muted"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              updateRow(row.id, { permitName: suggestion });
                              setActiveRowId(null);
                            }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Input
                    data-testid={`shipment-v2-permit-row-${index}-state`}
                    className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                    placeholder="وضعیت مجوز"
                    value={row.permitState || ""}
                    onChange={(event) => updateRow(row.id, { permitState: event.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {savedRows.length ? (
            savedRows.map((row, index) => (
              <div key={`${row.permitName}-${index}`} className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                  {(index + 1).toLocaleString("fa-IR")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[11px] font-black leading-5 text-foreground sm:text-xs">{row.permitName}</p>
                  <p className="mt-0.5 break-words text-[10px] font-bold leading-4 text-muted-foreground">
                    وضعیت: {displayValue(row.permitState)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-2.5 text-[11px] font-bold leading-5 text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>هنوز مجوزی برای این محموله ثبت نشده است.</span>
            </div>
          )}
        </div>
      )}
      <SectionActions
        canUpdate={canUpdate}
        isSaving={isSaving}
        isEditing={isEditing}
        testIdPrefix="shipment-v2-permits"
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          resetDraft();
          setActiveRowId(null);
          setIsEditing(false);
        }}
        onSave={handleSave}
      />
    </div>
  );
}

function PaymentsSection({
  data,
  canUpdate,
  isSaving,
  onSave,
}: {
  data: ShipmentV2PaymentsSection;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (payload: ShipmentV2PaymentsSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<PaymentsDraft>(() => paymentsDraftFromData(data || {}));

  React.useEffect(() => {
    if (!isEditing) setDraft(paymentsDraftFromData(data || {}));
  }, [data, isEditing]);

  const updateDraft = (updates: Partial<PaymentsDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };

  const customsAmountCurrency = draft.customsAmountCurrency || data.customsAmountCurrency || "IRR";
  const customsDifferenceCurrency = draft.customsDifferenceCurrency || data.customsDifferenceCurrency || "IRR";
  const customsTaxCurrency = draft.customsTaxCurrency || data.customsTaxCurrency || "IRR";
  const taxStatus = draft.customsTaxStatus || null;
  const taxStatusLabel = data.customsTaxStatus ? customsTaxStatusLabels[data.customsTaxStatus] : "";
  const taxDisplay =
    data.customsTaxStatus === "GOOD_STANDING"
      ? "—"
      : displayMoneyValue(data.customsTaxAmount, data.customsTaxCurrency);
  const paidStatusText = (isPaid?: boolean) => (isPaid ? "پرداخت شده" : "پرداخت نشده");
  const PaymentSummaryRow = ({
    label,
    value,
    status,
    testId,
  }: {
    label: string;
    value: React.ReactNode;
    status: string;
    testId: string;
  }) => (
    <div data-testid={testId} className="min-w-0 rounded-lg border border-border bg-muted/20 px-2.5 py-2 sm:px-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-black leading-4 text-muted-foreground sm:text-[10px]">{label}</p>
          <p className="mt-0.5 text-[10px] font-bold leading-4 text-muted-foreground">{status}</p>
        </div>
        <div className="min-w-0 max-w-[58%] break-words text-left text-[11px] font-black leading-5 text-foreground sm:text-xs" dir="auto">
          {value}
        </div>
      </div>
    </div>
  );

  const handleSave = () => {
    const customsTaxAmount = optionalNumber(draft.customsTaxAmount);
    if (draft.customsTaxStatus === "PAYABLE" && customsTaxAmount === null) {
      toast.error("مبلغ مالیات گمرکی را وارد کنید.");
      return;
    }
    onSave({
      ...draft,
      customsPaymentPaid: Boolean(draft.customsPaymentPaid),
      customsAmount: optionalNumber(draft.customsAmount),
      customsAmountCurrency: draft.customsAmountCurrency || "IRR",
      customsDifferenceAmount: optionalNumber(draft.customsDifferenceAmount),
      customsDifferenceCurrency: draft.customsDifferenceCurrency || "IRR",
      customsDifferencePaid: Boolean(draft.customsDifferencePaid),
      customsTaxAmount: draft.customsTaxStatus === "GOOD_STANDING" ? 0 : customsTaxAmount,
      customsTaxCurrency: draft.customsTaxCurrency || "IRR",
      customsTaxPaid: draft.customsTaxStatus === "GOOD_STANDING" ? false : Boolean(draft.customsTaxPaid),
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-2.5">
      {isEditing ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="flex items-center justify-between gap-2 text-[10px] font-bold text-muted-foreground sm:text-xs">
              <span>مبلغ گمرکی</span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold">
                <span>{paidStatusText(draft.customsPaymentPaid)}</span>
                <input
                  data-testid="shipment-v2-payments-customs-paid"
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                  checked={Boolean(draft.customsPaymentPaid)}
                  onChange={(event) => updateDraft({ customsPaymentPaid: event.target.checked })}
                />
              </span>
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-1.5">
              <Input
                data-testid="shipment-v2-payments-customs-amount"
                className="h-8 min-w-0 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                inputMode="decimal"
                value={draft.customsAmount}
                onChange={(event) => updateDraft({ customsAmount: event.target.value })}
              />
              <select
                data-testid="shipment-v2-payments-customs-amount-currency"
                className={compactSelectClassName}
                value={customsAmountCurrency}
                onChange={(event) => updateDraft({ customsAmountCurrency: event.target.value as ShipmentV2CurrencyCode })}
              >
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>
                    {currencyLabels[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center justify-between gap-2 text-[10px] font-bold text-muted-foreground sm:text-xs">
              <span>تفاوت گمرکی</span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold">
                <span>{paidStatusText(draft.customsDifferencePaid)}</span>
                <input
                  data-testid="shipment-v2-payments-customs-difference-paid"
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                  checked={Boolean(draft.customsDifferencePaid)}
                  onChange={(event) => updateDraft({ customsDifferencePaid: event.target.checked })}
                />
              </span>
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-1.5">
              <Input
                data-testid="shipment-v2-payments-customs-difference"
                className="h-8 min-w-0 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                inputMode="decimal"
                value={draft.customsDifferenceAmount}
                onChange={(event) => updateDraft({ customsDifferenceAmount: event.target.value })}
              />
              <select
                data-testid="shipment-v2-payments-customs-difference-currency"
                className={compactSelectClassName}
                value={customsDifferenceCurrency}
                onChange={(event) => updateDraft({ customsDifferenceCurrency: event.target.value as ShipmentV2CurrencyCode })}
              >
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>
                    {currencyLabels[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">وضعیت مالیات گمرکی</Label>
            <select
              data-testid="shipment-v2-payments-tax-status"
              className={compactSelectClassName}
              value={taxStatus || ""}
              onChange={(event) => {
                const nextStatus = (event.target.value || null) as ShipmentV2CustomsTaxStatus | null;
                updateDraft({
                  customsTaxStatus: nextStatus,
                  customsTaxAmount: nextStatus === "GOOD_STANDING" ? "0" : draft.customsTaxAmount,
                  customsTaxPaid: nextStatus === "GOOD_STANDING" ? false : draft.customsTaxPaid,
                });
              }}
            >
              <option value="">ثبت نشده</option>
              {customsTaxStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {customsTaxStatusLabels[option]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center justify-between gap-2 text-[10px] font-bold text-muted-foreground sm:text-xs">
              <span>مبلغ مالیات گمرکی</span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold">
                <span>{taxStatus === "GOOD_STANDING" ? "بدون پرداخت" : paidStatusText(draft.customsTaxPaid)}</span>
                <input
                  data-testid="shipment-v2-payments-tax-paid"
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-primary disabled:opacity-50"
                  disabled={taxStatus !== "PAYABLE"}
                  checked={taxStatus === "PAYABLE" ? Boolean(draft.customsTaxPaid) : false}
                  onChange={(event) => updateDraft({ customsTaxPaid: event.target.checked })}
                />
              </span>
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-1.5">
              <Input
                data-testid="shipment-v2-payments-tax-amount"
                className="h-8 min-w-0 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                inputMode="decimal"
                disabled={taxStatus !== "PAYABLE"}
                value={taxStatus === "GOOD_STANDING" ? "—" : taxStatus === "PAYABLE" ? draft.customsTaxAmount : ""}
                onChange={(event) => updateDraft({ customsTaxAmount: event.target.value })}
              />
              <select
                data-testid="shipment-v2-payments-tax-currency"
                className={compactSelectClassName}
                disabled={taxStatus !== "PAYABLE"}
                value={customsTaxCurrency}
                onChange={(event) => updateDraft({ customsTaxCurrency: event.target.value as ShipmentV2CurrencyCode })}
              >
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>
                    {currencyLabels[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <PaymentSummaryRow
            label="مبلغ گمرکی"
            testId="shipment-v2-payments-customs-amount-value"
            value={displayMoneyValue(data.customsAmount, data.customsAmountCurrency)}
            status={paidStatusText(data.customsPaymentPaid)}
          />
          <PaymentSummaryRow
            label="تفاوت گمرکی"
            testId="shipment-v2-payments-customs-difference-value"
            value={displayMoneyValue(data.customsDifferenceAmount, data.customsDifferenceCurrency)}
            status={paidStatusText(data.customsDifferencePaid)}
          />
          <PaymentSummaryRow
            label={`مالیات گمرکی${taxStatusLabel ? ` - ${taxStatusLabel}` : ""}`}
            testId="shipment-v2-payments-tax-amount-value"
            value={taxDisplay}
            status={data.customsTaxStatus === "GOOD_STANDING" ? "بدون پرداخت" : paidStatusText(data.customsTaxPaid)}
          />
          <span data-testid="shipment-v2-payments-tax-status-value" className="sr-only">
            {displayValue(taxStatusLabel)}
          </span>
        </div>
      )}
      <SectionActions
        canUpdate={canUpdate}
        isSaving={isSaving}
        isEditing={isEditing}
        testIdPrefix="shipment-v2-payments"
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setDraft(paymentsDraftFromData(data || {}));
          setIsEditing(false);
        }}
        onSave={handleSave}
      />
    </div>
  );
}

function BankingSection({
  data,
  canUpdate,
  isSaving,
  onSave,
}: {
  data: ShipmentV2BankingSection;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (payload: ShipmentV2BankingSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<ShipmentV2BankingSection>(data || {});

  React.useEffect(() => {
    if (!isEditing) setDraft(data || {});
  }, [data, isEditing]);

  const updateDraft = (updates: Partial<ShipmentV2BankingSection>) => {
    setDraft((current) => ({ ...current, ...updates }));
  };

  const updateNumericDraft = (key: keyof ShipmentV2BankingSection, value: string) => {
    updateDraft({ [key]: value.replace(/\D/g, "") } as Partial<ShipmentV2BankingSection>);
  };

  return (
    <div className="space-y-2.5">
      {isEditing ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">نام بانک</Label>
            <Input
              data-testid="shipment-v2-banking-bank-name"
              className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
              value={draft.bankName || ""}
              onChange={(event) => updateDraft({ bankName: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">کد شعبه</Label>
            <Input
              data-testid="shipment-v2-banking-branch-code"
              className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
              inputMode="numeric"
              value={draft.branchCode || ""}
              onChange={(event) => updateNumericDraft("branchCode", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">نام شعبه</Label>
            <Input
              data-testid="shipment-v2-banking-branch-name"
              className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
              value={draft.branchName || ""}
              onChange={(event) => updateDraft({ branchName: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">کد ابزار پرداخت</Label>
            <Input
              data-testid="shipment-v2-banking-payment-instrument-code"
              className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
              inputMode="numeric"
              value={draft.paymentInstrumentCode || ""}
              onChange={(event) => updateNumericDraft("paymentInstrumentCode", event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">کد ساتا</Label>
            <Input
              data-testid="shipment-v2-banking-sata-code"
              className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
              inputMode="numeric"
              value={draft.sataCode || ""}
              onChange={(event) => updateNumericDraft("sataCode", event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          <BaseInfoCard label="نام بانک" testId="shipment-v2-banking-bank-name-value">
            {displayValue(data.bankName)}
          </BaseInfoCard>
          <BaseInfoCard label="کد شعبه" testId="shipment-v2-banking-branch-code-value">
            <span dir="ltr">{displayValue(data.branchCode)}</span>
          </BaseInfoCard>
          <BaseInfoCard label="نام شعبه" testId="shipment-v2-banking-branch-name-value">
            {displayValue(data.branchName)}
          </BaseInfoCard>
          <BaseInfoCard label="کد ابزار پرداخت" testId="shipment-v2-banking-payment-instrument-code-value">
            <span dir="ltr">{displayValue(data.paymentInstrumentCode)}</span>
          </BaseInfoCard>
          <BaseInfoCard label="کد ساتا" testId="shipment-v2-banking-sata-code-value" className="col-span-2 lg:col-span-1">
            <span dir="ltr">{displayValue(data.sataCode)}</span>
          </BaseInfoCard>
        </div>
      )}
      <SectionActions
        canUpdate={canUpdate}
        isSaving={isSaving}
        isEditing={isEditing}
        testIdPrefix="shipment-v2-banking"
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setDraft(data || {});
          setIsEditing(false);
        }}
        onSave={() => {
          onSave({
            bankName: draft.bankName || "",
            branchCode: draft.branchCode || "",
            branchName: draft.branchName || "",
            paymentInstrumentCode: draft.paymentInstrumentCode || "",
            sataCode: draft.sataCode || "",
          });
          setIsEditing(false);
        }}
      />
    </div>
  );
}

function NotesSection({
  data,
  canUpdate,
  isSaving,
  onSave,
}: {
  data: ShipmentV2NotesSection;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (payload: ShipmentV2NotesSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(data.internalNote || "");

  React.useEffect(() => {
    if (!isEditing) setDraft(data.internalNote || "");
  }, [data.internalNote, isEditing]);

  return (
    <div className="space-y-2.5">
      {isEditing ? (
        <textarea
          data-testid="shipment-v2-notes-input"
          className="min-h-32 w-full resize-y rounded-md border border-border bg-background p-3 text-xs leading-6 outline-none focus:ring-1 focus:ring-primary/50"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <div className="min-h-20 rounded-lg border border-border bg-muted/25 p-3 text-xs font-bold leading-6 text-foreground">
          {draft.trim() || "یادداشتی ثبت نشده است."}
        </div>
      )}
      <SectionActions
        canUpdate={canUpdate}
        isSaving={isSaving}
        isEditing={isEditing}
        testIdPrefix="shipment-v2-notes"
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setDraft(data.internalNote || "");
          setIsEditing(false);
        }}
        onSave={() => {
          onSave({ internalNote: draft });
          setIsEditing(false);
        }}
      />
    </div>
  );
}

function EmptyDetailSection() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center">
      <FileCheck2 className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-2 text-xs font-bold text-muted-foreground">هنوز فیلدی برای این بخش در فعال نشده است.</p>
    </div>
  );
}

export default function ShipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useAppDataStore((state) => state.currentUser);
  const users = useAppDataStore((state) => state.users);
  const customers = useAppDataStore((state) => state.customers);
  const shipments = useAppDataStore((state) => state.shipments);
  const commercialCards = useAppDataStore((state) => state.commercialCards);
  const canUpdate = Boolean(currentUser?.permissions?.includes("shipments.update"));
  const [data, setData] = React.useState<ShipmentV2ProfileResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isInitializing, setIsInitializing] = React.useState(false);
  const [savingSection, setSavingSection] = React.useState<ShipmentV2SectionKey | null>(null);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [documentCount, setDocumentCount] = React.useState<number | null>(null);
  const [isDocumentCountLoading, setIsDocumentCountLoading] = React.useState(false);
  const [dailyStatusRow, setDailyStatusRow] = React.useState<DailyStatusBoardRow | null>(null);
  const [malvaniProfiles, setMalvaniProfiles] = React.useState<MalvaniProfile[]>([]);
  const [isMalvaniLoading, setIsMalvaniLoading] = React.useState(false);
  const profileFlowCode = data?.profile?.flowCode || "IMPORT_SHIP";

  React.useLayoutEffect(() => {
    const scrollToHeader = () => {
      document.querySelector<HTMLElement>(".app-main")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    scrollToHeader();
    const frame = window.requestAnimationFrame(scrollToHeader);
    const timer = window.setTimeout(scrollToHeader, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [id]);

  const loadProfile = React.useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await shipmentV2Api.get(id);
      setData(response);
    } catch (error) {
      console.error("Load Shipment failed", error);
      const message = error instanceof ApiError && error.status === 404
        ? "محموله پیدا نشد."
        : "بارگذاری پرونده ناموفق بود.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadMalvaniProfiles = React.useCallback(async () => {
    setIsMalvaniLoading(true);
    try {
      const profiles = await businessEntitiesApi.listMalvaniProfiles();
      setMalvaniProfiles(profiles);
    } catch (error) {
      console.error("Load shipment Malvani profiles failed", error);
      toast.error("بارگیری فهرست ملوانی ناموفق بود.");
    } finally {
      setIsMalvaniLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (profileFlowCode === "IMPORT_LANJ") void loadMalvaniProfiles();
  }, [loadMalvaniProfiles, profileFlowCode]);

  React.useEffect(() => {
    if (!id) return;
    let isActive = true;
    setIsDocumentCountLoading(true);
    setDocumentCount(null);
    apiGet<ShipmentDocument[]>(`/api/shipments/${encodeURIComponent(id)}/documents`)
      .then((documents) => {
        if (!isActive) return;
        setDocumentCount(documents.filter((document) => !document.isArchived).length);
      })
      .catch((error) => {
        if (!isActive) return;
        if (!(error instanceof ApiError && error.status === 403)) {
          console.error("Load shipment document count failed", error);
        }
        setDocumentCount(null);
      })
      .finally(() => {
        if (isActive) setIsDocumentCountLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [id]);

  React.useEffect(() => {
    if (!id) return;
    let isActive = true;
    setDailyStatusRow(null);
    dailyStatusApi.getForShipment(id)
      .then((row) => {
        if (isActive) setDailyStatusRow(row);
      })
      .catch((error) => {
        if (!isActive) return;
        if (!(error instanceof ApiError && error.status === 403)) {
          console.error("Load shipment daily status failed", error);
        }
        setDailyStatusRow(null);
      });
    return () => {
      isActive = false;
    };
  }, [id]);

  const initializeProfile = async () => {
    if (!id) return;
    setIsInitializing(true);
    try {
      const response = await shipmentV2Api.initialize(id);
      setData(response);
      toast.success("پرونده برای این محموله ساخته شد.");
    } catch (error) {
      console.error("Initialize Shipment failed", error);
      toast.error("ساخت پرونده ناموفق بود.");
    } finally {
      setIsInitializing(false);
    }
  };

  const saveSection = async (sectionKey: ShipmentV2SectionKey, payload: ShipmentV2SectionPayload) => {
    if (!id) return;
    setSavingSection(sectionKey);
    try {
      const response = await shipmentV2Api.updateSection(id, sectionKey, payload);
      setData(response);
      toast.success("بخش پرونده ذخیره شد.");
    } catch (error) {
      console.error("Update Shipment section failed", error);
      toast.error("ذخیره بخش پرونده ناموفق بود.");
    } finally {
      setSavingSection(null);
    }
  };

  const updateShipmentSummary = React.useCallback((updated: Partial<ShipmentV2ShipmentSummary>) => {
    setData((current) => current ? {
      ...current,
      shipment: {
        ...current.shipment,
        ...updated,
      },
    } : current);
  }, []);

  if (isLoading) {
    return (
      <div className="app-page flex min-h-[50vh] items-center justify-center font-sans" dir="rtl">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بارگذاری پرونده
        </div>
      </div>
    );
  }

  if (errorMessage || !data) {
    return (
      <div className="app-page space-y-4 font-sans" dir="rtl">
        <Button type="button" variant="outline" className="h-9 rounded-lg text-xs font-black" onClick={() => navigate("/shipments")}>
          بازگشت به محموله‌ها
        </Button>
        <Card className="rounded-xl border-border bg-card">
          <CardContent className="p-6 text-center text-sm font-bold text-muted-foreground">{errorMessage || "پرونده در دسترس نیست."}</CardContent>
        </Card>
      </div>
    );
  }

  const { shipment, profile } = data;
  const flowCode = profile?.flowCode || profileFlowCode;
  const customer = customers.find((item) => item.id === shipment.customerId) || null;
  const baseSection = profile?.sections.base;
  const headerCustomerIdentifier = customer?.customerCode || customer?.code || shipment.customerCode || shipment.customerId || shipment.customerName || "";
  const updatedAt = profile?.updatedAt || shipment.updatedAt || shipment.createdAt;
  const updatedByName = resolveUserName(profile?.updatedById || profile?.createdById, users, currentUser);
  const routeSteps = [
    { key: "origin", label: "مبدا", value: baseSection?.origin || shipment.origin },
    { key: "dischargePort", label: "محل تخلیه", value: baseSection?.dischargePort },
    { key: "deliveryPort", label: "بندر تحویل", value: baseSection?.deliveryPort || shipment.destination },
  ];

  return (
    <div className="app-page space-y-5 font-sans" dir="rtl" data-testid="shipment-v2-detail-page">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              onClick={() => navigate("/shipments")}
              aria-label="بازگشت"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 data-testid="shipment-v2-header-shipment-id" className="font-mono text-sm font-black text-primary" dir="ltr">
                  {shipment.trackingNumber}
                </h1>
                <Badge variant="outline" className="rounded-lg text-[11px] font-black">
                  {flowLabels[flowCode]}
                </Badge>
                <Badge variant="outline" className="rounded-lg text-[11px] font-black">
                  {shipmentStatusLabel(shipment.status)}
                </Badge>
              </div>
              <p data-testid="shipment-v2-header-customer" className="mt-1 truncate text-xs font-black text-foreground">
                {headerCustomerIdentifier || "بدون مشتری"}
              </p>
            </div>
          </div>
          <HeaderRouteProgress steps={routeSteps} />
        </div>
      </div>

      {!profile ? (
        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardContent className="space-y-4 p-6 text-center">
            <Anchor className="mx-auto h-8 w-8 text-primary" />
            <div>
              <h2 className="text-base font-black text-foreground">پرونده هنوز برای این محموله ساخته نشده است.</h2>
              <p className="mt-2 text-xs font-bold leading-6 text-muted-foreground">
                ساخت پرونده یک پروفایل خالی و تمیز ایجاد می‌کند و داده‌های قدیمی جزئیات یا کوتاژ را کپی نمی‌کند.
              </p>
            </div>
            {canUpdate ? (
              <Button type="button" className="h-10 rounded-lg text-xs font-black" onClick={() => void initializeProfile()} disabled={isInitializing}>
                {isInitializing ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <RotateCw className="ml-1 h-4 w-4" />}
                شروع پرونده
              </Button>
            ) : (
              <p className="text-xs font-bold text-muted-foreground">برای ساخت پرونده به دسترسی ویرایش محموله نیاز است.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <ShipmentTimerPanel shipment={shipment} canUpdate={canUpdate} onShipmentUpdate={updateShipmentSummary} />
          {sectionDefinitions.map((section) => {
            const Icon = section.icon;
            if (section.key === "base") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <BaseSection
                      data={profile.sections.base}
                      goodsData={profile.sections.goods}
                      shipment={shipment}
                      flowCode={profile.flowCode}
                      customer={customer}
                      shipments={shipments}
                      commercialCards={commercialCards}
                      malvaniProfiles={malvaniProfiles}
                      isMalvaniLoading={isMalvaniLoading}
                      documentCount={documentCount}
                      isDocumentCountLoading={isDocumentCountLoading}
                      updatedAt={updatedAt}
                      updatedByName={updatedByName}
                      canUpdate={canUpdate}
                      isSaving={savingSection === "base"}
                      onSave={(payload) => void saveSection("base", payload)}
                    />
                  </SectionCard>
                </React.Fragment>
              );
            }
            if (section.key === "goods") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <GoodsSection
                      data={profile.sections.goods}
                      flowCode={profile.flowCode}
                      canUpdate={canUpdate}
                      isSaving={savingSection === "goods"}
                      onSave={(payload) => void saveSection("goods", payload)}
                    />
                  </SectionCard>
                  <div className="grid gap-4" data-testid="shipment-v2-collaboration-panels">
                    <ShipmentDocumentsPanel shipmentId={shipment.id} />
                    <ShipmentChatPanel shipmentId={shipment.id} shipmentCode={shipment.trackingNumber} />
                  </div>
                </React.Fragment>
              );
            }
            if (section.key === "declarationKootaj") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <DeclarationKootajSection
                      data={profile.sections.declarationKootaj}
                      canUpdate={canUpdate}
                      dailyStatusRow={dailyStatusRow}
                      isSaving={savingSection === "declarationKootaj"}
                      onSave={(payload) => void saveSection("declarationKootaj", payload)}
                    />
                  </SectionCard>
                </React.Fragment>
              );
            }
            if (section.key === "permits") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <PermitsSection
                      data={profile.sections.permits}
                      canUpdate={canUpdate}
                      isSaving={savingSection === "permits"}
                      onSave={(payload) => void saveSection("permits", payload)}
                    />
                  </SectionCard>
                </React.Fragment>
              );
            }
            if (section.key === "payments") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <PaymentsSection
                      data={profile.sections.payments}
                      canUpdate={canUpdate}
                      isSaving={savingSection === "payments"}
                      onSave={(payload) => void saveSection("payments", payload)}
                    />
                  </SectionCard>
                </React.Fragment>
              );
            }
            if (section.key === "banking") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <BankingSection
                      data={profile.sections.banking}
                      canUpdate={canUpdate}
                      isSaving={savingSection === "banking"}
                      onSave={(payload) => void saveSection("banking", payload)}
                    />
                  </SectionCard>
                </React.Fragment>
              );
            }
            if (section.key === "notes") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <NotesSection
                      data={profile.sections.notes}
                      canUpdate={canUpdate}
                      isSaving={savingSection === "notes"}
                      onSave={(payload) => void saveSection("notes", payload)}
                    />
                  </SectionCard>
                </React.Fragment>
              );
            }
            return (
              <React.Fragment key={section.key}>
                <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                  <EmptyDetailSection />
                </SectionCard>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
