import { z } from "./validation.js";
import {
  DAILY_STATUS_COMMON_STATUSES,
  DAILY_STATUS_COMMON_STATUS_FIELDS,
  DAILY_STATUS_CUSTOMS_ROUTES,
  DAILY_STATUS_CUSTOMS_STATUSES,
  DAILY_STATUS_DATE_FIELDS,
  DAILY_STATUS_NUMBER_FIELDS,
  DAILY_STATUS_RELEASE_STATUSES,
  DAILY_STATUS_TAX_PAYMENT_STATUSES,
} from "../shared/daily-status-board.js";
import {
  SHIPMENT_DIRECTION_VALUES,
  SHIPMENT_FORM_FIELD_SOURCES,
  SHIPMENT_FORM_FIELD_TYPES,
  SHIPMENT_TYPE_CODES,
  TRANSPORT_MODE_VALUES,
} from "../shared/shipment-form-fields.js";

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

const optionalId = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1, "Identifier is required.").max(128).optional().nullable()
);
const optionalNullableId = z.preprocess(
  blankToNull,
  z.string().trim().min(1, "Identifier is required.").max(128).nullable().optional()
);
const optionalNullableNonNegativeNumber = z.preprocess((value) => {
  const normalizedValue = blankToNull(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : normalizedValue;
}, z.number().min(0, "Number fields cannot be negative.").nullable().optional());
const optionalNullableNonNegativeInteger = z.preprocess((value) => {
  const normalizedValue = blankToNull(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : normalizedValue;
}, z.number().int().min(0, "Number fields cannot be negative.").nullable().optional());

const requiredId = z.string().trim().min(1, "Identifier is required.").max(128);
const firstQueryValue = (value) => Array.isArray(value) ? value[0] : value;
const queryBoolean = (defaultValue = false) =>
  z.preprocess((value) => {
    const singleValue = firstQueryValue(value);
    if (singleValue === undefined) return undefined;
    if (singleValue === true || singleValue === "true") return true;
    if (singleValue === false || singleValue === "false") return false;
    return singleValue;
  }, z.boolean().default(defaultValue));
const queryLimit = (defaultValue = 50) =>
  z.preprocess((value) => {
    const singleValue = firstQueryValue(value);
    if (singleValue === undefined || singleValue === "") return undefined;
    const numberValue = Number(singleValue);
    return Number.isFinite(numberValue) ? numberValue : singleValue;
  }, z.number().int().min(1).max(100).default(defaultValue));
const optionalQueryEnum = (values) =>
  z.preprocess(firstQueryValue, z.enum(values).optional());
const archiveEntityType = z.enum([
  "shipment",
  "document",
  "cheque",
  "compliance_meeting",
  "quotation",
  "customer",
]);

const publicTrackingToken = z
  .string()
  .trim()
  .min(24, "Tracking token is not valid.")
  .max(256, "Tracking token is too long.")
  .regex(/^[A-Za-z0-9_-]+$/, "Tracking token is not valid.");

export const publicTrackParamsSchema = z.object({
  token: publicTrackingToken,
});

export const publicTrackDocumentParamsSchema = z.object({
  token: publicTrackingToken,
  documentId: requiredId,
});

export const publicDocumentParamsSchema = z.object({
  id: requiredId,
});

export const publicDocumentQuerySchema = z.object({
  shipmentCode: z.preprocess(firstQueryValue, optionalTrimmedText(120)),
  expires: z.preprocess(firstQueryValue, optionalTrimmedText(32)),
  signature: z.preprocess(
    firstQueryValue,
    z.string().trim().min(20).max(256).regex(/^[A-Za-z0-9_-]+$/).optional()
  ),
});

export const publicTrackSearchBodySchema = z.object({
  shipmentCode: z.string().trim().min(1, "Shipment code is required.").max(120),
  verification: z.string().trim().min(1, "Verification value is required.").max(200),
});

export const documentMetadataSchema = z.object({
  title: optionalTrimmedText(180),
  type: optionalTrimmedText(80),
  shipmentId: optionalId,
  customerId: optionalId,
  visibility: z.enum(["internal", "customer_visible"]).optional(),
});

export const documentVisibilitySchema = z.object({
  visibility: z.enum(["internal", "customer_visible"], {
    required_error: "Document visibility is required.",
    invalid_type_error: "Document visibility is not valid.",
  }),
});

export const documentParamsSchema = z.object({
  id: requiredId,
});

const customerMutationBaseSchema = z.object({
  name: optionalTrimmedText(180),
  contactName: optionalTrimmedText(180),
  company: optionalTrimmedText(180),
  companyName: optionalTrimmedText(180),
  email: optionalTrimmedText(254),
  phone: optionalTrimmedText(80),
  address: optionalTrimmedText(500),
  referrer: optionalTrimmedText(180),
  notes: optionalTrimmedText(2000),
  status: optionalTrimmedText(40),
}).passthrough();

export const customerParamsSchema = z.object({
  id: requiredId,
});

export const customerRelatedParamsSchema = customerParamsSchema.extend({
  related: z.enum(["shipments", "documents", "quotations", "cheques"]),
});

export const customerCreateBodySchema = customerMutationBaseSchema.refine(
  (value) => value.name || value.contactName || value.company || value.companyName,
  {
    message: "Customer name or company is required.",
    path: ["name"],
  }
);

export const customerUpdateBodySchema = customerMutationBaseSchema;

export const shipmentParamsSchema = z.object({
  id: requiredId,
});

export const dailyStatusParamsSchema = z.object({
  shipmentId: requiredId,
});

const shipmentStatus = z.enum(["PENDING", "BOOKED", "IN_TRANSIT", "ARRIVED", "CUSTOMS", "CLEARED", "DELIVERED", "CLOSED"]);
const shipmentDirection = z.enum(SHIPMENT_DIRECTION_VALUES);
const shipmentTransportMode = z.enum(TRANSPORT_MODE_VALUES);
const shipmentTypeCode = z.enum(SHIPMENT_TYPE_CODES);
const optionalNonNegativeNumber = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : value;
}, z.number().min(0).optional());

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

