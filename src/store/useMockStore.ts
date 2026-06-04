import { create } from "zustand";
import { User, Customer, Shipment, Task, Message, ActivityLog, Demurrage, ShipmentStep, ShipmentStatus, TaskStatus, ShipmentDocument, Channel, Notification, Appointment, AppointmentStatus, Cheque, Quote, CommercialCard, OrganizationMemberOption, ShipmentWorkflowProgress, TaskEvent } from "../types";
import { QUOTATIONS_UI_ENABLED } from "../config/features";
import { buildShipmentWorkflowSteps, ensureShipmentWorkflowSteps } from "../lib/shipmentWorkflow";

const CURRENT_USER_STORAGE_KEY = "logisticplus.currentUser";

type DefaultStepRecord = {
  id: string;
  name: string;
  order: number;
};

type LoginUser = User & {
  password_hash?: string;
  is_online?: boolean;
  two_factor_enabled?: boolean;
  notification_preferences?: Record<string, boolean>;
};

type ApiRequestError = Error & {
  status?: number;
  code?: string;
  field?: string;
  retryAfter?: number;
};

const logBackgroundNotificationRefreshError = (error: unknown) => {
  if (error instanceof TypeError && error.message === "Failed to fetch") return;
  console.error("Could not refresh notifications.", error);
};

const COLLECTION_KEYS = [
  "users",
  "customers",
  "shipments",
  "tasks",
  "messages",
  "activityLogs",
  "demurrageRecords",
  "shipmentSteps",
  "documents",
  "commercialCards",
  "channels",
  "appointments",
  "cheques",
  "quotes",
  "deletedItems",
  "defaultSteps",
] as const;

// Compatibility bridge only: collections migrated to canonical APIs must not be
// persisted back through /api/users/:id/records, or stale frontend state can
// overwrite the canonical tables.
const CANONICAL_API_COLLECTIONS = new Set<string>(["shipments", "customers", "messages", "channels"]);
const DISABLED_UI_COLLECTIONS = new Set<string>(QUOTATIONS_UI_ENABLED ? [] : ["quotes"]);
const filterDisabledDeletedItems = <T extends { entityType?: string }>(items: T[]) =>
  QUOTATIONS_UI_ENABLED ? items : items.filter((item) => String(item.entityType || "").toUpperCase() !== "QUOTE");

const normalizeUser = (user: LoginUser | null): User | null => {
  if (!user) return null;
  const { password_hash, is_online, ...rest } = user;
  return {
    ...rest,
    isOnline: user.isOnline ?? is_online ?? false,
    twoFactorEnabled: user.twoFactorEnabled ?? user.two_factor_enabled ?? false,
    notificationPreferences: user.notificationPreferences ?? user.notification_preferences ?? {},
  } as User;
};

const normalizeShipmentStatus = (status: unknown): ShipmentStatus => {
  const value = String(status || "PENDING").toUpperCase();
  return (["PENDING", "BOOKED", "IN_TRANSIT", "ARRIVED", "CUSTOMS", "CLEARED", "DELIVERED", "CLOSED"].includes(value)
    ? value
    : "PENDING") as ShipmentStatus;
};

const normalizeShipmentRecord = (record: any): Shipment => {
  const legacy = record?.legacy_data || record || {};
  const freeTimeDays = Number(record?.freeTimeDays ?? legacy.freeTimeDays ?? record?.free_time_days ?? 0);
  return {
    id: record.id,
    trackingNumber: record.trackingNumber || record.shipment_code || legacy.trackingNumber || record.id,
    containerNumber: record.containerNumber || legacy.containerNumber || "",
    customerId: record.customerId || record.customer_id || legacy.customerId || "",
    customerName: record.customerName || record.customer_name || legacy.customerName || "",
    origin: record.origin || legacy.origin || "",
    destination: record.destination || legacy.destination || "",
    status: normalizeShipmentStatus(record.status || legacy.status),
    shipmentDirection: record.shipmentDirection || record.shipment_direction || legacy.shipmentDirection || legacy.shipment_direction || "import",
    transportMode: record.transportMode || record.transport_mode || legacy.transportMode || legacy.transport_mode || "",
    shipmentTypeCode: record.shipmentTypeCode || record.shipment_type_code || legacy.shipmentTypeCode || legacy.shipment_type_code || "IMPORT_SEA_CONTAINER",
    createdAt: record.createdAt || record.created_at || legacy.createdAt || new Date().toISOString(),
    estimatedDelivery: record.estimatedDelivery || record.estimated_delivery_at || legacy.estimatedDelivery || "",
    actualDelivery: record.actualDelivery || record.actual_delivery_at || legacy.actualDelivery || undefined,
    freeTimeDays: Number.isFinite(freeTimeDays) ? freeTimeDays : 0,
    isArchived: Boolean(record.isArchived ?? record.archived_at ?? legacy.isArchived),
    isExitedArchived: Boolean(record.isExitedArchived ?? record.exited_archived_at ?? record.exitedArchivedAt),
    exitedArchivedAt: record.exitedArchivedAt || record.exited_archived_at || null,
    exitedArchivedById: record.exitedArchivedById || record.exited_archived_by_id || null,
    exitedArchiveReason: record.exitedArchiveReason || record.exited_archive_reason || "",
    postExitStatus: record.postExitStatus || record.post_exit_status || "needs_follow_up",
    postExitNote: record.postExitNote || record.post_exit_note || "",
    postExitFollowUpAt: record.postExitFollowUpAt || record.post_exit_follow_up_at || null,
    postExitClosedAt: record.postExitClosedAt || record.post_exit_closed_at || null,
    postExitClosedById: record.postExitClosedById || record.post_exit_closed_by_id || null,
    assignedManagerId: record.assignedManagerId || record.assigned_manager_id || legacy.assignedManagerId || undefined,
    updatedAt: record.updatedAt || record.updated_at || legacy.updatedAt || undefined,
    customerAccessEnabled: Boolean(
      record.customerAccessEnabled ??
        record.customer_access_enabled ??
        legacy.customerAccessEnabled ??
        legacy.customer_access_enabled
    ),
    hasCustomerAccess: Boolean(
      record.hasCustomerAccess ??
        record.has_customer_access ??
        record.customerAccessEnabled ??
        record.customer_access_enabled ??
        legacy.hasCustomerAccess ??
        legacy.customerAccessEnabled ??
        legacy.customer_access_enabled
    ),
  };
};

