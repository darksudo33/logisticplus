/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = "CEO" | "MANAGER" | "OPERATIONS" | "CUSTOMER_SERVICE" | "FINANCE";
export type ShipmentStatus = "LOADING" | "IN_TRANSIT" | "ARRIVED" | "KOOTAJ_DONE" | "EXITED";
export type StepStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type TaskStatus = "TODO" | "ASSIGNED" | "IN_PROGRESS" | "WAITING" | "BLOCKED" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type DemurrageStatus = "ACTIVE" | "PAID" | "WAIVED";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: "active" | "suspended" | "pending";
  avatar?: string;
  isOnline?: boolean;
  phone?: string;
  location?: string;
  bio?: string;
  twoFactorEnabled?: boolean;
  notificationPreferences?: Record<string, boolean>;
  organizationId?: string;
  organizationName?: string;
  organizationStatus?: string;
  organizationPlanId?: string;
  lastSeenAt?: string;
  permissions?: string[];
}

export interface CustomerPhoneNumber {
  id: string;
  organizationId?: string;
  customerId?: string;
  phoneNumber: string;
  phoneLabel?: string;
  note?: string;
  isPrimary?: boolean;
  sortOrder?: number;
  archivedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Customer {
  id: string;
  organization_id?: string;
  organizationId?: string;
  customerCode?: string;
  code?: string;
  name: string;
  company: string;
  phone: string;
  phoneNumbers?: CustomerPhoneNumber[];
  email: string;
  address: string;
  referrer?: string;
  notes?: string;
  status?: string;
  isArchived?: boolean;
  canViewPrivateDetails?: boolean;
  shipmentsCount: number;
  createdAt: string;
}

export interface Shipment {
  id: string;
  trackingNumber: string;
  containerNumber: string;
  customerId: string;
  customerCode?: string;
  customerName: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  v2ProfileId?: string | null;
  v2FlowCode?: ShipmentV2FlowCode | string | null;
  hasV2Profile?: boolean;
  displayStatusText?: string;
  currentStage?: string;
  dischargePort?: string;
  deliveryPort?: string;
  shipmentDirection?: "import" | "export" | "transit" | "domestic";
  transportMode?: "sea" | "air" | "land" | "rail" | "";
  shipmentTypeCode?: string;
  createdAt: string;
  estimatedDelivery: string;
  actualDelivery?: string;
  goodsTotalCount?: number;
  firstGoodsName?: string;
  freeTimeDays: number;
  isArchived?: boolean;
  isExitedArchived?: boolean;
  exitedArchivedAt?: string | null;
  exitedArchivedById?: string | null;
  exitedArchiveReason?: string;
  postExitStatus?: "needs_follow_up" | "in_progress" | "settled" | "closed";
  postExitNote?: string;
  postExitFollowUpAt?: string | null;
  postExitClosedAt?: string | null;
  postExitClosedById?: string | null;
  customerAccessEnabled?: boolean;
  hasCustomerAccess?: boolean;
  assignedManagerId?: string;
  updatedAt?: string;
}
export type ShipmentV2FlowCode = "IMPORT_LANJ" | "IMPORT_SHIP";
export type ShipmentV2SectionKey =
  | "base"
  | "orderRegistration"
  | "goods"
  | "declarationKootaj"
  | "permits"
  | "payments"
  | "banking"
  | "notes";

export type ShipmentV2LenjType = "TEH_LENJI" | "MALVANI";
export type ShipmentV2CustomsRoute = "GREEN" | "YELLOW" | "RED" | "DIRECT_CARRIAGE";
export type ShipmentV2CurrencyCode = "EUR" | "CNY" | "USD" | "AED" | "IRR";
export type ShipmentV2CustomsTaxStatus = "PAYABLE" | "GOOD_STANDING";

export interface ShipmentV2ShipmentSummary {
  id: string;
  trackingNumber: string;
  customerId: string;
  customerCode?: string;
  customerName: string;
  status: ShipmentStatus;
  shipmentDirection: "import" | "export" | "transit" | "domestic";
  transportMode: "sea" | "air" | "land" | "rail" | "";
  shipmentTypeCode: string;
  origin: string;
  destination: string;
  estimatedDelivery: string;
  assignedManagerId?: string | null;
  isExitedArchived?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ShipmentV2BaseSection {
  trackingNumber?: string;
  origin?: string;
  dischargePort?: string;
  deliveryPort?: string;
  consigneeName?: string;
  lenjType?: ShipmentV2LenjType | null;
  statusText?: string;
  currentStage?: string;
  orderRegistrationNumber?: string;
  commercialCardId?: string | null;
  commercialCardDisplayName?: string;
  malvaniProfileId?: string | null;
  malvaniDisplayName?: string;
  status?: ShipmentStatus;
}

export interface ShipmentV2GoodsRow {
  description: string;
  packagingType?: string;
  quantity?: number | null;
  weight?: number | null;
  cbm?: number | null;
  pcs?: number | null;
}

export interface ShipmentV2GoodsSection {
  container20Count?: number | null;
  container40Count?: number | null;
  goodsRows?: ShipmentV2GoodsRow[];
}

export interface ShipmentV2DeclarationKootajSection {
  cotageNumber?: string;
  customsRoute?: ShipmentV2CustomsRoute | null;
  cotageRegistrationDate?: string;
  totalValueAmount?: number | null;
  totalValueCurrency?: ShipmentV2CurrencyCode;
  finalPaidAmount?: number | null;
  finalPaidCurrency?: ShipmentV2CurrencyCode;
}

export interface ShipmentV2PermitRow {
  permitName: string;
  permitState?: string;
}

export interface ShipmentV2PermitsSection {
  permitRows?: ShipmentV2PermitRow[];
}

export interface ShipmentV2PaymentsSection {
  customsPaymentPaid?: boolean;
  customsAmount?: number | null;
  customsAmountCurrency?: ShipmentV2CurrencyCode;
  customsDifferenceAmount?: number | null;
  customsDifferenceCurrency?: ShipmentV2CurrencyCode;
  customsDifferencePaid?: boolean;
  customsTaxStatus?: ShipmentV2CustomsTaxStatus | null;
  customsTaxAmount?: number | null;
  customsTaxCurrency?: ShipmentV2CurrencyCode;
  customsTaxPaid?: boolean;
}

export interface ShipmentV2BankingSection {
  bankName?: string;
  branchCode?: string;
  branchName?: string;
  paymentInstrumentCode?: string;
  sataCode?: string;
}

export interface ShipmentV2NotesSection {
  internalNote?: string;
}

export type ShipmentV2EmptySection = Record<string, never>;

export interface ShipmentV2Sections {
  base: ShipmentV2BaseSection;
  orderRegistration: ShipmentV2EmptySection;
  goods: ShipmentV2GoodsSection;
  declarationKootaj: ShipmentV2DeclarationKootajSection;
  permits: ShipmentV2PermitsSection;
  payments: ShipmentV2PaymentsSection;
  banking: ShipmentV2BankingSection;
  notes: ShipmentV2NotesSection;
}

export type ShipmentV2SectionPayload = ShipmentV2Sections[ShipmentV2SectionKey];

export interface ShipmentV2Profile {
  id: string;
  organizationId: string;
  shipmentId: string;
  flowCode: ShipmentV2FlowCode;
  sections: ShipmentV2Sections;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ShipmentV2ProfileResponse {
  shipment: ShipmentV2ShipmentSummary;
  profile: ShipmentV2Profile | null;
}

export interface ShipmentStep {
  id: string;
  shipmentId: string;
  name: string;
  order: number;
  status: StepStatus;
  completedAt?: string;
  notes?: string;
}

export interface Task {
  id: string;
  organizationId?: string;
  ownerUserId?: string;
  title: string;
  description: string;
  assignedToUserId: string;
  assignedToName: string;
  assignedByUserId?: string;
  assignedByName: string;
  assignedAt?: string;
  assignmentNote?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  deadline?: string; // Optional field for explicit time/date deadline
  shipmentId?: string;
  completedAt?: string;
  completedByUserId?: string;
  sourceType?: string;
  sourceId?: string;
  workflowInstanceId?: string;
  workflowStepCode?: string;
  workflowBlockerId?: string;
  blockerCode?: string;
  createdAt: string;
}

export type ShipmentWorkflowRoute = "green" | "yellow" | "red";
export type ShipmentWorkflowStepStatus = "pending" | "active" | "completed" | "skipped";
export type ShipmentWorkflowBlockerStatus = "open" | "resolved" | "cancelled";

export interface OrganizationMemberOption {
  userId: string;
  displayName: string;
  email: string;
  roleName: string;
  active: boolean;
}

export interface ShipmentWorkflowPhase {
  id: string;
  phaseKey?: string;
  labelFa: string;
  labelEn: string;
  order?: number;
  isVisible?: boolean;
}

export interface ShipmentWorkflowStep {
  code: string;
  phaseId: string | null;
  phaseLabelFa: string;
  phaseLabelEn: string;
  labelFa: string;
  labelEn: string;
  publicLabel?: string;
  isRequired?: boolean;
  isCustomerVisible?: boolean;
  roleSuggestion?: string;
  expectedDurationHours?: number | null;
  taskPolicy?: Record<string, unknown>;
  expectedDocuments?: unknown[];
  expectedFormFields?: unknown[];
  order: number;
  status: ShipmentWorkflowStepStatus;
  isVisible: boolean;
  isExceptional: boolean;
  internalNote: string;
  publicNote: string;
  completedByUserId?: string | null;
  completedAt?: string | null;
  blockers?: ShipmentWorkflowBlocker[];
}

export interface ShipmentWorkflowBlocker {
  id: string;
  workflowInstanceId: string;
  shipmentId: string;
  stepCode?: string | null;
  blockerCode: string;
  labelFa: string;
  labelEn: string;
  status: ShipmentWorkflowBlockerStatus;
  internalNote: string;
  publicNote: string;
  createdByUserId?: string | null;
  createdAt: string;
  resolvedByUserId?: string | null;
  resolvedAt?: string | null;
}

export interface ShipmentWorkflowEvent {
  id: string;
  eventType: string;
  stepCode?: string | null;
  blockerId?: string | null;
  blockerCode?: string | null;
  actorUserId?: string | null;
  actorName?: string;
  internalNote?: string;
  publicNote?: string;
  publicVisible?: boolean;
  createdAt: string;
}

export interface ShipmentWorkflowProgress {
  definition: null | {
    key: string;
    code?: string;
    version?: number;
    templateId?: string | null;
    titleFa?: string;
    titleEn?: string;
    routeVisibilityRule?: string | null;
    phases: ShipmentWorkflowPhase[];
    steps: Array<{
      code: string;
      phaseId: string;
      labelFa: string;
      labelEn: string;
      order: number;
      publicLabel?: string;
      visibilityRule?: { type?: string; [key: string]: unknown } | null;
    }>;
    blockers: Array<{ code: string; labelFa: string; labelEn: string }>;
  };
  shipmentId: string;
  workflow: null | {
    id: string;
    workflowKey: string;
    workflowTemplateId?: string | null;
    workflowTemplateCode?: string | null;
    workflowTemplateVersion?: number | null;
    status: "active" | "completed" | "cancelled";
    shipmentId: string;
    currentStepCode: string;
    customsRoute?: ShipmentWorkflowRoute | null;
    startedAt: string;
    completedAt?: string | null;
  };
  phases: ShipmentWorkflowPhase[];
  steps: ShipmentWorkflowStep[];
  blockers: ShipmentWorkflowBlocker[];
  history: ShipmentWorkflowEvent[];
  summary: null | {
    currentStepCode?: string | null;
    currentLabelFa: string;
    currentLabelEn: string;
    currentPublicPhase: string;
    currentPublicLabel: string;
    completedStepsCount: number;
    totalStepsCount: number;
    openBlockersCount: number;
    isBlocked: boolean;
  };
}

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  actorUserId?: string | null;
  actorName?: string;
  fromAssigneeUserId?: string | null;
  fromAssigneeName?: string;
  toAssigneeUserId?: string | null;
  toAssigneeName?: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string;
  workflowStepCode?: string | null;
  blockerCode?: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId?: string;
  receiverName?: string;
  groupId?: string;
  isGroup?: boolean;
  content: string;
  read: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
  createdAt: string;
  shipmentId?: string;
}

export interface Demurrage {
  id: string;
  shipmentId: string;
  freeTimeDays: number;
  freeTimeEnd: string;
  dailyCharge: number;
  totalCharge: number;
  status: DemurrageStatus;
}

export type DocumentType =
  | "ORDER_REGISTRATION"
  | "COMMERCIAL_CARD"
  | "COMMERCIAL_DOCUMENTS"
  | "SHIPPING_DOCUMENTS"
  | "CUSTOMS"
  | "PERMITS"
  | "BANKING"
  | "EXIT"
  | "MISC"
  | "BILL_OF_LADING"
  | "INVOICE"
  | "PACKING_LIST"
  | "CUSTOMS_PERMIT"
  | "INSURANCE"
  | "OTHER";

export interface ShipmentDocument {
  id: string;
  shipmentId?: string;
  customerId?: string;
  name: string;
  type: DocumentType;
  note?: string;
  fileSize: string;
  uploadedBy: string;
  createdAt: string;
  url: string;
  visibility?: "internal" | "customer_visible";
  isArchived?: boolean;
  version?: number;
}

export type CommercialCardStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED";

export interface CommercialCardDocument {
  id: string;
  title: string;
  fileName?: string;
  fileSize?: string;
  description?: string;
  uploadedAt: string;
}

export type BusinessEntityContactType = "commercial_card" | "malvani";

export interface BusinessEntityContact {
  id: string;
  organizationId?: string;
  entityType: BusinessEntityContactType;
  entityId: string;
  contactName: string;
  roleTitle: string;
  phoneNumber: string;
  phoneLabel?: string;
  note?: string;
  isPrimary: boolean;
  sortOrder: number;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface CommercialCard {
  id: string;
  holderName: string;
  cardNumber: string;
  issueDate: string;
  expirationDate: string;
  nationalId?: string;
  responsibleName?: string;
  responsiblePhone?: string;
  description?: string;
  documents: CommercialCardDocument[];
  contacts?: BusinessEntityContact[];
  isArchived?: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type MalvaniActiveStatus = "ACTIVE" | "INACTIVE" | "NEEDS_REVIEW";

export interface MalvaniProfile {
  id: string;
  organizationId?: string;
  displayName: string;
  captainName: string;
  lenjName: string;
  lenjRegistrationNumber: string;
  lenjType?: string;
  homePort?: string;
  activeStatus: MalvaniActiveStatus;
  note?: string;
  contacts: BusinessEntityContact[];
  contactsCount: number;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export type DailyStatusCustomsRoute = "green" | "yellow" | "red";
export type DailyStatusCommonStatus =
  | "not_started"
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "not_required";
export type DailyStatusCustomsStatus =
  | "not_started"
  | "declaration_registered"
  | "in_customs_review"
  | "documents_required"
  | "inspection"
  | "duties_pending"
  | "ready_for_release"
  | "released"
  | "exited"
  | "blocked";
export type DailyStatusTaxPaymentStatus = DailyStatusCommonStatus | "paid";
export type DailyStatusReleaseStatus = "not_released" | "ready" | "released" | "exited" | "blocked";

export interface DailyStatusKootajProfile {
  commercialCardId: string | null;
  orderRegistrationNumber: string;
  orderRegistrationDate: string | null;
  orderRegistrationExpiryDate: string | null;
  orderRegistrationStatus: DailyStatusCommonStatus | null;
  proformaNumber: string;
  proformaDate: string | null;
  foreignSellerName: string;
  foreignSellerCode: string;
  goodsIdSummary: string;
  hsCodeSummary: string;
  orderPermitStatus: DailyStatusCommonStatus | null;
  fxSourceStatus: DailyStatusCommonStatus | null;
  currencyType: string;
  currencyAmount: number | null;
  bankName: string;
  bankTrackingNumber: string;
  fxAllocationDate: string | null;
  bankProcessStatus: DailyStatusCommonStatus | null;
  insuranceNumber: string;
  inspectionCertificateNumber: string;
  bookingNumber: string;
  billOfLadingNumber: string;
  transportDocumentNumber: string;
  preAlertDate: string | null;
  cotageNumber: string;
  customsStatus: DailyStatusCustomsStatus | null;
  customsRoute: DailyStatusCustomsRoute | null;
  customsOffice: string;
  declarationReference: string;
  declarationDate: string | null;
  cotageDate: string | null;
  containerSummary: string;
  goodsSummary: string;
  packageCount: number | null;
  grossWeightKg: number | null;
  netWeightKg: number | null;
  arrivalNoticeNumber: string;
  arrivalDate: string | null;
  manifestNumber: string;
  deliveryOrderNumber: string;
  warehouseName: string;
  warehouseReceiptNumber: string;
  warehouseReceiptDate: string | null;
  evaluatorName: string;
  expertName: string;
  documentControlStatus: DailyStatusCommonStatus | null;
  physicalInspectionStatus: DailyStatusCommonStatus | null;
  physicalInspectionDate: string | null;
  labStatus: DailyStatusCommonStatus | null;
  labResultDate: string | null;
  tariffReviewStatus: DailyStatusCommonStatus | null;
  valuationStatus: DailyStatusCommonStatus | null;
  legalPermitStatus: DailyStatusCommonStatus | null;
  standardPermitStatus: DailyStatusCommonStatus | null;
  healthPermitStatus: DailyStatusCommonStatus | null;
  quarantinePermitStatus: DailyStatusCommonStatus | null;
  otherPermitNotes: string;
  taxPaymentStatus: DailyStatusTaxPaymentStatus | null;
  customsPaymentStatus: DailyStatusCommonStatus | null;
  dutiesAmount: number | null;
  taxAmount: number | null;
  customsPaymentDate: string | null;
  paymentReference: string;
  cashierConfirmationStatus: DailyStatusCommonStatus | null;
  warehouseChargesStatus: DailyStatusCommonStatus | null;
  terminalChargesStatus: DailyStatusCommonStatus | null;
  demurrageStatus: DailyStatusCommonStatus | null;
  loadingPermitNumber: string;
  loadingPermitDate: string | null;
  truckPlate: string;
  driverName: string;
  gatePassNumber: string;
  exitGateStatus: DailyStatusCommonStatus | null;
  releaseStatus: DailyStatusReleaseStatus | null;
  exitDate: string | null;
  deliveryDate: string | null;
  internalNote: string;
  customFields: Record<string, unknown>;
  updatedAt: string | null;
  updatedById: string | null;
}

export interface DailyStatusBoardRow {
  id: string;
  /**
   * Optimistic concurrency token for Kootaj-owned operation fields.
   * Source: shipment_kootaj_details.updated_at.
   */
  kootajUpdatedAt: string | null;
  shipment: {
    id: string;
    code: string;
    status: ShipmentStatus | string;
    origin: string;
    destination: string;
    shipmentTypeCode?: string;
    shipmentDirection?: string;
    transportMode?: string;
    assignedManagerId: string | null;
    assignedManagerName: string;
    updatedAt: string;
  };
  customer: {
    id: string;
    name: string;
    customerCode?: string;
  } | null;
  kootaj: DailyStatusKootajProfile;
  v2Profile?: {
    id: string;
    flowCode: ShipmentV2FlowCode | null;
    sections: ShipmentV2Sections;
  } | null;
  baseInfo: {
    code: string;
    customerCode?: string;
    customerName: string;
    statusText: string;
    orderRegistrationNumber: string;
    origin: string;
    dischargePort: string;
    deliveryPort: string;
    consigneeName: string;
    credentialType: BusinessEntityContactType;
    credentialId: string;
    credentialLabel: string;
    credentialDisplayName: string;
    documentCount: number;
    currentStage: string;
    updatedAt: string | null;
    updatedByName: string;
    goods: {
      container20Count: number | null;
      container40Count: number | null;
      goodsRows: ShipmentV2GoodsRow[];
      goodsSummary: string;
      packagingSummary: string;
      totalQuantity: number | null;
      totalWeight: number | null;
      totalCbm: number | null;
      totalPcs: number | null;
    };
  };
  commercialCard: {
    id: string;
    displayName: string;
    cardNumber: string;
    status: CommercialCardStatus | string | null;
  } | null;
  workflow: {
    currentPhase: string;
    currentStepCode: string | null;
    currentStepLabel: string;
    route: DailyStatusCustomsRoute | null;
    completedCount: number;
    totalCount: number;
  } | null;
  tasks: {
    openCount: number;
    overdueCount: number;
    assignedUserNames: string[];
  };
  documents: {
    totalCount: number;
    customerVisibleCount: number;
    missingRequiredCount: number;
  };
  links: {
    shipmentDetailUrl: string;
    customerDetailUrl: string | null;
    commercialCardDetailUrl: string | null;
  };
}

export type DailyStatusPatch = Partial<{
  baseInfo: Partial<{
    status: ShipmentStatus;
    currentStage: string | null;
    origin: string | null;
    deliveryPort: string | null;
    dischargePort: string | null;
    consigneeName: string | null;
    orderRegistrationNumber: string | null;
  }>;
  commercialCardId: string | null;
  orderRegistrationNumber: string | null;
  orderRegistrationDate: string | null;
  orderRegistrationExpiryDate: string | null;
  orderRegistrationStatus: DailyStatusCommonStatus | null;
  proformaNumber: string | null;
  proformaDate: string | null;
  foreignSellerName: string | null;
  foreignSellerCode: string | null;
  goodsIdSummary: string | null;
  hsCodeSummary: string | null;
  orderPermitStatus: DailyStatusCommonStatus | null;
  fxSourceStatus: DailyStatusCommonStatus | null;
  currencyType: string | null;
  currencyAmount: number | string | null;
  bankName: string | null;
  bankTrackingNumber: string | null;
  fxAllocationDate: string | null;
  bankProcessStatus: DailyStatusCommonStatus | null;
  insuranceNumber: string | null;
  inspectionCertificateNumber: string | null;
  bookingNumber: string | null;
  billOfLadingNumber: string | null;
  transportDocumentNumber: string | null;
  preAlertDate: string | null;
  cotageNumber: string | null;
  customsStatus: DailyStatusCustomsStatus | null;
  customsRoute: DailyStatusCustomsRoute | null;
  customsOffice: string | null;
  declarationReference: string | null;
  declarationDate: string | null;
  cotageDate: string | null;
  containerSummary: string | null;
  goodsSummary: string | null;
  packageCount: number | string | null;
  grossWeightKg: number | string | null;
  netWeightKg: number | string | null;
  arrivalNoticeNumber: string | null;
  arrivalDate: string | null;
  manifestNumber: string | null;
  deliveryOrderNumber: string | null;
  warehouseName: string | null;
  warehouseReceiptNumber: string | null;
  warehouseReceiptDate: string | null;
  evaluatorName: string | null;
  expertName: string | null;
  documentControlStatus: DailyStatusCommonStatus | null;
  physicalInspectionStatus: DailyStatusCommonStatus | null;
  physicalInspectionDate: string | null;
  labStatus: DailyStatusCommonStatus | null;
  labResultDate: string | null;
  tariffReviewStatus: DailyStatusCommonStatus | null;
  valuationStatus: DailyStatusCommonStatus | null;
  legalPermitStatus: DailyStatusCommonStatus | null;
  standardPermitStatus: DailyStatusCommonStatus | null;
  healthPermitStatus: DailyStatusCommonStatus | null;
  quarantinePermitStatus: DailyStatusCommonStatus | null;
  otherPermitNotes: string | null;
  taxPaymentStatus: DailyStatusTaxPaymentStatus | null;
  customsPaymentStatus: DailyStatusCommonStatus | null;
  dutiesAmount: number | string | null;
  taxAmount: number | string | null;
  customsPaymentDate: string | null;
  paymentReference: string | null;
  cashierConfirmationStatus: DailyStatusCommonStatus | null;
  warehouseChargesStatus: DailyStatusCommonStatus | null;
  terminalChargesStatus: DailyStatusCommonStatus | null;
  demurrageStatus: DailyStatusCommonStatus | null;
  loadingPermitNumber: string | null;
  loadingPermitDate: string | null;
  truckPlate: string | null;
  driverName: string | null;
  gatePassNumber: string | null;
  exitGateStatus: DailyStatusCommonStatus | null;
  releaseStatus: DailyStatusReleaseStatus | null;
  exitDate: string | null;
  deliveryDate: string | null;
  internalNote: string | null;
  customFields: Record<string, unknown>;
}>;

export interface Channel {
  id: string;
  name: string;
  description?: string;
  roleLimit?: UserRole;
  icon?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "INFO" | "WARNING" | "SUCCESS" | "URGENT";
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "IN_PROGRESS";

export type ChequeStatus = "ACTIVE" | "CLEARED" | "RETURNED" | "ARCHIVED";

export type QuoteStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export type CargoType = "GENERAL" | "REFRIGERATED" | "HAZARDOUS" | "OVERSIZED";

export interface Quote {
  id: string;
  customerName: string;
  customerPhone: string;
  originCity: string;
  destinationCity: string;
  cargoType: CargoType;
  weight: number; // in tons
  dimensions: string; // LexWxh
  pickupDate: string;
  deliveryDate: string;
  requirements: string[]; // insurance, express, etc.
  baseRate: number;
  fuelSurcharge: number;
  loadingFees: number;
  tollFees: number;
  insurancePercentage: number;
  profitMargin: number;
  totalPrice: number;
  validUntil: string;
  status: QuoteStatus;
  notes?: string;
  createdAt: string;
  isArchived?: boolean;
}

export interface Cheque {
  id: string;
  bankName: string;
  chequeNumber: string;
  amount: number;
  dueDate: string;
  location: string;
  receiver: string;
  status: ChequeStatus;
  description?: string;
  createdAt: string;
}

export interface AppointmentDocument {
  id: string;
  name: string;
  required: boolean;
  completed: boolean;
  fileName?: string;
}

export interface Appointment {
  id: string;
  dateTime: string;
  departmentName: string;
  purpose: string;
  requiredDocuments: AppointmentDocument[];
  assignedPersonId: string;
  assignedPersonName: string;
  status: AppointmentStatus;
  outcome?: string;
  nextActionItems?: string;
  reminderSent: boolean;
  createdAt: string;
  isArchived?: boolean;
}
