import {
  commonStatusOptions,
  customsStatusOptions,
  releaseStatusOptions,
  routeOptions,
} from "@/src/app/dailyStatusColumns";
import type { DailyStatusPatch } from "@/src/types";
import type { ShipmentFormTemplate } from "@/src/lib/shipmentFormTemplatesApi";

export type IranImportProfileFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "commercialCard"
  | "readonly";

export type IranImportProfileFieldSource = "derived" | "kootaj" | "workflow" | "relationship";

export type IranImportProfileField = {
  key: string;
  patchKey?: keyof DailyStatusPatch;
  label: string;
  englishLabel?: string;
  aliases?: string[];
  sectionId: string;
  type: IranImportProfileFieldType;
  source: IranImportProfileFieldSource;
  editable: boolean;
  options?: Array<{ value: string; label: string }>;
  validationHint?: string;
  dir?: "rtl" | "ltr";
  wide?: boolean;
  step?: string;
  fieldSource?: "canonical" | "custom";
  templateFieldId?: string;
  helperText?: string;
  isRequired?: boolean;
  isImportant?: boolean;
  showInShipmentDetail?: boolean;
  showInDailyStatus?: boolean;
  showInCreateForm?: boolean;
  customFieldKey?: string;
};

export type IranImportProfileSection = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  fields: IranImportProfileField[];
};

type IranImportProfileFieldDefinition = Omit<IranImportProfileField, "sectionId"> & { sectionId?: string };
type IranImportProfileSectionDefinition = Omit<IranImportProfileSection, "fields"> & {
  fields: IranImportProfileFieldDefinition[];
};

const readonlyField = (
  key: string,
  label: string,
  source: IranImportProfileFieldSource,
  aliases: string[] = []
): IranImportProfileFieldDefinition => ({
  key,
  label,
  aliases,
  type: "readonly",
  source,
  editable: false,
});

const kootajField = (
  patchKey: keyof DailyStatusPatch,
  label: string,
  type: IranImportProfileFieldType = "text",
  config: Partial<Omit<IranImportProfileFieldDefinition, "key" | "patchKey" | "label" | "type" | "source" | "editable">> = {}
): IranImportProfileFieldDefinition => ({
  key: patchKey,
  patchKey,
  label,
  type,
  source: patchKey === "commercialCardId" ? "relationship" : "kootaj",
  editable: true,
  ...config,
});

