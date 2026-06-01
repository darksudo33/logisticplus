/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = "CEO" | "MANAGER" | "OPERATIONS" | "CUSTOMER_SERVICE" | "FINANCE";
export type ShipmentStatus = "PENDING" | "BOOKED" | "IN_TRANSIT" | "ARRIVED" | "CUSTOMS" | "CLEARED" | "DELIVERED" | "CLOSED";
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
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  notes?: string;
  status?: string;
  isArchived?: boolean;
  shipmentsCount: number;
  createdAt: string;
}

export interface Shipment {
  id: string;
  trackingNumber: string;
  containerNumber: string;
  customerId: string;
  customerName: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  createdAt: string;
  estimatedDelivery: string;
  actualDelivery?: string;
  freeTimeDays: number;
  isArchived?: boolean;
  customerAccessEnabled?: boolean;
  hasCustomerAccess?: boolean;
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
  labelFa: string;
  labelEn: string;
}

export interface ShipmentWorkflowStep {
  code: string;
  phaseId: string | null;
  phaseLabelFa: string;
  phaseLabelEn: string;
  labelFa: string;
  labelEn: string;
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
  definition: {
    key: string;
    phases: ShipmentWorkflowPhase[];
    steps: Array<{ code: string; phaseId: string; labelFa: string; labelEn: string; order: number }>;
    blockers: Array<{ code: string; labelFa: string; labelEn: string }>;
  };
  shipmentId: string;
  workflow: null | {
    id: string;
    workflowKey: string;
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

export type DocumentType = "BILL_OF_LADING" | "INVOICE" | "PACKING_LIST" | "CUSTOMS_PERMIT" | "INSURANCE" | "OTHER";

export interface ShipmentDocument {
  id: string;
  shipmentId?: string;
  customerId?: string;
  name: string;
  type: DocumentType;
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
  createdAt: string;
  updatedAt: string;
}

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
