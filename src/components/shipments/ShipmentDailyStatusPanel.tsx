import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns-jalali";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Edit,
  ExternalLink,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  customsStatusOptions,
  commonStatusOptions,
  labelForOption,
  releaseStatusOptions,
  routeOptions,
} from "@/src/app/dailyStatusColumns";
import {
  iranImportDateFieldKeys,
  iranImportEditableFields,
  iranImportFieldTypeLabel,
  iranImportNumberFieldKeys,
  iranImportProfileSections,
  iranImportSectionTitle,
  flattenProfileSections,
  profileSectionsFromTemplate,
  type IranImportProfileField,
  type IranImportProfileSection,
} from "@/src/components/shipments/iranImportProfileFields";
import { toPersianDigits } from "@/src/components/ShamsiDateTimeField";
import { dailyStatusApi } from "@/src/lib/dailyStatusApi";
import { shipmentFormTemplatesApi } from "@/src/lib/shipmentFormTemplatesApi";
import { cn } from "@/lib/utils";
import { useMockStore } from "@/src/store/useMockStore";
import type { CommercialCard, DailyStatusBoardRow, DailyStatusKootajProfile, DailyStatusPatch } from "@/src/types";

const NONE_VALUE = "__none__";
const EMPTY_TEXT = "هنوز ثبت نشده";
const PROFILE_TITLE = "اطلاعات واردات، کوتاژ و ترخیص";

const shipmentStatusLabels: Record<string, string> = {
  PENDING: "در انتظار",
  BOOKED: "رزرو شده",
  IN_TRANSIT: "در مسیر",
  ARRIVED: "رسیده",
  CUSTOMS: "گمرک",
  CLEARED: "ترخیص شده",
  DELIVERED: "تحویل شده",
  CLOSED: "بسته شده",
};