const iranImportProfileSectionDefinitions: IranImportProfileSectionDefinition[] = [
  {
    id: "base",
    title: "اطلاعات پایه محموله",
    defaultOpen: true,
    fields: [
      readonlyField("shipmentCode", "کد محموله / شماره پرونده", "derived", ["shipment", "code", "پرونده"]),
      readonlyField("customerName", "مشتری", "derived", ["customer"]),
      readonlyField("shipmentStatus", "وضعیت محموله", "derived", ["status"]),
      readonlyField("workflowStep", "مرحله فعلی", "workflow", ["workflow", "step", "فرآیند"]),
      readonlyField("workflowRoute", "مسیر فرآیند", "workflow", ["route", "مسیر"]),
      readonlyField("documentCount", "اسناد قابل مشاهده/کل", "derived", ["documents", "docs", "مدارک"]),
      readonlyField("taskCount", "وظایف باز", "derived", ["tasks", "کار"]),
      readonlyField("profileUpdatedAt", "آخرین بروزرسانی پروفایل", "derived", ["updated", "بروزرسانی"]),
    ],
  },
  {
    id: "order-registration",
    title: "ثبت سفارش",
    fields: [
      kootajField("orderRegistrationNumber", "شماره ثبت سفارش", "text", { englishLabel: "Order registration number", aliases: ["ثبت", "سفارش", "ntsw", "order"], dir: "ltr" }),
      kootajField("orderRegistrationDate", "تاریخ ثبت سفارش", "date", { aliases: ["ثبت سفارش", "order date"] }),
      kootajField("orderRegistrationExpiryDate", "تاریخ اعتبار ثبت سفارش", "date", { aliases: ["اعتبار", "expiry"] }),
      kootajField("orderRegistrationStatus", "وضعیت ثبت سفارش", "select", { options: commonStatusOptions, aliases: ["وضعیت ثبت", "order status"] }),
      kootajField("proformaNumber", "شماره پروفرما", "text", { aliases: ["پروفرما", "proforma"], dir: "ltr" }),
      kootajField("proformaDate", "تاریخ پروفرما", "date", { aliases: ["پروفرما", "proforma date"] }),
      kootajField("foreignSellerName", "نام فروشنده خارجی", "text", { aliases: ["فروشنده", "seller"] }),
      kootajField("foreignSellerCode", "شناسه فروشنده خارجی", "text", { aliases: ["seller code"], dir: "ltr" }),
      kootajField("goodsIdSummary", "خلاصه شناسه کالا", "textarea", { aliases: ["شناسه کالا", "goods id"], wide: true }),
      kootajField("hsCodeSummary", "خلاصه کد تعرفه", "textarea", { aliases: ["تعرفه", "hs", "hs code"], wide: true }),
      kootajField("orderPermitStatus", "وضعیت مجوزهای ثبت سفارش", "select", { options: commonStatusOptions, aliases: ["مجوز", "permit"] }),
    ],
  },
  {
    id: "fx-bank",
    title: "ارز و بانک",
    fields: [
      kootajField("fxSourceStatus", "وضعیت منشأ ارز", "select", { options: commonStatusOptions, aliases: ["ارز", "fx", "منشا"] }),
      kootajField("currencyType", "نوع ارز", "text", { aliases: ["currency"], dir: "ltr" }),
      kootajField("currencyAmount", "مبلغ ارزی", "number", { aliases: ["ارز", "amount"], dir: "ltr", step: "0.01", validationHint: "عدد غیرمنفی." }),
      kootajField("bankName", "بانک عامل", "text", { aliases: ["بانک", "bank"] }),
      kootajField("bankTrackingNumber", "شماره پیگیری بانکی", "text", { aliases: ["بانک", "پیگیری", "bank tracking"], dir: "ltr" }),
      kootajField("fxAllocationDate", "تاریخ تخصیص ارز", "date", { aliases: ["ارز", "تخصیص", "allocation"] }),
      kootajField("bankProcessStatus", "وضعیت عملیات بانکی", "select", { options: commonStatusOptions, aliases: ["بانک", "bank status"] }),
    ],
  },
  {
    id: "origin-docs",
    title: "حمل و اسناد مبدأ",
    fields: [
      kootajField("insuranceNumber", "شماره بیمه", "text", { aliases: ["insurance"], dir: "ltr" }),
      kootajField("inspectionCertificateNumber", "شماره گواهی بازرسی", "text", { aliases: ["inspection certificate"], dir: "ltr" }),
      kootajField("bookingNumber", "شماره رزرو حمل", "text", { aliases: ["booking"], dir: "ltr" }),
      kootajField("billOfLadingNumber", "شماره بارنامه", "text", { aliases: ["بارنامه", "bl", "bill of lading"], dir: "ltr" }),
      kootajField("transportDocumentNumber", "شماره سند حمل", "text", { aliases: ["سند حمل", "transport document"], dir: "ltr" }),
      kootajField("preAlertDate", "تاریخ دریافت پیش‌آگهی", "date", { aliases: ["pre alert"] }),
      kootajField("containerSummary", "خلاصه کانتینر", "textarea", { aliases: ["کانتینر", "container"], wide: true }),
      kootajField("goodsSummary", "خلاصه کالا", "textarea", { aliases: ["کالا", "goods"], wide: true }),
      kootajField("packageCount", "تعداد بسته", "number", { aliases: ["package"], dir: "ltr", step: "1", validationHint: "عدد صحیح غیرمنفی." }),
      kootajField("grossWeightKg", "وزن ناخالص", "number", { aliases: ["gross weight"], dir: "ltr", step: "0.001", validationHint: "عدد غیرمنفی." }),
      kootajField("netWeightKg", "وزن خالص", "number", { aliases: ["net weight"], dir: "ltr", step: "0.001", validationHint: "عدد غیرمنفی." }),
    ],
  },
  {
    id: "arrival-warehouse",
    title: "ورود به ایران و انبار",
    fields: [
      kootajField("arrivalNoticeNumber", "شماره اعلامیه ورود", "text", { aliases: ["ورود", "arrival notice"], dir: "ltr" }),
      kootajField("arrivalDate", "تاریخ ورود", "date", { aliases: ["ورود", "arrival"] }),
      kootajField("manifestNumber", "شماره مانیفست", "text", { aliases: ["manifest"], dir: "ltr" }),
      kootajField("deliveryOrderNumber", "شماره ترخیصیه", "text", { aliases: ["delivery order"], dir: "ltr" }),
      kootajField("warehouseName", "نام انبار", "text", { aliases: ["انبار", "warehouse"] }),
      kootajField("warehouseReceiptNumber", "شماره قبض انبار", "text", { aliases: ["قبض", "انبار", "receipt"], dir: "ltr" }),
      kootajField("warehouseReceiptDate", "تاریخ قبض انبار", "date", { aliases: ["قبض", "انبار", "receipt date"] }),
    ],
  },
  {
    id: "declaration",
    title: "اظهار گمرکی و کوتاژ",
    fields: [
      kootajField("declarationReference", "شماره اظهار / مرجع اظهار", "text", { aliases: ["اظهار", "declaration"], dir: "ltr" }),
      kootajField("declarationDate", "تاریخ اظهار", "date", { aliases: ["اظهار", "declaration date"] }),
      kootajField("cotageNumber", "شماره کوتاژ", "text", { aliases: ["کوتاژ", "cotage", "kootaj"], dir: "ltr" }),
      kootajField("cotageDate", "تاریخ کوتاژ", "date", { aliases: ["کوتاژ", "cotage date"] }),
      kootajField("customsOffice", "گمرک / محل اظهار", "text", { aliases: ["گمرک", "customs office"] }),
      kootajField("customsStatus", "وضعیت گمرکی", "select", { options: customsStatusOptions, aliases: ["گمرک", "customs status"] }),
      kootajField("customsRoute", "مسیر گمرکی", "select", { options: routeOptions, aliases: ["مسیر", "route"] }),
      kootajField("evaluatorName", "نام ارزیاب", "text", { aliases: ["ارزیاب", "evaluator"] }),
      kootajField("expertName", "نام کارشناس", "text", { aliases: ["کارشناس", "expert"] }),
    ],
  },
  {
    id: "inspection",
    title: "مسیر گمرکی و ارزیابی",
    fields: [
      kootajField("documentControlStatus", "وضعیت کنترل اسناد", "select", { options: commonStatusOptions, aliases: ["کنترل", "اسناد"] }),
      kootajField("physicalInspectionStatus", "وضعیت ارزیابی فیزیکی", "select", { options: commonStatusOptions, aliases: ["ارزیابی", "inspection"] }),
      kootajField("physicalInspectionDate", "تاریخ ارزیابی فیزیکی", "date", { aliases: ["ارزیابی", "inspection date"] }),
      kootajField("labStatus", "وضعیت آزمایشگاه", "select", { options: commonStatusOptions, aliases: ["آزمایشگاه", "lab"] }),
      kootajField("labResultDate", "تاریخ نتیجه آزمایشگاه", "date", { aliases: ["آزمایشگاه", "lab date"] }),
      kootajField("tariffReviewStatus", "وضعیت بررسی تعرفه", "select", { options: commonStatusOptions, aliases: ["تعرفه", "tariff"] }),
      kootajField("valuationStatus", "وضعیت بررسی ارزش", "select", { options: commonStatusOptions, aliases: ["ارزش", "valuation"] }),
    ],
  },
  {
    id: "permits",
    title: "مجوزها",
    fields: [
      kootajField("legalPermitStatus", "وضعیت مجوزهای قانونی", "select", { options: commonStatusOptions, aliases: ["مجوز", "legal"] }),
      kootajField("standardPermitStatus", "وضعیت استاندارد", "select", { options: commonStatusOptions, aliases: ["استاندارد", "standard"] }),
      kootajField("healthPermitStatus", "وضعیت بهداشت", "select", { options: commonStatusOptions, aliases: ["بهداشت", "health"] }),
      kootajField("quarantinePermitStatus", "وضعیت قرنطینه", "select", { options: commonStatusOptions, aliases: ["قرنطینه", "quarantine"] }),
      kootajField("otherPermitNotes", "توضیحات سایر مجوزها", "textarea", { aliases: ["مجوز", "permit note"], wide: true }),
    ],
  },
  {
    id: "payments",
    title: "پرداخت‌ها و تسویه‌ها",
    fields: [
      kootajField("dutiesAmount", "مبلغ حقوق و عوارض", "number", { aliases: ["عوارض", "duties"], dir: "ltr", step: "0.01", validationHint: "عدد غیرمنفی." }),
      kootajField("taxAmount", "مبلغ مالیات", "number", { aliases: ["مالیات", "tax"], dir: "ltr", step: "0.01", validationHint: "عدد غیرمنفی." }),
      kootajField("customsPaymentStatus", "وضعیت پرداخت گمرکی", "select", { options: commonStatusOptions, aliases: ["پرداخت", "مالیات", "payment"] }),
      kootajField("customsPaymentDate", "تاریخ پرداخت گمرکی", "date", { aliases: ["پرداخت", "payment date"] }),
      kootajField("paymentReference", "شماره پیگیری پرداخت", "text", { aliases: ["پرداخت", "پیگیری", "payment reference"], dir: "ltr" }),
      kootajField("cashierConfirmationStatus", "وضعیت تأیید صندوق", "select", { options: commonStatusOptions, aliases: ["صندوق", "cashier"] }),
      kootajField("warehouseChargesStatus", "وضعیت تسویه انبارداری", "select", { options: commonStatusOptions, aliases: ["انبارداری", "warehouse charge"] }),
      kootajField("terminalChargesStatus", "وضعیت تسویه ترمینال", "select", { options: commonStatusOptions, aliases: ["ترمینال", "terminal"] }),
      kootajField("demurrageStatus", "وضعیت دموراژ / دیتنشن", "select", { options: commonStatusOptions, aliases: ["دموراژ", "detention", "demurrage"] }),
    ],
  },
  {
    id: "release",
    title: "خروج و تحویل",
    fields: [
      kootajField("loadingPermitNumber", "شماره مجوز بارگیری", "text", { aliases: ["بارگیری", "loading"], dir: "ltr" }),
      kootajField("loadingPermitDate", "تاریخ مجوز بارگیری", "date", { aliases: ["بارگیری", "loading date"] }),
      kootajField("truckPlate", "پلاک کامیون", "text", { aliases: ["پلاک", "truck"] }),
      kootajField("driverName", "نام راننده", "text", { aliases: ["راننده", "driver"] }),
      kootajField("gatePassNumber", "شماره بیجک / حواله خروج", "text", { aliases: ["خروج", "gate pass"], dir: "ltr" }),
      kootajField("exitGateStatus", "وضعیت درب خروج", "select", { options: commonStatusOptions, aliases: ["خروج", "gate"] }),
      kootajField("exitDate", "تاریخ خروج", "date", { aliases: ["خروج", "exit"] }),
      kootajField("deliveryDate", "تاریخ تحویل مقصد", "date", { aliases: ["تحویل", "delivery"] }),
      kootajField("releaseStatus", "وضعیت ترخیص / خروج", "select", { options: releaseStatusOptions, aliases: ["ترخیص", "خروج", "release"] }),
    ],
  },
  {
    id: "commercial-card",
    title: "کارت بازرگانی",
    fields: [
      kootajField("commercialCardId", "کارت بازرگانی", "commercialCard", { aliases: ["کارت", "بازرگانی", "commercial card"] }),
      readonlyField("commercialCardDisplay", "نمایش کارت انتخاب‌شده", "relationship", ["کارت", "card display"]),
    ],
  },
  {
    id: "internal-note",
    title: "یادداشت داخلی",
    fields: [
      kootajField("internalNote", "یادداشت داخلی", "textarea", { aliases: ["یادداشت", "internal note"], wide: true }),
    ],
  },
];

