import {
  SHIPMENT_DIRECTION_VALUES,
  SHIPMENT_FORM_FIELD_SOURCES,
  SHIPMENT_FORM_FIELD_TYPES,
  SHIPMENT_TYPE_CODES,
  TRANSPORT_MODE_VALUES,
} from "../../shared/shipment-form-fields.js";
import { z } from "../validation.js";

const blankToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalTrimmedText = (max = 180) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max).optional()
  );

const blankToNull = (value) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalNullableTrimmedText = (max = 180) =>
  z.preprocess(
    blankToNull,
    z.string().trim().max(max).nullable().optional()
  );

const padDatePart = (value) => String(value).padStart(2, "0");
const normalizeIsoDateInput = (value) => {
  const normalizedValue = blankToNull(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  if (typeof normalizedValue !== "string") return normalizedValue;
  const match = normalizedValue.trim().replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return normalizedValue;
  return `${match[1]}-${padDatePart(match[2])}-${padDatePart(match[3])}`;
};
const isRealIsoDate = (value) => {
  if (!value) return true;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};
const normalizeShipmentV2DateInput = (value) => {
  const normalizedValue = blankToNull(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  if (typeof normalizedValue !== "string") return normalizedValue;
  const match = normalizedValue.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return normalizedValue;
  const year = Number(match[1]);
  const separator = year < 1700 ? "/" : "-";
  return `${match[1]}${separator}${padDatePart(match[2])}${separator}${padDatePart(match[3])}`;
};
const isPlausibleShamsiDate = (value) => {
  if (!value) return true;
  const match = String(value).match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1200 || year > 1600 || month < 1 || month > 12) return false;
  const maxDay = month <= 6 ? 31 : month <= 11 ? 30 : 30;
  return day >= 1 && day <= maxDay;
};
const isRealShipmentV2Date = (value) => {
  if (!value) return true;
  const stringValue = String(value);
  return stringValue.includes("/") ? isPlausibleShamsiDate(stringValue) : isRealIsoDate(stringValue);
};

const optionalId = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1, "Identifier is required.").max(128).optional().nullable()
);
const optionalNullableId = z.preprocess(
  blankToNull,
  z.string().trim().min(1, "Identifier is required.").max(128).nullable().optional()
);
const normalizeLocalizedNumberInput = (value) => {
  const normalizedValue = blankToNull(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  if (typeof normalizedValue === "number") return normalizedValue;
  const persianDigits = "\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9";
  const arabicDigits = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
  return String(normalizedValue)
    .replace(/[\u06f0-\u06f9\u0660-\u0669]/g, (digit) => {
      const persianIndex = persianDigits.indexOf(digit);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = arabicDigits.indexOf(digit);
      return arabicIndex >= 0 ? String(arabicIndex) : digit;
    })
    .replace(/[\u066c,]/g, "")
    .replace(/\u066b/g, ".")
    .trim();
};
const optionalNullableNonNegativeNumber = z.preprocess((value) => {
  const normalizedValue = normalizeLocalizedNumberInput(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : normalizedValue;
}, z.number().min(0, "Number fields cannot be negative.").nullable().optional());

const requiredId = z.string().trim().min(1, "Identifier is required.").max(128);
const firstQueryValue = (value) => Array.isArray(value) ? value[0] : value;
const queryLimit = (defaultValue = 50) =>
  z.preprocess((value) => {
    const singleValue = firstQueryValue(value);
    if (singleValue === undefined || singleValue === "") return undefined;
    const numberValue = Number(singleValue);
    return Number.isFinite(numberValue) ? numberValue : singleValue;
  }, z.number().int().min(1).max(100).default(defaultValue));

export const shipmentParamsSchema = z.object({
  id: requiredId,
});

export const SHIPMENT_V2_SECTION_KEYS = [
  "base",
  "orderRegistration",
  "goods",
  "declarationKootaj",
  "permits",
  "payments",
  "banking",
  "notes",
];

const shipmentStatus = z.enum(["PENDING", "BOOKED", "IN_TRANSIT", "ARRIVED", "CUSTOMS", "CLEARED", "DELIVERED", "CLOSED"]);
const shipmentDirection = z.enum(SHIPMENT_DIRECTION_VALUES);
const shipmentTransportMode = z.enum(TRANSPORT_MODE_VALUES);
const shipmentTypeCode = z.enum(SHIPMENT_TYPE_CODES);
const lenjType = z.enum(["TEH_LENJI", "MALVANI"]);
const shipmentV2FlowCode = z.enum(["IMPORT_LANJ", "IMPORT_SHIP"]);
const shipmentV2CodeMode = z.enum(["new", "existing"]);
const shipmentV2SectionKey = z.enum(SHIPMENT_V2_SECTION_KEYS);
const shipmentV2Text = (max = 180) => z.string().trim().max(max).optional();
const shipmentV2NumericText = (max = 80) =>
  z.string().trim().max(max).regex(/^\d*$/, "This field must contain digits only.").optional();
const requiredShipmentV2Text = (fieldName, max = 180) =>
  z.string().trim().min(1, `${fieldName} is required.`).max(max);
const shipmentV2CustomsRoute = z.enum(["GREEN", "YELLOW", "RED", "DIRECT_CARRIAGE"]);
const shipmentV2CurrencyCode = z.enum(["EUR", "CNY", "USD", "AED", "IRR"]);
const shipmentV2CustomsTaxStatus = z.enum(["PAYABLE", "GOOD_STANDING"]);
const shipmentV2Date = z.preprocess(
  normalizeShipmentV2DateInput,
  z.string().trim().refine(isRealShipmentV2Date, "Date must be a valid Shamsi YYYY/MM/DD or ISO YYYY-MM-DD date.").nullable().optional()
);
const optionalNonNegativeNumber = z.preprocess((value) => {
  const normalizedValue = normalizeLocalizedNumberInput(value);
  if (normalizedValue === "" || normalizedValue === undefined || normalizedValue === null) return undefined;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : value;
}, z.number().min(0).optional());

const shipmentV2GoodsRowSchema = z.object({
  description: requiredShipmentV2Text("Goods description", 300),
  packagingType: shipmentV2Text(180),
  quantity: optionalNullableNonNegativeNumber,
  weight: optionalNullableNonNegativeNumber,
  cbm: optionalNullableNonNegativeNumber,
  pcs: optionalNullableNonNegativeNumber,
}).strict();

const shipmentV2PermitRowSchema = z.object({
  permitName: requiredShipmentV2Text("Permit name", 320),
  permitState: shipmentV2Text(180),
}).strict();

const shipmentV2BaseSectionPayloadSchema = z.object({
  trackingNumber: shipmentV2Text(120),
  origin: shipmentV2Text(180),
  dischargePort: shipmentV2Text(180),
  deliveryPort: shipmentV2Text(180),
  consigneeName: shipmentV2Text(180),
  lenjType: lenjType.optional().nullable(),
  statusText: shipmentV2Text(240),
  currentStage: shipmentV2Text(2000),
  orderRegistrationNumber: shipmentV2NumericText(120),
  commercialCardId: optionalNullableId,
  commercialCardDisplayName: shipmentV2Text(240),
  malvaniProfileId: optionalNullableId,
  malvaniDisplayName: shipmentV2Text(240),
}).strict();

const shipmentV2GoodsSectionPayloadSchema = z.object({
  container20Count: optionalNullableNonNegativeNumber,
  container40Count: optionalNullableNonNegativeNumber,
  goodsRows: z.array(shipmentV2GoodsRowSchema).max(100).optional(),
}).strict();

const shipmentV2DeclarationKootajSectionPayloadSchema = z.object({
  cotageNumber: shipmentV2Text(120),
  customsRoute: shipmentV2CustomsRoute.optional().nullable(),
  cotageRegistrationDate: shipmentV2Date,
  totalValueAmount: optionalNullableNonNegativeNumber,
  totalValueCurrency: shipmentV2CurrencyCode.optional(),
  finalPaidAmount: optionalNullableNonNegativeNumber,
  finalPaidCurrency: shipmentV2CurrencyCode.optional(),
}).strict();

const shipmentV2PermitsSectionPayloadSchema = z.object({
  permitRows: z.array(shipmentV2PermitRowSchema).max(100).optional(),
}).strict();

const shipmentV2PaymentsSectionPayloadSchema = z.object({
  customsPaymentPaid: z.boolean().optional(),
  customsAmount: optionalNullableNonNegativeNumber,
  customsAmountCurrency: shipmentV2CurrencyCode.optional(),
  customsDifferenceAmount: optionalNullableNonNegativeNumber,
  customsDifferenceCurrency: shipmentV2CurrencyCode.optional(),
  customsDifferencePaid: z.boolean().optional(),
  customsTaxStatus: shipmentV2CustomsTaxStatus.optional().nullable(),
  customsTaxAmount: optionalNullableNonNegativeNumber,
  customsTaxCurrency: shipmentV2CurrencyCode.optional(),
  customsTaxPaid: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.customsTaxStatus === "PAYABLE" && (value.customsTaxAmount === undefined || value.customsTaxAmount === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Customs tax amount is required when customs tax needs payment.",
      path: ["customsTaxAmount"],
    });
  }
});

