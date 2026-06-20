import React from "react";
import { Link } from "react-router-dom";
import {
  Anchor,
  ClipboardList,
  CreditCard,
  Edit3,
  ExternalLink,
  Filter,
  Loader2,
  Package,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  commonStatusOptions,
  customsStatusOptions,
  labelForOption,
  releaseStatusOptions,
  routeOptions,
  taxPaymentStatusOptions,
} from "@/src/app/dailyStatusColumns";
import {
  iranImportDateFieldKeys,
  iranImportNumberFieldKeys,
  flattenProfileSections,
  type IranImportProfileFieldType,
  type IranImportProfileField,
  type IranImportProfileSection,
} from "@/src/components/shipments/iranImportProfileFields";
import { toEnglishDigits, toPersianDigits } from "@/src/components/ShamsiDateTimeField";
import { dailyStatusApi, type DailyStatusListFilters } from "@/src/lib/dailyStatusApi";
import { businessEntitiesApi } from "@/src/lib/businessEntitiesApi";
import {
  isShipmentTerminalStatus,
  SHIPMENT_STATUS_OPTIONS,
  shipmentStatusLabel,
} from "@/src/shared/shipment-statuses.js";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/src/store/useAppStore";
import type { BusinessEntityContact, CommercialCard, Customer, DailyStatusBoardRow, DailyStatusPatch, MalvaniProfile, Shipment, ShipmentStatus } from "@/src/types";

const ALL_VALUE = "__all__";
const NONE_VALUE = "__none__";
const EMPTY_TEXT = "ثبت نشده";

type ActiveMode = "view" | "edit";
type DailyBaseInfoDraft = Pick<NonNullable<DailyStatusPatch["baseInfo"]>, "status" | "orderRegistrationNumber" | "currentStage">;
type DailyBaseInfoDraftKey = keyof DailyBaseInfoDraft;
type CustomerEditDraft = {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  referrer: string;
  notes: string;
};

const emptyCustomerEditDraft: CustomerEditDraft = {
  name: "",
  company: "",
  phone: "",
  email: "",
  address: "",
  referrer: "",
  notes: "",
};

const v2CustomsRouteLabels: Record<string, string> = {
  GREEN: "سبز",
  YELLOW: "زرد",
  RED: "قرمز",
  DIRECT_CARRIAGE: "حمل یکسره",
};

const v2CurrencyLabels: Record<string, string> = {
  EUR: "یورو",
  CNY: "یوان",
  USD: "دلار",
  AED: "درهم",
  IRR: "ریال",
};

const v2CustomsTaxStatusLabels: Record<string, string> = {
  PAYABLE: "نیاز به پرداخت",
  GOOD_STANDING: "خوش حسابی",
};

function padDatePart(value: string) {
  return value.padStart(2, "0");
}

