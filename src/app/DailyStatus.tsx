import React from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList,
  Edit3,
  ExternalLink,
  Filter,
  Loader2,
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
  commonStatusOptions,
  customsStatusOptions,
  labelForOption,
  releaseStatusOptions,
  routeOptions,
  taxPaymentStatusOptions,
} from "@/src/app/dailyStatusColumns";
import {
  iranImportDateFieldKeys,
  iranImportEditableFields,
  iranImportFieldTypeLabel,
  iranImportNumberFieldKeys,
  flattenProfileSections,
  profileSectionsFromTemplate,
  type IranImportProfileField,
  type IranImportProfileSection,
} from "@/src/components/shipments/iranImportProfileFields";
import { toPersianDigits } from "@/src/components/ShamsiDateTimeField";
import { dailyStatusApi, type DailyStatusListFilters } from "@/src/lib/dailyStatusApi";
import { shipmentFormTemplatesApi, type ShipmentFormTemplate } from "@/src/lib/shipmentFormTemplatesApi";
import { cn } from "@/lib/utils";
import { useMockStore } from "@/src/store/useMockStore";
import type { CommercialCard, DailyStatusBoardRow, DailyStatusPatch } from "@/src/types";

const ALL_VALUE = "__all__";
const NONE_VALUE = "__none__";
const EMPTY_TEXT = "ثبت نشده";

type ActiveMode = "view" | "edit";

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

function optionLabel(options: Array<{ value: string; label: string }>, value?: string | null) {
  return value ? labelForOption(options, value) || value : EMPTY_TEXT;
}