export const shipmentStepParamsSchema = shipmentParamsSchema.extend({
  stepId: requiredId,
});

export const shipmentTaskBodySchema = z.object({
  stepId: optionalId,
  stepName: optionalTrimmedText(180),
  title: optionalTrimmedText(240),
  description: optionalTrimmedText(2000),
  assignedToUserId: optionalId,
  assignedToName: optionalTrimmedText(180),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: optionalTrimmedText(80),
  deadline: optionalTrimmedText(80),
  assignmentNote: optionalTrimmedText(2000),
  workflowInstanceId: optionalId,
  workflowStepCode: optionalTrimmedText(16),
  workflowBlockerId: optionalId,
  blockerCode: optionalTrimmedText(8),
}).passthrough();

const workflowRoute = z.enum(["green", "yellow", "red"]);
const dailyStatusCustomsRoute = z.enum(DAILY_STATUS_CUSTOMS_ROUTES);
const dailyStatusCustomsStatus = z.enum(DAILY_STATUS_CUSTOMS_STATUSES);
const dailyStatusTaxPaymentStatus = z.enum(DAILY_STATUS_TAX_PAYMENT_STATUSES);
const dailyStatusReleaseStatus = z.enum(DAILY_STATUS_RELEASE_STATUSES);
const dailyStatusCommonStatus = z.enum(DAILY_STATUS_COMMON_STATUSES);
const dailyStatusDate = z.preprocess(
  normalizeIsoDateInput,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Exit date must use YYYY-MM-DD.")
    .refine(isRealIsoDate, "Exit date must be a real calendar date.")
    .nullable()
    .optional()
);
const dailyStatusCommonStatusField = z.preprocess(blankToNull, dailyStatusCommonStatus.nullable().optional());
const dailyStatusDateShape = Object.fromEntries(DAILY_STATUS_DATE_FIELDS.map((field) => [field, dailyStatusDate]));
const dailyStatusNumberShape = Object.fromEntries(
  DAILY_STATUS_NUMBER_FIELDS.map((field) => [
    field,
    field === "packageCount" ? optionalNullableNonNegativeInteger : optionalNullableNonNegativeNumber,
  ])
);
const dailyStatusCommonStatusShape = Object.fromEntries(
  DAILY_STATUS_COMMON_STATUS_FIELDS.map((field) => [field, dailyStatusCommonStatusField])
);
const workflowStepStatus = z.enum(["active", "current", "in_progress", "completed", "done", "skipped"]);
const taskMutationStatus = z.enum([
  "open",
  "assigned",
  "in_progress",
  "waiting",
  "blocked",
  "done",
  "cancelled",
  "TODO",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "DONE",
  "CANCELLED",
]);
const taskMutationPriority = z.enum(["low", "normal", "medium", "high", "urgent", "LOW", "MEDIUM", "HIGH", "URGENT"]);

