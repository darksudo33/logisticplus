import type { DailyStatusBoardRow, DailyStatusPatch } from "@/src/types";

export type DailyStatusFieldGroup = "shipment" | "customer" | "kootaj" | "relationship" | "workflow" | "tasks" | "documents" | "links";
export type DailyStatusEditorType = "text" | "textarea" | "select" | "date" | "commercialCard";

export type DailyStatusColumn = {
  key: string;
  label: string;
  group: DailyStatusFieldGroup;
  editable: boolean;
  editorType?: DailyStatusEditorType;
  field?: keyof DailyStatusPatch;
  width: string;
  desktop?: boolean;
  priority?: "primary" | "secondary";
  validationHint?: string;
  read: (row: DailyStatusBoardRow) => string | number | null;
  linkedRoute?: (row: DailyStatusBoardRow) => string | null;
};

export const routeOptions = [
  { value: "green", label: "سبز" },
  { value: "yellow", label: "زرد" },
  { value: "red", label: "قرمز" },
];

export const customsStatusOptions = [
  { value: "not_started", label: "شروع نشده" },
  { value: "declaration_registered", label: "اظهارنامه ثبت شده" },
  { value: "in_customs_review", label: "در بررسی گمرک" },
  { value: "documents_required", label: "نیازمند مدارک" },
  { value: "inspection", label: "بازرسی" },
  { value: "duties_pending", label: "در انتظار پرداخت حقوق و عوارض" },
  { value: "ready_for_release", label: "آماده ترخیص" },
  { value: "released", label: "ترخیص شده" },
  { value: "exited", label: "خارج شده" },
  { value: "blocked", label: "متوقف" },
];

export const commonStatusOptions = [
  { value: "not_started", label: "شروع نشده" },
  { value: "pending", label: "در انتظار" },
  { value: "in_progress", label: "در حال انجام" },
  { value: "completed", label: "تکمیل شده" },
  { value: "blocked", label: "متوقف" },
  { value: "not_required", label: "نیاز ندارد" },
];

export const taxPaymentStatusOptions = [
  { value: "not_started", label: "شروع نشده" },
  { value: "pending", label: "در انتظار پرداخت" },
  { value: "in_progress", label: "در حال انجام" },
  { value: "completed", label: "تکمیل شده" },
  { value: "blocked", label: "متوقف" },
  { value: "not_required", label: "نیاز ندارد" },
  { value: "paid", label: "پرداخت شده" },
];

export const releaseStatusOptions = [
  { value: "not_released", label: "ترخیص نشده" },
  { value: "ready", label: "آماده ترخیص" },
  { value: "released", label: "ترخیص شده" },
  { value: "exited", label: "خارج شده" },
  { value: "blocked", label: "متوقف" },
];

export function labelForOption(options: Array<{ value: string; label: string }>, value?: string | null) {
  if (!value) return "";
  return options.find((option) => option.value === value)?.label || value;
}

