import { z } from "./validation.js";

const blankToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalTrimmedText = (max = 180) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max).optional()
  );

const optionalId = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1, "Identifier is required.").max(128).optional().nullable()
);

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