const shipmentV2BankingSectionPayloadSchema = z.object({
  bankName: shipmentV2Text(180),
  branchCode: shipmentV2NumericText(80),
  branchName: shipmentV2Text(180),
  paymentInstrumentCode: shipmentV2NumericText(120),
  sataCode: shipmentV2NumericText(120),
}).strict();

const shipmentV2NotesSectionPayloadSchema = z.object({
  internalNote: shipmentV2Text(4000),
}).strict();

const shipmentV2EmptySectionPayloadSchema = z.object({}).strict();

export const shipmentV2SectionPayloadSchemas = {
  base: shipmentV2BaseSectionPayloadSchema,
  orderRegistration: shipmentV2EmptySectionPayloadSchema,
  goods: shipmentV2GoodsSectionPayloadSchema,
  declarationKootaj: shipmentV2DeclarationKootajSectionPayloadSchema,
  permits: shipmentV2PermitsSectionPayloadSchema,
  payments: shipmentV2PaymentsSectionPayloadSchema,
  banking: shipmentV2BankingSectionPayloadSchema,
  notes: shipmentV2NotesSectionPayloadSchema,
};

export const shipmentV2CreateBodySchema = z.object({
  flowCode: shipmentV2FlowCode,
  codeMode: shipmentV2CodeMode.optional().default("new"),
  trackingNumber: optionalTrimmedText(120),
  customerId: requiredId,
  origin: requiredShipmentV2Text("Origin"),
  dischargePort: requiredShipmentV2Text("Discharge port"),
  deliveryPort: requiredShipmentV2Text("Delivery port"),
  consigneeName: optionalTrimmedText(180),
  lenjType: lenjType.optional().nullable(),
  container20Count: optionalNonNegativeNumber,
  container40Count: optionalNonNegativeNumber,
  goodsRows: z.array(shipmentV2GoodsRowSchema).max(100).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.flowCode === "IMPORT_LANJ" && !value.lenjType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Lenj type is required.",
      path: ["lenjType"],
    });
  }
  if (value.codeMode === "existing" && !value.trackingNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Shipment code is required.",
      path: ["trackingNumber"],
    });
  }
});

