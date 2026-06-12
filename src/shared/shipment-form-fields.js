export const SHIPMENT_DIRECTION_VALUES = ["import", "export", "transit", "domestic"];
export const TRANSPORT_MODE_VALUES = ["sea", "air", "land", "rail"];

export const SHIPMENT_FORM_FIELD_SOURCES = ["canonical", "custom"];
export const SHIPMENT_FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "commercialCard",
  "readonly",
];

export const DEFAULT_SHIPMENT_TYPE_CODE = "IMPORT_SEA_CONTAINER";

export const SHIPMENT_TYPES = [
  {
    code: "IMPORT_LENJ",
    labelFa: "واردات با لنج",
    direction: "import",
    transportMode: "sea",
    description: "واردات دریایی سبک با تمرکز بر بندر، کالا، اظهار، مجوزها و خروج.",
  },
  {
    code: "IMPORT_SEA_CONTAINER",
    labelFa: "واردات دریایی کانتینری",
    direction: "import",
    transportMode: "sea",
    description: "واردات کانتینری با تمرکز بر بارنامه، کشتی، کانتینر، اسناد مبدا و کۆتاژ.",
  },
  {
    code: "IMPORT_SEA_BULK",
    labelFa: "واردات دریایی فله / جنرال کارگو",
    direction: "import",
    transportMode: "sea",
    description: "واردات فله و جنرال کارگو با تمرکز بر کالا، وزن، بسته بندی و ترخیص.",
  },
  {
    code: "IMPORT_AIR_CARGO",
    labelFa: "واردات هوایی",
    direction: "import",
    transportMode: "air",
    description: "واردات هوایی با تمرکز بر AWB، پرواز، انبار، کالا و ترخیص سریع.",
  },
  {
    code: "IMPORT_LAND_TRUCK",
    labelFa: "واردات زمینی",
    direction: "import",
    transportMode: "land",
    description: "واردات زمینی با تمرکز بر CMR، پلاک، راننده، مرز ورود و خروج.",
  },
  {
    code: "EXPORT_LENJ",
    labelFa: "صادرات با لنج",
    direction: "export",
    transportMode: "sea",
    description: "صادرات با لنج با تمرکز بر بندر خروج، کالا، اسناد صادراتی و تحویل.",
  },
  {
    code: "EXPORT_SEA_CONTAINER",
    labelFa: "صادرات دریایی کانتینری",
    direction: "export",
    transportMode: "sea",
    description: "صادرات کانتینری با تمرکز بر رزرو، بارنامه، کالا و خروج دریایی.",
  },
  {
    code: "EXPORT_SEA_BULK",
    labelFa: "صادرات دریایی فله / جنرال کارگو",
    direction: "export",
    transportMode: "sea",
    description: "صادرات فله و جنرال کارگو با تمرکز بر کالا، وزن، بسته بندی و اسناد خروج.",
  },
  {
    code: "EXPORT_AIR_CARGO",
    labelFa: "صادرات هوایی",
    direction: "export",
    transportMode: "air",
    description: "صادرات هوایی با تمرکز بر AWB، پرواز، کالا و تحویل سریع.",
  },
  {
    code: "EXPORT_LAND_TRUCK",
    labelFa: "صادرات زمینی",
    direction: "export",
    transportMode: "land",
    description: "صادرات زمینی با تمرکز بر CMR، پلاک، راننده، مرز خروج و تحویل.",
  },
];

export const SHIPMENT_TYPE_CODES = SHIPMENT_TYPES.map((item) => item.code);

export const shipmentTypeByCode = new Map(SHIPMENT_TYPES.map((item) => [item.code, item]));

export function normalizeShipmentTypeCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return shipmentTypeByCode.has(code) ? code : DEFAULT_SHIPMENT_TYPE_CODE;
}

const commonStatusOptions = [
  { value: "not_started", label: "شروع نشده" },
  { value: "pending", label: "در انتظار" },
  { value: "in_progress", label: "در حال انجام" },
  { value: "completed", label: "تکمیل شده" },
  { value: "blocked", label: "متوقف" },
  { value: "not_required", label: "نیاز ندارد" },
];