export const shipmentProgressParamsSchema = z.object({
  shipmentId: requiredId,
});

export const shipmentProgressStartBodySchema = z.object({
  metadata: z.record(z.unknown()).optional(),
}).passthrough();

export const shipmentProgressCurrentBodySchema = z.object({
  stepCode: z.string().trim().min(1).max(16).optional(),
  status: workflowStepStatus.optional(),
  customsRoute: workflowRoute.optional(),
  internalNote: optionalTrimmedText(4000),
  publicNote: optionalTrimmedText(1000),
  publicVisible: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  isExceptional: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "At least one progress field is required.",
});

export const shipmentProgressBlockerBodySchema = z.object({
  stepCode: optionalTrimmedText(16),
  blockerCode: z.string().trim().min(3).max(8),
  internalNote: optionalTrimmedText(4000),
  publicNote: optionalTrimmedText(1000),
  metadata: z.record(z.unknown()).optional(),
});

export const shipmentProgressUnblockBodySchema = z.object({
  blockerId: optionalId,
  blockerCode: optionalTrimmedText(8),
  status: z.enum(["resolved", "cancelled"]).optional(),
  internalNote: optionalTrimmedText(4000),
  publicNote: optionalTrimmedText(1000),
  metadata: z.record(z.unknown()).optional(),
}).refine((value) => value.blockerId || value.blockerCode, {
  message: "A blocker id or code is required.",
  path: ["blockerId"],
});

export const taskParamsSchema = z.object({
  taskId: requiredId,
});

export const taskAssignBodySchema = z.object({
  assignedToUserId: requiredId,
  dueAt: optionalTrimmedText(80),
  dueDate: optionalTrimmedText(80),
  priority: taskMutationPriority.optional(),
  assignmentNote: optionalTrimmedText(2000),
  status: taskMutationStatus.optional(),
});

export const taskStatusBodySchema = z.object({
  status: taskMutationStatus,
  note: optionalTrimmedText(2000),
});

export const taskListQuerySchema = z.object({
  shipmentId: z.preprocess(firstQueryValue, optionalId),
  assignedTo: z.preprocess(firstQueryValue, z.enum(["me", "all"]).optional()),
  assignedBy: z.preprocess(firstQueryValue, z.enum(["me", "all"]).optional()),
  status: z.preprocess(firstQueryValue, z.string().trim().max(40).optional()),
  blocked: queryBoolean(false),
  overdue: queryBoolean(false),
});

export const organizationMembersQuerySchema = z.object({
  includeInactive: queryBoolean(false),
});

const normalizeBusinessPhoneInput = (value) => {
  const singleValue = firstQueryValue(value);
  if (singleValue === undefined || singleValue === null) return singleValue;
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const normalizedDigits = String(singleValue)
    .replace(/[۰-۹٠-٩]/g, (digit) => {
      const persianIndex = persianDigits.indexOf(digit);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = arabicDigits.indexOf(digit);
      return arabicIndex >= 0 ? String(arabicIndex) : digit;
    })
    .trim()
    .replace(/^00/, "+")
    .replace(/[()\s\-._]/g, "");
  return normalizedDigits;
};