export const shipmentV2SectionParamsSchema = shipmentParamsSchema.extend({
  sectionKey: shipmentV2SectionKey,
});

const shipmentOperationalFieldsBaseSchema = z.object({
  trackingNumber: optionalTrimmedText(120),
  shipmentCode: optionalTrimmedText(120),
  containerNumber: optionalTrimmedText(120),
  containerCount: optionalNonNegativeNumber,
  grossWeightKg: optionalNonNegativeNumber,
  weight: optionalNonNegativeNumber,
  customerId: optionalId,
  customerName: optionalTrimmedText(180),
  origin: optionalTrimmedText(180),
  destination: optionalTrimmedText(180),
  status: shipmentStatus.optional(),
  shipmentDirection: shipmentDirection.optional(),
  shipment_direction: shipmentDirection.optional(),
  transportMode: shipmentTransportMode.optional(),
  transport_mode: shipmentTransportMode.optional(),
  shipmentTypeCode: shipmentTypeCode.optional(),
  shipment_type_code: shipmentTypeCode.optional(),
  estimatedDelivery: optionalTrimmedText(80),
  actualDelivery: optionalTrimmedText(80),
  freeTimeDays: optionalNonNegativeNumber,
  notes: optionalTrimmedText(4000),
  customsDeclarationNumber: optionalTrimmedText(120),
  customsStatus: optionalTrimmedText(120),
  importPermitNumber: optionalTrimmedText(120),
  assignedManagerId: optionalId,
}).strict();

export const shipmentCreateBodySchema = shipmentOperationalFieldsBaseSchema.refine(
  (value) => value.trackingNumber || value.shipmentCode,
  {
    message: "Shipment tracking number is required.",
    path: ["trackingNumber"],
  }
);

export const shipmentOperationalFieldsBodySchema = shipmentOperationalFieldsBaseSchema.refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  {
    message: "At least one shipment field is required.",
  }
);

const postExitStatus = z.enum(["needs_follow_up", "in_progress", "settled", "closed"]);
const optionalIsoDate = z.preprocess(
  normalizeIsoDateInput,
  z.string().trim().refine(isRealIsoDate, "Date must be a valid YYYY-MM-DD date.").nullable().optional()
);