export const iranImportProfileSections: IranImportProfileSection[] = iranImportProfileSectionDefinitions.map((section) => ({
  ...section,
  fields: section.fields.map((field) => ({ ...field, sectionId: section.id })),
}));

export const iranImportProfileFields = iranImportProfileSections.flatMap((section) =>
  section.fields
);

export const iranImportEditableFields = iranImportProfileFields.filter(
  (field): field is IranImportProfileField & { patchKey: keyof DailyStatusPatch } => Boolean(field.editable && field.patchKey)
);

export const iranImportDateFieldKeys = new Set(
  iranImportEditableFields.filter((field) => field.type === "date").map((field) => field.patchKey)
);

export const iranImportNumberFieldKeys = new Set(
  iranImportEditableFields.filter((field) => field.type === "number").map((field) => field.patchKey)
);

export function iranImportSectionTitle(sectionId: string) {
  return iranImportProfileSections.find((section) => section.id === sectionId)?.title || sectionId;
}

export function iranImportFieldTypeLabel(type: IranImportProfileFieldType) {
  const labels: Record<IranImportProfileFieldType, string> = {
    text: "متن",
    textarea: "متن بلند",
    number: "عدد",
    date: "تاریخ",
    select: "انتخابی",
    commercialCard: "کارت بازرگانی",
    readonly: "خودکار",
  };
  return labels[type];
}