const businessPhone = z.preprocess(
  normalizeBusinessPhoneInput,
  z
    .string()
    .min(6, "Phone number is too short.")
    .max(21, "Phone number is too long.")
    .regex(/^\+?[0-9]{6,20}$/, "Phone number format is not valid.")
);
const malvaniActiveStatus = z.enum(["ACTIVE", "INACTIVE", "NEEDS_REVIEW"]);
const businessEntityContactType = z.enum(["commercial_card", "malvani"]);

export const malvaniProfileParamsSchema = z.object({
  id: requiredId,
});

export const malvaniProfileCreateBodySchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required.").max(180),
  captainName: z.string().trim().min(1, "Captain name is required.").max(180),
  lenjName: z.string().trim().min(1, "Lenj name is required.").max(180),
  lenjRegistrationNumber: z.string().trim().min(1, "Lenj registration number is required.").max(120),
  lenjType: optionalNullableTrimmedText(120),
  homePort: optionalNullableTrimmedText(120),
  activeStatus: malvaniActiveStatus.default("ACTIVE"),
  note: optionalTrimmedText(2000),
}).strict();

export const malvaniProfileUpdateBodySchema = z.object({
  displayName: optionalTrimmedText(180),
  captainName: optionalTrimmedText(180),
  lenjName: optionalTrimmedText(180),
  lenjRegistrationNumber: optionalTrimmedText(120),
  lenjType: optionalNullableTrimmedText(120),
  homePort: optionalNullableTrimmedText(120),
  activeStatus: malvaniActiveStatus.optional(),
  note: optionalTrimmedText(2000),
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: "At least one Malvani field is required." }
);

export const businessEntityContactsQuerySchema = z.object({
  entityType: z.preprocess(firstQueryValue, businessEntityContactType),
  entityId: z.preprocess(firstQueryValue, requiredId),
}).strict();

export const businessEntityContactParamsSchema = z.object({
  id: requiredId,
});

export const businessEntityContactCreateBodySchema = z.object({
  entityType: businessEntityContactType,
  entityId: requiredId,
  contactName: z.string().trim().min(1, "Contact name is required.").max(180),
  roleTitle: z.string().trim().min(1, "Role/title is required.").max(180),
  phoneNumber: businessPhone,
  phoneLabel: optionalNullableTrimmedText(80),
  note: optionalNullableTrimmedText(1000),
  isPrimary: z.boolean().optional().default(false),
  sortOrder: optionalNullableNonNegativeInteger,
}).strict();

export const businessEntityContactUpdateBodySchema = z.object({
  contactName: optionalTrimmedText(180),
  roleTitle: optionalTrimmedText(180),
  phoneNumber: businessPhone.optional(),
  phoneLabel: optionalNullableTrimmedText(80),
  note: optionalNullableTrimmedText(1000),
  isPrimary: z.boolean().optional(),
  sortOrder: optionalNullableNonNegativeInteger,
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: "At least one contact field is required." }
);

export const dailyStatusListQuerySchema = z.object({
  q: z.preprocess(firstQueryValue, optionalTrimmedText(160)),
  shipmentId: z.preprocess(firstQueryValue, optionalId),
  commercialCardId: z.preprocess(firstQueryValue, optionalId),
  customsRoute: optionalQueryEnum(DAILY_STATUS_CUSTOMS_ROUTES),
  customsStatus: optionalQueryEnum(DAILY_STATUS_CUSTOMS_STATUSES),
  releaseStatus: optionalQueryEnum(DAILY_STATUS_RELEASE_STATUSES),
  limit: queryLimit(50),
}).strict();