const normalizeTaskRecord = (record: any): Task => {
  const legacy = record?.legacy_data || record || {};
  return {
    id: record.id,
    organizationId: record.organizationId || record.organization_id || legacy.organizationId || undefined,
    ownerUserId: record.ownerUserId || record.owner_user_id || legacy.ownerUserId || undefined,
    title: record.title || legacy.title || "",
    description: record.description || legacy.description || "",
    assignedToUserId: record.assignedToUserId || record.assigned_to_id || legacy.assignedToUserId || "",
    assignedToName: record.assignedToName || record.assigned_to_name || legacy.assignedToName || "",
    assignedByUserId: record.assignedByUserId || record.assigned_by_id || legacy.assignedByUserId || "",
    assignedByName: record.assignedByName || record.assigned_by_name || legacy.assignedByName || "",
    assignedAt: record.assignedAt || record.assigned_at || legacy.assignedAt || "",
    assignmentNote: record.assignmentNote || record.assignment_note || legacy.assignmentNote || "",
    status: String(record.status || legacy.status || "TODO").toUpperCase() as TaskStatus,
    priority: String(record.priority || legacy.priority || "MEDIUM").toUpperCase() as any,
    dueDate: record.dueDate || record.due_at || legacy.dueDate || "",
    deadline: record.deadline || legacy.deadline || "",
    shipmentId: record.shipmentId || record.shipment_id || legacy.shipmentId || undefined,
    completedAt: record.completedAt || record.completed_at || legacy.completedAt || undefined,
    completedByUserId: record.completedByUserId || record.completed_by_user_id || legacy.completedByUserId || undefined,
    sourceType: record.sourceType || record.source_type || legacy.sourceType || undefined,
    sourceId: record.sourceId || record.source_id || legacy.sourceId || undefined,
    workflowInstanceId: record.workflowInstanceId || record.workflow_instance_id || legacy.workflowInstanceId || undefined,
    workflowStepCode: record.workflowStepCode || record.workflow_step_code || legacy.workflowStepCode || undefined,
    workflowBlockerId: record.workflowBlockerId || record.workflow_blocker_id || legacy.workflowBlockerId || undefined,
    blockerCode: record.blockerCode || record.blocker_code || legacy.blockerCode || undefined,
    createdAt: record.createdAt || record.created_at || legacy.createdAt || new Date().toISOString(),
  };
};

const getStoredCurrentUser = (): User | null => {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    return stored ? JSON.parse(stored) as User : null;
  } catch {
    return null;
  }
};