type ShipmentDailyStatusPanelProps = {
  shipmentId: string;
  shipmentCode?: string;
  shipmentStatus?: string;
  customerName?: string;
  origin?: string;
  destination?: string;
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

function formatJalaliDate(value?: string | null) {
  const normalized = normalizeIsoDateForInput(value);
  if (!normalized) return "";
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return toPersianDigits(format(date, "yyyy/MM/dd"));
}

function formatJalaliDateTime(value?: string | null) {
  if (!value) return EMPTY_TEXT;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return toPersianDigits(format(date, "yyyy/MM/dd HH:mm"));
}

function displayValue(value?: React.ReactNode) {
  if (value === null || value === undefined || value === "") return EMPTY_TEXT;
  return value;
}

function editableProfileFields(fields: IranImportProfileField[]) {
  return fields.filter((field) => field.editable && (field.patchKey || field.customFieldKey));
}

function normalizeCustomDraftValue(field: IranImportProfileField, value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (field.type === "number") {
    if (value === "") return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : value;
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return field.type === "date" ? normalizeIsoDateForInput(trimmed) || trimmed : trimmed;
}

function draftFromRow(row: DailyStatusBoardRow, fields: IranImportProfileField[] = iranImportEditableFields): DailyStatusPatch {
  const draft: DailyStatusPatch = {};
  const writableDraft = draft as Record<string, unknown>;
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
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : value;
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return iranImportDateFieldKeys.has(field) ? normalizeIsoDateForInput(trimmed) || trimmed : trimmed;
}

function cleanDraft(draft: DailyStatusPatch, fields: IranImportProfileField[] = iranImportEditableFields): DailyStatusPatch {
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
  return patch;
}

function cleanNewProfileDraft(draft: DailyStatusPatch, fields: IranImportProfileField[] = iranImportEditableFields): DailyStatusPatch {
  const cleaned = cleanDraft(draft, fields) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of editableProfileFields(fields)) {
    if (field.customFieldKey) {
      const value = (cleaned.customFields as Record<string, unknown> | undefined)?.[field.customFieldKey];
      if (value === undefined || value === null || value === "") continue;
      patch.customFields = {
        ...((patch.customFields as Record<string, unknown>) || {}),
        [field.customFieldKey]: value,
      };
      continue;
    }
    if (!field.patchKey) continue;
    const value = cleaned[field.patchKey];
    if (value === undefined || value === null || value === "") continue;
    patch[field.patchKey] = value;
  }
  return patch as DailyStatusPatch;
}

function emptyKootajProfile(fields: IranImportProfileField[] = iranImportEditableFields): DailyStatusKootajProfile {
  const profile: Record<string, unknown> = {
    customFields: {},
    taxPaymentStatus: null,
    updatedAt: null,
    updatedById: null,
  };
  for (const field of editableProfileFields(fields)) {
    if (field.customFieldKey) {
      (profile.customFields as Record<string, unknown>)[field.customFieldKey] = "";
      continue;
    }
    const patchKey = field.patchKey;
    if (!patchKey) continue;
    if (field.type === "number" || field.type === "date" || field.type === "select" || field.type === "commercialCard") {
      profile[patchKey] = null;
    } else {
      profile[patchKey] = "";
    }
  }
  return profile as unknown as DailyStatusKootajProfile;
}

function createEmptyDailyStatusRow({
  shipmentId,
  shipmentCode,
  shipmentStatus,
  customerName,
  origin,
  destination,
}: ShipmentDailyStatusPanelProps): DailyStatusBoardRow {
  return {
    id: shipmentId,
    shipment: {
      id: shipmentId,
      code: shipmentCode || shipmentId,
      status: shipmentStatus || "PENDING",
      origin: origin || "",
      destination: destination || "",
      assignedManagerId: null,
      assignedManagerName: "",
      updatedAt: new Date(0).toISOString(),
    },
    customer: customerName ? { id: "", name: customerName } : null,
    kootaj: emptyKootajProfile(),
    commercialCard: null,
    workflow: null,
    tasks: {
      openCount: 0,
      overdueCount: 0,
      assignedUserNames: [],
    },
    documents: {
      totalCount: 0,
      customerVisibleCount: 0,
      missingRequiredCount: 0,
    },
    links: {
      shipmentDetailUrl: `/shipments/${encodeURIComponent(shipmentId)}`,
      customerDetailUrl: null,
      commercialCardDetailUrl: null,
    },
  };
}

function changedPatch(row: DailyStatusBoardRow, draft: DailyStatusPatch, fields: IranImportProfileField[] = iranImportEditableFields): DailyStatusPatch {
  const before = cleanDraft(draftFromRow(row, fields), fields) as Record<string, unknown>;
  const after = cleanDraft(draft, fields) as Record<string, unknown>;
  const patch: DailyStatusPatch = {};
  const writablePatch = patch as Record<string, unknown>;
  for (const field of editableProfileFields(fields)) {
    if (field.customFieldKey) {
      const beforeValue = ((before.customFields as Record<string, unknown> | undefined)?.[field.customFieldKey]) ?? null;
      const afterValue = ((after.customFields as Record<string, unknown> | undefined)?.[field.customFieldKey]) ?? null;
      if (beforeValue !== afterValue) {
        writablePatch.customFields = {
          ...((writablePatch.customFields as Record<string, unknown>) || {}),
          [field.customFieldKey]: afterValue,
        };
      }
      continue;
    }
    if (!field.patchKey) continue;
    const beforeValue = before[field.patchKey] ?? null;
    const afterValue = after[field.patchKey] ?? null;
    if (beforeValue !== afterValue) writablePatch[field.patchKey] = afterValue;
  }
  return patch;
}

function fieldIsComplete(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function optionLabel(options: Array<{ value: string; label: string }>, value?: string | null) {
  return value ? labelForOption(options, value) || value : EMPTY_TEXT;
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

function readonlyValue(row: DailyStatusBoardRow, key: string) {
  switch (key) {
    case "shipmentCode":
      return row.shipment.code;
    case "customerName":
      return row.customer?.name;
    case "shipmentStatus":
      return shipmentStatusLabels[row.shipment.status] || row.shipment.status;
    case "workflowStep":
      return row.workflow?.currentStepLabel;
    case "workflowRoute":
      return optionLabel(routeOptions, row.workflow?.route);
    case "documentCount":
      return `${toPersianDigits(row.documents.customerVisibleCount)}/${toPersianDigits(row.documents.totalCount)}`;
    case "taskCount":
      return toPersianDigits(row.tasks.openCount);
    case "profileUpdatedAt":
      return formatJalaliDateTime(row.kootaj.updatedAt);
    case "commercialCardDisplay":
      return row.commercialCard?.displayName || row.kootaj.commercialCardId;
    default:
      return "";
  }
}

function rawEditableValue(row: DailyStatusBoardRow, draft: DailyStatusPatch, field: IranImportProfileField, preferDraft = false) {
  if (field.customFieldKey) {
    return preferDraft ? draft.customFields?.[field.customFieldKey] : row.kootaj.customFields?.[field.customFieldKey];
  }
  const patchKey = field.patchKey;
  if (!patchKey) return "";
  if (preferDraft) return draft[patchKey];
  if (patchKey === "commercialCardId") return row.kootaj.commercialCardId || row.commercialCard?.id || null;
  return row.kootaj[patchKey as keyof typeof row.kootaj];
}

function renderDisplayValue(row: DailyStatusBoardRow, draft: DailyStatusPatch, field: IranImportProfileField, preferDraft = false) {
  if (field.customFieldKey) {
    const value = rawEditableValue(row, draft, field, preferDraft);
    if (field.type === "date") return value ? `${value} (${formatJalaliDate(String(value))})` : "";
    if (field.type === "select") return optionLabel(field.options || [], value as string | null);
    if (field.type === "number" && value !== null && value !== undefined && value !== "") return toPersianDigits(String(value));
    return value as React.ReactNode;
  }
  if (!field.editable || !field.patchKey) return readonlyValue(row, field.key);
  const value = rawEditableValue(row, draft, field, preferDraft);
  if (field.patchKey === "commercialCardId") return row.commercialCard?.displayName || value;
  if (field.type === "date") return value ? `${value} (${formatJalaliDate(String(value))})` : "";
  if (field.type === "select") return optionLabel(field.options || [], value as string | null);
  if (field.type === "number" && value !== null && value !== undefined && value !== "") return toPersianDigits(String(value));
  return value as React.ReactNode;
}

function completionForFields(row: DailyStatusBoardRow, draft: DailyStatusPatch, fields: IranImportProfileField[]) {
  const completeCount = fields.filter((item) => {
    if (item.customFieldKey) return fieldIsComplete(normalizeCustomDraftValue(item, draft.customFields?.[item.customFieldKey]));
    if (item.editable && item.patchKey) return fieldIsComplete(normalizePatchValue(item.patchKey, draft[item.patchKey]));
    return fieldIsComplete(readonlyValue(row, item.key));
  }).length;
  const totalCount = fields.length;
  return {
    completeCount,
    totalCount,
    percent: totalCount ? Math.round((completeCount / totalCount) * 100) : 0,
  };
}

function ReadField({
  label,
  value,
  badge,
  wide,
  testId,
}: {
  label: string;
  value?: React.ReactNode;
  badge?: string;
  wide?: boolean;
  testId?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-border bg-background px-3 py-2", wide && "md:col-span-2 xl:col-span-3")} data-testid={testId}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-[11px] font-black text-muted-foreground">{label}</p>
        {badge ? <Badge variant="outline" className="shrink-0 text-[10px] font-black">{badge}</Badge> : null}
      </div>
      <p className="mt-1 min-h-5 whitespace-pre-wrap break-words text-xs font-black leading-6 text-foreground">
        {displayValue(value)}
      </p>
    </div>
  );
}

function FormField({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", wide && "md:col-span-2 xl:col-span-3")}>
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
  testId: string;
}) {
  return (
    <Select value={value || NONE_VALUE} onValueChange={(next) => onChange(next === NONE_VALUE ? null : next)}>
      <SelectTrigger data-testid={testId} className="h-10 w-full rounded-lg bg-background text-xs font-black">
        <span className="truncate">{value ? labelForOption(options, value) || value : EMPTY_TEXT}</span>
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

function DateField({
  value,
  onChange,
  testId,
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
  testId: string;
}) {
  const normalized = normalizeIsoDateForInput(value);
  const jalali = formatJalaliDate(normalized);
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          type="date"
          value={normalized}
          onChange={(event) => onChange(event.target.value || null)}
          className="h-10 rounded-lg bg-background text-xs font-black"
          dir="ltr"
          data-testid={testId}
        />
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-lg" onClick={() => onChange(null)} aria-label="پاک کردن تاریخ">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground" data-testid={`${testId}-jalali`}>
        <CalendarDays className="h-3.5 w-3.5" />
        {jalali ? `نمایش شمسی: ${jalali}` : "نمایش شمسی پس از انتخاب تاریخ"}
      </p>
    </div>
  );
}

function normalizeSearchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[كي]/g, (letter) => (letter === "ك" ? "ک" : "ی"))
    .replace(/ى/g, "ی")
    .trim();
}

function fieldSearchText(field: IranImportProfileField, sectionTitle: string) {
  return normalizeSearchText([
    field.key,
    field.patchKey,
    field.customFieldKey,
    field.label,
    field.englishLabel,
    sectionTitle,
    ...(field.aliases || []),
  ].filter(Boolean).join(" "));
}

export function ShipmentDailyStatusPanel({
  shipmentId,
  shipmentCode,
  shipmentStatus,
  customerName,
  origin,
  destination,
}: ShipmentDailyStatusPanelProps) {
  const commercialCards = useMockStore((state) => state.commercialCards);
  const [row, setRow] = React.useState<DailyStatusBoardRow | null>(null);
  const [draft, setDraft] = React.useState<DailyStatusPatch>({});
  const [loading, setLoading] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [fieldSearch, setFieldSearch] = React.useState("");
  const [quickFieldKey, setQuickFieldKey] = React.useState<string | null>(null);
  const [profileSections, setProfileSections] = React.useState<IranImportProfileSection[]>(iranImportProfileSections);
  const fieldRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [openSectionIds, setOpenSectionIds] = React.useState<Set<string>>(
    () => new Set(iranImportProfileSections.filter((section) => section.defaultOpen).map((section) => section.id))
  );
  const profileFields = React.useMemo(() => flattenProfileSections(profileSections), [profileSections]);
  const emptyRow = React.useMemo(() => createEmptyDailyStatusRow({
    shipmentId,
    shipmentCode,
    shipmentStatus,
    customerName,
    origin,
    destination,
  }), [customerName, destination, origin, shipmentCode, shipmentId, shipmentStatus]);
  const activeRow = row || emptyRow;

  const loadDailyStatus = React.useCallback(async () => {
    setLoading(true);
    try {
      const [data, activeTemplate] = await Promise.all([
        dailyStatusApi.getForShipment(shipmentId),
        shipmentFormTemplatesApi.getForShipment(shipmentId).catch((error) => {
          console.error("Shipment form template failed:", error);
          return null;
        }),
      ]);
      const nextSections = profileSectionsFromTemplate(activeTemplate?.template || null, "shipmentDetail");
      const nextFields = flattenProfileSections(nextSections);
      setProfileSections(nextSections);
      setOpenSectionIds(new Set(nextSections.filter((section) => section.defaultOpen).map((section) => section.id)));
      setRow(data);
      setDraft(draftFromRow(data, nextFields));
      setIsEditing(false);
    } catch (error) {
      console.error("Shipment daily status failed:", error);
      setRow(null);
      setDraft(draftFromRow(emptyRow));
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  }, [emptyRow, shipmentId]);

  React.useEffect(() => {
    loadDailyStatus();
  }, [loadDailyStatus]);

  const pendingPatch = React.useMemo(() => row ? changedPatch(row, draft, profileFields) : cleanNewProfileDraft(draft, profileFields), [row, draft, profileFields]);
  const isDirty = Object.keys(pendingPatch).length > 0;
  const allFields = profileFields;
  const overallCompletion = React.useMemo(
    () => completionForFields(activeRow, draft, allFields),
    [activeRow, allFields, draft]
  );
  const searchResults = React.useMemo(() => {
    const query = normalizeSearchText(fieldSearch);
    if (!query) return [];
    return profileFields
      .filter((field) => {
        const sectionTitle = profileSections.find((section) => section.id === field.sectionId)?.title || iranImportSectionTitle(field.sectionId);
        return fieldSearchText(field, sectionTitle).includes(query);
      })
      .slice(0, 8);
  }, [fieldSearch, profileFields, profileSections]);
  const quickField = React.useMemo(
    () => profileFields.find((field) => field.key === quickFieldKey) || null,
    [profileFields, quickFieldKey]
  );

  React.useEffect(() => {
    if (!isEditing || !isDirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isEditing]);

  const changeDraft = (field: keyof DailyStatusPatch, value: string | number | null) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const changeCustomDraft = (fieldKey: string, value: string | number | null) => {
    setDraft((current) => ({
      ...current,
      customFields: {
        ...(current.customFields || {}),
        [fieldKey]: value,
      },
    }));
  };

  const handleSectionToggle = (sectionId: string, open: boolean) => {
    setOpenSectionIds((current) => {
      const next = new Set(current);
      if (open) next.add(sectionId);
      else next.delete(sectionId);
      return next;
    });
  };

  const startEditing = () => {
    setDraft(draftFromRow(activeRow, profileFields));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(draftFromRow(activeRow, profileFields));
    setIsEditing(!row);
    setQuickFieldKey(null);
  };

  const focusField = (field: IranImportProfileField) => {
    window.setTimeout(() => {
      const container = fieldRefs.current[field.key];
      container?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = container?.querySelector("input, textarea, button, [tabindex]") as HTMLElement | null;
      focusable?.focus();
    }, 50);
  };

  const openField = (field: IranImportProfileField) => {
    setOpenSectionIds((current) => {
      const next = new Set(current);
      next.add(field.sectionId);
      return next;
    });
    if (field.editable && !isEditing) {
      setDraft(draftFromRow(activeRow, profileFields));
      setIsEditing(true);
    }
    setQuickFieldKey(field.key);
    focusField(field);
  };

  const saveDailyStatus = async () => {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      const updated = await dailyStatusApi.updateFromShipmentDetail(activeRow.id, pendingPatch);
      setRow(updated);
      setDraft(draftFromRow(updated, profileFields));
      setIsEditing(false);
      toast.success("اطلاعات واردات، کوتاژ و ترخیص ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره اطلاعات واردات ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveQuickField = async () => {
    if (!quickField?.patchKey && !quickField?.customFieldKey) return;
    if (quickField.customFieldKey) {
      const fieldKey = quickField.customFieldKey;
      const patchValue = normalizeCustomDraftValue(quickField, draft.customFields?.[fieldKey]);
      const beforeValue = row?.kootaj.customFields?.[fieldKey] ?? null;
      if ((patchValue ?? null) === (beforeValue ?? null)) {
        setQuickFieldKey(null);
        return;
      }
      setIsSaving(true);
      try {
        const updated = await dailyStatusApi.updateFromShipmentDetail(activeRow.id, { customFields: { [fieldKey]: patchValue ?? null } });
        setRow(updated);
        setDraft(draftFromRow(updated, profileFields));
        setQuickFieldKey(null);
        toast.success("فیلد انتخاب شده ذخیره شد.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "ذخیره فیلد ناموفق بود.");
      } finally {
        setIsSaving(false);
      }
      return;
    }
    const patchKey = quickField.patchKey;
    if (!patchKey) return;
    const patchValue = normalizePatchValue(patchKey, draft[patchKey]);
    const beforeValue = row ? normalizePatchValue(patchKey, draftFromRow(row, profileFields)[patchKey]) : null;
    if ((patchValue ?? null) === (beforeValue ?? null)) {
      setQuickFieldKey(null);
      return;
    }
    setIsSaving(true);
    try {
      const updated = await dailyStatusApi.updateFromShipmentDetail(activeRow.id, { [patchKey]: patchValue ?? null } as DailyStatusPatch);
      setRow(updated);
      setDraft(draftFromRow(updated, profileFields));
      setQuickFieldKey(null);
      toast.success("فیلد انتخاب‌شده ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره فیلد ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderEditor = (field: IranImportProfileField, prefix = `shipment-daily-status-${field.key}`) => {
    if (field.customFieldKey) {
      const customKey = field.customFieldKey;
      const customValue = draft.customFields?.[customKey];
      const testId = prefix;
      if (field.type === "select") {
        return (
          <SelectField
            value={customValue as string | null}
            options={field.options || []}
            onChange={(next) => changeCustomDraft(customKey, next)}
            testId={`${testId}-select`}
          />
        );
      }
      if (field.type === "date") {
        return <DateField value={customValue as string | null} onChange={(next) => changeCustomDraft(customKey, next)} testId={`${testId}-input`} />;
      }
      if (field.type === "textarea") {
        return (
          <textarea
            value={String(customValue || "")}
            onChange={(event) => changeCustomDraft(customKey, event.target.value)}
            className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs font-bold leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            data-testid={`${testId}-input`}
          />
        );
      }
      return (
        <Input
          type={field.type === "number" ? "number" : "text"}
          min={field.type === "number" ? 0 : undefined}
          step={field.step}
          value={String(customValue ?? "")}
          onChange={(event) => changeCustomDraft(customKey, event.target.value)}
          className="h-10 rounded-lg bg-background text-xs font-black"
          dir={field.dir || "rtl"}
          data-testid={`${testId}-input`}
        />
      );
    }
    if (!field.patchKey) return null;
    const patchKey = field.patchKey;
    const value = draft[patchKey];
    const testId = prefix;
    if (field.type === "commercialCard") {
      return (
        <Select value={(value as string) || NONE_VALUE} onValueChange={(next) => changeDraft(patchKey, next === NONE_VALUE ? null : next)}>
          <SelectTrigger data-testid={`${testId}-select`} className="h-10 w-full rounded-lg bg-background text-xs font-black">
            <span className="truncate">{commercialCardLabel(activeRow, commercialCards, value as string | null)}</span>
          </SelectTrigger>
          <SelectContent className="bg-card text-foreground" dir="rtl">
            <SelectItem value={NONE_VALUE}>بدون کارت</SelectItem>
            {selectableCommercialCards(commercialCards).map((card) => (
              <SelectItem key={card.id} value={card.id}>
                {card.holderName || card.cardNumber || card.id} {card.cardNumber ? `(${card.cardNumber})` : ""}
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
          onChange={(next) => changeDraft(patchKey, next)}
          testId={`${testId}-select`}
        />
      );
    }
    if (field.type === "date") {
      return <DateField value={value as string | null} onChange={(next) => changeDraft(patchKey, next)} testId={`${testId}-input`} />;
    }
    if (field.type === "textarea") {
      return (
        <textarea
          value={String(value || "")}
          onChange={(event) => changeDraft(patchKey, event.target.value)}
          className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs font-bold leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          data-testid={`${testId}-input`}
        />
      );
    }
    return (
      <Input
        type={field.type === "number" ? "number" : "text"}
        min={field.type === "number" ? 0 : undefined}
        step={field.step}
        value={String(value ?? "")}
        onChange={(event) => changeDraft(patchKey, event.target.value)}
        className="h-10 rounded-lg bg-background text-xs font-black"
        dir={field.dir || "rtl"}
        data-testid={`${testId}-input`}
      />
    );
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm" data-testid="shipment-daily-status-panel" dir="rtl">
      <CardHeader className="border-b border-border/50 bg-muted/20 p-4">
        <CardTitle className="flex flex-col gap-3 text-sm font-black sm:flex-row sm:items-center sm:justify-between">
          <span className="flex min-w-0 items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate" data-testid="shipment-daily-status-title">{PROFILE_TITLE}</span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black">
              <Link to="/daily-status">
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
                مشاهده برد
              </Link>
            </Button>
            {!isEditing ? (
              <Button type="button" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={startEditing} data-testid="shipment-daily-status-edit">
                <Edit className="ml-1 h-3.5 w-3.5" />
                ویرایش
              </Button>
            ) : null}
            {isEditing ? (
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={cancelEditing} disabled={isSaving}>
                <X className="ml-1 h-3.5 w-3.5" />
                انصراف
              </Button>
            ) : null}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-xs font-bold text-muted-foreground">
            <RefreshCw className="ml-2 h-4 w-4 animate-spin" />
            در حال بارگیری
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-background p-3" data-testid="shipment-daily-status-progress">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">پیشرفت تکمیل پروفایل واردات</p>
                  <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                    {toPersianDigits(overallCompletion.completeCount)} از {toPersianDigits(overallCompletion.totalCount)} فیلد تکمیل شده
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "w-fit text-[11px] font-black",
                    overallCompletion.percent === 100
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700"
                  )}
                >
                  {overallCompletion.percent === 100 ? "تکمیل شده" : "تکمیل نشده"}
                </Badge>
              </div>
              <Progress value={overallCompletion.percent} className="mt-3 h-2" />
            </div>

            <div className="rounded-lg border border-border bg-background p-3" data-testid="shipment-daily-status-form">
              <Label className="text-[11px] font-black text-muted-foreground">جستجوی سریع فیلد</Label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={fieldSearch}
                  onChange={(event) => setFieldSearch(event.target.value)}
                  placeholder="جستجوی فیلد برای تکمیل اطلاعات..."
                  className="h-10 rounded-lg bg-card pr-9 text-xs font-bold"
                  data-testid="shipment-daily-status-field-search"
                />
              </div>
              {fieldSearch.trim() ? (
                <div className="mt-3 grid gap-2" data-testid="shipment-daily-status-field-search-results">
                  {searchResults.length ? searchResults.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      className="grid gap-2 rounded-lg border border-border bg-card p-3 text-right transition hover:border-primary/40 hover:bg-primary/5 md:grid-cols-[minmax(0,1fr)_140px]"
                      onClick={() => openField(field)}
                      data-testid={`shipment-daily-status-search-result-${field.key}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black text-foreground">{field.label}</span>
                        <span className="mt-1 block truncate text-[11px] font-bold text-muted-foreground">
                          {profileSections.find((section) => section.id === field.sectionId)?.title || iranImportSectionTitle(field.sectionId)}
                        </span>
                        <span className="mt-1 block truncate text-[11px] font-bold text-muted-foreground">
                          {displayValue(renderDisplayValue(activeRow, draft, field, isEditing))}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-start gap-1 md:justify-end">
                        <Badge variant="outline" className="text-[10px] font-black">{iranImportFieldTypeLabel(field.type)}</Badge>
                        <Badge variant="outline" className="text-[10px] font-black">{field.editable ? "قابل ویرایش" : "خودکار"}</Badge>
                      </span>
                    </button>
                  )) : (
                    <div className="rounded-lg border border-dashed border-border p-3 text-xs font-bold text-muted-foreground">
                      نتیجه‌ای پیدا نشد.
                    </div>
                  )}
                </div>
              ) : null}

              {quickField ? (
                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3" data-testid="shipment-daily-status-quick-edit">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-foreground">{quickField.label}</p>
                      <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                        {profileSections.find((section) => section.id === quickField.sectionId)?.title || iranImportSectionTitle(quickField.sectionId)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px] font-black">{iranImportFieldTypeLabel(quickField.type)}</Badge>
                      <Badge variant="outline" className="text-[10px] font-black">{quickField.editable ? "قابل ویرایش" : "خودکار"}</Badge>
                    </div>
                  </div>
                  {quickField.editable ? (
                    <>
                      <FormField label={quickField.label} wide={quickField.wide}>
                        {renderEditor(quickField, `shipment-daily-status-quick-${quickField.key}`)}
                      </FormField>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => setQuickFieldKey(null)} disabled={isSaving}>
                          انصراف
                        </Button>
                        <Button type="button" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={saveQuickField} disabled={isSaving} data-testid="shipment-daily-status-quick-save">
                          {isSaving ? <RefreshCw className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Check className="ml-1 h-3.5 w-3.5" />}
                          ذخیره فیلد
                        </Button>
                      </div>
                    </>
                  ) : (
                    <ReadField label={quickField.label} value={renderDisplayValue(activeRow, draft, quickField, isEditing)} badge="خودکار" />
                  )}
                </div>
              ) : null}
            </div>

            <div className="space-y-3" data-testid="shipment-daily-status-sections">
              {profileSections.map((section) => {
                const sectionCompletion = completionForFields(activeRow, draft, section.fields);
                return (
                  <details
                    key={section.id}
                    open={openSectionIds.has(section.id)}
                    onToggle={(event) => handleSectionToggle(section.id, event.currentTarget.open)}
                    className="group rounded-lg border border-border bg-background"
                    data-testid={`shipment-daily-status-section-${section.id}`}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                        <span className="truncate text-xs font-black text-foreground">{section.title}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-black">
                          {toPersianDigits(sectionCompletion.completeCount)}/{toPersianDigits(sectionCompletion.totalCount)}
                        </Badge>
                        <span className="text-[10px] font-black text-muted-foreground" dir="ltr">{sectionCompletion.percent}%</span>
                      </div>
                    </summary>
                    <div className="border-t border-border p-3">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {section.fields.map((field) => (
                          <div key={field.key} ref={(element) => { fieldRefs.current[field.key] = element; }} className={cn("min-w-0", field.wide && "md:col-span-2 xl:col-span-3")}>
                            {isEditing && field.editable ? (
                              <FormField label={field.label} wide={field.wide}>
                                {renderEditor(field)}
                              </FormField>
                            ) : (
                              <ReadField
                                label={field.label}
                                value={renderDisplayValue(activeRow, draft, field, isEditing)}
                                badge={field.editable ? "قابل ویرایش" : "خودکار"}
                                testId={`shipment-daily-status-${field.key}-value`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>

            {isEditing ? (
              <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t border-border bg-card/95 p-3 backdrop-blur" data-testid="shipment-daily-status-save-footer">
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg text-xs font-black" onClick={cancelEditing} disabled={isSaving}>
                  <X className="ml-1 h-4 w-4" />
                  انصراف
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-lg text-xs font-black"
                  onClick={saveDailyStatus}
                  disabled={isSaving || !isDirty}
                  data-testid="shipment-daily-status-save"
                >
                  {isSaving ? <RefreshCw className="ml-1 h-4 w-4 animate-spin" /> : <Check className="ml-1 h-4 w-4" />}
                  ذخیره تغییرات
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