const routeOptions = [
  { value: "green", label: "سبز" },
  { value: "yellow", label: "زرد" },
  { value: "red", label: "قرمز" },
];

const customsStatusOptions = [
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

const releaseStatusOptions = [
  { value: "not_released", label: "ترخیص نشده" },
  { value: "ready", label: "آماده ترخیص" },
  { value: "released", label: "ترخیص شده" },
  { value: "exited", label: "خارج شده" },
  { value: "blocked", label: "متوقف" },
];

function canonicalField({
  key,
  labelFa,
  labelEn,
  sourceEntity = "shipment_kootaj_details",
  apiFieldName = key,
  fieldType = "text",
  options = [],
  helperText = "",
  editable = true,
  sectionSuggestion = "base",
  aliases = [],
}) {
  return {
    key,
    labelFa,
    labelEn,
    sourceEntity,
    apiFieldName,
    fieldType,
    options,
    helperText,
    publicVisibility: "private",
    editable,
    sectionSuggestion,
    aliases,
  };
}

export const CANONICAL_SHIPMENT_FORM_FIELDS = [
  canonicalField({ key: "shipmentCode", labelFa: "کد محموله / شماره پرونده", labelEn: "Shipment code", sourceEntity: "shipments", fieldType: "readonly", editable: false, aliases: ["shipment", "code"] }),
  canonicalField({ key: "customerName", labelFa: "مشتری", labelEn: "Customer", sourceEntity: "shipments/customers", fieldType: "readonly", editable: false, aliases: ["customer"] }),
  canonicalField({ key: "shipmentStatus", labelFa: "وضعیت محموله", labelEn: "Shipment status", sourceEntity: "shipments", fieldType: "readonly", editable: false, aliases: ["status"] }),
  canonicalField({ key: "workflowStep", labelFa: "مرحله فعلی", labelEn: "Workflow step", sourceEntity: "shipment_workflow_instances", fieldType: "readonly", editable: false, aliases: ["workflow", "step"] }),
  canonicalField({ key: "workflowRoute", labelFa: "مسیر فرایند", labelEn: "Workflow route", sourceEntity: "shipment_workflow_instances", fieldType: "readonly", editable: false, aliases: ["workflow", "route"] }),
  canonicalField({ key: "documentCount", labelFa: "اسناد قابل مشاهده/کل", labelEn: "Document count", sourceEntity: "documents", fieldType: "readonly", editable: false, aliases: ["documents"] }),
  canonicalField({ key: "taskCount", labelFa: "وظایف باز", labelEn: "Open task count", sourceEntity: "tasks", fieldType: "readonly", editable: false, aliases: ["tasks"] }),
  canonicalField({ key: "profileUpdatedAt", labelFa: "آخرین بروزرسانی پروفایل", labelEn: "Profile updated at", sourceEntity: "shipment_kootaj_details", fieldType: "readonly", editable: false, aliases: ["updated"] }),
  canonicalField({ key: "commercialCardDisplay", labelFa: "نمایش کارت انتخاب شده", labelEn: "Commercial card display", sourceEntity: "commercial_cards", fieldType: "readonly", editable: false, aliases: ["commercial card"] }),
  canonicalField({ key: "commercialCardId", labelFa: "کارت بازرگانی", labelEn: "Commercial card", sourceEntity: "commercial_cards", fieldType: "commercialCard", aliases: ["card", "commercial"] }),
  canonicalField({ key: "orderRegistrationNumber", labelFa: "شماره ثبت سفارش", labelEn: "Order registration number", aliases: ["order", "ntsw"] }),
  canonicalField({ key: "orderRegistrationDate", labelFa: "تاریخ ثبت سفارش", labelEn: "Order registration date", fieldType: "date" }),
  canonicalField({ key: "orderRegistrationExpiryDate", labelFa: "تاریخ اعتبار ثبت سفارش", labelEn: "Order registration expiry date", fieldType: "date" }),
  canonicalField({ key: "orderRegistrationStatus", labelFa: "وضعیت ثبت سفارش", labelEn: "Order registration status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "proformaNumber", labelFa: "شماره پروفرما", labelEn: "Proforma number", aliases: ["proforma"] }),
  canonicalField({ key: "proformaDate", labelFa: "تاریخ پروفرما", labelEn: "Proforma date", fieldType: "date" }),
  canonicalField({ key: "foreignSellerName", labelFa: "نام فروشنده خارجی", labelEn: "Foreign seller name" }),
  canonicalField({ key: "foreignSellerCode", labelFa: "شناسه فروشنده خارجی", labelEn: "Foreign seller code" }),
  canonicalField({ key: "goodsIdSummary", labelFa: "خلاصه شناسه کالا", labelEn: "Goods ID summary", fieldType: "textarea" }),
  canonicalField({ key: "hsCodeSummary", labelFa: "خلاصه کد تعرفه", labelEn: "HS code summary", fieldType: "textarea", aliases: ["hs", "tariff"] }),
  canonicalField({ key: "orderPermitStatus", labelFa: "وضعیت مجوزهای ثبت سفارش", labelEn: "Order permit status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "fxSourceStatus", labelFa: "وضعیت منشا ارز", labelEn: "FX source status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "currencyType", labelFa: "نوع ارز", labelEn: "Currency type" }),
  canonicalField({ key: "currencyAmount", labelFa: "مبلغ ارزی", labelEn: "Currency amount", fieldType: "number" }),
  canonicalField({ key: "bankName", labelFa: "بانک عامل", labelEn: "Bank name" }),
  canonicalField({ key: "bankTrackingNumber", labelFa: "شماره پیگیری بانکی", labelEn: "Bank tracking number" }),
  canonicalField({ key: "fxAllocationDate", labelFa: "تاریخ تخصیص ارز", labelEn: "FX allocation date", fieldType: "date" }),
  canonicalField({ key: "bankProcessStatus", labelFa: "وضعیت عملیات بانکی", labelEn: "Bank process status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "insuranceNumber", labelFa: "شماره بیمه", labelEn: "Insurance number" }),
  canonicalField({ key: "inspectionCertificateNumber", labelFa: "شماره گواهی بازرسی", labelEn: "Inspection certificate number" }),
  canonicalField({ key: "bookingNumber", labelFa: "شماره رزرو حمل", labelEn: "Booking number" }),
  canonicalField({ key: "billOfLadingNumber", labelFa: "شماره بارنامه", labelEn: "Bill of lading number", aliases: ["bl"] }),
  canonicalField({ key: "transportDocumentNumber", labelFa: "شماره سند حمل", labelEn: "Transport document number" }),
  canonicalField({ key: "preAlertDate", labelFa: "تاریخ دریافت پیش آگهی", labelEn: "Pre-alert date", fieldType: "date" }),
  canonicalField({ key: "containerSummary", labelFa: "خلاصه کانتینر", labelEn: "Container summary", fieldType: "textarea", aliases: ["container"] }),
  canonicalField({ key: "goodsSummary", labelFa: "خلاصه کالا", labelEn: "Goods summary", fieldType: "textarea", aliases: ["goods"] }),
  canonicalField({ key: "packageCount", labelFa: "تعداد بسته", labelEn: "Package count", fieldType: "number" }),
  canonicalField({ key: "grossWeightKg", labelFa: "وزن ناخالص", labelEn: "Gross weight kg", fieldType: "number" }),
  canonicalField({ key: "netWeightKg", labelFa: "وزن خالص", labelEn: "Net weight kg", fieldType: "number" }),
  canonicalField({ key: "arrivalNoticeNumber", labelFa: "شماره اعلامیه ورود", labelEn: "Arrival notice number" }),
  canonicalField({ key: "arrivalDate", labelFa: "تاریخ ورود", labelEn: "Arrival date", fieldType: "date" }),
  canonicalField({ key: "manifestNumber", labelFa: "شماره مانیفست", labelEn: "Manifest number" }),
  canonicalField({ key: "deliveryOrderNumber", labelFa: "شماره ترخیصیه", labelEn: "Delivery order number" }),
  canonicalField({ key: "warehouseName", labelFa: "نام انبار", labelEn: "Warehouse name" }),
  canonicalField({ key: "warehouseReceiptNumber", labelFa: "شماره قبض انبار", labelEn: "Warehouse receipt number" }),
  canonicalField({ key: "warehouseReceiptDate", labelFa: "تاریخ قبض انبار", labelEn: "Warehouse receipt date", fieldType: "date" }),
  canonicalField({ key: "declarationReference", labelFa: "شماره اظهار / مرجع اظهار", labelEn: "Declaration reference" }),
  canonicalField({ key: "declarationDate", labelFa: "تاریخ اظهار", labelEn: "Declaration date", fieldType: "date" }),
  canonicalField({ key: "cotageNumber", labelFa: "شماره کوتاژ", labelEn: "Cotage number", aliases: ["kootaj", "cotage"] }),
  canonicalField({ key: "cotageDate", labelFa: "تاریخ کوتاژ", labelEn: "Cotage date", fieldType: "date" }),
  canonicalField({ key: "customsOffice", labelFa: "گمرک / محل اظهار", labelEn: "Customs office" }),
  canonicalField({ key: "customsStatus", labelFa: "وضعیت گمرکی", labelEn: "Customs status", fieldType: "select", options: customsStatusOptions }),
  canonicalField({ key: "customsRoute", labelFa: "مسیر گمرکی", labelEn: "Customs route", fieldType: "select", options: routeOptions }),
  canonicalField({ key: "evaluatorName", labelFa: "نام ارزیاب", labelEn: "Evaluator name" }),
  canonicalField({ key: "expertName", labelFa: "نام کارشناس", labelEn: "Expert name" }),
  canonicalField({ key: "documentControlStatus", labelFa: "وضعیت کنترل اسناد", labelEn: "Document control status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "physicalInspectionStatus", labelFa: "وضعیت ارزیابی فیزیکی", labelEn: "Physical inspection status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "physicalInspectionDate", labelFa: "تاریخ ارزیابی فیزیکی", labelEn: "Physical inspection date", fieldType: "date" }),
  canonicalField({ key: "labStatus", labelFa: "وضعیت آزمایشگاه", labelEn: "Lab status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "labResultDate", labelFa: "تاریخ نتیجه آزمایشگاه", labelEn: "Lab result date", fieldType: "date" }),
  canonicalField({ key: "tariffReviewStatus", labelFa: "وضعیت بررسی تعرفه", labelEn: "Tariff review status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "valuationStatus", labelFa: "وضعیت بررسی ارزش", labelEn: "Valuation status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "legalPermitStatus", labelFa: "وضعیت مجوزهای قانونی", labelEn: "Legal permit status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "standardPermitStatus", labelFa: "وضعیت استاندارد", labelEn: "Standard permit status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "healthPermitStatus", labelFa: "وضعیت بهداشت", labelEn: "Health permit status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "quarantinePermitStatus", labelFa: "وضعیت قرنطینه", labelEn: "Quarantine permit status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "otherPermitNotes", labelFa: "توضیحات سایر مجوزها", labelEn: "Other permit notes", fieldType: "textarea" }),
  canonicalField({ key: "dutiesAmount", labelFa: "مبلغ حقوق و عوارض", labelEn: "Duties amount", fieldType: "number" }),
  canonicalField({ key: "taxAmount", labelFa: "مبلغ مالیات", labelEn: "Tax amount", fieldType: "number" }),
  canonicalField({ key: "customsPaymentStatus", labelFa: "وضعیت پرداخت گمرکی", labelEn: "Customs payment status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "customsPaymentDate", labelFa: "تاریخ پرداخت گمرکی", labelEn: "Customs payment date", fieldType: "date" }),
  canonicalField({ key: "paymentReference", labelFa: "شماره پیگیری پرداخت", labelEn: "Payment reference" }),
  canonicalField({ key: "cashierConfirmationStatus", labelFa: "وضعیت تایید صندوق", labelEn: "Cashier confirmation status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "warehouseChargesStatus", labelFa: "وضعیت تسویه انبارداری", labelEn: "Warehouse charges status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "terminalChargesStatus", labelFa: "وضعیت تسویه ترمینال", labelEn: "Terminal charges status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "demurrageStatus", labelFa: "وضعیت دموراژ / دیتنشن", labelEn: "Demurrage status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "loadingPermitNumber", labelFa: "شماره مجوز بارگیری", labelEn: "Loading permit number" }),
  canonicalField({ key: "loadingPermitDate", labelFa: "تاریخ مجوز بارگیری", labelEn: "Loading permit date", fieldType: "date" }),
  canonicalField({ key: "truckPlate", labelFa: "پلاک کامیون", labelEn: "Truck plate" }),
  canonicalField({ key: "driverName", labelFa: "نام راننده", labelEn: "Driver name" }),
  canonicalField({ key: "gatePassNumber", labelFa: "شماره بیجک / حواله خروج", labelEn: "Gate pass number" }),
  canonicalField({ key: "exitGateStatus", labelFa: "وضعیت درب خروج", labelEn: "Exit gate status", fieldType: "select", options: commonStatusOptions }),
  canonicalField({ key: "releaseStatus", labelFa: "وضعیت ترخیص / خروج", labelEn: "Release status", fieldType: "select", options: releaseStatusOptions }),
  canonicalField({ key: "exitDate", labelFa: "تاریخ خروج", labelEn: "Exit date", fieldType: "date" }),
  canonicalField({ key: "deliveryDate", labelFa: "تاریخ تحویل مقصد", labelEn: "Delivery date", fieldType: "date" }),
  canonicalField({ key: "internalNote", labelFa: "یادداشت داخلی", labelEn: "Internal note", fieldType: "textarea" }),
];

export const canonicalShipmentFormFieldByKey = new Map(
  CANONICAL_SHIPMENT_FORM_FIELDS.map((field) => [field.key, field])
);

export function getCanonicalShipmentFormField(fieldKey) {
  return canonicalShipmentFormFieldByKey.get(String(fieldKey || ""));
}

const readonlyBaseFields = [
  "shipmentCode",
  "customerName",
  "shipmentStatus",
  "workflowStep",
  "workflowRoute",
  "documentCount",
  "taskCount",
  "profileUpdatedAt",
];

function section(sectionKey, titleFa, fields, config = {}) {
  return {
    sectionKey,
    titleFa,
    description: config.description || "",
    sortOrder: config.sortOrder || 0,
    isCollapsedByDefault: config.isCollapsedByDefault ?? sectionKey !== "base",
    fields,
  };
}

function field(fieldKey, config = {}) {
  const canonical = getCanonicalShipmentFormField(fieldKey);
  const source = config.source || (canonical ? "canonical" : "custom");
  return {
    fieldKey,
    fieldSource: source,
    fieldType: config.fieldType || canonical?.fieldType || "text",
    labelFa: config.labelFa || canonical?.labelFa || fieldKey,
    helperText: config.helperText || canonical?.helperText || "",
    placeholder: config.placeholder || "",
    sortOrder: config.sortOrder || 0,
    isVisible: config.isVisible !== false,
    isRequired: Boolean(config.isRequired),
    isImportant: Boolean(config.isImportant),
    showInShipmentDetail: config.showInShipmentDetail !== false,
    showInDailyStatus: config.showInDailyStatus !== false,
    showInCreateForm: Boolean(config.showInCreateForm),
    validationJson: config.validationJson || {},
    optionsJson: config.optionsJson || canonical?.options || [],
  };
}

function defaultTemplate({ code, titleFa, description, sections }) {
  return {
    code: `default-${code.toLowerCase().replace(/_/g, "-")}`,
    shipmentTypeCode: code,
    titleFa,
    description,
    isSystem: true,
    isActive: true,
    version: 1,
    sections: sections.map((item, sectionIndex) => ({
      ...item,
      sortOrder: sectionIndex + 1,
      fields: item.fields.map((fieldItem, fieldIndex) => ({
        ...fieldItem,
        sortOrder: fieldIndex + 1,
      })),
    })),
  };
}

export const DEFAULT_SHIPMENT_FORM_TEMPLATE_DEFINITIONS = [
  defaultTemplate({
    code: "IMPORT_LENJ",
    titleFa: "قالب واردات با لنج",
    description: "قالب پایه برای پرونده های واردات با لنج.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key, { showInCreateForm: key === "shipmentCode" }))),
      section("lenj-port", "اطلاعات لنج و بندر", [
        field("lenjName", { source: "custom", labelFa: "نام لنج", isImportant: true }),
        field("portOfArrival", { source: "custom", labelFa: "بندر ورود", isImportant: true }),
        field("arrivalDate", { isImportant: true }),
        field("warehouseReceiptNumber"),
      ]),
      section("goods", "کالا و بسته بندی", [
        field("goodsSummary", { isImportant: true }),
        field("packageCount"),
        field("grossWeightKg"),
      ]),
      section("declaration", "اظهار و کوتاژ", [
        field("cotageNumber", { isImportant: true, showInCreateForm: true }),
        field("customsRoute", { isImportant: true }),
        field("customsStatus", { isImportant: true }),
        field("customsOffice"),
      ]),
      section("permits", "مجوزها", [
        field("legalPermitStatus", { isImportant: true }),
        field("standardPermitStatus"),
        field("healthPermitStatus"),
      ]),
      section("payments-release", "پرداخت ها و خروج", [
        field("customsPaymentStatus", { isImportant: true }),
        field("releaseStatus", { isImportant: true }),
        field("exitDate"),
      ]),
      section("internal-note", "یادداشت داخلی", [field("internalNote")], { isCollapsedByDefault: true }),
    ],
  }),
  defaultTemplate({
    code: "IMPORT_SEA_CONTAINER",
    titleFa: "قالب واردات دریایی کانتینری",
    description: "قالب پایه برای واردات دریایی کانتینری.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key, { showInCreateForm: key === "shipmentCode" }))),
      section("order-registration", "ثبت سفارش", [
        field("orderRegistrationNumber", { isImportant: true }),
        field("orderRegistrationDate"),
        field("orderRegistrationStatus"),
      ]),
      section("fx-bank", "ارز و بانک", [
        field("bankTrackingNumber", { isImportant: true }),
        field("bankName"),
        field("bankProcessStatus"),
      ]),
      section("sea", "حمل دریایی", [
        field("billOfLadingNumber", { isImportant: true, showInCreateForm: true }),
        field("vesselName", { source: "custom", labelFa: "نام کشتی", isImportant: true }),
        field("voyageNumber", { source: "custom", labelFa: "شماره سفر" }),
        field("deliveryOrderNumber"),
      ]),
      section("containers", "کانتینرها", [
        field("containerSummary", { isImportant: true }),
        field("warehouseReceiptNumber"),
      ]),
      section("origin-docs", "اسناد مبدا", [
        field("proformaNumber"),
        field("transportDocumentNumber"),
        field("goodsSummary"),
      ]),
      section("declaration", "اظهار و کوتاژ", [
        field("cotageNumber", { isImportant: true, showInCreateForm: true }),
        field("customsRoute", { isImportant: true }),
        field("customsStatus", { isImportant: true }),
        field("customsOffice"),
      ]),
      section("payments-release", "پرداخت ها و خروج", [
        field("customsPaymentStatus", { isImportant: true }),
        field("paymentReference"),
        field("releaseStatus", { isImportant: true }),
        field("truckPlate"),
        field("driverName"),
        field("exitDate"),
      ]),
      section("commercial-card", "کارت بازرگانی", [
        field("commercialCardId", { isImportant: true }),
        field("commercialCardDisplay"),
      ]),
      section("internal-note", "یادداشت داخلی", [field("internalNote")], { isCollapsedByDefault: true }),
    ],
  }),
  defaultTemplate({
    code: "IMPORT_SEA_BULK",
    titleFa: "قالب واردات دریایی فله / جنرال کارگو",
    description: "قالب پایه برای واردات فله و جنرال کارگو.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key))),
      section("sea", "حمل دریایی", [
        field("billOfLadingNumber", { isImportant: true, showInCreateForm: true }),
        field("vesselName", { source: "custom", labelFa: "نام کشتی", isImportant: true }),
        field("voyageNumber", { source: "custom", labelFa: "شماره سفر" }),
      ]),
      section("bulk-goods", "کالا و وزن", [
        field("goodsSummary", { isImportant: true }),
        field("grossWeightKg", { isImportant: true }),
        field("packageCount"),
        field("warehouseReceiptNumber"),
      ]),
      section("declaration", "اظهار و کوتاژ", [
        field("cotageNumber", { isImportant: true, showInCreateForm: true }),
        field("customsRoute", { isImportant: true }),
        field("releaseStatus", { isImportant: true }),
      ]),
    ],
  }),
  defaultTemplate({
    code: "IMPORT_AIR_CARGO",
    titleFa: "قالب واردات هوایی",
    description: "قالب پایه برای واردات هوایی.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key))),
      section("air", "حمل هوایی", [
        field("awbNumber", { source: "custom", labelFa: "شماره AWB", isImportant: true, showInCreateForm: true }),
        field("flightNumber", { source: "custom", labelFa: "شماره پرواز" }),
        field("airlineName", { source: "custom", labelFa: "نام ایرلاین" }),
        field("arrivalDate", { isImportant: true }),
        field("warehouseReceiptNumber"),
      ]),
      section("goods", "کالا", [
        field("goodsSummary", { isImportant: true }),
        field("grossWeightKg"),
      ]),
      section("declaration", "اظهار و ترخیص", [
        field("cotageNumber", { isImportant: true, showInCreateForm: true }),
        field("customsRoute", { isImportant: true }),
        field("customsPaymentStatus", { isImportant: true }),
        field("releaseStatus", { isImportant: true }),
        field("exitDate"),
      ]),
    ],
  }),
  defaultTemplate({
    code: "IMPORT_LAND_TRUCK",
    titleFa: "قالب واردات زمینی",
    description: "قالب پایه برای واردات زمینی.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key))),
      section("land", "حمل زمینی", [
        field("cmrNumber", { source: "custom", labelFa: "شماره CMR", isImportant: true, showInCreateForm: true }),
        field("truckPlate", { isImportant: true }),
        field("driverName", { isImportant: true }),
        field("borderEntryPoint", { source: "custom", labelFa: "مرز ورود" }),
        field("arrivalDate"),
      ]),
      section("goods", "کالا", [
        field("goodsSummary", { isImportant: true }),
        field("packageCount"),
        field("grossWeightKg"),
      ]),
      section("declaration", "اظهار و ترخیص", [
        field("cotageNumber", { isImportant: true, showInCreateForm: true }),
        field("customsRoute", { isImportant: true }),
        field("customsPaymentStatus", { isImportant: true }),
        field("releaseStatus", { isImportant: true }),
        field("exitDate"),
      ]),
    ],
  }),
  defaultTemplate({
    code: "EXPORT_LENJ",
    titleFa: "قالب صادرات با لنج",
    description: "قالب پایه برای پرونده های صادرات با لنج.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key))),
      section("lenj-port", "لنج و بندر خروج", [
        field("lenjName", { source: "custom", labelFa: "نام لنج", isImportant: true }),
        field("portOfDeparture", { source: "custom", labelFa: "بندر خروج", isImportant: true }),
        field("goodsSummary", { isImportant: true }),
      ]),
      section("export-docs", "اسناد صادراتی", [
        field("bookingNumber"),
        field("transportDocumentNumber"),
        field("customsStatus", { isImportant: true }),
        field("releaseStatus", { isImportant: true }),
      ]),
      section("internal-note", "یادداشت داخلی", [field("internalNote")], { isCollapsedByDefault: true }),
    ],
  }),
  defaultTemplate({
    code: "EXPORT_SEA_CONTAINER",
    titleFa: "قالب صادرات دریایی کانتینری",
    description: "قالب پایه برای صادرات دریایی کانتینری.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key))),
      section("sea", "حمل دریایی", [
        field("bookingNumber", { isImportant: true }),
        field("billOfLadingNumber", { isImportant: true }),
        field("vesselName", { source: "custom", labelFa: "نام کشتی", isImportant: true }),
        field("voyageNumber", { source: "custom", labelFa: "شماره سفر" }),
      ]),
      section("goods", "کالا و کانتینر", [
        field("goodsSummary", { isImportant: true }),
        field("containerSummary"),
        field("packageCount"),
        field("grossWeightKg"),
      ]),
      section("export-release", "خروج و تحویل", [
        field("customsStatus", { isImportant: true }),
        field("releaseStatus", { isImportant: true }),
        field("exitDate"),
      ]),
      section("internal-note", "یادداشت داخلی", [field("internalNote")], { isCollapsedByDefault: true }),
    ],
  }),
  defaultTemplate({
    code: "EXPORT_SEA_BULK",
    titleFa: "قالب صادرات دریایی فله / جنرال کارگو",
    description: "قالب پایه برای صادرات فله و جنرال کارگو.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key))),
      section("sea", "حمل دریایی", [
        field("bookingNumber", { isImportant: true }),
        field("billOfLadingNumber", { isImportant: true }),
        field("vesselName", { source: "custom", labelFa: "نام کشتی", isImportant: true }),
      ]),
      section("bulk-goods", "کالا و وزن", [
        field("goodsSummary", { isImportant: true }),
        field("grossWeightKg", { isImportant: true }),
        field("packageCount"),
      ]),
      section("export-release", "خروج و تحویل", [
        field("customsStatus", { isImportant: true }),
        field("releaseStatus", { isImportant: true }),
        field("exitDate"),
      ]),
    ],
  }),
  defaultTemplate({
    code: "EXPORT_AIR_CARGO",
    titleFa: "قالب صادرات هوایی",
    description: "قالب پایه برای صادرات هوایی.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key))),
      section("air", "حمل هوایی", [
        field("awbNumber", { source: "custom", labelFa: "شماره AWB", isImportant: true }),
        field("flightNumber", { source: "custom", labelFa: "شماره پرواز" }),
        field("airlineName", { source: "custom", labelFa: "نام ایرلاین" }),
      ]),
      section("goods", "کالا", [
        field("goodsSummary", { isImportant: true }),
        field("grossWeightKg"),
      ]),
      section("export-release", "خروج و تحویل", [
        field("customsStatus", { isImportant: true }),
        field("releaseStatus", { isImportant: true }),
        field("exitDate"),
      ]),
    ],
  }),
  defaultTemplate({
    code: "EXPORT_LAND_TRUCK",
    titleFa: "قالب صادرات زمینی",
    description: "قالب پایه برای صادرات زمینی.",
    sections: [
      section("base", "اطلاعات پایه", readonlyBaseFields.map((key) => field(key))),
      section("land", "حمل زمینی", [
        field("cmrNumber", { source: "custom", labelFa: "شماره CMR", isImportant: true }),
        field("truckPlate", { isImportant: true }),
        field("driverName", { isImportant: true }),
        field("borderExitPoint", { source: "custom", labelFa: "مرز خروج" }),
      ]),
      section("goods", "کالا", [
        field("goodsSummary", { isImportant: true }),
        field("packageCount"),
        field("grossWeightKg"),
      ]),
      section("export-release", "خروج و تحویل", [
        field("customsStatus", { isImportant: true }),
        field("releaseStatus", { isImportant: true }),
        field("exitDate"),
      ]),
    ],
  }),
];