const persistCurrentUser = (user: User | null) => {
  if (typeof window === "undefined") return;

  try {
    if (user) {
      window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
};

const createApiRequestError = async (response: Response, fallbackMessage: string): Promise<ApiRequestError> => {
  const payload = await response.json().catch(() => ({}));
  const retryAfter = Number(response.headers.get("Retry-After") || 0);
  const error = new Error(payload?.error?.message || payload?.message || fallbackMessage) as ApiRequestError;
  error.status = response.status;
  error.code = payload?.error?.code;
  error.field = payload?.error?.field;
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    error.retryAfter = retryAfter;
  }
  return error;
};

interface MockStore {
  currentUser: User | null;
  users: User[];
  customers: Customer[];
  shipments: Shipment[];
  tasks: Task[];
  shipmentProgressById: Record<string, ShipmentWorkflowProgress | null>;
  organizationMembers: OrganizationMemberOption[];
  messages: Message[];
  activityLogs: ActivityLog[];
  demurrageRecords: Demurrage[];
  shipmentSteps: ShipmentStep[];
  documents: ShipmentDocument[];
  commercialCards: CommercialCard[];
  channels: Channel[];
  notifications: Notification[];
  appointments: Appointment[];
  defaultSteps: DefaultStepRecord[];
  hasHydratedFromDatabase: boolean;
  isHydratingFromDatabase: boolean;
  hydrateFromRecords: (records: Record<string, any[]>) => void;
  loadCurrentUserRecords: () => Promise<void>;
  restoreCurrentUserFromSession: () => Promise<User | null>;
  refreshUsers: () => Promise<void>;
  refreshCustomers: () => Promise<void>;
  refreshDocuments: () => Promise<void>;
  refreshShipments: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshShipmentProgress: (shipmentId: string) => Promise<ShipmentWorkflowProgress | null>;
  startShipmentWorkflow: (shipmentId: string) => Promise<ShipmentWorkflowProgress | null>;
  updateShipmentWorkflowCurrent: (shipmentId: string, updates: Record<string, any>) => Promise<ShipmentWorkflowProgress | null>;
  addShipmentWorkflowBlocker: (shipmentId: string, body: Record<string, any>) => Promise<ShipmentWorkflowProgress | null>;
  resolveShipmentWorkflowBlocker: (shipmentId: string, body: Record<string, any>) => Promise<ShipmentWorkflowProgress | null>;
  fetchOrganizationMembers: () => Promise<OrganizationMemberOption[]>;
  assignTask: (taskId: string, body: Record<string, any>) => Promise<Task>;
  updateTaskStatusRemote: (taskId: string, body: { status: TaskStatus | string; note?: string }) => Promise<Task>;
  fetchTaskEvents: (taskId: string) => Promise<TaskEvent[]>;
  refreshNotifications: () => Promise<void>;
  loginWithPassword: (email: string, password: string, remember?: boolean) => Promise<User>;
  loginWithPhoneCode: (phone: string, code: string, remember?: boolean) => Promise<User>;

  setCurrentUser: (user: User | null) => void;
  addShipment: (shipment: Omit<Shipment, "id">) => Promise<void>;
  updateShipment: (id: string, updates: Partial<Shipment>) => Promise<void>;
  updateShipmentStatus: (id: string, status: ShipmentStatus) => Promise<void>;
  addTask: (task: Omit<Task, "id" | "createdAt">) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  deleteTask: (id: string) => void;
  addMessage: (message: Omit<Message, "id" | "createdAt">) => void;
  addActivity: (log: Omit<ActivityLog, "id" | "createdAt">) => void;
  updateShipmentStep: (id: string, updates: Partial<ShipmentStep>) => void;
  addUser: (user: Omit<User, "id">) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;
  addDocument: (document: Omit<ShipmentDocument, "id" | "createdAt">) => void;
  deleteDocument: (id: string) => void;
  addCommercialCard: (card: Omit<CommercialCard, "id" | "createdAt" | "updatedAt"> & { id?: string }) => void;
  updateCommercialCard: (id: string, updates: Partial<Omit<CommercialCard, "id" | "createdAt">>) => void;
  deleteCommercialCard: (id: string) => void;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  addNotification: (notification: Omit<Notification, "id" | "isRead" | "createdAt" | "link"> & { link?: string }) => void;
  updateCurrentUser: (updates: Partial<User>) => void;
  addAppointment: (appointment: Omit<Appointment, "id" | "createdAt" | "reminderSent">) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  
  deletedItems: { id: string, entityType: string, data: any, deletedAt: string }[];
  softDelete: (id: string, entityType: string) => void;
  restoreItem: (id: string) => void;
  permanentDelete: (id: string) => void;

  currentTheme: 'light' | 'dark';
  toggleTheme: () => void;

  cheques: Cheque[];
  addCheque: (cheque: Omit<Cheque, "id" | "createdAt">) => void;
  updateCheque: (id: string, updates: Partial<Cheque>) => void;
  deleteCheque: (id: string) => void;
  archiveShipment: (id: string) => Promise<void>;
  archiveCheque: (id: string) => void;
  archiveDocument: (id: string) => void;
  unarchiveShipment: (id: string) => Promise<void>;
  unarchiveCheque: (id: string, originalStatus?: any) => void;
  unarchiveDocument: (id: string) => void;
  permanentDeleteShipment: (id: string) => void;
  permanentDeleteCheque: (id: string) => void;
  permanentDeleteDocument: (id: string) => void;
  quotes: Quote[];
  addQuote: (quote: Omit<Quote, "id" | "createdAt">) => void;
  updateQuote: (id: string, updates: Partial<Quote>) => void;
  deleteQuote: (id: string) => void;
}

let suppressNextDatabaseSave = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useMockStore = create<MockStore>((set) => ({
  currentUser: getStoredCurrentUser(),
  users: [],
  customers: [],
  shipments: [],
  tasks: [],
  shipmentProgressById: {},
  organizationMembers: [],
  messages: [],
  activityLogs: [],
  demurrageRecords: [],
  shipmentSteps: [],
  documents: [],
  commercialCards: [],
  channels: [],
  notifications: [],
  appointments: [],
  cheques: [],
  quotes: [],
  defaultSteps: [],
  hasHydratedFromDatabase: false,
  isHydratingFromDatabase: false,

  currentTheme: 'light',
  toggleTheme: () => set((state) => ({ currentTheme: state.currentTheme === 'light' ? 'dark' : 'light' })),
  deletedItems: [] as { id: string, entityType: string, data: any, deletedAt: string }[],

  hydrateFromRecords: (records) => {
    suppressNextDatabaseSave = true;
    const defaultSteps = records.defaultSteps || [];
    const repairedWorkflow = ensureShipmentWorkflowSteps(records.shipments || [], records.shipmentSteps || [], defaultSteps);
    set(() => ({
      users: records.users || [],
      customers: records.customers || [],
      shipments: records.shipments || [],
      tasks: (records.tasks || []).map(normalizeTaskRecord),
      messages: records.messages || [],
      activityLogs: records.activityLogs || [],
      demurrageRecords: records.demurrageRecords || [],
      shipmentSteps: repairedWorkflow.shipmentSteps,
      documents: records.documents || [],
      commercialCards: records.commercialCards || [],
      channels: records.channels || [],
      notifications: records.notifications || [],
      appointments: records.appointments || [],
      cheques: records.cheques || [],
      quotes: QUOTATIONS_UI_ENABLED ? records.quotes || [] : [],
      deletedItems: filterDisabledDeletedItems(records.deletedItems || []),
      defaultSteps,
      hasHydratedFromDatabase: true,
      isHydratingFromDatabase: false,
    }));
  },

  loadCurrentUserRecords: async () => {
    const user = useMockStore.getState().currentUser;
    if (!user) return;

    useMockStore.setState({ isHydratingFromDatabase: true });
    const authResponse = await fetch("/api/auth/me", { cache: "no-store" });
    if (!authResponse.ok) {
      const error = await createApiRequestError(authResponse, "Could not restore current session.");
      if (authResponse.status === 401 || authResponse.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      } else {
        useMockStore.setState({ isHydratingFromDatabase: false });
      }
      throw error;
    }

    const authPayload = await authResponse.json();
    const restoredUser = normalizeUser({
      ...authPayload.data?.user,
      permissions: authPayload.data?.permissions || authPayload.data?.user?.permissions || [],
    });
    if (!restoredUser) {
      persistCurrentUser(null);
      useMockStore.setState({
        currentUser: null,
        hasHydratedFromDatabase: false,
        isHydratingFromDatabase: false,
      });
      throw new Error("Could not restore current session.");
    }
    persistCurrentUser(restoredUser);
    useMockStore.setState({ currentUser: restoredUser });

    const response = await fetch(`/api/users/${encodeURIComponent(restoredUser.id)}/bootstrap`);
    if (!response.ok) {
      const error = await createApiRequestError(response, "Could not load database records.");
      if (response.status === 401 || response.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      } else {
        useMockStore.setState({ hasHydratedFromDatabase: true, isHydratingFromDatabase: false });
      }
      throw error;
    }
    const payload = await response.json();
    useMockStore.getState().hydrateFromRecords(payload.records || {});
    useMockStore.getState().refreshNotifications().catch(logBackgroundNotificationRefreshError);
  },

  restoreCurrentUserFromSession: async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      }
      throw await createApiRequestError(response, "Could not restore current session.");
    }

    const payload = await response.json();
    const user = normalizeUser({
      ...payload?.data?.user,
      permissions: payload?.data?.permissions || payload?.data?.user?.permissions || [],
    });
    if (!user) return null;
    persistCurrentUser(user);
    useMockStore.setState({ currentUser: user });
    return user;
  },

  refreshUsers: async () => {
    const user = useMockStore.getState().currentUser;
    if (!user) return;

    const response = await fetch("/api/users");
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      }
      throw new Error("Could not refresh users.");
    }
    const payload = await response.json();
    suppressNextDatabaseSave = true;
    useMockStore.setState({ users: payload.data || [] });
  },

  refreshDocuments: async () => {
    const user = useMockStore.getState().currentUser;
    if (!user) return;

    const response = await fetch("/api/documents?includeArchived=true");
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      }
      throw new Error("Could not refresh documents.");
    }
    const payload = await response.json();
    useMockStore.setState({ documents: payload.data || [] });
  },

  refreshCustomers: async () => {
    const user = useMockStore.getState().currentUser;
    if (!user) return;

    const response = await fetch("/api/customers?includeArchived=true");
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      }
      throw new Error("Could not refresh customers.");
    }
    const payload = await response.json();
    useMockStore.setState({ customers: payload.data || [] });
  },

  refreshShipments: async () => {
    const user = useMockStore.getState().currentUser;
    if (!user) return;

    const response = await fetch("/api/shipments");
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      }
      throw new Error("Could not refresh shipments.");
    }
    const payload = await response.json();
    suppressNextDatabaseSave = true;
    useMockStore.setState({ shipments: (payload.data || []).map(normalizeShipmentRecord) });
  },

  refreshTasks: async () => {
    const user = useMockStore.getState().currentUser;
    if (!user) return;

    const response = await fetch("/api/tasks");
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      }
      throw new Error("Could not refresh tasks.");
    }
    const payload = await response.json();
    suppressNextDatabaseSave = true;
    useMockStore.setState({ tasks: (payload.data || []).map(normalizeTaskRecord) });
  },

  refreshShipmentProgress: async (shipmentId) => {
    const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/progress`, { cache: "no-store" });
    if (!response.ok) throw await createApiRequestError(response, "Could not load shipment progress.");
    const payload = await response.json();
    const data = payload.data || null;
    suppressNextDatabaseSave = true;
    useMockStore.setState((state) => ({
      shipmentProgressById: { ...state.shipmentProgressById, [shipmentId]: data },
    }));
    return data;
  },

  startShipmentWorkflow: async (shipmentId) => {
    const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/progress/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) throw await createApiRequestError(response, "Could not start shipment workflow.");
    const payload = await response.json();
    const data = payload.data || null;
    useMockStore.setState((state) => ({
      shipmentProgressById: { ...state.shipmentProgressById, [shipmentId]: data },
    }));
    return data;
  },

  updateShipmentWorkflowCurrent: async (shipmentId, updates) => {
    const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/progress/current`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates || {}),
    });
    if (!response.ok) throw await createApiRequestError(response, "Could not update shipment workflow.");
    const payload = await response.json();
    const data = payload.data || null;
    useMockStore.setState((state) => ({
      shipmentProgressById: { ...state.shipmentProgressById, [shipmentId]: data },
    }));
    return data;
  },

  addShipmentWorkflowBlocker: async (shipmentId, body) => {
    const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/progress/blockers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!response.ok) throw await createApiRequestError(response, "Could not add workflow blocker.");
    const payload = await response.json();
    const data = payload.data?.progress || payload.data || null;
    useMockStore.setState((state) => ({
      shipmentProgressById: { ...state.shipmentProgressById, [shipmentId]: data },
    }));
    return data;
  },

  resolveShipmentWorkflowBlocker: async (shipmentId, body) => {
    const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/progress/unblock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!response.ok) throw await createApiRequestError(response, "Could not resolve workflow blocker.");
    const payload = await response.json();
    const data = payload.data?.progress || payload.data || null;
    useMockStore.setState((state) => ({
      shipmentProgressById: { ...state.shipmentProgressById, [shipmentId]: data },
    }));
    return data;
  },

  fetchOrganizationMembers: async () => {
    const response = await fetch("/api/organization/members");
    if (!response.ok) throw await createApiRequestError(response, "Could not load organization members.");
    const payload = await response.json();
    const data = payload.data || [];
    useMockStore.setState({ organizationMembers: data });
    return data;
  },

  assignTask: async (taskId, body) => {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!response.ok) throw await createApiRequestError(response, "Could not assign task.");
    const payload = await response.json();
    const task = normalizeTaskRecord(payload.data);
    useMockStore.setState((state) => ({
      tasks: state.tasks.map((item) => item.id === task.id ? task : item),
    }));
    return task;
  },

  updateTaskStatusRemote: async (taskId, body) => {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!response.ok) throw await createApiRequestError(response, "Could not update task status.");
    const payload = await response.json();
    const task = normalizeTaskRecord(payload.data);
    useMockStore.setState((state) => ({
      tasks: state.tasks.map((item) => item.id === task.id ? task : item),
    }));
    return task;
  },

  fetchTaskEvents: async (taskId) => {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/events`);
    if (!response.ok) throw await createApiRequestError(response, "Could not load task history.");
    const payload = await response.json();
    return payload.data || [];
  },

  refreshNotifications: async () => {
    const user = useMockStore.getState().currentUser;
    if (!user) return;

    const response = await fetch("/api/notifications?includeRead=true&limit=50");
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      }
      throw new Error("Could not refresh notifications.");
    }
    const payload = await response.json();
    suppressNextDatabaseSave = true;
    useMockStore.setState({ notifications: payload.data || [] });
  },

  loginWithPassword: async (email, password, remember = false) => {
    useMockStore.setState({ isHydratingFromDatabase: true });
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
    });

    if (!response.ok) {
      useMockStore.setState({ isHydratingFromDatabase: false });
      throw await createApiRequestError(response, "Invalid email or password.");
    }

    const payload = await response.json();
    const user = normalizeUser(payload.user);
    persistCurrentUser(user);
    set({ currentUser: user });
    useMockStore.getState().hydrateFromRecords(payload.records || {});
    useMockStore.getState().refreshNotifications().catch(logBackgroundNotificationRefreshError);
    return user as User;
  },

  loginWithPhoneCode: async (phone, code, remember = false) => {
    useMockStore.setState({ isHydratingFromDatabase: true });
    const response = await fetch("/api/auth/phone/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, remember }),
    });

    if (!response.ok) {
      useMockStore.setState({ isHydratingFromDatabase: false });
      throw await createApiRequestError(response, "Invalid or expired SMS code.");
    }

    const payload = await response.json();
    const user = normalizeUser(payload.user);
    persistCurrentUser(user);
    set({ currentUser: user });
    useMockStore.getState().hydrateFromRecords(payload.records || {});
    useMockStore.getState().refreshNotifications().catch(logBackgroundNotificationRefreshError);
    return user as User;
  },

  softDelete: (id: string, entityType: string) => set((state: any) => {
    let item: any;
    let newItems: any;
    const collections: any = {
      SHIPMENT: 'shipments',
      TASK: 'tasks',
      CHEQUE: 'cheques',
      DOCUMENT: 'documents',
      QUOTE: 'quotes',
      USER: 'users',
      CUSTOMER: 'customers',
      APPOINTMENT: 'appointments'
    };

    const collectionName = collections[entityType];
    if (!collectionName) return state;

    item = state[collectionName].find((i: any) => i.id === id);
    if (!item) return state;

    const log: ActivityLog = {
      id: `l${Date.now()}-soft-del`,
      userName: state.currentUser?.name || "System",
      action: "انتقال به سطل زباله",
      entityType: entityType,
      entityId: id,
      details: `${entityType} با شناسنامه ${id} به سطل زباله منتقل شد.`,
      createdAt: new Date().toISOString()
    };

    return {
      [collectionName]: state[collectionName].filter((i: any) => i.id !== id),
      deletedItems: [...state.deletedItems, { id, entityType, data: item, deletedAt: new Date().toISOString() }],
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  restoreItem: (id: string) => set((state: any) => {
    const item = state.deletedItems.find((i: any) => i.id === id);
    if (!item) return state;

    const collections: any = {
      SHIPMENT: 'shipments',
      TASK: 'tasks',
      CHEQUE: 'cheques',
      DOCUMENT: 'documents',
      QUOTE: 'quotes',
      USER: 'users',
      CUSTOMER: 'customers',
      APPOINTMENT: 'appointments'
    };

    const collectionName = collections[item.entityType];
    const log: ActivityLog = {
      id: `l${Date.now()}-restore`,
      userName: state.currentUser?.name || "System",
      action: "بازیابی از سطل زباله",
      entityType: item.entityType,
      entityId: id,
      details: `${item.entityType} با شناسنامه ${id} بازیابی شد.`,
      createdAt: new Date().toISOString()
    };

    return {
      [collectionName]: [item.data, ...state[collectionName]],
      deletedItems: state.deletedItems.filter((i: any) => i.id !== id),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  permanentDelete: (id: string) => set((state: any) => ({
    deletedItems: state.deletedItems.filter((i: any) => i.id !== id)
  })),

  setCurrentUser: (user) => {
    persistCurrentUser(user);
    if (!user) {
      set({
        currentUser: null,
        users: [],
        customers: [],
        shipments: [],
        tasks: [],
        shipmentProgressById: {},
        organizationMembers: [],
        messages: [],
        activityLogs: [],
        demurrageRecords: [],
        shipmentSteps: [],
        documents: [],
        commercialCards: [],
        channels: [],
        notifications: [],
        appointments: [],
        cheques: [],
        quotes: [],
        deletedItems: [],
        defaultSteps: [],
        hasHydratedFromDatabase: false,
        isHydratingFromDatabase: false,
      });
      return;
    }
    set({ currentUser: user });
  },

  addShipment: async (shipment) => {
    const id = `s${Math.random().toString(36).substr(2, 5)}`;
    const newShipment = { ...shipment, id };
    const newSteps = buildShipmentWorkflowSteps(id, useMockStore.getState().defaultSteps);

    set((state) => ({
      shipments: [newShipment, ...state.shipments],
      shipmentSteps: [...state.shipmentSteps, ...newSteps]
    }));
    await persistCurrentStateNow();
    await useMockStore.getState().refreshShipments();
  },

  updateShipment: async (id, updates) => {
    set((state) => {
    const shipment = state.shipments.find(s => s.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-ship-upd`,
      userName: state.currentUser?.name || "System",
      action: "ویرایش اطلاعات محموله",
      entityType: "SHIPMENT",
      entityId: id,
      details: `اطلاعات محموله ${shipment?.trackingNumber} بروزرسانی شد`,
      createdAt: new Date().toISOString()
    };
    return {
      shipments: state.shipments.map(s => s.id === id ? { ...s, ...updates } : s),
      activityLogs: [log, ...state.activityLogs]
    };
    });
    await persistCurrentStateNow();
    await useMockStore.getState().refreshShipments();
  },

  updateShipmentStatus: async (id, status) => {
    set((state) => {
    const shipment = state.shipments.find(s => s.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}`,
      userName: state.currentUser?.name || "System",
      action: "تغییر وضعیت محموله",
      entityType: "SHIPMENT",
      entityId: id,
      details: `وضعیت محموله ${shipment?.trackingNumber} به ${status} تغییر یافت`,
      createdAt: new Date().toISOString()
    };
    return {
      shipments: state.shipments.map(s => s.id === id ? { ...s, status } : s),
      activityLogs: [log, ...state.activityLogs]
    };
    });
    await persistCurrentStateNow();
    await useMockStore.getState().refreshShipments();
  },

  addTask: (task) => set((state) => {
    const newTask = { ...task, id: `t${Date.now()}`, createdAt: new Date().toISOString() };
    const log: ActivityLog = {
      id: `l${Date.now()}-task`,
      userName: state.currentUser?.name || "System",
      action: "ثبت وظیفه جدید",
      entityType: "TASK",
      entityId: newTask.id,
      details: `وظیفه "${task.title}" برای ${task.assignedToName} تعریف شد`,
      createdAt: new Date().toISOString()
    };
    return {
      tasks: [newTask, ...state.tasks],
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  updateTask: (id, updates) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-task-upd`,
      userName: state.currentUser?.name || "System",
      action: "ویرایش وظیفه",
      entityType: "TASK",
      entityId: id,
      details: `اطلاعات وظیفه "${task?.title}" بروزرسانی شد`,
      createdAt: new Date().toISOString()
    };
    return {
      tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates } : t),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  updateTaskStatus: (id, status) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-task-status`,
      userName: state.currentUser?.name || "System",
      action: "تغییر وضعیت وظیفه",
      entityType: "TASK",
      entityId: id,
      details: `وضعیت وظیفه "${task?.title}" به ${status} تغییر یافت`,
      createdAt: new Date().toISOString()
    };
    return {
      tasks: state.tasks.map(t => t.id === id ? { ...t, status } : t),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  deleteTask: (id) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-task-del`,
      userName: state.currentUser?.name || "System",
      action: "حذف وظیفه",
      entityType: "TASK",
      entityId: id,
      details: `وظیفه "${task?.title}" از سیستم حذف شد`,
      createdAt: new Date().toISOString()
    };
    return {
      tasks: state.tasks.filter(t => t.id !== id),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, { ...msg, id: `m${Date.now()}`, createdAt: new Date().toISOString() }]
  })),

  addActivity: (log) => set((state) => ({
    activityLogs: [{ ...log, id: `l${Date.now()}`, createdAt: new Date().toISOString() }, ...state.activityLogs]
  })),
  updateShipmentStep: (id, updates) => set((state) => {
    const step = state.shipmentSteps.find(s => s.id === id);
    const shipment = state.shipments.find(s => s.id === step?.shipmentId);
    const log: ActivityLog = {
      id: `l${Date.now()}-step`,
      userName: state.currentUser?.name || "System",
      action: "بروزرسانی مرحله محموله",
      entityType: "SHIPMENT",
      entityId: step?.shipmentId || id,
      details: `مرحله "${step?.name}" برای محموله ${shipment?.trackingNumber} ${updates.status === 'COMPLETED' ? 'تکمیل شد' : 'بروزرسانی شد'}`,
      createdAt: new Date().toISOString()
    };
    return {
      shipmentSteps: state.shipmentSteps.map(step => step.id === id ? { ...step, ...updates } : step),
      activityLogs: [log, ...state.activityLogs]
    };
  }),
  addDocument: (doc) => set((state) => {
    const newDoc = { ...doc, id: `doc${Date.now()}`, createdAt: new Date().toISOString() };
    const log: ActivityLog = {
      id: `l${Date.now()}-doc`,
      userName: state.currentUser?.name || "System",
      action: "بارگذاری سند",
      entityType: "DOCUMENT",
      entityId: newDoc.id,
      details: `فایل "${doc.name}" برای محموله ${doc.shipmentId || "عمومی"} بارگذاری شد`,
      createdAt: new Date().toISOString()
    };
    return {
      documents: [newDoc, ...state.documents],
      activityLogs: [log, ...state.activityLogs]
    };
  }),
  deleteDocument: (id) => set((state) => ({
    documents: state.documents.filter(d => d.id !== id)
  })),
  addCommercialCard: (card) => set((state) => {
    const now = new Date().toISOString();
    const newCard: CommercialCard = {
      ...card,
      id: card.id || `cc${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };
    return {
      commercialCards: [newCard, ...state.commercialCards],
    };
  }),
  updateCommercialCard: (id, updates) => set((state) => ({
    commercialCards: state.commercialCards.map((card) =>
      card.id === id ? { ...card, ...updates, updatedAt: new Date().toISOString() } : card
    ),
  })),
  deleteCommercialCard: (id) => set((state) => ({
    commercialCards: state.commercialCards.map((card) =>
      card.id === id
        ? { ...card, isArchived: true, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : card
    ),
  })),
  markNotificationRead: async (id) => {
    const previousNotifications = useMockStore.getState().notifications;
    suppressNextDatabaseSave = true;
    set((state) => ({
      notifications: state.notifications.map(n => n.id === id ? { ...n, isRead: true } : n)
    }));

    const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    });
    if (!response.ok) {
      suppressNextDatabaseSave = true;
      useMockStore.setState({ notifications: previousNotifications });
      throw await createApiRequestError(response, "Could not mark notification as read.");
    }
    const payload = await response.json();
    if (payload?.data) {
      suppressNextDatabaseSave = true;
      useMockStore.setState((state) => ({
        notifications: state.notifications.map(n => n.id === id ? payload.data : n)
      }));
    }
  },
  markAllNotificationsRead: async () => {
    const previousNotifications = useMockStore.getState().notifications;
    suppressNextDatabaseSave = true;
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, isRead: true }))
    }));

    const response = await fetch("/api/notifications/read-all", {
      method: "PATCH",
    });
    if (!response.ok) {
      suppressNextDatabaseSave = true;
      useMockStore.setState({ notifications: previousNotifications });
      throw await createApiRequestError(response, "Could not mark notifications as read.");
    }
    const payload = await response.json();
    suppressNextDatabaseSave = true;
    useMockStore.setState({ notifications: payload.data || [] });
  },
  addNotification: (notification) => {
    suppressNextDatabaseSave = true;
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: `n${Date.now()}`,
          isRead: false,
          createdAt: new Date().toISOString(),
          link: notification.link || "/dashboard"
        },
        ...state.notifications
      ]
    }));
  },
  addUser: (user) => set((state) => {
    const freshUser = { ...user, id: `u${Date.now()}` };
    const log: ActivityLog = {
      id: `l${Date.now()}-user-add`,
      userName: state.currentUser?.name || "System",
      action: "افزودن کاربر جدید",
      entityType: "USER",
      entityId: freshUser.id,
      details: `کاربر جدید "${user.name}" با نقش ${user.role} به سیستم اضافه شد`,
      createdAt: new Date().toISOString()
    };
    return {
      users: [...state.users, freshUser],
      activityLogs: [log, ...state.activityLogs]
    };
  }),
  updateUser: (id, updates) => set((state) => {
    const user = state.users.find(u => u.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-user-upd`,
      userName: state.currentUser?.name || "System",
      action: "ویرایش اطلاعات کاربر",
      entityType: "USER",
      entityId: id,
      details: `اطلاعات کاربر "${user?.name}" بروزرسانی شد`,
      createdAt: new Date().toISOString()
    };
    return {
      users: state.users.map(u => u.id === id ? { ...u, ...updates } : u),
      activityLogs: [log, ...state.activityLogs]
    };
  }),
  deleteUser: (id) => set((state) => {
    const user = state.users.find(u => u.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-user-del`,
      userName: state.currentUser?.name || "System",
      action: "حذف کاربر",
      entityType: "USER",
      entityId: id,
      details: `دسترسی کاربر "${user?.name}" به سیستم مسدود شد`,
      createdAt: new Date().toISOString()
    };
    return {
      users: state.users.filter(u => u.id !== id),
      activityLogs: [log, ...state.activityLogs]
    };
  }),
  updateCurrentUser: (updates) => set((state) => {
    const currentUser = state.currentUser ? { ...state.currentUser, ...updates } : null;
    persistCurrentUser(currentUser);

    return {
      currentUser,
      users: state.users.map(u => u.id === state.currentUser?.id ? { ...u, ...updates } : u)
    };
  }),
  addAppointment: (appointment) => set((state) => {
    const newAppointment: Appointment = {
      ...appointment,
      id: `ap${Date.now()}`,
      createdAt: new Date().toISOString(),
      reminderSent: false
    };
    const log: ActivityLog = {
      id: `l${Date.now()}-ap-add`,
      userName: state.currentUser?.name || "System",
      action: "ثبت نوبت جدید",
      entityType: "APPOINTMENT",
      entityId: newAppointment.id,
      details: `نوبت جدید "${appointment.purpose}" برای دپارتمان ${appointment.departmentName} ثبت شد`,
      createdAt: new Date().toISOString()
    };
    return {
      appointments: [newAppointment, ...state.appointments],
      activityLogs: [log, ...state.activityLogs]
    };
  }),
  updateAppointment: (id, updates) => set((state) => {
    const appointment = state.appointments.find(a => a.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-ap-upd`,
      userName: state.currentUser?.name || "System",
      action: "ویرایش نوبت",
      entityType: "APPOINTMENT",
      entityId: id,
      details: `اطلاعات نوبت "${appointment?.purpose}" بروزرسانی شد`,
      createdAt: new Date().toISOString()
    };
    return {
      appointments: state.appointments.map(a => a.id === id ? { ...a, ...updates } : a),
      activityLogs: [log, ...state.activityLogs]
    };
  }),
  deleteAppointment: (id) => set((state) => {
    const appointment = state.appointments.find(a => a.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-ap-del`,
      userName: state.currentUser?.name || "System",
      action: "حذف نوبت",
      entityType: "APPOINTMENT",
      entityId: id,
      details: `نوبت "${appointment?.purpose}" از لیست حذف شد`,
      createdAt: new Date().toISOString()
    };
    return {
      appointments: state.appointments.filter(a => a.id !== id),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  addCheque: (cheque) => set((state) => {
    const newCheque: Cheque = {
      ...cheque,
      id: `chq${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    const log: ActivityLog = {
      id: `l${Date.now()}-chq-add`,
      userName: state.currentUser?.name || "System",
      action: "ثبت چک جدید",
      entityType: "CHEQUE",
      entityId: newCheque.id,
      details: `چک شماره ${cheque.chequeNumber} (${cheque.bankName}) ثبت شد`,
      createdAt: new Date().toISOString()
    };
    return {
      cheques: [newCheque, ...state.cheques],
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  updateCheque: (id, updates) => set((state) => {
    const cheque = state.cheques.find(c => c.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-chq-upd`,
      userName: state.currentUser?.name || "System",
      action: "ویرایش اطلاعات چک",
      entityType: "CHEQUE",
      entityId: id,
      details: `اطلاعات چک ${cheque?.chequeNumber} بروزرسانی شد`,
      createdAt: new Date().toISOString()
    };
    return {
      cheques: state.cheques.map(c => c.id === id ? { ...c, ...updates } : c),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  deleteCheque: (id) => set((state) => {
    const cheque = state.cheques.find(c => c.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-chq-del`,
      userName: state.currentUser?.name || "System",
      action: "حذف چک",
      entityType: "CHEQUE",
      entityId: id,
      details: `چک شماره ${cheque?.chequeNumber} از سامانه حذف شد`,
      createdAt: new Date().toISOString()
    };
    return {
      cheques: state.cheques.filter(c => c.id !== id),
      activityLogs: [log, ...state.activityLogs]
    };
  }),
  
  archiveShipment: async (id) => {
    set((state) => {
    const shipment = state.shipments.find(s => s.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-ship-arc`,
      userName: state.currentUser?.name || "System",
      action: "بایگانی محموله",
      entityType: "SHIPMENT",
      entityId: id,
      details: `محموله ${shipment?.trackingNumber} به بایگانی منتقل شد`,
      createdAt: new Date().toISOString()
    };
    return {
      shipments: state.shipments.map(s => s.id === id ? { ...s, isArchived: true } : s),
      activityLogs: [log, ...state.activityLogs]
    };
    });
    await persistCurrentStateNow();
    await useMockStore.getState().refreshShipments();
  },

  archiveCheque: (id) => set((state) => {
    const cheque = state.cheques.find(c => c.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-chq-arc`,
      userName: state.currentUser?.name || "System",
      action: "بایگانی چک",
      entityType: "CHEQUE",
      entityId: id,
      details: `چک شماره ${cheque?.chequeNumber} به بایگانی منتقل شد`,
      createdAt: new Date().toISOString()
    };
    return {
      cheques: state.cheques.map(c => c.id === id ? { ...c, status: "ARCHIVED" } : c),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  archiveDocument: (id) => set((state) => {
    const doc = state.documents.find(d => d.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-doc-arc`,
      userName: state.currentUser?.name || "System",
      action: "بایگانی سند",
      entityType: "DOCUMENT",
      entityId: id,
      details: `سند ${doc?.name} به بایگانی منتقل شد`,
      createdAt: new Date().toISOString()
    };
    return {
      documents: state.documents.map(d => d.id === id ? { ...d, isArchived: true } : d),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  unarchiveShipment: async (id) => {
    set((state) => {
    const shipment = state.shipments.find(s => s.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-ship-unarc`,
      userName: state.currentUser?.name || "System",
      action: "بازگردانی محموله",
      entityType: "SHIPMENT",
      entityId: id,
      details: `محموله ${shipment?.trackingNumber} از بایگانی خارج شد`,
      createdAt: new Date().toISOString()
    };
    return {
      shipments: state.shipments.map(s => s.id === id ? { ...s, isArchived: false } : s),
      activityLogs: [log, ...state.activityLogs]
    };
    });
    await persistCurrentStateNow();
    await useMockStore.getState().refreshShipments();
  },

  unarchiveCheque: (id, originalStatus) => set((state) => {
    const cheque = state.cheques.find(c => c.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-chq-unarc`,
      userName: state.currentUser?.name || "System",
      action: "بازگردانی چک",
      entityType: "CHEQUE",
      entityId: id,
      details: `چک شماره ${cheque?.chequeNumber} از بایگانی خارج شد`,
      createdAt: new Date().toISOString()
    };
    return {
      cheques: state.cheques.map(c => c.id === id ? { ...c, status: originalStatus || "PENDING" } : c),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  unarchiveDocument: (id) => set((state) => {
    const doc = state.documents.find(d => d.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-doc-unarc`,
      userName: state.currentUser?.name || "System",
      action: "بازگردانی سند",
      entityType: "DOCUMENT",
      entityId: id,
      details: `سند ${doc?.name} از بایگانی خارج شد`,
      createdAt: new Date().toISOString()
    };
    return {
      documents: state.documents.map(d => d.id === id ? { ...d, isArchived: false } : d),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  permanentDeleteShipment: (id) => set((state) => ({
    shipments: state.shipments.filter(s => s.id !== id),
    shipmentSteps: state.shipmentSteps.filter(step => step.shipmentId !== id),
    documents: state.documents.filter(doc => doc.shipmentId !== id)
  })),

  permanentDeleteCheque: (id) => set((state) => ({
    cheques: state.cheques.filter(c => c.id !== id)
  })),

  permanentDeleteDocument: (id) => set((state) => ({
    documents: state.documents.filter(d => d.id !== id)
  })),

  addQuote: (quote) => set((state) => {
    if (!QUOTATIONS_UI_ENABLED) return state;
    const newQuote: Quote = {
      ...quote,
      id: `q${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    const log: ActivityLog = {
      id: `l${Date.now()}-quote-add`,
      userName: state.currentUser?.name || "System",
      action: "ثبت کوتاژ جدید",
      entityType: "QUOTE",
      entityId: newQuote.id,
      details: `استعلام قیمت برای ${quote.customerName} (مسیر: ${quote.originCity} به ${quote.destinationCity}) ثبت شد`,
      createdAt: new Date().toISOString()
    };
    return {
      quotes: [newQuote, ...state.quotes],
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  updateQuote: (id, updates) => set((state) => {
    if (!QUOTATIONS_UI_ENABLED) return state;
    const quote = state.quotes.find(q => q.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-quote-upd`,
      userName: state.currentUser?.name || "System",
      action: "ویرایش کوتاژ",
      entityType: "QUOTE",
      entityId: id,
      details: `اطلاعات استعلام قیمت ${quote?.id} بروزرسانی شد`,
      createdAt: new Date().toISOString()
    };
    return {
      quotes: state.quotes.map(q => q.id === id ? { ...q, ...updates } : q),
      activityLogs: [log, ...state.activityLogs]
    };
  }),

  deleteQuote: (id) => set((state) => {
    if (!QUOTATIONS_UI_ENABLED) return state;
    const quote = state.quotes.find(q => q.id === id);
    const log: ActivityLog = {
      id: `l${Date.now()}-quote-del`,
      userName: state.currentUser?.name || "System",
      action: "حذف کوتاژ",
      entityType: "QUOTE",
      entityId: id,
      details: `استعلام قیمت شماره ${quote?.id} از سیستم حذف شد`,
      createdAt: new Date().toISOString()
    };
    return {
      quotes: state.quotes.filter(q => q.id !== id),
      activityLogs: [log, ...state.activityLogs]
    };
  }),
}));

const buildDatabasePayload = (state: MockStore) => {
  return COLLECTION_KEYS.reduce((records, key) => {
    if (CANONICAL_API_COLLECTIONS.has(key)) return records;
    if (DISABLED_UI_COLLECTIONS.has(key)) return records;
    records[key] = (state as any)[key] || [];
    return records;
  }, {} as Record<string, any[]>);
};

const saveStateToDatabase = async (state: MockStore) => {
  if (!state.currentUser || !state.hasHydratedFromDatabase || state.isHydratingFromDatabase) {
    return;
  }

  const response = await fetch(`/api/users/${state.currentUser.id}/records`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: buildDatabasePayload(state) }),
  });

  if (!response.ok) {
    throw new Error("Database save failed.");
  }
};

async function persistCurrentStateNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await saveStateToDatabase(useMockStore.getState());
}

useMockStore.subscribe((state) => {
  if (suppressNextDatabaseSave) {
    suppressNextDatabaseSave = false;
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStateToDatabase(state).catch((error) => {
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) return;
      console.error(error);
    });
  }, 500);
});

export const useAppDataStore = useMockStore;
