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
import { SHIPMENT_STATUS_VALUES } from "../shared/shipment-statuses.js";

export {
  customerCreateBodySchema,
  customerParamsSchema,
  customerRelatedParamsSchema,
  customerUpdateBodySchema,
} from "./schemas/customers.schemas.js";

export {
  currencyRateManualBodySchema,
  currencyRateReviewBodySchema,
  currencyRateReviewParamsSchema,
  currencyRateSettingsBodySchema,
  currencyRateSnapshotListQuerySchema,
  tariffCatalogImportBodySchema,
  tariffCatalogParamsSchema,
  tariffCatalogSearchQuerySchema,
} from "./schemas/pricing.schemas.js";

export {
  exitedShipmentArchiveBodySchema,
  exitedShipmentsListQuerySchema,
  postExitUpdateBodySchema,
  shipmentCreateBodySchema,
  shipmentFormTemplateCreateBodySchema,
  shipmentFormTemplateFieldCreateBodySchema,
  shipmentFormTemplateFieldParamsSchema,
  shipmentFormTemplateFieldUpdateBodySchema,
  shipmentFormTemplateListQuerySchema,
  shipmentFormTemplateParamsSchema,
  shipmentFormTemplateUpdateBodySchema,
  shipmentOperationalFieldsBodySchema,
  shipmentParamsSchema,
  SHIPMENT_V2_SECTION_KEYS,
  shipmentV2CreateBodySchema,
  shipmentV2SectionParamsSchema,
  shipmentV2SectionPayloadSchemas,
} from "./schemas/shipments.schemas.js";

export {
  shipmentProgressBlockerBodySchema,
  shipmentProgressCurrentBodySchema,
  shipmentProgressParamsSchema,
  shipmentProgressStartBodySchema,
  shipmentProgressUnblockBodySchema,
  shipmentStepParamsSchema,
  shipmentTaskBodySchema,
  shipmentTypeWorkflowTemplateBodySchema,
  shipmentTypeWorkflowTemplateParamsSchema,
  shipmentWorkflowStepCatalogListQuerySchema,
  shipmentWorkflowTemplateArchiveBodySchema,
  shipmentWorkflowTemplateCreateBodySchema,
  shipmentWorkflowTemplateListQuerySchema,
  shipmentWorkflowTemplateParamsSchema,
  shipmentWorkflowTemplatePublishBodySchema,
  shipmentWorkflowTemplateStepCreateBodySchema,
  shipmentWorkflowTemplateStepParamsSchema,
  shipmentWorkflowTemplateStepsFromCatalogBodySchema,
  shipmentWorkflowTemplateStepUpdateBodySchema,
  shipmentWorkflowTemplateUpdateBodySchema,
  taskAssignBodySchema,
  taskListQuerySchema,
  taskParamsSchema,
  taskStatusBodySchema,
} from "./schemas/workflows.schemas.js";

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
const isRealDateTime = (value) => {
  if (!value) return true;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime());
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
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return String(normalizedValue)
    .replace(/[۰-۹٠-٩]/g, (digit) => {
      const persianIndex = persianDigits.indexOf(digit);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = arabicDigits.indexOf(digit);
      return arabicIndex >= 0 ? String(arabicIndex) : digit;
    })
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".")
    .trim();
};
const optionalNullableNonNegativeNumber = z.preprocess((value) => {
  const normalizedValue = normalizeLocalizedNumberInput(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : normalizedValue;
}, z.number().min(0, "Number fields cannot be negative.").nullable().optional());
const optionalNullableNonNegativeInteger = z.preprocess((value) => {
  const normalizedValue = normalizeLocalizedNumberInput(value);
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

export const documentMetadataSchema = z.object({
  title: optionalTrimmedText(180),
  type: optionalTrimmedText(80),
  note: optionalTrimmedText(2000),
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

export const documentManagementCenterSearchQuerySchema = z.object({
  query: z.preprocess(
    firstQueryValue,
    z.string().trim().min(2, "Search query is required.").max(120, "Search query is too long.")
  ),
  limit: queryLimit(12),
});

export const dailyStatusParamsSchema = z.object({
  shipmentId: requiredId,
});

const dailyStatusCustomsRoute = z.enum(DAILY_STATUS_CUSTOMS_ROUTES);
const dailyStatusCustomsStatus = z.enum(DAILY_STATUS_CUSTOMS_STATUSES);
const dailyStatusTaxPaymentStatus = z.enum(DAILY_STATUS_TAX_PAYMENT_STATUSES);
const dailyStatusReleaseStatus = z.enum(DAILY_STATUS_RELEASE_STATUSES);
const dailyStatusCommonStatus = z.enum(DAILY_STATUS_COMMON_STATUSES);
const expectedKootajUpdatedAt = z.preprocess(
  blankToNull,
  z.string().trim().refine(isRealDateTime, "Expected Kootaj version must be a valid date/time.").nullable().optional()
);
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
const dailyStatusBaseInfoPatchSchema = z.object({
  status: z.enum(SHIPMENT_STATUS_VALUES).optional(),
  currentStage: optionalNullableTrimmedText(500),
  origin: optionalNullableTrimmedText(180),
  deliveryPort: optionalNullableTrimmedText(180),
  dischargePort: optionalNullableTrimmedText(180),
  consigneeName: optionalNullableTrimmedText(240),
  orderRegistrationNumber: optionalNullableTrimmedText(120),
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: "At least one base info field is required." }
);
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
  shipmentStatus: optionalQueryEnum(SHIPMENT_STATUS_VALUES),
  limit: queryLimit(50),
}).strict();

export const dailyStatusPatchBodySchema = z.object({
  baseInfo: dailyStatusBaseInfoPatchSchema.optional(),
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

export const kootajBoardPatchBodySchema = z.object({
  cotageNumber: optionalNullableTrimmedText(120),
  customsStatus: z.preprocess(blankToNull, dailyStatusCustomsStatus.nullable().optional()),
  customsRoute: z.preprocess(blankToNull, dailyStatusCustomsRoute.nullable().optional()),
  releaseStatus: z.preprocess(blankToNull, dailyStatusReleaseStatus.nullable().optional()),
  expectedKootajUpdatedAt,
}).strict().refine(
  (value) =>
    value.cotageNumber !== undefined ||
    value.customsStatus !== undefined ||
    value.customsRoute !== undefined ||
    value.releaseStatus !== undefined,
  { message: "At least one Kootaj operation field is required." }
);

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