function statusBadge(status: string) {
  const tone: Record<string, string> = {
    CLEARED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
    DELIVERED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
    CUSTOMS: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    IN_TRANSIT: "border-sky-500/20 bg-sky-500/10 text-sky-700",
    CLOSED: "border-rose-500/20 bg-rose-500/10 text-rose-700",
  };
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap text-[11px] font-black", tone[status])}>
      {shipmentStatusLabels[status] || status}
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

function cleanPatch(draft: DailyStatusPatch, fields: IranImportProfileField[] = iranImportEditableFields): DailyStatusPatch {
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
      return formatDate(row.kootaj.updatedAt);
    case "commercialCardDisplay":
      return row.commercialCard?.displayName || row.kootaj.commercialCardId;
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

function rowExitOrCustomsLabel(row: DailyStatusBoardRow) {
  return optionLabel(releaseStatusOptions, row.kootaj.releaseStatus) || optionLabel(customsStatusOptions, row.kootaj.customsStatus);
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background px-3 py-2">
      <p className="truncate text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-black text-foreground">{value}</p>
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
          {commercialCards.map((card) => (
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
  isSaving,
  onModeChange,
  onDraftChange,
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
  isSaving: boolean;
  onModeChange: (mode: ActiveMode) => void;
  onDraftChange: (field: keyof DailyStatusPatch, value: string | null) => void;
  onCustomDraftChange: (fieldKey: string, value: string | null) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const isEdit = mode === "edit";
  const panelHeightClass = surface === "desktop" ? "max-h-[calc(100dvh-15.5rem)]" : "max-h-[75dvh]";
  const panelTestId = (name: string) => `daily-status-${surface}-${name}-${row.id}`;
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-primary/15 bg-primary/5", panelHeightClass)} data-testid={panelTestId(`${mode}-panel`)}>
      <div className="shrink-0 p-3 pb-3 md:p-4 md:pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">
              {isEdit ? "ویرایش وضعیت روزانه" : "جزئیات وضعیت روزانه"} {row.shipment.code}
            </p>
            <p className="mt-1 text-[11px] font-bold text-muted-foreground">
              داده‌های محموله، مشتری، workflow، اسناد و وظایف از ماژول‌های اصلی خوانده می‌شوند.
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
          {sections.map((section) => (
            <details key={section.id} open={Boolean(section.defaultOpen)} className="rounded-lg border border-border bg-card" data-testid={`daily-status-${surface}-section-${section.id}-${row.id}`}>
              <summary className="cursor-pointer px-3 py-2 text-xs font-black text-foreground">
                {section.title}
              </summary>
              <div className="grid gap-2 border-t border-border p-3 md:grid-cols-2">
                {section.fields.map((field) => (
                  <React.Fragment key={field.key}>
                    {isEdit && field.editable ? (
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
                        value={renderProfileValue(row, draft, field, isEdit)}
                        wide={field.wide}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </details>
          ))}
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
}: {
  value?: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  widthClass?: string;
}) {
  return (
    <Select value={value || ALL_VALUE} onValueChange={onChange}>
      <SelectTrigger className={cn("h-10 rounded-lg bg-background text-xs font-bold", widthClass)}>
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
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 transition", isActive && "border-primary/40 bg-primary/5")} data-testid={`daily-status-row-${row.id}`}>
      <div className="grid gap-3">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="min-h-[58px] min-w-0 rounded-lg border border-border bg-background px-2.5 py-2">
            <Link to={row.links.shipmentDetailUrl} className="inline-flex max-w-full items-center gap-1 truncate text-sm font-black text-primary">
              <span className="truncate">{row.shipment.code}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </Link>
            <p className="mt-1 truncate text-[10px] font-bold text-muted-foreground">کد محموله / شماره پرونده</p>
          </div>
          <CompactFact label="مشتری" value={row.customer?.name} />
          <div className="min-h-[58px] min-w-0 rounded-lg border border-border bg-background px-2.5 py-2">
            <p className="truncate text-[10px] font-bold text-muted-foreground">وضعیت محموله</p>
            <div className="mt-1">{statusBadge(row.shipment.status)}</div>
          </div>
          <CompactFact label="مرحله فعلی" value={row.workflow?.currentStepLabel} />
          <CompactFact label="مسیر گمرکی" value={rowRouteLabel(row)} />
          <CompactFact label="شماره کوتاژ" value={row.kootaj.cotageNumber} />
          <CompactFact label="کارت بازرگانی" value={row.commercialCard?.displayName} />
          <CompactFact label="وضعیت خروج/گمرک" value={rowExitOrCustomsLabel(row)} />
          <CompactFact label="آخرین بروزرسانی" value={formatDate(row.kootaj.updatedAt || row.shipment.updatedAt)} />
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
  isSaving,
  onOpen,
  onModeChange,
  onDraftChange,
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
  isSaving: boolean;
  onOpen: (mode: ActiveMode) => void;
  onModeChange: (mode: ActiveMode) => void;
  onDraftChange: (field: keyof DailyStatusPatch, value: string | null) => void;
  onCustomDraftChange: (fieldKey: string, value: string | null) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3" data-testid={`daily-status-mobile-card-${row.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={row.links.shipmentDetailUrl} className="inline-flex max-w-full items-center gap-1 truncate text-sm font-black text-primary">
            <span className="truncate">{row.shipment.code}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </Link>
          <p className="mt-1 truncate text-xs font-bold text-muted-foreground">{row.customer?.name || "مشتری ثبت نشده"}</p>
        </div>
        {statusBadge(row.shipment.status)}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ReadField label="مرحله فعلی" value={row.workflow?.currentStepLabel} />
        <ReadField label="مسیر گمرکی" value={rowRouteLabel(row)} />
        <ReadField label="شماره کوتاژ" value={row.kootaj.cotageNumber} />
        <ReadField label="کارت بازرگانی" value={row.commercialCard?.displayName} />
        <ReadField label="وضعیت خروج/گمرک" value={rowExitOrCustomsLabel(row)} />
        <ReadField label="آخرین بروزرسانی" value={formatDate(row.kootaj.updatedAt || row.shipment.updatedAt)} />
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
            isSaving={isSaving}
            onModeChange={onModeChange}
            onDraftChange={onDraftChange}
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
  const commercialCards = useMockStore((state) => state.commercialCards);
  const [rows, setRows] = React.useState<DailyStatusBoardRow[]>([]);
  const [filters, setFilters] = React.useState<DailyStatusListFilters>({ limit: 50 });
  const [searchText, setSearchText] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [activeRowId, setActiveRowId] = React.useState<string | null>(null);
  const [activeMode, setActiveMode] = React.useState<ActiveMode>("view");
  const [draft, setDraft] = React.useState<DailyStatusPatch>({});
  const [templates, setTemplates] = React.useState<ShipmentFormTemplate[]>([]);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);
  const hasLoadedRowsRef = React.useRef(false);

  const activeRow = React.useMemo(() => rows.find((row) => row.id === activeRowId) || null, [rows, activeRowId]);
  const templateByType = React.useMemo(
    () => new Map(templates.map((template) => [template.shipmentTypeCode, template])),
    [templates]
  );
  const sectionsForRow = React.useCallback((row: DailyStatusBoardRow | null) => {
    const template = row ? templateByType.get(row.shipment.shipmentTypeCode || "") : null;
    return profileSectionsFromTemplate(template, "dailyStatus");
  }, [templateByType]);
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
    shipmentFormTemplatesApi.list()
      .then(setTemplates)
      .catch((error) => {
        console.error("Shipment form templates failed:", error);
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
      const updated = await dailyStatusApi.update(row.id, cleanPatch(draft, fieldsForRow(row)));
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
    setFilters(nextFilters);
    loadRows(nextFilters);
  };

  const refreshRows = () => loadRows({ ...filters, q: searchText || undefined });
  const hasFilters = Boolean(searchText || filters.customsRoute || filters.customsStatus || filters.releaseStatus);
  const totalOpenTasks = rows.reduce((sum, row) => sum + row.tasks.openCount, 0);
  const withCotage = rows.filter((row) => row.kootaj.cotageNumber).length;
  const blockedRows = rows.filter((row) => row.kootaj.customsStatus === "blocked" || row.kootaj.releaseStatus === "blocked").length;

  const filterControls = (
    <>
      <FilterSelect value={filters.customsRoute} allLabel="همه مسیرها" options={routeOptions} onChange={(value) => setFilterValue("customsRoute", value)} widthClass="w-full lg:w-36" />
      <FilterSelect value={filters.customsStatus} allLabel="همه وضعیت‌ها" options={customsStatusOptions} onChange={(value) => setFilterValue("customsStatus", value)} widthClass="w-full lg:w-44" />
      <FilterSelect value={filters.releaseStatus} allLabel="همه ترخیص‌ها" options={releaseStatusOptions} onChange={(value) => setFilterValue("releaseStatus", value)} widthClass="w-full lg:w-44" />
    </>
  );

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-background p-3 text-foreground md:p-4 lg:p-6" dir="rtl" data-testid="daily-status-page">
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black tracking-normal text-foreground">وضعیت روزانه</h1>
                <p className="mt-1 text-xs font-bold text-muted-foreground">نمای عملیاتی محموله، کوتاژ، کارت بازرگانی، فرآیند، وظایف و اسناد</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
            <SummaryTile label="ردیف‌ها" value={rows.length} />
            <SummaryTile label="کوتاژ ثبت‌شده" value={withCotage} />
            <SummaryTile label="وظایف باز" value={totalOpenTasks} />
            <SummaryTile label="متوقف" value={blockedRows} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3" data-testid="daily-status-toolbar">
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
            ) : rows.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <p className="text-sm font-black text-foreground">ردیفی برای نمایش نیست</p>
                <p className="mt-2 text-xs font-bold text-muted-foreground">فیلترها را تغییر دهید یا محموله جدید ثبت کنید.</p>
              </div>
            ) : (
              rows.map((row) => (
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
          <aside className="min-w-0" data-testid="daily-status-detail-panel">
            {activeRow ? (
              <RowDetailsPanel
                row={activeRow}
                mode={activeMode}
                surface="desktop"
                draft={draft}
                sections={sectionsForRow(activeRow)}
                commercialCards={commercialCards}
                isSaving={savingId === activeRow.id}
                onModeChange={setActiveMode}
                onDraftChange={changeDraft}
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
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm font-black text-foreground">ردیفی برای نمایش نیست</p>
              <p className="mt-2 text-xs font-bold text-muted-foreground">فیلترها را تغییر دهید یا محموله جدید ثبت کنید.</p>
            </div>
          ) : (
            rows.map((row) => (
              <React.Fragment key={row.id}>
                <MobileCard
                  row={row}
                  isActive={activeRowId === row.id}
                  activeMode={activeMode}
                  draft={draft}
                  sections={sectionsForRow(row)}
                  commercialCards={commercialCards}
                  isSaving={savingId === row.id}
                  onOpen={(mode) => openRow(row, mode)}
                  onModeChange={setActiveMode}
                  onDraftChange={changeDraft}
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
