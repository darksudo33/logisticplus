import {
  SHIPMENT_DIRECTION_VALUES,
  SHIPMENT_TYPE_CODES,
  TRANSPORT_MODE_VALUES,
} from "../../shared/shipment-form-fields.js";
import { z } from "../validation.js";
import { shipmentParamsSchema } from "./shipments.schemas.js";

const blankToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalTrimmedText = (max = 180) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max).optional()
  );

const blankToNull = (value) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalId = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1, "Identifier is required.").max(128).optional().nullable()
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

const optionalNonNegativeNumber = z.preprocess((value) => {
  const normalizedValue = normalizeLocalizedNumberInput(value);
  if (normalizedValue === "" || normalizedValue === undefined || normalizedValue === null) return undefined;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : value;
}, z.number().min(0).optional());

const shipmentTypeCode = z.enum(SHIPMENT_TYPE_CODES);
const shipmentDirection = z.enum(SHIPMENT_DIRECTION_VALUES);
const shipmentTransportMode = z.enum(TRANSPORT_MODE_VALUES);

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