export const dailyStatusPatchBodySchema = z.object({
  commercialCardId: optionalNullableId,
  orderRegistrationNumber: optionalNullableTrimmedText(120),
  proformaNumber: optionalNullableTrimmedText(120),
  foreignSellerName: optionalNullableTrimmedText(240),
  foreignSellerCode: optionalNullableTrimmedText(120),
  goodsIdSummary: optionalNullableTrimmedText(1000),
  hsCodeSummary: optionalNullableTrimmedText(1000),
  currencyType: optionalNullableTrimmedText(40),
  bankName: optionalNullableTrimmedText(180),
  bankTrackingNumber: optionalNullableTrimmedText(120),
  insuranceNumber: optionalNullableTrimmedText(120),
  inspectionCertificateNumber: optionalNullableTrimmedText(120),
  bookingNumber: optionalNullableTrimmedText(120),
  billOfLadingNumber: optionalNullableTrimmedText(120),
  transportDocumentNumber: optionalNullableTrimmedText(120),
  cotageNumber: optionalNullableTrimmedText(120),
  customsStatus: z.preprocess(blankToNull, dailyStatusCustomsStatus.nullable().optional()),
  customsRoute: z.preprocess(blankToNull, dailyStatusCustomsRoute.nullable().optional()),
  customsOffice: optionalNullableTrimmedText(180),
  declarationReference: optionalNullableTrimmedText(180),
  containerSummary: optionalNullableTrimmedText(1000),
  goodsSummary: optionalNullableTrimmedText(1000),
  arrivalNoticeNumber: optionalNullableTrimmedText(120),
  manifestNumber: optionalNullableTrimmedText(120),
  deliveryOrderNumber: optionalNullableTrimmedText(120),
  warehouseName: optionalNullableTrimmedText(180),
  warehouseReceiptNumber: optionalNullableTrimmedText(120),
  evaluatorName: optionalNullableTrimmedText(180),
  expertName: optionalNullableTrimmedText(180),
  otherPermitNotes: optionalNullableTrimmedText(2000),
  taxPaymentStatus: z.preprocess(blankToNull, dailyStatusTaxPaymentStatus.nullable().optional()),
  customsPaymentStatus: dailyStatusCommonStatusField,
  dutiesAmount: optionalNullableNonNegativeNumber,
  taxAmount: optionalNullableNonNegativeNumber,
  paymentReference: optionalNullableTrimmedText(120),
  loadingPermitNumber: optionalNullableTrimmedText(120),
  truckPlate: optionalNullableTrimmedText(80),
  driverName: optionalNullableTrimmedText(180),
  gatePassNumber: optionalNullableTrimmedText(120),
  releaseStatus: z.preprocess(blankToNull, dailyStatusReleaseStatus.nullable().optional()),
  internalNote: optionalNullableTrimmedText(2000),
  customFields: z.record(z.unknown()).optional(),
  ...dailyStatusDateShape,
  ...dailyStatusNumberShape,
  ...dailyStatusCommonStatusShape,
}).strict().superRefine((value, ctx) => {
  if (
    value.taxPaymentStatus !== undefined &&
    value.customsPaymentStatus !== undefined &&
    value.taxPaymentStatus !== value.customsPaymentStatus
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customsPaymentStatus"],
      message: "Payment status fields cannot conflict.",
    });
  }
}).refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: "At least one daily status field is required." }
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

export const shipmentWorkflowTemplateParamsSchema = z.object({
  id: requiredId,
});

export const shipmentWorkflowTemplateStepParamsSchema = shipmentWorkflowTemplateParamsSchema.extend({
  stepId: requiredId,
});

export const shipmentTypeWorkflowTemplateParamsSchema = z.object({
  shipmentTypeCode,
});

export const shipmentWorkflowTemplateListQuerySchema = z.object({
  shipmentTypeCode: z.preprocess(firstQueryValue, shipmentTypeCode.optional()),
  includeArchived: queryBoolean(false),
}).strict();

export const shipmentWorkflowStepCatalogListQuerySchema = z.object({
  q: z.preprocess(firstQueryValue, optionalTrimmedText(160)),
  search: z.preprocess(firstQueryValue, optionalTrimmedText(160)),
  stageKey: z.preprocess(firstQueryValue, optionalTrimmedText(80)),
  category: z.preprocess(firstQueryValue, optionalTrimmedText(80)),
  includeArchived: queryBoolean(false),
}).strict();