function normalizeIsoDateForInput(value?: string | null) {
  const raw = String(value || "").trim().replace(/\//g, "-");
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";
  return `${match[1]}-${padDatePart(match[2])}-${padDatePart(match[3])}`;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

function displayValue(value?: React.ReactNode) {
  if (value === null || value === undefined || value === "") return EMPTY_TEXT;
  return value;
}

function customerEditDraftFromCustomer(customer: Customer | null, fallbackName = ""): CustomerEditDraft {
  return {
    name: customer?.name || fallbackName || "",
    company: customer?.company || "",
    phone: customer?.phone || "",
    email: customer?.email || "",
    address: customer?.address || "",
    referrer: customer?.referrer || "",
    notes: customer?.notes || "",
  };
}

function trimCustomerDraft(draft: CustomerEditDraft): CustomerEditDraft {
  return {
    name: draft.name.trim(),
    company: draft.company.trim(),
    phone: draft.phone.trim(),
    email: draft.email.trim(),
    address: draft.address.trim(),
    referrer: draft.referrer.trim(),
    notes: draft.notes.trim(),
  };
}

function optionLabel(options: Array<{ value: string; label: string }>, value?: string | null) {
  return value ? labelForOption(options, value) || value : EMPTY_TEXT;
}

function statusBadge(status: string, label?: string) {
  const tone: Record<string, string> = {
    LOADING: "border-slate-500/20 bg-slate-500/10 text-slate-700",
    IN_TRANSIT: "border-sky-500/20 bg-sky-500/10 text-sky-700",
    ARRIVED: "border-green-500/20 bg-green-500/10 text-green-700",
    KOOTAJ_DONE: "border-violet-500/20 bg-violet-500/10 text-violet-700",
    EXITED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  };
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap text-[11px] font-black", tone[status])}>
      {label || shipmentStatusLabel(status)}
    </Badge>
  );
}

function commercialCardLabel(row: DailyStatusBoardRow | null, commercialCards: CommercialCard[], value?: string | null) {
  if (!value) return "بدون کارت";
  const card = commercialCards.find((item) => item.id === value);
  if (card) return `${card.holderName || card.cardNumber || card.id}${card.cardNumber ? ` (${card.cardNumber})` : ""}`;
  if (row?.commercialCard?.id === value) return row.commercialCard.displayName || value;
  return value;
}

function selectableCommercialCards(commercialCards: CommercialCard[]) {
  return commercialCards.filter((card) => !card.isArchived && !card.archivedAt);
}

function commercialCardDisplayName(card?: CommercialCard | null) {
  if (!card) return "";
  return card.holderName || card.cardNumber || card.id || "";
}

function commercialCardDescription(card: CommercialCard) {
  return [card.cardNumber, card.responsibleName].filter(Boolean).join(" • ");
}

function malvaniDisplayName(profile?: MalvaniProfile | null) {
  if (!profile) return "";
  return profile.displayName || profile.captainName || profile.lenjName || profile.id || "";
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

function formatShamsiDateForDialog(value?: string | null) {
  if (!value) return EMPTY_TEXT;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("fa-IR-u-ca-persian");
}

const malvaniActiveStatusLabels: Record<MalvaniProfile["activeStatus"], string> = {
  ACTIVE: "فعال",
  INACTIVE: "غیرفعال",
  NEEDS_REVIEW: "نیازمند بررسی",
};

function editableProfileFields(fields: IranImportProfileField[]) {
  return fields.filter((field) => field.editable && (field.patchKey || field.customFieldKey));
}

function normalizeLocalizedDecimalText(value: unknown) {
  return toEnglishDigits(String(value ?? ""))
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".")
    .trim();
}

function normalizeCustomDraftValue(field: IranImportProfileField, value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (field.type === "number") {
    if (value === "") return null;
    const numberValue = Number(normalizeLocalizedDecimalText(value));
    return Number.isFinite(numberValue) ? numberValue : value;
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return field.type === "date" ? normalizeIsoDateForInput(trimmed) || trimmed : trimmed;
}

function normalizeBaseInfoText(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function baseInfoDraftFromRow(row: DailyStatusBoardRow): DailyBaseInfoDraft {
  return {
    status: row.shipment.status as ShipmentStatus,
    orderRegistrationNumber: row.baseInfo?.orderRegistrationNumber || row.kootaj.orderRegistrationNumber || "",
    currentStage: row.baseInfo?.currentStage || row.workflow?.currentStepLabel || "",
  };
}

function draftFromRow(row: DailyStatusBoardRow, fields: IranImportProfileField[]): DailyStatusPatch {
  const draft: DailyStatusPatch = {};
  const writableDraft = draft as Record<string, unknown>;
  writableDraft.baseInfo = baseInfoDraftFromRow(row);
  for (const field of editableProfileFields(fields)) {
    if (field.customFieldKey) {
      writableDraft.customFields = {
        ...((writableDraft.customFields as Record<string, unknown>) || {}),
        [field.customFieldKey]: row.kootaj.customFields?.[field.customFieldKey] ?? "",
      };
      continue;
    }
    const patchKey = field.patchKey;
    if (!patchKey) continue;
    const value = row.kootaj[patchKey as keyof typeof row.kootaj];
    if (patchKey === "commercialCardId") {
      writableDraft[patchKey] = row.kootaj.commercialCardId || row.commercialCard?.id || null;
    } else if (patchKey === "customsPaymentStatus") {
      writableDraft[patchKey] = row.kootaj.customsPaymentStatus || null;
    } else if (iranImportDateFieldKeys.has(patchKey)) {
      writableDraft[patchKey] = normalizeIsoDateForInput(value as string | null);
    } else {
      writableDraft[patchKey] = value ?? "";
    }
  }
  return draft;
}

function normalizePatchValue(field: keyof DailyStatusPatch, value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (iranImportNumberFieldKeys.has(field)) {
    if (value === "") return null;
    const numberValue = Number(normalizeLocalizedDecimalText(value));
    return Number.isFinite(numberValue) ? numberValue : value;
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return iranImportDateFieldKeys.has(field) ? normalizeIsoDateForInput(trimmed) || trimmed : trimmed;
}

function cleanBaseInfoPatch(draft: DailyStatusPatch, row: DailyStatusBoardRow): DailyBaseInfoDraft | undefined {
  if (!draft.baseInfo) return undefined;
  const current = baseInfoDraftFromRow(row);
  const patch: DailyBaseInfoDraft = {};
  if (draft.baseInfo.status && draft.baseInfo.status !== current.status) patch.status = draft.baseInfo.status;
  for (const key of ["orderRegistrationNumber", "currentStage"] as const) {
    const nextValue = normalizeBaseInfoText(draft.baseInfo[key]);
    const currentValue = normalizeBaseInfoText(current[key]);
    if (nextValue !== currentValue) patch[key] = nextValue;
  }
  return Object.keys(patch).length ? patch : undefined;
}

function cleanPatch(draft: DailyStatusPatch, fields: IranImportProfileField[], row: DailyStatusBoardRow): DailyStatusPatch {
  const patch: DailyStatusPatch = {};
  const writablePatch = patch as Record<string, unknown>;
  for (const field of editableProfileFields(fields)) {
    if (field.customFieldKey) {
      const value = normalizeCustomDraftValue(field, draft.customFields?.[field.customFieldKey]);
      if (value === undefined) continue;
      writablePatch.customFields = {
        ...((writablePatch.customFields as Record<string, unknown>) || {}),
        [field.customFieldKey]: value,
      };
      continue;
    }
    if (!field.patchKey) continue;
    const value = normalizePatchValue(field.patchKey, draft[field.patchKey]);
    if (value === undefined) continue;
    writablePatch[field.patchKey] = value;
  }
  const baseInfo = cleanBaseInfoPatch(draft, row);
  if (baseInfo) writablePatch.baseInfo = baseInfo;
  return patch;
}

function baseStatusText(row: DailyStatusBoardRow) {
  const text = row.baseInfo?.statusText;
  if (text && text !== row.shipment.status) return text;
  return shipmentStatusLabel(row.shipment.status) || text || row.shipment.status;
}

function isLenjShipment(row: DailyStatusBoardRow) {
  const shipmentTypeCode = (row.shipment.shipmentTypeCode || "").toUpperCase();
  return (
    shipmentTypeCode.includes("LENJ") ||
    shipmentTypeCode.includes("LANJ") ||
    row.baseInfo?.credentialType === "malvani" ||
    row.baseInfo?.credentialLabel === "ملوانی"
  );
}

const dailyGoodsSection: IranImportProfileSection = {
  id: "goods-v2",
  title: "کالا و بسته‌بندی",
  defaultOpen: true,
  fields: [],
};

type DailyKootajEditFieldDefinition = Omit<IranImportProfileField, "sectionId">;

const dailyKootajEditField = (
  patchKey: keyof DailyStatusPatch,
  label: string,
  type: IranImportProfileFieldType = "text",
  config: Partial<Omit<DailyKootajEditFieldDefinition, "key" | "patchKey" | "label" | "type" | "source" | "editable">> = {}
): DailyKootajEditFieldDefinition => ({
  key: patchKey,
  patchKey,
  label,
  type,
  source: "kootaj",
  editable: true,
  ...config,
});

const dailyStatusEditSectionDefinitions: Array<Omit<IranImportProfileSection, "fields"> & { fields: DailyKootajEditFieldDefinition[] }> = [
  {
    id: "base",
    title: "اطلاعات پایه",
    defaultOpen: true,
    fields: [],
  },
  {
    ...dailyGoodsSection,
    title: "مشخصات کالا",
  },
  {
    id: "declarationKootaj",
    title: "اظهار و کوتاژ",
    defaultOpen: true,
    fields: [
      dailyKootajEditField("cotageNumber", "شماره کوتاژ", "text", { dir: "ltr" }),
      dailyKootajEditField("customsRoute", "مسیر گمرکی", "select", { options: routeOptions }),
      dailyKootajEditField("cotageDate", "تاریخ ثبت کوتاژ", "date"),
    ],
  },
  {
    id: "permits",
    title: "مجوزها",
    defaultOpen: true,
    fields: [],
  },
  {
    id: "payments",
    title: "پرداخت‌ها",
    defaultOpen: true,
    fields: [
      dailyKootajEditField("customsPaymentStatus", "پرداخت گمرکی", "select", { options: commonStatusOptions }),
      dailyKootajEditField("dutiesAmount", "مبلغ گمرکی", "number", { dir: "ltr", step: "0.01" }),
      dailyKootajEditField("taxPaymentStatus", "وضعیت مالیات", "select", { options: taxPaymentStatusOptions }),
      dailyKootajEditField("taxAmount", "مبلغ مالیات", "number", { dir: "ltr", step: "0.01" }),
    ],
  },
  {
    id: "banking",
    title: "بانکی",
    defaultOpen: true,
    fields: [
      dailyKootajEditField("bankName", "بانک", "text"),
    ],
  },
  {
    id: "notes",
    title: "یادداشت‌ها",
    defaultOpen: true,
    fields: [
      dailyKootajEditField("internalNote", "یادداشت‌ها", "textarea", { wide: true }),
    ],
  },
];

const dailyStatusEditSections: IranImportProfileSection[] = dailyStatusEditSectionDefinitions.map((section) => ({
  ...section,
  fields: section.fields.map((field) => ({ ...field, sectionId: section.id })),
}));

function dailyStatusSectionsForRow(_row: DailyStatusBoardRow | null): IranImportProfileSection[] {
  return dailyStatusEditSections;
}

function credentialInfo(row: DailyStatusBoardRow) {
  const isLenj = isLenjShipment(row);
  return {
    type: isLenj ? "malvani" as const : "commercial_card" as const,
    id: row.baseInfo?.credentialId || (!isLenj ? row.commercialCard?.id || row.kootaj.commercialCardId || "" : ""),
    label: isLenj ? "ملوانی" : row.baseInfo?.credentialLabel || "کارت بازرگانی",
    displayName: isLenj
      ? row.baseInfo?.credentialDisplayName
      : row.baseInfo?.credentialDisplayName || row.commercialCard?.displayName || row.kootaj.commercialCardId,
  };
}

function rowCustomerCode(row: DailyStatusBoardRow) {
  return row.baseInfo?.customerCode || row.customer?.customerCode || row.customer?.id || row.baseInfo?.customerName || row.customer?.name || "";
}

function readonlyValue(row: DailyStatusBoardRow, key: string) {
  switch (key) {
    case "shipmentCode":
      return row.baseInfo?.code || row.shipment.code;
    case "customerName":
      return rowCustomerCode(row);
    case "shipmentStatus":
      return baseStatusText(row);
    case "workflowStep":
      return row.baseInfo?.currentStage || row.workflow?.currentStepLabel;
    case "workflowRoute":
      return optionLabel(routeOptions, row.workflow?.route);
    case "documentCount":
      return toPersianDigits(row.baseInfo?.documentCount ?? row.documents.totalCount);
    case "taskCount":
      return toPersianDigits(row.tasks.openCount);
    case "profileUpdatedAt":
      return formatDate(row.baseInfo?.updatedAt || row.kootaj.updatedAt);
    case "commercialCardDisplay":
      return credentialInfo(row).displayName;
    default:
      return "";
  }
}

function renderProfileValue(row: DailyStatusBoardRow, draft: DailyStatusPatch, field: IranImportProfileField, preferDraft = false) {
  if (field.customFieldKey) {
    const value = preferDraft ? draft.customFields?.[field.customFieldKey] : row.kootaj.customFields?.[field.customFieldKey];
    if (field.type === "select") return optionLabel(field.options || [], value as string | null);
    if (field.type === "number" && value !== null && value !== undefined && value !== "") return toPersianDigits(String(value));
    return value as React.ReactNode;
  }
  if (!field.editable || !field.patchKey) return readonlyValue(row, field.key);
  const value = preferDraft ? draft[field.patchKey] : field.patchKey === "commercialCardId"
    ? row.kootaj.commercialCardId || row.commercialCard?.id || null
    : row.kootaj[field.patchKey as keyof typeof row.kootaj];
  if (field.patchKey === "commercialCardId") return row.commercialCard?.displayName || value;
  if (field.type === "select") return optionLabel(field.options || [], value as string | null);
  if (field.type === "number" && value !== null && value !== undefined && value !== "") return toPersianDigits(String(value));
  return value as React.ReactNode;
}

function rowRouteLabel(row: DailyStatusBoardRow) {
  return optionLabel(routeOptions, row.kootaj.customsRoute || row.workflow?.route);
}

function rowSearchText(row: DailyStatusBoardRow) {
  return [
    row.baseInfo?.code,
    row.shipment.code,
    rowCustomerCode(row),
    row.customer?.customerCode,
    row.customer?.name,
    row.kootaj.cotageNumber,
    row.kootaj.declarationReference,
  ].filter(Boolean).join(" ").toLowerCase();
}

function statusPill(label: string, value: string | null | undefined, options: Array<{ value: string; label: string }>) {
  return (
    <Badge variant={value ? "outline" : "secondary"} className="h-6 max-w-full rounded-md px-2 text-[10px] font-black">
      <span className="truncate">{label}: {optionLabel(options, value) || EMPTY_TEXT}</span>
    </Badge>
  );
}

function formatDailyNumber(value?: number | null) {
  if (value === null || value === undefined) return "";
  return Number(value).toLocaleString("fa-IR", { maximumFractionDigits: 6 });
}

function v2RouteLabel(value?: string | null) {
  return value ? v2CustomsRouteLabels[value] || value : "";
}

function v2TaxStatusLabel(value?: string | null) {
  return value ? v2CustomsTaxStatusLabels[value] || value : "";
}

function v2MoneyValue(amount?: number | null, currency?: string | null) {
  if (amount === null || amount === undefined) return "";
  return `${formatDailyNumber(amount)} ${v2CurrencyLabels[currency || "IRR"] || currency || "IRR"}`;
}

function v2PaymentStateLabel(isPaid?: boolean) {
  return isPaid ? "پرداخت شده" : "بدون پرداخت";
}

function v2DisplayDate(value?: string | null) {
  return value ? String(value) : "";
}

function goodsDescriptionSummary(row: DailyStatusBoardRow) {
  return row.baseInfo?.goods?.goodsSummary || row.kootaj.goodsSummary || "";
}

function goodsPackagingSummary(row: DailyStatusBoardRow) {
  const goods = row.baseInfo?.goods;
  const containerParts = [
    goods?.container20Count ? `${formatDailyNumber(goods.container20Count)} کانتینر ۲۰ فوت` : "",
    goods?.container40Count ? `${formatDailyNumber(goods.container40Count)} کانتینر ۴۰ فوت` : "",
  ].filter(Boolean);
  const packageText = goods?.packagingSummary || (row.kootaj.packageCount ? `${formatDailyNumber(row.kootaj.packageCount)} بسته` : "");
  return [...containerParts, packageText].filter(Boolean).join("، ");
}

function goodsCompactSummary(row: DailyStatusBoardRow) {
  return [goodsDescriptionSummary(row), goodsPackagingSummary(row)].filter(Boolean).join(" / ");
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background px-3 py-2 shadow-sm">
      <p className="truncate text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black text-foreground">{value}</p>
    </div>
  );
}

function ReadField({ label, value, wide }: { label: string; value?: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-border bg-background px-3 py-2", wide && "md:col-span-2")}>
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 min-h-5 whitespace-pre-wrap break-words text-xs font-black leading-6 text-foreground">
        {displayValue(value)}
      </p>
    </div>
  );
}

function DialogFactRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-2.5 py-2">
      <span className="shrink-0 text-[10px] font-black text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-left text-[11px] font-black text-foreground" dir="auto">
        {displayValue(value)}
      </span>
    </div>
  );
}

function CustomerEditField({
  label,
  value,
  onChange,
  multiline,
  dir,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  dir?: "rtl" | "ltr";
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-black text-muted-foreground">{label}</Label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs font-bold leading-5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          dir={dir || "rtl"}
        />
      ) : (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 rounded-lg bg-background text-xs font-bold"
          dir={dir || "rtl"}
        />
      )}
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

function FormInput({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", wide && "md:col-span-2")}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Label className="truncate text-[11px] font-black text-muted-foreground">{label}</Label>
        <Badge variant="outline" className="shrink-0 text-[10px] font-black">قابل ویرایش</Badge>
      </div>
      {children}
    </div>
  );
}

function SelectField({
  value,
  options,
  onChange,
  testId,
}: {
  value?: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
  testId?: string;
}) {
  return (
    <Select value={value || NONE_VALUE} onValueChange={(next) => onChange(next === NONE_VALUE ? null : next)}>
      <SelectTrigger data-testid={testId} className="h-9 w-full rounded-lg bg-background text-xs font-bold">
        <span className="truncate">{value ? labelForOption(options, value) : EMPTY_TEXT}</span>
      </SelectTrigger>
      <SelectContent className="bg-card text-foreground" dir="rtl">
        <SelectItem value={NONE_VALUE}>{EMPTY_TEXT}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CompactFact({ label, value, className }: { label: string; value?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-[58px] min-w-0 rounded-lg border border-border bg-background px-2.5 py-2", className)}>
      <p className="truncate text-[10px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 line-clamp-2 break-words text-[11px] font-black leading-4 text-foreground">{displayValue(value)}</p>
    </div>
  );
}

function DailyBaseInfoBox({
  label,
  children,
  wide,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-border bg-background px-3 py-2", wide && "col-span-2")} data-testid={testId}>
      <p className="truncate text-[11px] font-bold text-muted-foreground">{label}</p>
      <div className="mt-1 min-h-5 break-words text-xs font-black leading-6 text-foreground">
        {children}
      </div>
    </div>
  );
}

function DailyBaseInfoGrid({
  row,
  surface,
  customers,
  shipments,
  commercialCards,
  malvaniProfiles,
  mode = "view",
  draft,
  onBaseInfoChange,
}: {
  row: DailyStatusBoardRow;
  surface: "desktop" | "mobile";
  customers: Customer[];
  shipments: Shipment[];
  commercialCards: CommercialCard[];
  malvaniProfiles: MalvaniProfile[];
  mode?: ActiveMode;
  draft?: DailyStatusPatch;
  onBaseInfoChange?: (field: DailyBaseInfoDraftKey, value: string | null) => void;
}) {
  const base = row.baseInfo;
  const isEdit = mode === "edit" && Boolean(onBaseInfoChange);
  const baseDraft = draft?.baseInfo || baseInfoDraftFromRow(row);
  const credential = credentialInfo(row);
  const testId = (name: string) => `daily-status-${surface}-base-${name}-${row.id}`;
  const [dialog, setDialog] = React.useState<"customer" | "credential" | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = React.useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = React.useState(false);
  const [customerDraft, setCustomerDraft] = React.useState<CustomerEditDraft>(emptyCustomerEditDraft);
  const currentUser = useAppStore((state) => state.currentUser);
  const loadCurrentUserRecords = useAppStore((state) => state.loadCurrentUserRecords);
  const customer = customers.find((item) => item.id === row.customer?.id) || null;
  const activeCustomerShipments = React.useMemo(() => {
    if (!row.customer?.id) return [];
    return shipments.filter((item) => item.customerId === row.customer?.id && isActiveCustomerShipment(item));
  }, [row.customer?.id, shipments]);
  const linkedCommercialCard = React.useMemo(() => (
    commercialCards.find((card) => (
      card.id === credential.id ||
      card.id === row.commercialCard?.id ||
      commercialCardDisplayName(card) === credential.displayName
    )) || null
  ), [commercialCards, credential.displayName, credential.id, row.commercialCard?.id]);
  const linkedMalvaniProfile = React.useMemo(() => (
    malvaniProfiles.find((profile) => (
      profile.id === credential.id ||
      malvaniDisplayName(profile) === credential.displayName
    )) || null
  ), [credential.displayName, credential.id, malvaniProfiles]);
  const canOpenCredential = Boolean(credential.displayName || linkedCommercialCard || linkedMalvaniProfile);
  const customerName = customer?.name || base?.customerName || row.customer?.name;
  const customerIdentifier = customer?.customerCode || customer?.code || row.customer?.customerCode || base?.customerCode || row.customer?.id || customerName || "";
  const customerDisplay = customerIdentifier;
  const canEditCustomer = currentUser?.role === "CEO" && Boolean(row.customer?.id);
  const renderTextEditor = (
    field: Exclude<DailyBaseInfoDraftKey, "status">,
    name: string,
    { multiline = false, dir = "rtl" as "rtl" | "ltr" } = {}
  ) => {
    const value = String(baseDraft[field] ?? "");
    if (multiline) {
      return (
        <textarea
          value={value}
          onChange={(event) => onBaseInfoChange?.(field, event.target.value)}
          className="min-h-16 w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 text-xs font-bold leading-5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          dir={dir}
          data-testid={`${testId(name)}-input`}
        />
      );
    }
    return (
      <Input
        value={value}
        onChange={(event) => onBaseInfoChange?.(field, event.target.value)}
        className="h-9 rounded-lg bg-background text-xs font-bold"
        dir={dir}
        data-testid={`${testId(name)}-input`}
      />
    );
  };

  React.useEffect(() => {
    if (dialog === "customer" && !isEditingCustomer) {
      setCustomerDraft(customerEditDraftFromCustomer(customer, customerName || ""));
    }
  }, [customer, customerName, dialog, isEditingCustomer]);

  const startCustomerEdit = () => {
    setCustomerDraft(customerEditDraftFromCustomer(customer, customerName || ""));
    setIsEditingCustomer(true);
  };

  const saveCustomerEdit = async () => {
    if (!row.customer?.id) return;
    const payload = trimCustomerDraft(customerDraft);
    if (!payload.name && !payload.company) {
      toast.error("نام مشتری یا نام شرکت را وارد کنید.");
      return;
    }
    setIsSavingCustomer(true);
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(row.customer.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error?.message || "بروزرسانی مشتری ناموفق بود.");
      }
      await loadCurrentUserRecords();
      setIsEditingCustomer(false);
      toast.success("اطلاعات مشتری بروزرسانی شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بروزرسانی مشتری ناموفق بود.");
    } finally {
      setIsSavingCustomer(false);
    }
  };

  return (
    <>
      <div className="grid grid-flow-row-dense grid-cols-2 gap-2" data-testid={`daily-status-${surface}-base-info-${row.id}`}>
        <DailyBaseInfoBox label="کد محموله" testId={testId("code")}>
          <Link to={row.links.shipmentDetailUrl} className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline">
            <span className="truncate font-mono" dir="ltr">{displayValue(base?.code || row.shipment.code)}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </Link>
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label="مشتری" testId={testId("customer")}>
          {customerDisplay ? (
            <button
              type="button"
              data-testid={testId("customer-button")}
              className="inline-flex max-w-full items-center gap-1 text-right text-primary underline-offset-4 hover:underline"
              onClick={() => setDialog("customer")}
            >
              <span className="truncate">{displayValue(customerDisplay)}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </button>
          ) : (
            displayValue(customerDisplay)
          )}
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label="وضعیت محموله" testId={testId("status")}>
          {isEdit ? (
            <Select value={baseDraft.status || row.shipment.status} onValueChange={(next) => onBaseInfoChange?.("status", next as ShipmentStatus)}>
              <SelectTrigger data-testid={`${testId("status")}-select`} className="h-9 w-full rounded-lg bg-background text-xs font-bold">
                <span className="truncate">{shipmentStatusLabel(baseDraft.status || row.shipment.status)}</span>
              </SelectTrigger>
              <SelectContent className="bg-card text-foreground" dir="rtl">
                {SHIPMENT_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            displayValue(baseStatusText(row))
          )}
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label="مرحله فعلی" testId={testId("current-stage")}>
          {isEdit ? (
            renderTextEditor("currentStage", "current-stage", { multiline: true })
          ) : (
            <p className="whitespace-pre-wrap">{displayValue(base?.currentStage || row.workflow?.currentStepLabel)}</p>
          )}
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label="شماره ثبت سفارش" testId={testId("order-registration-number")}>
          {isEdit ? renderTextEditor("orderRegistrationNumber", "order-registration-number", { dir: "ltr" }) : (
            <span dir="ltr">{displayValue(base?.orderRegistrationNumber || row.kootaj.orderRegistrationNumber)}</span>
          )}
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label={credential.label} testId={testId("business-credential")}>
          {canOpenCredential ? (
            <button
              type="button"
              data-testid={testId("business-credential-button")}
              className="inline-flex max-w-full items-center gap-1 text-right text-primary underline-offset-4 hover:underline"
              onClick={() => setDialog("credential")}
            >
              <span className="truncate">{displayValue(credential.displayName)}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </button>
          ) : (
            displayValue(credential.displayName)
          )}
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label="تعداد اسناد" testId={testId("document-count")}>
          {toPersianDigits(base?.documentCount ?? row.documents.totalCount)}
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label="مبدا" testId={testId("origin")}>
          {displayValue(base?.origin || row.shipment.origin)}
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label="بندر تحویل" testId={testId("delivery-port")}>
          {displayValue(base?.deliveryPort || row.shipment.destination)}
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label="محل تخلیه" testId={testId("discharge-port")}>
          {displayValue(base?.dischargePort)}
        </DailyBaseInfoBox>
        <DailyBaseInfoBox label="آخرین به روز رسانی" wide testId={testId("last-update")}>
          <p>{displayValue(formatDate(base?.updatedAt || row.kootaj.updatedAt || row.shipment.updatedAt))}</p>
          <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">توسط {displayValue(base?.updatedByName)}</p>
        </DailyBaseInfoBox>
      </div>

      <Dialog open={dialog === "customer"} onOpenChange={(open) => {
        if (!open) {
          setDialog(null);
          setIsEditingCustomer(false);
        }
      }}>
        <DialogContent data-testid={`daily-status-${surface}-customer-dialog-${row.id}`} className="max-h-[90vh] overflow-y-auto rounded-xl border-border bg-card p-4 text-right text-foreground sm:max-w-xl" dir="rtl">
          <DialogHeader className="gap-1 border-b border-border/60 pb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-black">
              <Package className="h-4 w-4 text-primary" />
              {displayValue(customerIdentifier)}
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
            <div data-testid={`daily-status-${surface}-customer-active-shipments-${row.id}`} className="grid gap-1.5">
              {(activeCustomerShipments.length ? activeCustomerShipments : [{
                id: row.id,
                trackingNumber: base?.code || row.shipment.code,
                origin: row.shipment.origin,
                destination: row.shipment.destination,
                status: row.shipment.status as Shipment["status"],
              }]).map((item) => (
                <Link
                  key={item.id}
                  to={`/shipments/${item.id}`}
                  className="group rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-right hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => setDialog(null)}
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
                    {[item.origin, item.destination].filter(Boolean).join(" ← ") || EMPTY_TEXT}
                  </p>
                </Link>
              ))}
            </div>
            {currentUser?.role === "CEO" && row.links.customerDetailUrl ? (
              <Button asChild variant="outline" size="sm" className="mt-2 h-8 rounded-lg text-[11px] font-black">
                <Link to={row.links.customerDetailUrl} onClick={() => setDialog(null)}>باز کردن صفحه مشتری</Link>
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "credential"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent data-testid={`daily-status-${surface}-business-credential-dialog-${row.id}`} className="max-h-[90vh] overflow-y-auto rounded-xl border-border bg-card p-4 text-right text-foreground sm:max-w-xl" dir="rtl">
          {credential.type === "commercial_card" ? (
            <>
              <DialogHeader className="gap-1 border-b border-border/60 pb-3">
                <DialogTitle className="flex items-center gap-2 text-sm font-black">
                  <CreditCard className="h-4 w-4 text-primary" />
                  {displayValue(commercialCardDisplayName(linkedCommercialCard) || credential.displayName)}
                </DialogTitle>
                <DialogDescription className="text-right text-[11px] font-bold text-muted-foreground">
                  اطلاعات کارت بازرگانی لینک شده به محموله
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <DialogFactRow label="شماره کارت" value={linkedCommercialCard?.cardNumber || row.commercialCard?.cardNumber} />
                <DialogFactRow label="تاریخ صدور" value={formatShamsiDateForDialog(linkedCommercialCard?.issueDate)} />
                <DialogFactRow label="تاریخ انقضا" value={formatShamsiDateForDialog(linkedCommercialCard?.expirationDate)} />
                <DialogFactRow label="شناسه ملی" value={linkedCommercialCard?.nationalId} />
                <DialogFactRow label="اسناد" value={toPersianDigits(linkedCommercialCard?.documents?.length || 0)} />
                {linkedCommercialCard?.description ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
                    <p className="text-[10px] font-black text-muted-foreground">توضیحات</p>
                    <p className="mt-1 text-[11px] font-bold leading-5 text-foreground">{linkedCommercialCard.description}</p>
                  </div>
                ) : null}
                <div className="pt-1">
                  <p className="mb-1.5 text-[10px] font-black text-muted-foreground">مخاطبین</p>
                  <CompactContactList
                    contacts={(linkedCommercialCard?.contacts || []) as BusinessEntityContact[]}
                    emptyText="مخاطبی برای این کارت ثبت نشده است."
                    testId={`daily-status-${surface}-business-credential-contacts-${row.id}`}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="gap-1 border-b border-border/60 pb-3">
                <DialogTitle className="flex items-center gap-2 text-sm font-black">
                  <Anchor className="h-4 w-4 text-primary" />
                  {displayValue(malvaniDisplayName(linkedMalvaniProfile) || credential.displayName)}
                </DialogTitle>
                <DialogDescription className="text-right text-[11px] font-bold text-muted-foreground">
                  اطلاعات ملوانی لینک شده به محموله
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <DialogFactRow label="نام ناخدا" value={linkedMalvaniProfile?.captainName} />
                <DialogFactRow label="نام لنج" value={linkedMalvaniProfile?.lenjName} />
                <DialogFactRow label="شماره/شناسه لنج" value={linkedMalvaniProfile?.lenjRegistrationNumber} />
                <DialogFactRow label="نوع لنج" value={linkedMalvaniProfile?.lenjType} />
                <DialogFactRow label="بندر اصلی" value={linkedMalvaniProfile?.homePort} />
                <DialogFactRow label="وضعیت" value={linkedMalvaniProfile ? malvaniActiveStatusLabels[linkedMalvaniProfile.activeStatus] || linkedMalvaniProfile.activeStatus : null} />
                {linkedMalvaniProfile?.note ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
                    <p className="text-[10px] font-black text-muted-foreground">یادداشت</p>
                    <p className="mt-1 text-[11px] font-bold leading-5 text-foreground">{linkedMalvaniProfile.note}</p>
                  </div>
                ) : null}
                <div className="pt-1">
                  <p className="mb-1.5 text-[10px] font-black text-muted-foreground">مخاطبین</p>
                  <CompactContactList
                    contacts={(linkedMalvaniProfile?.contacts || []) as BusinessEntityContact[]}
                    emptyText="مخاطبی برای این ملوانی ثبت نشده است."
                    testId={`daily-status-${surface}-business-credential-contacts-${row.id}`}
                  />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DailyGoodsInfoPanel({ row, surface }: { row: DailyStatusBoardRow; surface: "desktop" | "mobile" }) {
  const goods = row.baseInfo?.goods;
  const rows = goods?.goodsRows || [];
  const containerParts = [
    goods?.container20Count ? ["کانتینر ۲۰ فوت", formatDailyNumber(goods.container20Count)] : null,
    goods?.container40Count ? ["کانتینر ۴۰ فوت", formatDailyNumber(goods.container40Count)] : null,
  ].filter(Boolean) as Array<[string, string]>;
  return (
    <div className="space-y-2.5" data-testid={`daily-status-${surface}-goods-v2-${row.id}`}>
      {containerParts.length ? (
        <div className="grid grid-cols-2 gap-2">
          {containerParts.map(([label, value]) => (
            <React.Fragment key={label}>
              <ReadField label={label} value={value} />
            </React.Fragment>
          ))}
        </div>
      ) : null}
      {rows.length ? (
        <div className="space-y-2">
          {rows.map((item, index) => (
            <div key={`${item.description}-${index}`} className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs">
              <div className="flex min-w-0 items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                  {(index + 1).toLocaleString("fa-IR")}
                </span>
                <p className="min-w-0 flex-1 break-words font-black leading-5 text-foreground">{item.description}</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                {[
                  ["تعداد", formatDailyNumber(item.quantity)],
                  ["وزن", formatDailyNumber(item.weight)],
                  ["CBM", formatDailyNumber(item.cbm)],
                  ["PCS", formatDailyNumber(item.pcs)],
                  ["بسته‌بندی", item.packagingType],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-md bg-background/80 px-2 py-1">
                    <p className="truncate text-[9px] font-black text-muted-foreground">{label}</p>
                    <p className="mt-0.5 truncate text-[11px] font-black text-foreground">{displayValue(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5" data-testid={`daily-status-${surface}-goods-total-${row.id}`}>
            <p className="text-[10px] font-black text-primary">مجموع</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {[
                ["تعداد", formatDailyNumber(goods?.totalQuantity), "quantity"],
                ["وزن", formatDailyNumber(goods?.totalWeight), "weight"],
                ["CBM", formatDailyNumber(goods?.totalCbm), "cbm"],
                ["PCS", formatDailyNumber(goods?.totalPcs), "pcs"],
              ].map(([label, value, key]) => (
                <div key={key} className="min-w-0 rounded-md bg-background/80 px-2 py-1" data-testid={`daily-status-${surface}-goods-total-${key}-${row.id}`}>
                  <p className="truncate text-[9px] font-black text-muted-foreground">{label}</p>
                  <p className="mt-0.5 truncate text-[11px] font-black text-foreground">{displayValue(value)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-2.5 text-[11px] font-bold leading-5 text-muted-foreground">
          <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>هنوز کالایی در V2 ثبت نشده است.</span>
        </div>
      )}
    </div>
  );
}

function DailyV2DetailSection({
  row,
  surface,
  id,
  title,
  children,
}: {
  row: DailyStatusBoardRow;
  surface: "desktop" | "mobile";
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details open className="rounded-lg border border-border bg-card" data-testid={`daily-status-${surface}-section-${id}-${row.id}`}>
      <summary className="cursor-pointer px-3 py-2 text-xs font-black text-foreground">
        {title}
      </summary>
      <div className="border-t border-border p-3">
        {children}
      </div>
    </details>
  );
}

function DailyDeclarationKootajPanel({ row }: { row: DailyStatusBoardRow }) {
  const declaration = row.v2Profile?.sections?.declarationKootaj || {};
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <ReadField label="شماره کوتاژ" value={declaration.cotageNumber || row.kootaj.cotageNumber} />
      <ReadField label="مسیر گمرکی" value={v2RouteLabel(declaration.customsRoute) || rowRouteLabel(row)} />
      <ReadField label="تاریخ ثبت کوتاژ" value={v2DisplayDate(declaration.cotageRegistrationDate) || row.kootaj.cotageDate} />
      <ReadField label="ارزش کل" value={v2MoneyValue(declaration.totalValueAmount, declaration.totalValueCurrency)} />
      <ReadField label="مبلغ نهایی پرداختی" value={v2MoneyValue(declaration.finalPaidAmount, declaration.finalPaidCurrency)} />
    </div>
  );
}

function DailyPermitsPanel({ row }: { row: DailyStatusBoardRow }) {
  const permitRows = row.v2Profile?.sections?.permits?.permitRows || [];
  if (!permitRows.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2.5 text-[11px] font-bold text-muted-foreground">
        ثبت نشده
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {permitRows.map((permit, index) => (
        <div key={`${permit.permitName}-${index}`} className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
            {(index + 1).toLocaleString("fa-IR")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-[11px] font-black leading-5 text-foreground sm:text-xs">{permit.permitName}</p>
            <p className="mt-0.5 break-words text-[10px] font-bold leading-4 text-muted-foreground">
              وضعیت: {displayValue(permit.permitState)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyPaymentsPanel({ row }: { row: DailyStatusBoardRow }) {
  const payments = row.v2Profile?.sections?.payments || {};
  const taxAmount =
    payments.customsTaxStatus === "GOOD_STANDING"
      ? 0
      : payments.customsTaxAmount ?? row.kootaj.taxAmount;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <ReadField label="پرداخت گمرکی" value={v2PaymentStateLabel(payments.customsPaymentPaid)} />
      <ReadField label="مبلغ گمرکی" value={v2MoneyValue(payments.customsAmount ?? row.kootaj.dutiesAmount, payments.customsAmountCurrency)} />
      <ReadField label="مابه‌التفاوت گمرکی" value={v2MoneyValue(payments.customsDifferenceAmount, payments.customsDifferenceCurrency)} />
      <ReadField label="پرداخت مابه‌التفاوت" value={v2PaymentStateLabel(payments.customsDifferencePaid)} />
      <ReadField label="وضعیت مالیات" value={v2TaxStatusLabel(payments.customsTaxStatus) || optionLabel(taxPaymentStatusOptions, row.kootaj.taxPaymentStatus)} />
      <ReadField label="مبلغ مالیات" value={v2MoneyValue(taxAmount, payments.customsTaxCurrency)} />
    </div>
  );
}

function DailyBankingPanel({ row }: { row: DailyStatusBoardRow }) {
  const banking = row.v2Profile?.sections?.banking || {};
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <ReadField label="بانک" value={banking.bankName || row.kootaj.bankName} />
      <ReadField label="کد شعبه" value={banking.branchCode} />
      <ReadField label="نام شعبه" value={banking.branchName} />
      <ReadField label="کد ابزار پرداخت" value={banking.paymentInstrumentCode} />
      <ReadField label="کد ساتا" value={banking.sataCode} />
    </div>
  );
}

function DailyNotesPanel({ row }: { row: DailyStatusBoardRow }) {
  const notes = row.v2Profile?.sections?.notes || {};
  return (
    <ReadField label="یادداشت‌ها" value={notes.internalNote || row.kootaj.internalNote} wide />
  );
}

function DailyKootajV2Details({
  row,
  surface,
  customers,
  shipments,
  commercialCards,
  malvaniProfiles,
}: {
  row: DailyStatusBoardRow;
  surface: "desktop" | "mobile";
  customers: Customer[];
  shipments: Shipment[];
  commercialCards: CommercialCard[];
  malvaniProfiles: MalvaniProfile[];
}) {
  return (
    <>
      <DailyV2DetailSection row={row} surface={surface} id="base" title="اطلاعات پایه">
        <DailyBaseInfoGrid
          row={row}
          surface={surface}
          customers={customers}
          shipments={shipments}
          commercialCards={commercialCards}
          malvaniProfiles={malvaniProfiles}
        />
      </DailyV2DetailSection>
      <DailyV2DetailSection row={row} surface={surface} id="goods-v2" title="مشخصات کالا">
        <DailyGoodsInfoPanel row={row} surface={surface} />
      </DailyV2DetailSection>
      <DailyV2DetailSection row={row} surface={surface} id="declarationKootaj" title="اظهار و کوتاژ">
        <DailyDeclarationKootajPanel row={row} />
      </DailyV2DetailSection>
      <DailyV2DetailSection row={row} surface={surface} id="permits" title="مجوزها">
        <DailyPermitsPanel row={row} />
      </DailyV2DetailSection>
      <DailyV2DetailSection row={row} surface={surface} id="payments" title="پرداخت‌ها">
        <DailyPaymentsPanel row={row} />
      </DailyV2DetailSection>
      <DailyV2DetailSection row={row} surface={surface} id="banking" title="بانکی">
        <DailyBankingPanel row={row} />
      </DailyV2DetailSection>
      <DailyV2DetailSection row={row} surface={surface} id="notes" title="یادداشت‌ها">
        <DailyNotesPanel row={row} />
      </DailyV2DetailSection>
    </>
  );
}

function renderEditor({
  row,
  field,
  draft,
  commercialCards,
  onDraftChange,
  onCustomDraftChange,
  prefix,
}: {
  row: DailyStatusBoardRow;
  field: IranImportProfileField;
  draft: DailyStatusPatch;
  commercialCards: CommercialCard[];
  onDraftChange: (field: keyof DailyStatusPatch, value: string | null) => void;
  onCustomDraftChange: (fieldKey: string, value: string | null) => void;
  prefix: string;
}) {
  if (field.customFieldKey) {
    const customKey = field.customFieldKey;
    const value = draft.customFields?.[customKey];
    if (field.type === "select") {
      return (
        <SelectField
          value={value as string | null}
          options={field.options || []}
          onChange={(next) => onCustomDraftChange(customKey, next)}
          testId={`${prefix}-select`}
        />
      );
    }
    if (field.type === "date") {
      const normalized = normalizeIsoDateForInput(value as string | null);
      return (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input
              type="date"
              value={normalized}
              onChange={(event) => onCustomDraftChange(customKey, event.target.value || null)}
              className="h-9 rounded-lg bg-background text-xs font-bold"
              dir="ltr"
              data-testid={`${prefix}-input`}
            />
            <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => onCustomDraftChange(customKey, null)} aria-label="پاک کردن تاریخ">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground">ذخیره به صورت YYYY-MM-DD</p>
        </div>
      );
    }
    if (field.type === "textarea") {
      return (
        <textarea
          value={String(value || "")}
          onChange={(event) => onCustomDraftChange(customKey, event.target.value)}
          className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs font-bold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          data-testid={`${prefix}-input`}
        />
      );
    }
    return (
      <Input
        type={field.type === "number" ? "number" : "text"}
        min={field.type === "number" ? 0 : undefined}
        value={String(value ?? "")}
        onChange={(event) => onCustomDraftChange(customKey, event.target.value)}
        className="h-9 rounded-lg bg-background text-xs font-bold"
        dir={field.dir || "rtl"}
        data-testid={`${prefix}-input`}
      />
    );
  }
  if (!field.patchKey) return null;
  const patchKey = field.patchKey;
  const value = draft[patchKey];
  if (field.type === "commercialCard") {
    return (
      <Select value={(value as string) || NONE_VALUE} onValueChange={(next) => onDraftChange(patchKey, next === NONE_VALUE ? null : next)}>
        <SelectTrigger data-testid={`${prefix}-select`} className="h-9 w-full rounded-lg bg-background text-xs font-bold">
          <span className="truncate">{commercialCardLabel(row, commercialCards, value as string | null)}</span>
        </SelectTrigger>
        <SelectContent className="bg-card text-foreground" dir="rtl">
          <SelectItem value={NONE_VALUE}>بدون کارت</SelectItem>
          {selectableCommercialCards(commercialCards).map((card) => (
            <SelectItem key={card.id} value={card.id}>
              {card.holderName || card.cardNumber} {card.cardNumber ? `(${card.cardNumber})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "select") {
    return (
      <SelectField
        value={value as string | null}
        options={field.options || commonStatusOptions}
        onChange={(next) => onDraftChange(patchKey, next)}
        testId={`${prefix}-select`}
      />
    );
  }
  if (field.type === "date") {
    const normalized = normalizeIsoDateForInput(value as string | null);
    return (
      <div className="space-y-1">
        <div className="flex gap-2">
          <Input
            type="date"
            value={normalized}
            onChange={(event) => onDraftChange(patchKey, event.target.value || null)}
            className="h-9 rounded-lg bg-background text-xs font-bold"
            dir="ltr"
            data-testid={`${prefix}-input`}
          />
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => onDraftChange(patchKey, null)} aria-label="پاک کردن تاریخ">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] font-bold text-muted-foreground">ذخیره به صورت YYYY-MM-DD</p>
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        value={String(value || "")}
        onChange={(event) => onDraftChange(patchKey, event.target.value)}
        className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs font-bold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        data-testid={`${prefix}-input`}
      />
    );
  }
  return (
    <Input
      type={field.type === "number" ? "number" : "text"}
      min={field.type === "number" ? 0 : undefined}
      step={field.step}
      value={String(value ?? "")}
      onChange={(event) => onDraftChange(patchKey, event.target.value)}
      className="h-9 rounded-lg bg-background text-xs font-bold"
      dir={field.dir || "rtl"}
      data-testid={`${prefix}-input`}
    />
  );
}

function RowDetailsPanel({
  row,
  mode,
  surface,
  draft,
  sections,
  commercialCards,
  customers,
  shipments,
  malvaniProfiles,
  isSaving,
  onModeChange,
  onDraftChange,
  onBaseInfoChange,
  onCustomDraftChange,
  onCancel,
  onSave,
}: {
  row: DailyStatusBoardRow;
  mode: ActiveMode;
  surface: "desktop" | "mobile";
  draft: DailyStatusPatch;
  sections: IranImportProfileSection[];
  commercialCards: CommercialCard[];
  customers: Customer[];
  shipments: Shipment[];
  malvaniProfiles: MalvaniProfile[];
  isSaving: boolean;
  onModeChange: (mode: ActiveMode) => void;
  onDraftChange: (field: keyof DailyStatusPatch, value: string | null) => void;
  onBaseInfoChange: (field: DailyBaseInfoDraftKey, value: string | null) => void;
  onCustomDraftChange: (fieldKey: string, value: string | null) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const isEdit = mode === "edit";
  const panelHeightClass = surface === "desktop" ? "h-[calc(100dvh-5rem)]" : "max-h-[75dvh]";
  const panelTestId = (name: string) => `daily-status-${surface}-${name}-${row.id}`;
  const shipmentCode = row.baseInfo?.code || row.shipment.code;
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-primary/15 bg-primary/5", panelHeightClass)} data-testid={panelTestId(`${mode}-panel`)}>
      <div className="shrink-0 p-3 pb-3 md:p-4 md:pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">
              {isEdit ? "ویرایش وضعیت روزانه" : "جزئیات وضعیت روزانه"} {shipmentCode}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isEdit ? (
              <Button size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => onModeChange("edit")} data-testid={panelTestId("edit-from-details")}>
                <Edit3 className="ml-1 h-3.5 w-3.5" />
                ویرایش
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={onCancel} disabled={isSaving}>
              <X className="ml-1 h-3.5 w-3.5" />
              بستن
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 md:px-4 md:pb-4">
        <div className="space-y-3">
          {isEdit ? (
            sections.map((section) => (
              <details key={section.id} open={Boolean(section.defaultOpen)} className="rounded-lg border border-border bg-card" data-testid={`daily-status-${surface}-section-${section.id}-${row.id}`}>
                <summary className="cursor-pointer px-3 py-2 text-xs font-black text-foreground">
                  {section.title}
                </summary>
                <div className="border-t border-border p-3">
                  {section.id === "base" ? (
                    <DailyBaseInfoGrid
                      row={row}
                      surface={surface}
                      customers={customers}
                      shipments={shipments}
                      commercialCards={commercialCards}
                      malvaniProfiles={malvaniProfiles}
                      mode="edit"
                      draft={draft}
                      onBaseInfoChange={onBaseInfoChange}
                    />
                  ) : section.id === "goods-v2" ? (
                    <DailyGoodsInfoPanel row={row} surface={surface} />
                  ) : section.id === "permits" ? (
                    <DailyPermitsPanel row={row} />
                  ) : section.fields.length > 0 ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      {section.fields.map((field) => (
                        <React.Fragment key={field.key}>
                          {field.editable ? (
                            <FormInput label={field.label} wide={field.wide}>
                              {renderEditor({
                                row,
                                field,
                                draft,
                                commercialCards,
                                onDraftChange,
                                onCustomDraftChange,
                                prefix: `daily-status-${surface}-${field.key}-${row.id}`,
                              })}
                            </FormInput>
                          ) : (
                            <ReadField
                              label={field.label}
                              value={renderProfileValue(row, draft, field, true)}
                              wide={field.wide}
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2.5 text-[11px] font-bold text-muted-foreground">
                      ثبت نشده
                    </div>
                  )}
                </div>
              </details>
            ))
          ) : (
            <DailyKootajV2Details
              row={row}
              surface={surface}
              customers={customers}
              shipments={shipments}
              commercialCards={commercialCards}
              malvaniProfiles={malvaniProfiles}
            />
          )}
        </div>
      </div>

      {isEdit ? (
        <div className="shrink-0 p-3 pt-0 md:p-4 md:pt-0">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs font-black" onClick={onCancel} disabled={isSaving}>
              <X className="ml-1 h-4 w-4" />
              انصراف
            </Button>
            <Button size="sm" className="h-9 rounded-lg text-xs font-black" onClick={onSave} disabled={isSaving} data-testid={panelTestId("save")}>
              {isSaving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}
              ذخیره
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  value,
  allLabel,
  options,
  onChange,
  widthClass,
  testId,
}: {
  value?: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  widthClass?: string;
  testId?: string;
}) {
  return (
    <Select value={value || ALL_VALUE} onValueChange={onChange}>
      <SelectTrigger className={cn("h-10 rounded-lg bg-background text-xs font-bold", widthClass)} data-testid={testId}>
        <span className="truncate">{value ? labelForOption(options, value) : allLabel}</span>
      </SelectTrigger>
      <SelectContent className="bg-card text-foreground" dir="rtl">
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CompactRow({
  row,
  isActive,
  onOpen,
}: {
  row: DailyStatusBoardRow;
  isActive: boolean;
  onOpen: (mode: ActiveMode) => void;
}) {
  const credential = credentialInfo(row);
  const shipmentCode = row.baseInfo?.code || row.shipment.code;
  const customerDisplay = rowCustomerCode(row);
  const statusText = baseStatusText(row);
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 transition", isActive && "border-primary/40 bg-primary/5")} data-testid={`daily-status-row-${row.id}`}>
      <div className="grid gap-3">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="min-h-[58px] min-w-0 rounded-lg border border-border bg-background px-2.5 py-2">
            <Link to={row.links.shipmentDetailUrl} className="inline-flex max-w-full items-center gap-1 truncate text-sm font-black text-primary">
              <span className="truncate">{shipmentCode}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </Link>
            <p className="mt-1 truncate text-[10px] font-bold text-muted-foreground">کد محموله / شماره پرونده</p>
          </div>
          <CompactFact label="مشتری" value={customerDisplay} />
          <div className="min-h-[58px] min-w-0 rounded-lg border border-border bg-background px-2.5 py-2">
            <p className="truncate text-[10px] font-bold text-muted-foreground">وضعیت محموله</p>
            <div className="mt-1">{statusBadge(row.shipment.status, statusText)}</div>
          </div>
          <CompactFact label="مرحله فعلی" value={row.baseInfo?.currentStage || row.workflow?.currentStepLabel} />
          <CompactFact label="کالا و بسته‌بندی" value={goodsCompactSummary(row)} />
          <div className="min-h-[58px] min-w-0 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2">
            <p className="truncate text-[10px] font-bold text-muted-foreground">کوتاژ و اظهارنامه</p>
            <p className="mt-1 truncate text-xs font-black text-foreground">{displayValue(row.kootaj.cotageNumber)}</p>
            <p className="mt-0.5 truncate text-[10px] font-bold text-muted-foreground">{displayValue(row.kootaj.declarationReference || row.kootaj.customsOffice)}</p>
          </div>
          <CompactFact label="شماره ثبت سفارش" value={row.baseInfo?.orderRegistrationNumber || row.kootaj.orderRegistrationNumber} />
          <CompactFact label={credential.label} value={credential.displayName} />
          <div className="min-h-[58px] min-w-0 rounded-lg border border-border bg-background px-2.5 py-2">
            <p className="truncate text-[10px] font-bold text-muted-foreground">گمرک / ترخیص</p>
            <div className="mt-1 flex min-w-0 flex-wrap gap-1">
              {statusPill("گمرک", row.kootaj.customsStatus, customsStatusOptions)}
              {statusPill("ترخیص", row.kootaj.releaseStatus, releaseStatusOptions)}
            </div>
          </div>
          <CompactFact label="مسیر گمرکی" value={rowRouteLabel(row)} />
          <CompactFact label="آخرین بروزرسانی" value={formatDate(row.baseInfo?.updatedAt || row.kootaj.updatedAt || row.shipment.updatedAt)} />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/70 pt-2">
          <Button size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => onOpen("view")} data-testid={`daily-status-details-${row.id}`}>
            جزئیات / ویرایش
          </Button>
          <Button variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => onOpen("edit")} data-testid={`daily-status-edit-${row.id}`}>
            <Edit3 className="ml-1 h-3.5 w-3.5" />
            ویرایش
          </Button>
        </div>
      </div>
    </div>
  );
}

function MobileCard({
  row,
  isActive,
  activeMode,
  draft,
  sections,
  commercialCards,
  customers,
  shipments,
  malvaniProfiles,
  isSaving,
  onOpen,
  onModeChange,
  onDraftChange,
  onBaseInfoChange,
  onCustomDraftChange,
  onCancel,
  onSave,
}: {
  row: DailyStatusBoardRow;
  isActive: boolean;
  activeMode: ActiveMode;
  draft: DailyStatusPatch;
  sections: IranImportProfileSection[];
  commercialCards: CommercialCard[];
  customers: Customer[];
  shipments: Shipment[];
  malvaniProfiles: MalvaniProfile[];
  isSaving: boolean;
  onOpen: (mode: ActiveMode) => void;
  onModeChange: (mode: ActiveMode) => void;
  onDraftChange: (field: keyof DailyStatusPatch, value: string | null) => void;
  onBaseInfoChange: (field: DailyBaseInfoDraftKey, value: string | null) => void;
  onCustomDraftChange: (fieldKey: string, value: string | null) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const credential = credentialInfo(row);
  const shipmentCode = row.baseInfo?.code || row.shipment.code;
  const customerDisplay = rowCustomerCode(row);
  const statusText = baseStatusText(row);
  return (
    <div className="rounded-lg border border-border bg-card p-3" data-testid={`daily-status-mobile-card-${row.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={row.links.shipmentDetailUrl} className="inline-flex max-w-full items-center gap-1 truncate text-sm font-black text-primary">
            <span className="truncate">{shipmentCode}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </Link>
          <p className="mt-1 truncate text-xs font-bold text-muted-foreground">{customerDisplay || "مشتری ثبت نشده"}</p>
        </div>
        {statusBadge(row.shipment.status, statusText)}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ReadField label="مرحله فعلی" value={row.baseInfo?.currentStage || row.workflow?.currentStepLabel} />
        <ReadField label="کالا و بسته‌بندی" value={goodsCompactSummary(row)} />
        <ReadField label="مسیر گمرکی" value={rowRouteLabel(row)} />
        <ReadField label="شماره کوتاژ" value={row.kootaj.cotageNumber} />
        <ReadField label="اظهارنامه" value={row.kootaj.declarationReference} />
        <ReadField label="گمرک" value={row.kootaj.customsOffice} />
        <ReadField label="شماره ثبت سفارش" value={row.baseInfo?.orderRegistrationNumber || row.kootaj.orderRegistrationNumber} />
        <ReadField label={credential.label} value={credential.displayName} />
        <ReadField label="وضعیت گمرک" value={optionLabel(customsStatusOptions, row.kootaj.customsStatus)} />
        <ReadField label="وضعیت ترخیص" value={optionLabel(releaseStatusOptions, row.kootaj.releaseStatus)} />
        <ReadField label="آخرین بروزرسانی" value={formatDate(row.baseInfo?.updatedAt || row.kootaj.updatedAt || row.shipment.updatedAt)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => onOpen("view")} data-testid={`daily-status-mobile-details-${row.id}`}>
          جزئیات / ویرایش
        </Button>
        <Button variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => onOpen("edit")} data-testid={`daily-status-mobile-edit-${row.id}`}>
          ویرایش
        </Button>
      </div>

      {isActive ? (
        <div className="mt-3">
          <RowDetailsPanel
            row={row}
            mode={activeMode}
            surface="mobile"
            draft={draft}
            sections={sections}
            commercialCards={commercialCards}
            customers={customers}
            shipments={shipments}
            malvaniProfiles={malvaniProfiles}
            isSaving={isSaving}
            onModeChange={onModeChange}
            onDraftChange={onDraftChange}
            onBaseInfoChange={onBaseInfoChange}
            onCustomDraftChange={onCustomDraftChange}
            onCancel={onCancel}
            onSave={onSave}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function DailyStatus() {
  const commercialCards = useAppStore((state) => state.commercialCards);
  const customers = useAppStore((state) => state.customers);
  const shipments = useAppStore((state) => state.shipments);
  const [rows, setRows] = React.useState<DailyStatusBoardRow[]>([]);
  const [filters, setFilters] = React.useState<DailyStatusListFilters>({ limit: 50 });
  const [searchText, setSearchText] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [malvaniProfiles, setMalvaniProfiles] = React.useState<MalvaniProfile[]>([]);
  const [activeRowId, setActiveRowId] = React.useState<string | null>(null);
  const [activeMode, setActiveMode] = React.useState<ActiveMode>("view");
  const [draft, setDraft] = React.useState<DailyStatusPatch>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);
  const [customsStatusFilter, setCustomsStatusFilter] = React.useState("");
  const [releaseStatusFilter, setReleaseStatusFilter] = React.useState("");
  const hasLoadedRowsRef = React.useRef(false);

  const visibleRows = React.useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !rowSearchText(row).includes(query)) return false;
      if (customsStatusFilter && row.kootaj.customsStatus !== customsStatusFilter) return false;
      if (releaseStatusFilter && row.kootaj.releaseStatus !== releaseStatusFilter) return false;
      return true;
    });
  }, [rows, searchText, customsStatusFilter, releaseStatusFilter]);

  const activeRow = React.useMemo(() => rows.find((row) => row.id === activeRowId) || null, [rows, activeRowId]);
  const sectionsForRow = React.useCallback((row: DailyStatusBoardRow | null) => dailyStatusSectionsForRow(row), []);
  const fieldsForRow = React.useCallback((row: DailyStatusBoardRow | null) => flattenProfileSections(sectionsForRow(row)), [sectionsForRow]);

  const loadRows = React.useCallback(async (nextFilters: DailyStatusListFilters = { limit: 50 }) => {
    setLoading(true);
    try {
      const data = await dailyStatusApi.list(nextFilters);
      const shouldAutoSelectFirstRow = !hasLoadedRowsRef.current;
      setRows(data);
      setActiveRowId((current) => (
        current && data.some((row) => row.id === current)
          ? current
          : shouldAutoSelectFirstRow
            ? data[0]?.id || null
            : null
      ));
      if (shouldAutoSelectFirstRow && data[0]) setDraft(draftFromRow(data[0], fieldsForRow(data[0])));
      hasLoadedRowsRef.current = true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بارگیری وضعیت روزانه ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [fieldsForRow]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadRows({ ...filters, q: searchText || undefined });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchText, filters, loadRows]);

  React.useEffect(() => {
    loadRows({ limit: 50 });
  }, [loadRows]);

  React.useEffect(() => {
    businessEntitiesApi.listMalvaniProfiles()
      .then(setMalvaniProfiles)
      .catch((error) => {
        console.error("Malvani profiles failed:", error);
      });
  }, []);

  React.useEffect(() => {
    if (activeRow) setDraft(draftFromRow(activeRow, fieldsForRow(activeRow)));
  }, [activeRow, fieldsForRow]);

  const openRow = (row: DailyStatusBoardRow, mode: ActiveMode) => {
    setActiveRowId(row.id);
    setActiveMode(mode);
    setDraft(draftFromRow(row, fieldsForRow(row)));
  };

  const closeRow = () => {
    setActiveRowId(null);
    setActiveMode("view");
    setDraft({});
  };

  const changeDraft = (field: keyof DailyStatusPatch, value: string | null) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const changeBaseInfoDraft = (field: DailyBaseInfoDraftKey, value: string | null) => {
    setDraft((current) => ({
      ...current,
      baseInfo: {
        ...(current.baseInfo || {}),
        [field]: field === "status" ? value as ShipmentStatus : value,
      },
    }));
  };

  const changeCustomDraft = (fieldKey: string, value: string | null) => {
    setDraft((current) => ({
      ...current,
      customFields: {
        ...(current.customFields || {}),
        [fieldKey]: value,
      },
    }));
  };

  const saveRow = async (row: DailyStatusBoardRow) => {
    setSavingId(row.id);
    try {
      const updated = await dailyStatusApi.update(row.id, cleanPatch(draft, fieldsForRow(row), row));
      setRows((current) => current.map((item) => item.id === updated.id ? updated : item));
      setActiveRowId(updated.id);
      setActiveMode("view");
      setDraft(draftFromRow(updated, fieldsForRow(updated)));
      toast.success("وضعیت روزانه بروزرسانی شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره وضعیت روزانه ناموفق بود.");
    } finally {
      setSavingId(null);
    }
  };

  const setFilterValue = (key: keyof DailyStatusListFilters, value: string) => {
    const nextFilters = {
      ...filters,
      [key]: value === ALL_VALUE ? undefined : value,
    };
    setFilters(nextFilters);
  };

  const clearFilters = () => {
    const nextFilters = { limit: 50 };
    setSearchText("");
    setCustomsStatusFilter("");
    setReleaseStatusFilter("");
    setFilters(nextFilters);
    loadRows(nextFilters);
  };

  const refreshRows = () => loadRows({ ...filters, q: searchText || undefined });
  const hasFilters = Boolean(searchText || filters.customsRoute || filters.shipmentStatus || customsStatusFilter || releaseStatusFilter);
  const totalOpenTasks = visibleRows.reduce((sum, row) => sum + row.tasks.openCount, 0);
  const withCotage = visibleRows.filter((row) => row.kootaj.cotageNumber).length;
  const blockedRows = visibleRows.filter((row) => row.kootaj.customsStatus === "blocked" || row.kootaj.releaseStatus === "blocked").length;

  const filterControls = (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="daily-status-shipment-status-filters">
        <Button
          type="button"
          variant={!filters.shipmentStatus ? "default" : "outline"}
          size="sm"
          className="h-8 rounded-lg px-2.5 text-[10px] font-black"
          data-testid="daily-status-shipment-status-filter-ALL"
          onClick={() => setFilterValue("shipmentStatus", ALL_VALUE)}
        >
          همه محموله‌ها
        </Button>
        {SHIPMENT_STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={filters.shipmentStatus === option.value ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-lg px-2.5 text-[10px] font-black"
            data-testid={`daily-status-shipment-status-filter-${option.value}`}
            onClick={() => setFilterValue("shipmentStatus", option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <FilterSelect value={filters.customsRoute} allLabel="همه مسیرها" options={routeOptions} onChange={(value) => setFilterValue("customsRoute", value)} widthClass="w-full lg:w-36" />
      <FilterSelect value={customsStatusFilter} allLabel="همه وضعیت‌های گمرکی" options={customsStatusOptions} onChange={(value) => setCustomsStatusFilter(value === ALL_VALUE ? "" : value)} widthClass="w-full lg:w-44" testId="daily-status-customs-status-filter" />
      <FilterSelect value={releaseStatusFilter} allLabel="همه وضعیت‌های ترخیص" options={releaseStatusOptions} onChange={(value) => setReleaseStatusFilter(value === ALL_VALUE ? "" : value)} widthClass="w-full lg:w-44" testId="daily-status-release-status-filter" />
    </>
  );

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-background p-3 text-foreground md:p-4 lg:p-6" dir="rtl" data-testid="daily-status-page">
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-4">
        <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black tracking-normal text-foreground">وضعیت روزانه</h1>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
            <SummaryTile label="ردیف‌ها" value={visibleRows.length} />
            <SummaryTile label="کوتاژ ثبت‌شده" value={withCotage} />
            <SummaryTile label="وظایف باز" value={totalOpenTasks} />
            <SummaryTile label="متوقف" value={blockedRows} />
          </div>
        </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-sm" data-testid="daily-status-toolbar">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="جستجو در محموله، مشتری، کوتاژ، اظهارنامه یا کارت بازرگانی"
                className="h-10 rounded-lg pr-9 text-xs font-bold"
                data-testid="daily-status-search"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg text-xs font-black lg:hidden"
              onClick={() => setShowMobileFilters((value) => !value)}
              data-testid="daily-status-mobile-filter-toggle"
            >
              <Filter className="ml-1 h-4 w-4" />
              فیلترها
            </Button>

            <div className="hidden min-w-0 flex-wrap items-center gap-2 lg:flex">
              {filterControls}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-10 rounded-lg text-xs font-black" onClick={clearFilters} disabled={!hasFilters}>
                <X className="ml-1 h-4 w-4" />
                پاکسازی
              </Button>
              <Button variant="outline" className="h-10 rounded-lg text-xs font-black" onClick={refreshRows} disabled={loading}>
                <RefreshCw className={cn("ml-1 h-4 w-4", loading && "animate-spin")} />
                بروزرسانی
              </Button>
            </div>
          </div>

          {showMobileFilters ? (
            <div className="mt-3 grid gap-2 border-t border-border pt-3 lg:hidden" data-testid="daily-status-mobile-filters">
              {filterControls}
            </div>
          ) : null}
        </div>

        <div className="hidden min-w-0 gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]" data-testid="daily-status-operations-layout">
          <div className="min-w-0 space-y-2" data-testid="daily-status-compact-list">
            {loading && rows.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center text-sm font-bold text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                در حال بارگیری وضعیت روزانه
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <p className="text-sm font-black text-foreground">ردیفی برای نمایش نیست</p>
                <p className="mt-2 text-xs font-bold text-muted-foreground">فیلترها را تغییر دهید یا محموله جدید ثبت کنید.</p>
              </div>
            ) : (
              visibleRows.map((row) => (
                <React.Fragment key={row.id}>
                  <CompactRow
                    row={row}
                    isActive={activeRowId === row.id}
                    onOpen={(mode) => openRow(row, mode)}
                  />
                </React.Fragment>
              ))
            )}
          </div>
          <aside className="min-w-0 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto" data-testid="daily-status-detail-panel">
            {activeRow ? (
              <RowDetailsPanel
                row={activeRow}
                mode={activeMode}
                surface="desktop"
                draft={draft}
                sections={sectionsForRow(activeRow)}
                commercialCards={commercialCards}
                customers={customers}
                shipments={shipments}
                malvaniProfiles={malvaniProfiles}
            isSaving={savingId === activeRow.id}
            onModeChange={setActiveMode}
            onDraftChange={changeDraft}
            onBaseInfoChange={changeBaseInfoDraft}
            onCustomDraftChange={changeCustomDraft}
            onCancel={closeRow}
            onSave={() => saveRow(activeRow)}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-xs font-bold text-muted-foreground">
                یک محموله را برای مشاهده جزئیات انتخاب کنید.
              </div>
            )}
          </aside>
        </div>

        <div className="space-y-3 lg:hidden" data-testid="daily-status-mobile-list">
          {loading && rows.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm font-bold text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              در حال بارگیری وضعیت روزانه
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm font-black text-foreground">ردیفی برای نمایش نیست</p>
              <p className="mt-2 text-xs font-bold text-muted-foreground">فیلترها را تغییر دهید یا محموله جدید ثبت کنید.</p>
            </div>
          ) : (
            visibleRows.map((row) => (
              <React.Fragment key={row.id}>
                <MobileCard
                  row={row}
                  isActive={activeRowId === row.id}
                  activeMode={activeMode}
                  draft={draft}
                  sections={sectionsForRow(row)}
                  commercialCards={commercialCards}
                  customers={customers}
                  shipments={shipments}
                  malvaniProfiles={malvaniProfiles}
                  isSaving={savingId === row.id}
                  onOpen={(mode) => openRow(row, mode)}
                  onModeChange={setActiveMode}
                  onDraftChange={changeDraft}
                  onBaseInfoChange={changeBaseInfoDraft}
                  onCustomDraftChange={changeCustomDraft}
                  onCancel={closeRow}
                  onSave={() => saveRow(row)}
                />
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
