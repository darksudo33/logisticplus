const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const SHIPMENT_FIELD_LOOKUP_INTENT_ID = "shipment.field.lookup";

export const HAMYAR_SHIPMENT_FIELD_POLICY = Object.freeze({
  VALUE: "value",
  COUNT: "count",
  EXISTS: "exists",
  LIST: "list",
  DEFERRED: "deferred",
});

function normalizeDigits(value = "") {
  return String(value)
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function normalizeShipmentFieldText(value = "") {
  return normalizeDigits(value)
    .replace(/[يى]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\u200c\u200d\u200e\u200f\u00a0]/g, " ")
    .replace(/[؟?.,،؛:!()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function withPossessiveAliases(aliases = []) {
  const expanded = [];
  for (const alias of aliases) {
    const normalized = String(alias || "").trim();
    if (!normalized) continue;
    expanded.push(normalized);
    if (/[\u0600-\u06ff]$/u.test(normalized)) {
      expanded.push(`${normalized}ش`, `${normalized} اش`, `${normalized}‌اش`);
    }
  }
  return unique(expanded);
}

function field({
  key,
  labelFa,
  labelEn,
  aliases = [],
  relationPath = [],
  sourcePath = "",
  answerPolicy = HAMYAR_SHIPMENT_FIELD_POLICY.VALUE,
  missingValuePhrase = "ثبت نشده",
  liveVerificationRequired = true,
  metadataOnly = false,
  deferredUnsupported = false,
  sourceTool = "getShipmentDetailFields",
} = {}) {
  return {
    key,
    labelFa,
    labelEn,
    aliases: withPossessiveAliases(unique([labelFa, labelEn, ...aliases])),
    relationPath,
    sourcePath,
    answerPolicy,
    missingValuePhrase,
    liveVerificationRequired,
    metadataOnly,
    deferredUnsupported,
    sourceTool: deferredUnsupported ? "" : sourceTool,
  };
}

export const HAMYAR_SHIPMENT_FIELD_DEFINITIONS = deepFreeze([
  field({
    key: "shipment.code",
    labelFa: "کد محموله",
    labelEn: "shipment code",
    aliases: ["شماره بار", "شماره محموله", "کد بار", "tracking number", "shipment number"],
    relationPath: ["shipment", "field", "code"],
    sourcePath: "shipments.shipment_code",
    missingValuePhrase: "کد محموله در دسترس نیست",
  }),
  field({
    key: "shipment.customer",
    labelFa: "مشتری",
    labelEn: "customer",
    aliases: ["صاحب بار", "مالک بار", "مشتری بار", "customer name", "owner"],
    relationPath: ["shipment", "field", "customer"],
    sourcePath: "shipments.customer_id -> customers",
    missingValuePhrase: "مشتری ثبت نشده",
  }),
  field({
    key: "shipment.status",
    labelFa: "وضعیت",
    labelEn: "status",
    aliases: ["وضعیت بار", "وضعیت محموله", "در چه حاله", "کجاست", "current status"],
    relationPath: ["shipment", "field", "status"],
    sourcePath: "shipments.status + shipment_v2_profiles.sections_json.base.statusText",
    missingValuePhrase: "وضعیت ثبت نشده",
  }),
  field({
    key: "shipment.order_registration_number",
    labelFa: "شماره ثبت سفارش",
    labelEn: "order registration number",
    aliases: ["ثبت سفارش", "شماره ثبت سفارش بار", "کد ثبت سفارش", "order registration", "order number"],
    relationPath: ["shipment", "field", "order_registration_number"],
    sourcePath: "shipment_v2_profiles.sections_json.base.orderRegistrationNumber",
    missingValuePhrase: "شماره ثبت سفارش ثبت نشده",
  }),
  field({
    key: "shipment.commercial_card",
    labelFa: "کارت بازرگانی",
    labelEn: "commercial card",
    aliases: ["کارت ترخیص", "کارت بازرگانی بار", "کارت بازرگانی محموله", "commercial card"],
    relationPath: ["shipment", "field", "commercial_card"],
    sourcePath: "shipment_v2_profiles.sections_json.base.commercialCardDisplayName/commercialCardId",
    missingValuePhrase: "کارت بازرگانی ثبت نشده",
  }),
  field({
    key: "shipment.document_count",
    labelFa: "تعداد اسناد",
    labelEn: "document count",
    aliases: ["چند تا سند", "چند سند", "تعداد مدارک", "سند داره", "مدرک داره", "documents count"],
    relationPath: ["shipment", "documents", "count"],
    sourcePath: "documents count by shipment_id",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.COUNT,
    metadataOnly: true,
    missingValuePhrase: "سندی بارگذاری نشده",
  }),
  field({
    key: "shipment.goods_count",
    labelFa: "تعداد کالا",
    labelEn: "goods count",
    aliases: ["چند تا کالا", "چند کالا", "تعداد کالاها", "تعداد اقلام", "چند قلم کالا", "goods count", "items count"],
    relationPath: ["shipment", "goods", "count"],
    sourcePath: "shipment_v2_profiles.sections_json.goods.goodsRows.length",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.COUNT,
    metadataOnly: true,
    missingValuePhrase: "کالایی ثبت نشده",
  }),
  field({
    key: "shipment.goods.exists",
    labelFa: "وجود کالا",
    labelEn: "goods exist",
    aliases: ["کالا داره", "کالا دارد", "کالا ثبت شده", "کالایی ثبت شده", "کالا براش ثبت شده", "چیزی تو V2 کالاهاش داره", "در V2 کالا ثبت شده", "آیا کالایی ثبت شده", "has goods", "goods exist"],
    relationPath: ["shipment", "goods", "exists"],
    sourcePath: "shipment_v2_profiles.sections_json.goods.goodsRows",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.EXISTS,
    metadataOnly: true,
    missingValuePhrase: "کالایی ثبت نشده",
  }),
  field({
    key: "shipment.container_count",
    labelFa: "تعداد کانتینر",
    labelEn: "container count",
    aliases: ["چند تا کانتینر", "کانتینرش چنده", "مجموع کانتینر", "container count"],
    relationPath: ["shipment", "containers", "count"],
    sourcePath: "shipment_v2_profiles.sections_json.goods.container20Count/container40Count",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.COUNT,
    metadataOnly: true,
    missingValuePhrase: "تعداد کانتینر ثبت نشده",
  }),
  field({
    key: "shipment.current_stage",
    labelFa: "مرحله فعلی",
    labelEn: "current stage",
    aliases: ["مرحله فعلی بار", "مرحله فعلی محموله", "مرحله عملیات", "الان تو چه مرحله", "مرحله‌اش", "مرحله اش", "current stage"],
    relationPath: ["shipment", "field", "current_stage"],
    sourcePath: "shipment_v2_profiles.sections_json.base.currentStage",
    missingValuePhrase: "مرحله فعلی ثبت نشده",
  }),
  field({
    key: "shipment.updated_at",
    labelFa: "آخرین به‌روزرسانی",
    labelEn: "last updated at",
    aliases: ["آخرین به روز رسانی", "آخرین آپدیت", "آخرین بار کی آپدیت شده", "آخرین بار کی به روز شده", "کی آپدیت شده", "کی آخرین بار تغییر کرده", "آخرین بار تغییر کرده", "آخرین به‌روزرسانیش", "تاریخ آپدیت", "updated at", "last update"],
    relationPath: ["shipment", "field", "updated_at"],
    sourcePath: "shipment_v2_profiles.updated_at fallback shipments.updated_at",
    missingValuePhrase: "زمان به‌روزرسانی ثبت نشده",
  }),
  field({
    key: "shipment.updated_by",
    labelFa: "به‌روزرسانی توسط",
    labelEn: "updated by",
    aliases: ["کی آپدیتش کرده", "توسط کی آپدیت شده", "توسط چه کسی به روز رسانی شده", "آخرین به روز رسانی توسط", "آخرین آپدیتش توسط کی بوده", "آخرین تغییر رو کی داده", "چه کسی به روز کرده", "توسط چه کسی به‌روزرسانی شده", "updated by"],
    relationPath: ["shipment", "field", "updated_by"],
    sourcePath: "shipment_v2_profiles.updated_by_id -> app_users.name",
    missingValuePhrase: "به‌روزرسانی‌کننده ثبت نشده",
  }),
  field({
    key: "shipment.container_20ft",
    labelFa: "کانتینر ۲۰ فوت",
    labelEn: "20-foot container",
    aliases: ["کانتینر 20 فوت", "کانتینر بیست فوت", "بیست فوت", "۲۰ فوت", "20ft", "20 foot container"],
    relationPath: ["shipment", "goods", "container_20ft"],
    sourcePath: "shipment_v2_profiles.sections_json.goods.container20Count",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.COUNT,
    metadataOnly: true,
    missingValuePhrase: "تعداد کانتینر ۲۰ فوت ثبت نشده",
  }),
  field({
    key: "shipment.container_40ft",
    labelFa: "کانتینر ۴۰ فوت",
    labelEn: "40-foot container",
    aliases: ["کانتینر 40 فوت", "کانتینر چهل فوت", "چهل فوت", "۴۰ فوت", "40ft", "40 foot container"],
    relationPath: ["shipment", "goods", "container_40ft"],
    sourcePath: "shipment_v2_profiles.sections_json.goods.container40Count",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.COUNT,
    metadataOnly: true,
    missingValuePhrase: "تعداد کانتینر ۴۰ فوت ثبت نشده",
  }),
  field({
    key: "shipment.goods.contents",
    labelFa: "محتویات بار",
    labelEn: "goods contents",
    aliases: ["محتویاتش", "شرح کالاش", "شرح کالا", "شرح کالاها", "محتویات بار چیه", "چیا توشه", "چی توشه", "کالا", "کالای", "کالای محموله", "کالاها", "کالاهاش", "goods description", "contents"],
    relationPath: ["shipment", "goods", "contents"],
    sourcePath: "shipment_v2_profiles.sections_json.goods.goodsRows.description",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.LIST,
    missingValuePhrase: "محتویات/شرح کالا ثبت نشده",
  }),
  field({
    key: "shipment.goods.list",
    labelFa: "لیست کالاها",
    labelEn: "goods list",
    aliases: ["فهرست کالا", "لیست کالا", "کالاهای بار", "کالاهاش چیه", "چه کالاهایی ثبت شده", "goods list", "commodities"],
    relationPath: ["shipment", "goods", "list"],
    sourcePath: "shipment_v2_profiles.sections_json.goods.goodsRows",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.LIST,
    missingValuePhrase: "لیست کالا ثبت نشده",
  }),
  field({
    key: "shipment.documents.count",
    labelFa: "مجموع اسناد",
    labelEn: "total documents",
    aliases: ["اسنادش", "مدارکش", "تعداد سند", "تعداد اسناد", "تعداد مدارک", "تعداد فایل", "تعداد فایل‌ها", "چند تا سند داره", "documents count", "document count"],
    relationPath: ["shipment", "documents", "count"],
    sourcePath: "documents count by shipment_id",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.COUNT,
    metadataOnly: true,
    missingValuePhrase: "سندی بارگذاری نشده",
  }),
  field({
    key: "shipment.documents.exists",
    labelFa: "وجود سند",
    labelEn: "documents exist",
    aliases: ["سند داره", "سندی داره", "سند بارگذاری شده", "سندی بارگذاری شده", "سندی براش بارگذاری شده", "مدرک آپلود شده", "مدرکی براش بارگذاری شده", "مدرک داره", "فایل داره", "آیا سندی بارگذاری شده", "has document", "has documents", "documents exist"],
    relationPath: ["shipment", "documents", "exists"],
    sourcePath: "documents existence by shipment_id",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.EXISTS,
    metadataOnly: true,
    missingValuePhrase: "سندی بارگذاری نشده",
  }),
  field({
    key: "shipment.messages.exists",
    labelFa: "وجود پیام داخلی",
    labelEn: "internal messages exist",
    aliases: ["پیام داخلی دارد", "پیام داخلی داره", "پیام داخلی", "پیامی ثبت شده", "چت داخلی دارد", "گفتگو داخلی دارد", "گفتگوی محموله", "گفتگو داره", "internal messages"],
    relationPath: ["shipment", "messages", "exists"],
    sourcePath: "chat_threads/chat_messages metadata",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.EXISTS,
    metadataOnly: true,
    missingValuePhrase: "پیام داخلی ثبت نشده",
  }),
  field({
    key: "shipment.messages.count",
    labelFa: "تعداد پیام‌های داخلی",
    labelEn: "internal message count",
    aliases: ["تعداد پیام داخلی", "تعداد پیام‌ها", "تعداد پیام ها", "چند تا پیام داخلی", "چند تا پیام", "چند پیام داخلی", "تعداد چت داخلی", "message count", "internal message count"],
    relationPath: ["shipment", "messages", "count"],
    sourcePath: "chat_threads/chat_messages metadata",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.COUNT,
    metadataOnly: true,
    missingValuePhrase: "پیام داخلی ثبت نشده",
  }),
  field({
    key: "shipment.messages.latest",
    labelFa: "آخرین پیام داخلی",
    labelEn: "latest internal message",
    aliases: ["آخرین پیام داخلی", "آخرین چت داخلی", "آخرین پیام", "latest internal message"],
    relationPath: ["shipment", "messages", "latest"],
    sourcePath: "chat_threads/chat_messages latest safe content",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.VALUE,
    missingValuePhrase: "پیام داخلی ثبت نشده",
  }),
  field({
    key: "shipment.customs.cotage_number",
    labelFa: "شماره کوتاژ",
    labelEn: "cotage number",
    aliases: ["کوتاژ", "کوتاژ بار", "شماره کوتاج", "کوتاج", "cotage", "customs declaration number"],
    relationPath: ["shipment", "customs", "cotage_number"],
    sourcePath: "shipment_v2_profiles.sections_json.declarationKootaj.cotageNumber",
    missingValuePhrase: "شماره کوتاژ ثبت نشده",
  }),
  field({
    key: "shipment.customs.route",
    labelFa: "مسیر گمرکی",
    labelEn: "customs route",
    aliases: ["مسیر گمرک", "مسیر گمرکی بار", "customs route"],
    relationPath: ["shipment", "customs", "route"],
    sourcePath: "shipment_v2_profiles.sections_json.declarationKootaj.customsRoute",
    missingValuePhrase: "مسیر گمرکی ثبت نشده",
  }),
  field({
    key: "shipment.customs.cotage_registered_at",
    labelFa: "تاریخ ثبت کوتاژ",
    labelEn: "cotage registration date",
    aliases: ["تاریخ کوتاژ", "تاریخ ثبت کوتاج", "زمان ثبت کوتاژ", "کوتاژ کی ثبت شده", "cotage date", "cotage registration date"],
    relationPath: ["shipment", "customs", "cotage_registered_at"],
    sourcePath: "shipment_v2_profiles.sections_json.declarationKootaj.cotageRegistrationDate",
    missingValuePhrase: "تاریخ ثبت کوتاژ ثبت نشده",
  }),
  field({
    key: "shipment.customs.total_value",
    labelFa: "ارزش کل",
    labelEn: "total value",
    aliases: ["ارزش کل بار", "ارزش کل محموله", "total value"],
    relationPath: ["shipment", "customs", "total_value"],
    sourcePath: "shipment_v2_profiles.sections_json.declarationKootaj.totalValueAmount/Currency",
    missingValuePhrase: "ارزش کل ثبت نشده",
  }),
  field({
    key: "shipment.customs.final_paid_amount",
    labelFa: "مبلغ نهایی پرداختی",
    labelEn: "final paid amount",
    aliases: ["مبلغ نهایی پرداختی", "پرداختی نهایی", "پرداخت نهایی", "نهایی چقدر پرداخت شده", "پرداخت نهاییش", "final paid amount"],
    relationPath: ["shipment", "customs", "final_paid_amount"],
    sourcePath: "shipment_v2_profiles.sections_json.declarationKootaj.finalPaidAmount/Currency",
    missingValuePhrase: "مبلغ نهایی پرداختی ثبت نشده",
  }),
  field({
    key: "shipment.permits.exists",
    labelFa: "وجود مجوز",
    labelEn: "permits exist",
    aliases: ["مجوز دارد", "مجوز داره", "مجوز ثبت شده", "مجوزی ثبت شده", "مجوزی براش زدن", "مجوز", "آیا مجوزی ثبت شده", "has permit", "permits exist"],
    relationPath: ["shipment", "permits", "exists"],
    sourcePath: "shipment_v2_profiles.sections_json.permits.permitRows",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.EXISTS,
    metadataOnly: true,
    missingValuePhrase: "مجوزی ثبت نشده",
  }),
  field({
    key: "shipment.permits.count",
    labelFa: "تعداد مجوزها",
    labelEn: "permit count",
    aliases: ["چند تا مجوز", "چند مجوز", "لیست مجوزها", "مجوزها", "permit count", "permits list"],
    relationPath: ["shipment", "permits", "count"],
    sourcePath: "shipment_v2_profiles.sections_json.permits.permitRows",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.LIST,
    metadataOnly: true,
    missingValuePhrase: "مجوزی ثبت نشده",
  }),
  field({
    key: "shipment.payments.customs_amount",
    labelFa: "مبلغ گمرکی",
    labelEn: "customs amount",
    aliases: ["مبلغ گمرکی", "هزینه گمرکی", "پرداخت گمرکی", "گمرکی پرداخت شده", "مبلغ گمرکیش پرداخت شده", "customs amount"],
    relationPath: ["shipment", "payments", "customs_amount"],
    sourcePath: "shipment_v2_profiles.sections_json.payments.customsAmount/Currency",
    missingValuePhrase: "مبلغ گمرکی ثبت نشده",
  }),
  field({
    key: "shipment.payments.customs_difference",
    labelFa: "تفاوت گمرکی",
    labelEn: "customs difference",
    aliases: ["تفاوت گمرکی", "اختلاف گمرکی", "اختلاف گمرکیش", "مابه التفاوت گمرکی", "customs difference"],
    relationPath: ["shipment", "payments", "customs_difference"],
    sourcePath: "shipment_v2_profiles.sections_json.payments.customsDifferenceAmount/Currency",
    missingValuePhrase: "تفاوت گمرکی ثبت نشده",
  }),
  field({
    key: "shipment.payments.customs_tax",
    labelFa: "مالیات گمرکی",
    labelEn: "customs tax",
    aliases: ["مالیات گمرکی", "مالیات", "مالیاتش", "وضعیت مالیات گمرکی", "customs tax"],
    relationPath: ["shipment", "payments", "customs_tax"],
    sourcePath: "shipment_v2_profiles.sections_json.payments.customsTaxStatus/customsTaxAmount/Currency",
    missingValuePhrase: "مالیات گمرکی ثبت نشده",
  }),
  field({
    key: "shipment.payments.status",
    labelFa: "وضعیت پرداخت",
    labelEn: "payment status",
    aliases: ["پرداخت شده", "پرداخت شده یا نه", "وضعیت پرداخت گمرکی", "پرداخت گمرکی", "payment status"],
    relationPath: ["shipment", "payments", "status"],
    sourcePath: "shipment_v2_profiles.sections_json.payments.customsPaymentPaid",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.EXISTS,
    metadataOnly: true,
    missingValuePhrase: "وضعیت پرداخت ثبت نشده",
  }),
  field({
    key: "shipment.payments.customs_payment_date",
    labelFa: "تاریخ پرداخت گمرکی",
    labelEn: "customs payment date",
    aliases: ["تاریخ پرداخت گمرکی", "پرداخت گمرکی کی ثبت شده", "customs payment date", "payment date"],
    relationPath: ["shipment", "payments", "customs_payment_date"],
    sourcePath: "shipment_kootaj_details.customs_payment_date",
    missingValuePhrase: "تاریخ پرداخت گمرکی ثبت نشده",
  }),
  field({
    key: "shipment.payments.payment_reference",
    labelFa: "شناسه پرداخت",
    labelEn: "payment reference",
    aliases: ["شناسه پرداخت", "رفرنس پرداخت", "شماره پرداخت", "payment reference"],
    relationPath: ["shipment", "payments", "payment_reference"],
    sourcePath: "shipment_kootaj_details.payment_reference",
    missingValuePhrase: "شناسه پرداخت ثبت نشده",
  }),
  field({
    key: "shipment.bank.name",
    labelFa: "نام بانک",
    labelEn: "bank name",
    aliases: ["بانک", "نام بانک بار", "bank name"],
    relationPath: ["shipment", "bank", "name"],
    sourcePath: "shipment_v2_profiles.sections_json.banking.bankName",
    missingValuePhrase: "نام بانک ثبت نشده",
  }),
  field({
    key: "shipment.bank.branch_code",
    labelFa: "کد شعبه",
    labelEn: "branch code",
    aliases: ["کد شعبه بانک", "شماره شعبه", "شماره شعبه‌اش", "branch code"],
    relationPath: ["shipment", "bank", "branch_code"],
    sourcePath: "shipment_v2_profiles.sections_json.banking.branchCode",
    missingValuePhrase: "کد شعبه ثبت نشده",
  }),
  field({
    key: "shipment.bank.branch_name",
    labelFa: "نام شعبه",
    labelEn: "branch name",
    aliases: ["شعبه بانک", "شعبه‌اش", "اسم شعبه", "branch name"],
    relationPath: ["shipment", "bank", "branch_name"],
    sourcePath: "shipment_v2_profiles.sections_json.banking.branchName",
    missingValuePhrase: "نام شعبه ثبت نشده",
  }),
  field({
    key: "shipment.bank.payment_instrument_code",
    labelFa: "کد ابزار پرداخت",
    labelEn: "payment instrument code",
    aliases: ["کد ابزار پرداخت", "کد ابزار", "ابزار پرداخت", "ابزار پرداختش", "کد پرداخت", "payment instrument code"],
    relationPath: ["shipment", "bank", "payment_instrument_code"],
    sourcePath: "shipment_v2_profiles.sections_json.banking.paymentInstrumentCode",
    missingValuePhrase: "کد ابزار پرداخت ثبت نشده",
  }),
  field({
    key: "shipment.bank.sata_code",
    labelFa: "کد ساتا",
    labelEn: "SATA code",
    aliases: ["ساتا", "کد ساتا", "sata code"],
    relationPath: ["shipment", "bank", "sata_code"],
    sourcePath: "shipment_v2_profiles.sections_json.banking.sataCode",
    missingValuePhrase: "کد ساتا ثبت نشده",
  }),
  field({
    key: "shipment.notes.exists",
    labelFa: "وجود یادداشت",
    labelEn: "notes exist",
    aliases: ["یادداشت دارد", "یادداشت داره", "یادداشتی هست", "برای این پرونده یادداشتی هست", "نوت دارد", "notes exist", "has note"],
    relationPath: ["shipment", "notes", "exists"],
    sourcePath: "shipment_v2_profiles.sections_json.notes.internalNote",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.EXISTS,
    metadataOnly: true,
    missingValuePhrase: "یادداشتی ثبت نشده",
  }),
  field({
    key: "shipment.notes.text",
    labelFa: "متن یادداشت",
    labelEn: "note text",
    aliases: ["متن یادداشت", "یادداشت چی نوشته", "یادداشت", "نوت", "note text"],
    relationPath: ["shipment", "notes", "text"],
    sourcePath: "shipment_v2_profiles.sections_json.notes.internalNote",
    missingValuePhrase: "یادداشتی ثبت نشده",
  }),
  field({
    key: "shipment.documents.file_link",
    labelFa: "فایل سند",
    labelEn: "document file link",
    aliases: ["فایل سند", "لینک سند", "دانلود سند", "خود سند", "document file", "document link", "download document"],
    relationPath: ["shipment", "documents", "file_link"],
    sourcePath: "deferred",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.DEFERRED,
    metadataOnly: false,
    deferredUnsupported: true,
    liveVerificationRequired: false,
    missingValuePhrase: "دسترسی به فایل سند هنوز برای همیار فعال نیست",
  }),
  field({
    key: "shipment.documents.image",
    labelFa: "تصویر سند",
    labelEn: "document image",
    aliases: ["تصویر سند", "عکس سند", "اسکن سند", "document image", "document photo"],
    relationPath: ["shipment", "documents", "image"],
    sourcePath: "deferred",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.DEFERRED,
    metadataOnly: false,
    deferredUnsupported: true,
    liveVerificationRequired: false,
    missingValuePhrase: "دسترسی به تصویر سند هنوز برای همیار فعال نیست",
  }),
  field({
    key: "shipment.documents.private_url",
    labelFa: "لینک خصوصی سند",
    labelEn: "private document URL",
    aliases: ["لینک خصوصی سند", "آدرس خصوصی سند", "private url", "signed url", "storage key", "object key"],
    relationPath: ["shipment", "documents", "private_url"],
    sourcePath: "deferred",
    answerPolicy: HAMYAR_SHIPMENT_FIELD_POLICY.DEFERRED,
    metadataOnly: false,
    deferredUnsupported: true,
    liveVerificationRequired: false,
    missingValuePhrase: "لینک خصوصی یا کلید ذخیره‌سازی سند قابل نمایش نیست",
  }),
]);

const FIELD_BY_KEY = new Map(HAMYAR_SHIPMENT_FIELD_DEFINITIONS.map((definition) => [definition.key, definition]));

const ALIAS_INDEX = HAMYAR_SHIPMENT_FIELD_DEFINITIONS
  .flatMap((definition) =>
    definition.aliases.map((alias) => ({
      definition,
      alias,
      normalizedAlias: normalizeShipmentFieldText(alias),
    }))
  )
  .filter((item) => item.normalizedAlias)
  .sort((left, right) => {
    if (left.definition.deferredUnsupported !== right.definition.deferredUnsupported) {
      return left.definition.deferredUnsupported ? -1 : 1;
    }
    return right.normalizedAlias.length - left.normalizedAlias.length;
  });

export function getShipmentFieldDefinition(key) {
  return FIELD_BY_KEY.get(key) || null;
}

export function isShipmentFieldKey(key) {
  return FIELD_BY_KEY.has(key);
}

export function isShipmentFieldDeferred(key) {
  return Boolean(getShipmentFieldDefinition(key)?.deferredUnsupported);
}

export function listShipmentFieldDefinitions({ includeDeferred = true } = {}) {
  return HAMYAR_SHIPMENT_FIELD_DEFINITIONS.filter((definition) => includeDeferred || !definition.deferredUnsupported);
}

export function matchShipmentFieldQuestion(value = "") {
  const normalized = normalizeShipmentFieldText(value);
  if (!normalized) return null;
  for (const item of ALIAS_INDEX) {
    if (normalized.includes(item.normalizedAlias)) {
      return {
        field: item.definition,
        matchedAlias: item.alias,
        normalizedAlias: item.normalizedAlias,
      };
    }
  }
  return null;
}

export function shipmentFieldCapabilityEntries() {
  return Object.fromEntries(
    HAMYAR_SHIPMENT_FIELD_DEFINITIONS.map((definition) => [
      definition.key,
      {
        aliases: definition.aliases,
        source: definition.sourcePath,
        sourceTool: definition.sourceTool,
        safe: definition.deferredUnsupported ? "restricted" : "live_verify",
        freshness: definition.liveVerificationRequired ? "live_required" : "snapshot_ok",
        memoryPolicy: definition.metadataOnly ? "candidate_only" : "none",
        answerTemplate: `${definition.labelFa} بار {shipmentCode}: {value}`,
        missingTemplate: `برای این محموله ${definition.missingValuePhrase}.`,
        notes: definition.deferredUnsupported
          ? "Document file/link/image lookup is intentionally deferred and must not expose private URLs, storage keys, signed URLs, files, or images."
          : "Visible shipment detail page field; answer from the narrow live shipment field tool.",
      },
    ])
  );
}