const fallbackFieldByKey = new Map(iranImportProfileFields.map((field) => [field.key, field]));

function templateFieldVisibleForSurface(
  field: NonNullable<ShipmentFormTemplate["sections"][number]["fields"]>[number],
  surface: "shipmentDetail" | "dailyStatus" | "createForm"
) {
  if (!field.isVisible) return false;
  if (surface === "shipmentDetail") return field.showInShipmentDetail;
  if (surface === "dailyStatus") return field.showInDailyStatus;
  return field.showInCreateForm;
}

export function profileSectionsFromTemplate(
  template?: ShipmentFormTemplate | null,
  surface: "shipmentDetail" | "dailyStatus" | "createForm" = "shipmentDetail"
): IranImportProfileSection[] {
  if (!template?.sections?.length) return iranImportProfileSections;
  const sections = template.sections
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => {
      const fields = (section.fields || [])
        .filter((field) => templateFieldVisibleForSurface(field, surface))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((field): IranImportProfileField | null => {
          const fallback = fallbackFieldByKey.get(field.fieldKey);
          if (field.fieldSource === "canonical") {
            if (!fallback) return null;
            return {
              ...fallback,
              key: field.fieldKey,
              sectionId: section.sectionKey,
              label: field.labelFa || fallback.label,
              type: field.fieldType || fallback.type,
              options: field.optionsJson?.length ? field.optionsJson : fallback.options,
              helperText: field.helperText || fallback.validationHint,
              templateFieldId: field.id,
              fieldSource: "canonical",
              isRequired: field.isRequired,
              isImportant: field.isImportant,
              showInShipmentDetail: field.showInShipmentDetail,
              showInDailyStatus: field.showInDailyStatus,
              showInCreateForm: field.showInCreateForm,
            };
          }
          return {
            key: field.fieldKey,
            label: field.labelFa || field.fieldKey,
            englishLabel: field.fieldKey,
            aliases: [field.fieldKey],
            sectionId: section.sectionKey,
            type: field.fieldType === "commercialCard" || field.fieldType === "readonly" ? "text" : field.fieldType,
            source: "kootaj",
            editable: true,
            options: field.optionsJson || [],
            validationHint: field.helperText || "",
            wide: field.fieldType === "textarea",
            templateFieldId: field.id,
            fieldSource: "custom",
            customFieldKey: field.fieldKey,
            helperText: field.helperText || "",
            isRequired: field.isRequired,
            isImportant: field.isImportant,
            showInShipmentDetail: field.showInShipmentDetail,
            showInDailyStatus: field.showInDailyStatus,
            showInCreateForm: field.showInCreateForm,
          };
        })
        .filter((field): field is IranImportProfileField => Boolean(field));

      return {
        id: section.sectionKey,
        title: section.titleFa,
        defaultOpen: !section.isCollapsedByDefault,
        fields,
      };
    })
    .filter((section) => section.fields.length > 0);
  return sections.length ? sections : iranImportProfileSections;
}

export function flattenProfileSections(sections: IranImportProfileSection[]) {
  return sections.flatMap((section) => section.fields.map((field) => ({ ...field, sectionId: section.id })));
}