export const dailyStatusColumns: DailyStatusColumn[] = [
  {
    key: "shipment",
    label: "محموله",
    group: "shipment",
    editable: false,
    width: "w-[140px] min-w-[140px]",
    priority: "primary",
    read: (row) => row.shipment.code,
    linkedRoute: (row) => row.links.shipmentDetailUrl,
  },
  {
    key: "customer",
    label: "مشتری",
    group: "customer",
    editable: false,
    width: "w-[140px] min-w-[140px]",
    priority: "primary",
    read: (row) => row.baseInfo?.customerCode || row.customer?.customerCode || row.customer?.id || row.customer?.name || "",
    linkedRoute: (row) => row.links.customerDetailUrl,
  },
  {
    key: "shipmentStatus",
    label: "وضعیت محموله",
    group: "shipment",
    editable: false,
    width: "w-[120px] min-w-[120px]",
    priority: "primary",
    read: (row) => row.shipment.status,
  },
  {
    key: "workflow",
    label: "مرحله فرآیند",
    group: "workflow",
    editable: false,
    width: "w-[170px] min-w-[170px]",
    priority: "primary",
    read: (row) => row.workflow?.currentStepLabel || "",
  },
  {
    key: "customsRoute",
    label: "مسیر گمرکی",
    group: "kootaj",
    editable: true,
    editorType: "select",
    field: "customsRoute",
    width: "w-[105px] min-w-[105px]",
    priority: "primary",
    validationHint: "سبز، زرد یا قرمز.",
    read: (row) => labelForOption(routeOptions, row.kootaj.customsRoute || row.workflow?.route),
  },
  {
    key: "cotageNumber",
    label: "شماره کوتاژ",
    group: "kootaj",
    editable: true,
    editorType: "text",
    field: "cotageNumber",
    width: "w-[130px] min-w-[130px]",
    priority: "primary",
    validationHint: "حداکثر ۱۲۰ کاراکتر.",
    read: (row) => row.kootaj.cotageNumber,
  },
  {
    key: "customsStatus",
    label: "وضعیت گمرکی",
    group: "kootaj",
    editable: true,
    editorType: "select",
    field: "customsStatus",
    width: "w-[145px] min-w-[145px]",
    priority: "primary",
    validationHint: "از وضعیت‌های مجاز انتخاب شود.",
    read: (row) => labelForOption(customsStatusOptions, row.kootaj.customsStatus),
  },
  {
    key: "commercialCard",
    label: "کارت بازرگانی",
    group: "relationship",
    editable: true,
    editorType: "commercialCard",
    field: "commercialCardId",
    width: "w-[155px] min-w-[155px]",
    priority: "primary",
    validationHint: "کارت باید متعلق به همین سازمان باشد.",
    read: (row) => row.commercialCard?.displayName || "",
    linkedRoute: (row) => row.links.commercialCardDetailUrl,
  },
  {
    key: "documents",
    label: "اسناد",
    group: "documents",
    editable: false,
    width: "w-[90px] min-w-[90px]",
    priority: "primary",
    read: (row) => `${row.documents.customerVisibleCount}/${row.documents.totalCount}`,
  },
  {
    key: "tasks",
    label: "وظایف باز",
    group: "tasks",
    editable: false,
    width: "w-[105px] min-w-[105px]",
    priority: "primary",
    read: (row) => row.tasks.overdueCount ? `${row.tasks.openCount} / ${row.tasks.overdueCount} دیرکرد` : row.tasks.openCount,
  },
  {
    key: "responsible",
    label: "مسئول",
    group: "shipment",
    editable: false,
    width: "w-[140px] min-w-[140px]",
    desktop: false,
    priority: "secondary",
    read: (row) => row.shipment.assignedManagerName || row.tasks.assignedUserNames.join("، "),
  },
  {
    key: "originDestination",
    label: "مسیر حمل",
    group: "shipment",
    editable: false,
    width: "w-[170px] min-w-[170px]",
    desktop: false,
    priority: "secondary",
    read: (row) => [row.shipment.origin, row.shipment.destination].filter(Boolean).join(" ← "),
  },
  {
    key: "releaseStatus",
    label: "ترخیص/خروج",
    group: "kootaj",
    editable: true,
    editorType: "select",
    field: "releaseStatus",
    width: "w-[150px] min-w-[150px]",
    desktop: false,
    priority: "secondary",
    validationHint: "از وضعیت‌های مجاز انتخاب شود.",
    read: (row) => labelForOption(releaseStatusOptions, row.kootaj.releaseStatus),
  },
  {
    key: "taxPaymentStatus",
    label: "پرداخت گمرکی",
    group: "kootaj",
    editable: true,
    editorType: "select",
    field: "customsPaymentStatus",
    width: "w-[150px] min-w-[150px]",
    desktop: false,
    priority: "secondary",
    validationHint: "از وضعیت‌های مجاز انتخاب شود.",
    read: (row) => labelForOption(taxPaymentStatusOptions, row.kootaj.customsPaymentStatus || row.kootaj.taxPaymentStatus),
  },
  {
    key: "updatedAt",
    label: "آخرین بروزرسانی",
    group: "shipment",
    editable: false,
    width: "w-[130px] min-w-[130px]",
    priority: "primary",
    read: (row) => row.kootaj.updatedAt || row.shipment.updatedAt,
  },
];