const workflowTemplateJsonArray = z.array(z.unknown()).max(80);
const workflowTemplateCatalogStepIds = z.array(requiredId).min(1).max(80);

export const shipmentWorkflowTemplateCreateBodySchema = z.object({
  sourceTemplateId: optionalId,
  code: optionalTrimmedText(120),
  shipmentTypeCode: shipmentTypeCode.optional(),
  shipmentDirection: shipmentDirection.optional(),
  transportMode: shipmentTransportMode.optional(),
  titleFa: z.string().trim().min(1).max(180),
  titleEn: optionalTrimmedText(180),
  description: optionalTrimmedText(1000),
  isActive: z.boolean().optional(),
}).strict();

export const shipmentWorkflowTemplateUpdateBodySchema = z.object({
  titleFa: optionalTrimmedText(180),
  titleEn: optionalTrimmedText(180),
  description: optionalTrimmedText(1000),
  isActive: z.boolean().optional(),
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: "At least one workflow template field is required." }
);

export const shipmentWorkflowTemplatePublishBodySchema = z.object({
  shipmentTypeCode: shipmentTypeCode.optional(),
  titleFa: optionalTrimmedText(180),
  titleEn: optionalTrimmedText(180),
  description: optionalTrimmedText(1000),
}).strict();

export const shipmentWorkflowTemplateStepCreateBodySchema = z.object({
  phaseId: optionalId,
  phaseKey: optionalTrimmedText(80),
  stepKey: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/, "Step key must be ASCII."),
  labelFa: z.string().trim().min(1).max(240),
  labelEn: optionalTrimmedText(240),
  publicLabel: optionalTrimmedText(240),
  sortOrder: optionalNonNegativeNumber,
  isRequired: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  isCustomerVisible: z.boolean().optional(),
  roleSuggestion: optionalTrimmedText(120),
  expectedDurationHours: optionalNonNegativeNumber,
  taskPolicy: z.record(z.unknown()).optional(),
  checklist: workflowTemplateJsonArray.optional(),
  expectedDocuments: workflowTemplateJsonArray.optional(),
  expectedFormFields: workflowTemplateJsonArray.optional(),
  nextStepRules: z.record(z.unknown()).optional(),
}).strict().refine(
  (value) => Boolean(value.phaseId || value.phaseKey),
  { path: ["phaseId"], message: "A workflow phase is required." }
);

export const shipmentWorkflowTemplateStepUpdateBodySchema = z.object({
  phaseId: optionalId,
  phaseKey: optionalTrimmedText(80),
  labelFa: optionalTrimmedText(240),
  labelEn: optionalTrimmedText(240),
  publicLabel: optionalTrimmedText(240),
  sortOrder: optionalNonNegativeNumber,
  isRequired: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  isCustomerVisible: z.boolean().optional(),
  roleSuggestion: optionalTrimmedText(120),
  expectedDurationHours: optionalNonNegativeNumber,
  taskPolicy: z.record(z.unknown()).optional(),
  checklist: workflowTemplateJsonArray.optional(),
  expectedDocuments: workflowTemplateJsonArray.optional(),
  expectedFormFields: workflowTemplateJsonArray.optional(),
  nextStepRules: z.record(z.unknown()).optional(),
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: "At least one workflow step field is required." }
);

export const shipmentWorkflowTemplateStepsFromCatalogBodySchema = z.object({
  catalogStepIds: workflowTemplateCatalogStepIds,
  allowDuplicates: z.boolean().optional(),
}).strict();

export const shipmentWorkflowTemplateArchiveBodySchema = z.object({
  reason: optionalTrimmedText(500),
  archivedReason: optionalTrimmedText(500),
}).strict();

export const shipmentTypeWorkflowTemplateBodySchema = z.object({
  templateId: requiredId,
}).strict();

export const shipmentPublicStatusBodySchema = z.object({
  publicLabel: z.string().trim().min(1, "Public status label is required.").max(180),
  publicDescription: optionalTrimmedText(1000),
  isCustomerVisible: z.boolean().optional(),
});