export const exitedShipmentsListQuerySchema = z.object({
  q: z.preprocess(firstQueryValue, optionalTrimmedText(120)),
  customerId: z.preprocess(firstQueryValue, optionalNullableId),
  shipmentTypeCode: z.preprocess(firstQueryValue, shipmentTypeCode.optional()),
  exitDateFrom: z.preprocess(firstQueryValue, optionalIsoDate),
  exitDateTo: z.preprocess(firstQueryValue, optionalIsoDate),
  postExitStatus: z.preprocess(firstQueryValue, postExitStatus.optional()),
  assignedManagerId: z.preprocess(firstQueryValue, optionalNullableId),
  limit: queryLimit(100),
}).strict();

export const exitedShipmentArchiveBodySchema = z.object({
  reason: optionalNullableTrimmedText(1000),
}).strict();

export const postExitUpdateBodySchema = z.object({
  postExitStatus: postExitStatus.optional(),
  postExitNote: optionalNullableTrimmedText(4000),
  postExitFollowUpAt: optionalIsoDate,
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  {
    message: "At least one post-exit field is required.",
  }
);

const shipmentFormFieldKey = z.string().trim().min(2).max(80).regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Field key must be camelCase-like ASCII.");
const shipmentFormOptionSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
}).strict();

export const shipmentFormTemplateParamsSchema = z.object({
  id: requiredId,
});

export const shipmentFormTemplateFieldParamsSchema = shipmentFormTemplateParamsSchema.extend({
  fieldId: requiredId,
});

export const shipmentFormTemplateListQuerySchema = z.object({
  shipmentTypeCode: z.preprocess(firstQueryValue, shipmentTypeCode.optional()),
}).strict();

export const shipmentFormTemplateCreateBodySchema = z.object({
  code: optionalTrimmedText(120),
  shipmentTypeCode,
  titleFa: z.string().trim().min(1).max(180),
  description: optionalTrimmedText(1000),
  isActive: z.boolean().optional(),
}).strict();

const shipmentFormTemplateSectionPatchSchema = z.object({
  id: optionalId,
  sectionKey: optionalTrimmedText(80),
  titleFa: optionalTrimmedText(180),
  description: optionalTrimmedText(1000),
  sortOrder: optionalNonNegativeNumber,
  isCollapsedByDefault: z.boolean().optional(),
}).strict();

export const shipmentFormTemplateUpdateBodySchema = z.object({
  titleFa: optionalTrimmedText(180),
  description: optionalTrimmedText(1000),
  isActive: z.boolean().optional(),
  sections: z.array(shipmentFormTemplateSectionPatchSchema).max(60).optional(),
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: "At least one template field is required." }
);

export const shipmentFormTemplateFieldCreateBodySchema = z.object({
  sectionId: optionalId,
  sectionKey: optionalTrimmedText(80),
  fieldKey: shipmentFormFieldKey,
  fieldSource: z.enum(SHIPMENT_FORM_FIELD_SOURCES),
  fieldType: z.enum(SHIPMENT_FORM_FIELD_TYPES).optional(),
  labelFa: z.string().trim().min(1).max(180),
  helperText: optionalTrimmedText(1000),
  placeholder: optionalTrimmedText(180),
  sortOrder: optionalNonNegativeNumber,
  isVisible: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isImportant: z.boolean().optional(),
  showInShipmentDetail: z.boolean().optional(),
  showInDailyStatus: z.boolean().optional(),
  showInCreateForm: z.boolean().optional(),
  validationJson: z.record(z.unknown()).optional(),
  optionsJson: z.array(shipmentFormOptionSchema).max(80).optional(),
}).strict().refine(
  (value) => Boolean(value.sectionId || value.sectionKey),
  { path: ["sectionId"], message: "A section is required." }
);

export const shipmentFormTemplateFieldUpdateBodySchema = z.object({
  sectionId: optionalId,
  labelFa: optionalTrimmedText(180),
  helperText: optionalTrimmedText(1000),
  placeholder: optionalTrimmedText(180),
  sortOrder: optionalNonNegativeNumber,
  isVisible: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isImportant: z.boolean().optional(),
  showInShipmentDetail: z.boolean().optional(),
  showInDailyStatus: z.boolean().optional(),
  showInCreateForm: z.boolean().optional(),
  validationJson: z.record(z.unknown()).optional(),
  optionsJson: z.array(shipmentFormOptionSchema).max(80).optional(),
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: "At least one field update is required." }
);
