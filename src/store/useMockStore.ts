import { create } from "zustand";
import { User, Customer, Shipment, Task, Message, ActivityLog, Demurrage, ShipmentStep, ShipmentStatus, TaskStatus, ShipmentDocument, Channel, Notification, Appointment, AppointmentStatus, Cheque, Quote } from "../types";

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
  "channels",
  "notifications",
  "appointments",
  "cheques",
  "quotes",
  "deletedItems",
  "defaultSteps",
] as const;

// Compatibility bridge only: collections migrated to canonical APIs must not be
// persisted back through /api/users/:id/records, or stale frontend state can
// overwrite the canonical tables.
const CANONICAL_API_COLLECTIONS = new Set<string>(["shipments"]);

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

interface MockStore {
  currentUser: User | null;
  users: User[];
  customers: Customer[];
  shipments: Shipment[];
  tasks: Task[];
  messages: Message[];
  activityLogs: ActivityLog[];
  demurrageRecords: Demurrage[];
  shipmentSteps: ShipmentStep[];
  documents: ShipmentDocument[];
  channels: Channel[];
  notifications: Notification[];
  appointments: Appointment[];
  defaultSteps: DefaultStepRecord[];
  hasHydratedFromDatabase: boolean;
  isHydratingFromDatabase: boolean;
  hydrateFromRecords: (records: Record<string, any[]>) => void;
  loadCurrentUserRecords: () => Promise<void>;
  loginWithPassword: (email: string, password: string, remember?: boolean) => Promise<User>;
  loginWithPhoneCode: (phone: string, code: string, remember?: boolean) => Promise<User>;

  setCurrentUser: (user: User | null) => void;
  addShipment: (shipment: Omit<Shipment, "id">) => void;
  updateShipment: (id: string, updates: Partial<Shipment>) => void;
  updateShipmentStatus: (id: string, status: ShipmentStatus) => void;
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
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
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
  archiveShipment: (id: string) => void;
  archiveCheque: (id: string) => void;
  archiveDocument: (id: string) => void;
  unarchiveShipment: (id: string) => void;
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

export const useMockStore = create<MockStore>((set) => ({
  currentUser: getStoredCurrentUser(),
  users: [],
  customers: [],
  shipments: [],
  tasks: [],
  messages: [],
  activityLogs: [],
  demurrageRecords: [],
  shipmentSteps: [],
  documents: [],
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

  hydrateFromRecords: (records) => set(() => ({
    users: records.users || [],
    customers: records.customers || [],
    shipments: records.shipments || [],
    tasks: records.tasks || [],
    messages: records.messages || [],
    activityLogs: records.activityLogs || [],
    demurrageRecords: records.demurrageRecords || [],
    shipmentSteps: records.shipmentSteps || [],
    documents: records.documents || [],
    channels: records.channels || [],
    notifications: records.notifications || [],
    appointments: records.appointments || [],
    cheques: records.cheques || [],
    quotes: records.quotes || [],
    deletedItems: records.deletedItems || [],
    defaultSteps: records.defaultSteps || [],
    hasHydratedFromDatabase: true,
    isHydratingFromDatabase: false,
  })),

  loadCurrentUserRecords: async () => {
    const user = useMockStore.getState().currentUser;
    if (!user) return;

    useMockStore.setState({ isHydratingFromDatabase: true });
    const authResponse = await fetch("/api/auth/me");
    if (!authResponse.ok) {
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
      throw new Error("Could not restore current session.");
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

    const response = await fetch(`/api/users/${restoredUser.id}/bootstrap`);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        persistCurrentUser(null);
        useMockStore.setState({
          currentUser: null,
          hasHydratedFromDatabase: false,
          isHydratingFromDatabase: false,
        });
      } else {
        useMockStore.setState({ isHydratingFromDatabase: false });
      }
      throw new Error("Could not load database records.");
    }
    const payload = await response.json();
    useMockStore.getState().hydrateFromRecords(payload.records || {});
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
      throw new Error("Invalid email or password.");
    }

    const payload = await response.json();
    const user = normalizeUser(payload.user);
    persistCurrentUser(user);
    set({ currentUser: user });
    useMockStore.getState().hydrateFromRecords(payload.records || {});
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
      throw new Error("Invalid or expired SMS code.");
    }

    const payload = await response.json();
    const user = normalizeUser(payload.user);
    persistCurrentUser(user);
    set({ currentUser: user });
    useMockStore.getState().hydrateFromRecords(payload.records || {});
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
        messages: [],
        activityLogs: [],
        demurrageRecords: [],
        shipmentSteps: [],
        documents: [],
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

  addShipment: (shipment) => {
    const id = `s${Math.random().toString(36).substr(2, 5)}`;
    const newShipment = { ...shipment, id };
    const stepNames = useMockStore.getState().defaultSteps
      .sort((a, b) => a.order - b.order)
      .map(step => step.name);
    const newSteps = stepNames.map((name, i) => ({
      id: `step-${id}-${i}`,
      shipmentId: id,
      name,
      order: i,
      status: i === 0 ? "IN_PROGRESS" : "PENDING" as any
    }));

    set((state) => ({
      shipments: [newShipment, ...state.shipments],
      shipmentSteps: [...state.shipmentSteps, ...newSteps]
    }));
  },

  updateShipment: (id, updates) => set((state) => {
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
  }),

  updateShipmentStatus: (id, status) => set((state) => {
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
  }),

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
  markNotificationRead: (id) => set((state) => ({
    notifications: state.notifications.map(n => n.id === id ? { ...n, isRead: true } : n)
  })),
  markAllNotificationsRead: () => set((state) => ({
    notifications: state.notifications.map(n => ({ ...n, isRead: true }))
  })),
  addNotification: (notification) => set((state) => ({
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
  })),
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
  
  archiveShipment: (id) => set((state) => {
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
  }),

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

  unarchiveShipment: (id) => set((state) => {
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
  }),

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

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const buildDatabasePayload = (state: MockStore) => {
  return COLLECTION_KEYS.reduce((records, key) => {
    if (CANONICAL_API_COLLECTIONS.has(key)) return records;
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

useMockStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStateToDatabase(state).catch((error) => {
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) return;
      console.error(error);
    });
  }, 500);
});