export const archiveEntityParamsSchema = z.object({
  entityType: archiveEntityType,
  entityId: requiredId,
});

export const billingPaymentStartParamsSchema = z.object({
  id: requiredId,
});

export const signupRequestParamsSchema = z.object({
  id: requiredId,
});

export const notificationParamsSchema = z.object({
  id: requiredId,
});

export const notificationListQuerySchema = z.object({
  includeRead: queryBoolean(false),
  limit: queryLimit(50),
});

const chatMessageBody = z.string().trim().min(1, "Message cannot be empty.").max(3000, "Message is too long.");

export const chatParticipantsQuerySchema = z.object({
  q: z.preprocess(firstQueryValue, optionalTrimmedText(120)),
  limit: queryLimit(100),
}).strict();

export const chatThreadParamsSchema = z.object({
  id: requiredId,
});

export const chatThreadAttachmentParamsSchema = z.object({
  threadId: requiredId,
});

export const chatMessageAttachmentParamsSchema = z.object({
  messageId: requiredId,
  attachmentId: requiredId,
});

export const chatThreadParticipantParamsSchema = chatThreadParamsSchema.extend({
  userId: requiredId,
});

export const chatDirectBodySchema = z.object({
  userId: requiredId,
}).strict();

export const chatThreadCreateBodySchema = z.object({
  type: z.literal("GROUP").default("GROUP"),
  name: z.string().trim().min(1, "Group name is required.").max(120),
  description: optionalTrimmedText(500),
  participantUserIds: z.array(requiredId).min(1, "At least one participant is required.").max(100),
}).strict();

export const chatMessageListQuerySchema = z.object({
  before: z.preprocess(firstQueryValue, optionalId),
  limit: queryLimit(50),
}).strict();

export const chatMessageSendBodySchema = z.object({
  threadId: requiredId.optional(),
  body: chatMessageBody,
  clientMessageId: optionalTrimmedText(128),
}).strict();

export const chatAttachmentUploadBodySchema = z.object({
  caption: optionalTrimmedText(3000),
  clientMessageId: optionalTrimmedText(128),
}).strict();

export const chatMediaListQuerySchema = z.object({
  q: z.preprocess(firstQueryValue, optionalTrimmedText(160)),
  type: optionalQueryEnum(["image", "document"]),
  includeDeleted: queryBoolean(false),
  limit: queryLimit(100),
}).strict();

export const chatReadBodySchema = z.object({
  threadId: requiredId.optional(),
  messageId: optionalId,
}).strict();

export const chatParticipantBodySchema = z.object({
  userId: requiredId,
}).strict();

export const chatTypingBodySchema = z.object({
  threadId: requiredId,
}).strict();

const appUserRole = z.enum(["CEO", "MANAGER", "OPERATIONS", "CUSTOMER_SERVICE", "FINANCE"]);
const appUserStatus = z.enum(["active", "suspended", "pending"]);

export const userParamsSchema = z.object({
  id: requiredId,
});

export const adminOrganizationParamsSchema = z.object({
  orgId: requiredId,
});

export const adminOrganizationUserParamsSchema = z.object({
  orgId: requiredId,
  id: requiredId,
});

export const userCreateBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(180),
  email: z.string().trim().email("Email is not valid.").max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  role: appUserRole.default("OPERATIONS"),
  avatar: optionalTrimmedText(500),
  department: optionalTrimmedText(120),
});

export const userUpdateBodySchema = z.object({
  name: optionalTrimmedText(180),
  email: z.preprocess(blankToUndefined, z.string().trim().email("Email is not valid.").max(254).optional()),
  role: appUserRole.optional(),
  avatar: optionalTrimmedText(500),
  department: optionalTrimmedText(120),
  status: appUserStatus.optional(),
  phone: optionalTrimmedText(80),
  location: optionalTrimmedText(180),
  bio: optionalTrimmedText(1000),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "At least one user field is required.",
});

export const userRoleBodySchema = z.object({
  role: appUserRole,
});

export const userPasswordBodySchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});
