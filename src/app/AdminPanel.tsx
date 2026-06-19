import React from "react";
import { Activity, AlertTriangle, ArrowUpLeft, BellRing, Building2, CheckCircle2, ChevronDown, ChevronUp, CircleDollarSign, ClipboardList, Clock3, CreditCard, Database, FileWarning, Globe2, HardDrive, HeartPulse, KeyRound, LayoutDashboard, Mail, MessageSquareText, PhoneCall, ReceiptText, Send, Server, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UserCheck, UserPlus, Users, UserX, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EmptyState, EmptyTableRow } from "@/src/components/EmptyState";
import { AdminPanelSkeleton } from "@/src/components/SkeletonStates";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { useAppDataStore } from "@/src/store/useMockStore";

export type AdminTabKey = "overview" | "organizations" | "subscriptions" | "billing" | "errors";
type Organization = {
  id: string;
  name: string;
  status: string;
  planName?: string;
  contactEmail?: string;
  userCount?: number;
  activeUserCount?: number;
};
type Plan = {
  id: string;
  name: string;
};
type AdminOrgUser = {
  id: string;
  name: string;
  email: string;
  role: "CEO" | "MANAGER" | "OPERATIONS" | "CUSTOMER_SERVICE" | "FINANCE";
  status?: string;
  isOnline?: boolean;
  lastSeenAt?: string;
};

const adminRoleOptions: AdminOrgUser["role"][] = ["CEO", "MANAGER", "OPERATIONS", "CUSTOMER_SERVICE", "FINANCE"];

const moduleLabels: Record<string, string> = {
  chat: "چت",
  cheques: "چک‌ها",
  compliance: "جلسات اداری",
  quotations: "استعلام قیمت",
  archive: "آرشیو",
  smsNotifications: "SMS هشدارها",
};

const limitLabels: Record<string, string> = {
  users: "تعداد کارمندان",
  monthlyShipments: "ارسال ماهانه",
  storageMb: "فضای ذخیره‌سازی MB",
  documents: "تعداد اسناد",
  customerLinks: "لینک رهگیری مشتری",
};

function isIncompleteUnpaidSignup(request: any) {
  return Boolean(request?.abandonedCleanupEligible)
    || (!request?.hasPaidPayment
      && !request?.hasReceipt
      && request?.paymentStatus !== "paid"
      && ["payment_pending", "payment_failed", "pending_review"].includes(request?.status));
}

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || "Request failed.");
  return payload.data;
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString("fa-IR")} ریال`;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString("fa-IR") : "ثبت نشده";
}

function preferredContactMethodLabel(value?: string) {
  if (value === "email") return "ایمیل";
  if (value === "either") return "هر دو";
  return "تماس تلفنی";
}

function StatusBadge({ status }: { status?: string }) {
  const tone =
    status === "active" || status === "paid" || status === "approved" || status === "resolved"
      ? "border-emerald-500/30 bg-emerald-50 text-emerald-700"
      : status === "suspended" || status === "rejected" || status === "failed" || status === "expired" || status === "void"
        ? "border-red-500/30 bg-red-50 text-red-700"
      : "border-amber-500/30 bg-amber-50 text-amber-700";
  return <Badge variant="outline" className={cn("rounded-lg px-2.5 py-1 text-[11px] font-bold", tone)}>{status || "نامشخص"}</Badge>;
}

type PlatformHealthState = {
  api: "healthy" | "down" | "unknown";
  db: "healthy" | "down" | "unknown";
  checkedAt?: string;
};

function numberFa(value: unknown) {
  return Number(value || 0).toLocaleString("fa-IR");
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function safeDateValue(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function DashboardKpiCard({
  icon: Icon,
  label,
  value,
  description,
  accent,
  statusText,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  description: string;
  accent: string;
  statusText?: string;
}) {
  return (
    <Card className="group rounded-2xl border-border/80 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black text-muted-foreground">{label}</p>
            <div className="mt-3 text-3xl font-black tracking-tight text-foreground">{value}</div>
          </div>
          <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", accent)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[11px] font-bold text-muted-foreground">{description}</p>
          {statusText ? <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-black text-muted-foreground">{statusText}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardPanel({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  description?: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId} className={cn("rounded-2xl border-border/80 bg-card shadow-sm", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-black">{title}</CardTitle>
              {description ? <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p> : null}
            </div>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function CompactListItem({
  title,
  meta,
  badge,
  action,
}: {
  key?: React.Key;
  title: string;
  meta?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-black">{title || "بدون عنوان"}</div>
        {meta ? <div className="mt-1 truncate text-[11px] text-muted-foreground">{meta}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge}
        {action}
      </div>
    </div>
  );
}

function MiniBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="text-muted-foreground">{label}</span>
        <span>{numberFa(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${percent(value, total)}%` }} />
      </div>
    </div>
  );
}

function EmptyDashboardState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/25 p-7 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-background text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-black">{title}</div>
      <p className="mt-1 max-w-sm text-xs leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

type AdminPanelProps = {
  activeTab?: AdminTabKey;
  onTabChange?: (tab: AdminTabKey) => void;
  embedded?: boolean;
};

export default function AdminPanel({ activeTab, onTabChange, embedded = false }: AdminPanelProps = {}) {
  const currentUser = useAppDataStore((state) => state.currentUser);
  const [internalTab, setInternalTab] = React.useState<AdminTabKey>("overview");
  const tab = activeTab || internalTab;
  const setTab = React.useCallback((nextTab: AdminTabKey) => {
    setInternalTab(nextTab);
    onTabChange?.(nextTab);
  }, [onTabChange]);
  const [loading, setLoading] = React.useState(true);
  const [overview, setOverview] = React.useState<any>(null);
  const [organizations, setOrganizations] = React.useState<Organization[]>([]);
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [selectedOrgId, setSelectedOrgId] = React.useState("");
  const [orgDetail, setOrgDetail] = React.useState<any>(null);
  const [orgBilling, setOrgBilling] = React.useState<any>(null);
  const [orgUsers, setOrgUsers] = React.useState<AdminOrgUser[]>([]);
  const [orgUserSaving, setOrgUserSaving] = React.useState("");
  const [payments, setPayments] = React.useState<any[]>([]);
  const [invoices, setInvoices] = React.useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = React.useState<any>(null);
  const [newInvoice, setNewInvoice] = React.useState({
    organizationId: "",
    amountIrr: "",
    description: "صورتحساب دستی اشتراک",
    dueAt: "",
  });
  const [errors, setErrors] = React.useState<any[]>([]);
  const [errorFilter, setErrorFilter] = React.useState("unresolved");
  const [platformHealth, setPlatformHealth] = React.useState<PlatformHealthState>({ api: "unknown", db: "unknown" });
  const [limits, setLimits] = React.useState<Record<string, any>>({});
  const [creatingCompany, setCreatingCompany] = React.useState(false);
  const [manualSignupOpen, setManualSignupOpen] = React.useState(false);
  const [manualSignup, setManualSignup] = React.useState({
    companyName: "",
    ownerName: "",
    ownerEmail: "",
    password: "",
    contactPhone: "",
    planId: "",
    billingCycle: "monthly",
    companySize: "",
    expectedVolume: "",
    notes: "",
  });

  const loadOrganization = React.useCallback(async (id: string) => {
    if (!id) return;
    const [detail, billing, users] = await Promise.all([
      api<any>(`/api/admin/organizations/${id}`),
      api<any>(`/api/admin/organizations/${id}/billing`),
      api<AdminOrgUser[]>(`/api/admin/organizations/${id}/users`),
    ]);
    setSelectedOrgId(id);
    setOrgDetail(detail);
    setOrgBilling(billing);
    setOrgUsers(users);
    setLimits(detail.subscription?.limitsOverride || {});
  }, []);

  const loadPlatformHealth = React.useCallback(async () => {
    const [apiResult, dbResult] = await Promise.allSettled([
      fetch("/api/health", { cache: "no-store" }),
      fetch("/api/db/health", { cache: "no-store" }),
    ]);
    setPlatformHealth({
      api: apiResult.status === "fulfilled" && apiResult.value.ok ? "healthy" : "down",
      db: dbResult.status === "fulfilled" && dbResult.value.ok ? "healthy" : "down",
      checkedAt: new Date().toISOString(),
    });
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [overviewData, orgData, planData, paymentData, invoiceData, errorData] = await Promise.all([
        api<any>("/api/admin/overview"),
        api<Organization[]>("/api/admin/organizations"),
        api<Plan[]>("/api/plans"),
        api<any[]>("/api/admin/payments"),
        api<any[]>("/api/admin/billing/invoices"),
        api<any[]>(`/api/admin/error-logs?resolved=${errorFilter}`),
      ]);
      setOverview(overviewData);
      setOrganizations(orgData);
      setPlans(planData);
      setManualSignup((current) => ({ ...current, planId: current.planId || planData[0]?.id || "" }));
      setPayments(paymentData);
      setInvoices(invoiceData);
      setErrors(errorData);
      await loadOrganization(selectedOrgId || orgData[0]?.id || "");
      await loadPlatformHealth();
    } catch (error: any) {
      toast.error(error.message || "دسترسی به پنل ادمین ممکن نیست");
    } finally {
      setLoading(false);
    }
  }, [errorFilter, loadOrganization, loadPlatformHealth, selectedOrgId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const createCompanyManually = async () => {
    const planId = manualSignup.planId || plans[0]?.id || "";
    if (!manualSignup.companyName || !manualSignup.ownerName || !manualSignup.ownerEmail || !manualSignup.password || !planId) {
      toast.error("نام شرکت، مالک، ایمیل، رمز عبور و پلن را وارد کنید");
      return;
    }
    setCreatingCompany(true);
    try {
      const data = await api<any>("/api/admin/organizations/manual-signup", {
        method: "POST",
        body: JSON.stringify({ ...manualSignup, planId }),
      });
      toast.success("شرکت جدید با دسترسی فعال ساخته شد");
      setSelectedOrgId(data.organizationId);
      setManualSignup({
        companyName: "",
        ownerName: "",
        ownerEmail: "",
        password: "",
        contactPhone: "",
        planId,
        billingCycle: "monthly",
        companySize: "",
        expectedVolume: "",
        notes: "",
      });
      await refresh();
      await loadOrganization(data.organizationId);
    } catch (error: any) {
      toast.error(error.message || "ساخت شرکت جدید انجام نشد");
    } finally {
      setCreatingCompany(false);
    }
  };

  const saveLimits = async () => {
    if (!selectedOrgId) return;
    const cleaned = Object.fromEntries(Object.entries(limits).filter(([, value]) => value !== "" && value !== null && value !== undefined));
    const data = await api<any>(`/api/admin/organizations/${selectedOrgId}/subscription`, {
      method: "PATCH",
      body: JSON.stringify({ limitsOverride: cleaned }),
    });
    setLimits(data.limitsOverride || {});
    toast.success("محدودیت‌های اختصاصی ذخیره شد");
    await loadOrganization(selectedOrgId);
  };

  const changeOrgStatus = async (action: "activate" | "suspend") => {
    if (!selectedOrgId) return;
    await api(`/api/admin/organizations/${selectedOrgId}/${action}`, { method: "POST" });
    toast.success(action === "activate" ? "سازمان فعال شد" : "سازمان تعلیق شد");
    refresh();
  };

  const reloadOrgUsers = async () => {
    if (!selectedOrgId) return;
    setOrgUsers(await api<AdminOrgUser[]>(`/api/admin/organizations/${selectedOrgId}/users`));
  };

  const updateOrgUser = async (userId: string, updates: Record<string, any>) => {
    if (!selectedOrgId) return;
    setOrgUserSaving(userId);
    try {
      await api(`/api/admin/organizations/${selectedOrgId}/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      await reloadOrgUsers();
      toast.success("اطلاعات کاربر سازمان به‌روزرسانی شد.");
    } catch (error: any) {
      toast.error(error.message || "به‌روزرسانی کاربر سازمان ناموفق بود.");
    } finally {
      setOrgUserSaving("");
    }
  };

  const changeOrgUserStatus = async (userId: string, action: "activate" | "suspend") => {
    if (!selectedOrgId) return;
    setOrgUserSaving(userId);
    try {
      await api(`/api/admin/organizations/${selectedOrgId}/users/${userId}/${action}`, { method: "POST" });
      await reloadOrgUsers();
      toast.success(action === "activate" ? "کاربر فعال شد." : "دسترسی کاربر تعلیق شد.");
    } catch (error: any) {
      toast.error(error.message || "تغییر وضعیت کاربر ناموفق بود.");
    } finally {
      setOrgUserSaving("");
    }
  };

  const resetOrgUserPassword = async (userId: string) => {
    if (!selectedOrgId) return;
    const password = window.prompt("رمز عبور موقت جدید را وارد کنید (حداقل ۸ کاراکتر):");
    if (!password) return;
    setOrgUserSaving(userId);
    try {
      await api(`/api/admin/organizations/${selectedOrgId}/users/${userId}/password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      toast.success("رمز عبور موقت ذخیره شد.");
    } catch (error: any) {
      toast.error(error.message || "تغییر رمز عبور ناموفق بود.");
    } finally {
      setOrgUserSaving("");
    }
  };

  const deleteOrgUser = async (userId: string) => {
    if (!selectedOrgId) return;
    setOrgUserSaving(userId);
    try {
      const preview = await api<any>(`/api/admin/organizations/${selectedOrgId}/users/${userId}/delete-preview`);
      if (!preview.canDelete) {
        toast.error(preview.blockers?.[0]?.message || "حذف دائمی این کاربر مسدود است.");
        return;
      }
      if (!window.confirm("این کاربر به‌صورت دائمی حذف شود؟")) return;
      await api(`/api/admin/organizations/${selectedOrgId}/users/${userId}`, { method: "DELETE" });
      await reloadOrgUsers();
      toast.success("کاربر به‌صورت دائمی حذف شد.");
    } catch (error: any) {
      toast.error(error.message || "حذف کاربر ناموفق بود.");
    } finally {
      setOrgUserSaving("");
    }
  };

  const changeSubscription = async (action: "renew" | "expire") => {
    if (!selectedOrgId) return;
    await api(`/api/admin/organizations/${selectedOrgId}/subscription/${action}`, { method: "POST" });
    toast.success(action === "renew" ? "اشتراک تمدید شد" : "اشتراک منقضی شد");
    refresh();
  };

  const markPayment = async (paymentId: string, action: "mark-paid" | "mark-failed") => {
    await api(`/api/admin/billing/payments/${paymentId}/${action}`, {
      method: "POST",
      body: JSON.stringify({ note: "Manual platform admin override" }),
    });
    toast.success(action === "mark-paid" ? "پرداخت به صورت دستی تایید شد" : "پرداخت ناموفق ثبت شد");
    refresh();
  };

  const loadInvoice = async (invoiceId: string) => {
    const invoice = await api<any>(`/api/admin/billing/invoices/${invoiceId}`);
    setSelectedInvoice(invoice);
  };

  const createManualInvoice = async () => {
    const organizationId = newInvoice.organizationId || selectedOrgId;
    const amountIrr = Number(newInvoice.amountIrr);
    if (!organizationId || !amountIrr) {
      toast.error("شرکت و مبلغ صورتحساب را وارد کنید");
      return;
    }
    const invoice = await api<any>("/api/admin/billing/invoices", {
      method: "POST",
      body: JSON.stringify({
        organizationId,
        amountIrr,
        description: newInvoice.description,
        dueAt: newInvoice.dueAt || undefined,
      }),
    });
    setSelectedInvoice(invoice);
    setNewInvoice((current) => ({ ...current, amountIrr: "", dueAt: "" }));
    toast.success("صورتحساب دستی صادر شد");
    refresh();
  };

  const voidInvoice = async (invoiceId: string) => {
    await api(`/api/admin/billing/invoices/${invoiceId}/void`, { method: "POST" });
    toast.success("صورتحساب باطل شد");
    await refresh();
    if (selectedInvoice?.id === invoiceId) await loadInvoice(invoiceId);
  };

  const resolveError = async (id: string) => {
    await api(`/api/admin/error-logs/${id}/resolve`, { method: "POST" });
    setErrors((items) => items.filter((item) => item.id !== id));
    toast.success("خطا حل‌شده علامت خورد");
  };

  const cards = [
    ["مشتریان فعال", overview?.activeTenants, Building2],
    ["خطاهای باز", overview?.unresolvedErrors, AlertTriangle],
  ];

  const tabItems: { key: AdminTabKey; label: string; count?: number }[] = [
    { key: "overview", label: "نمای کلی" },
    { key: "organizations", label: "مشتریان", count: organizations.length },
    { key: "subscriptions", label: "اشتراک و محدودیت" },
    { key: "billing", label: "صورتحساب و پرداخت" },
    { key: "errors", label: "خطاها", count: overview?.unresolvedErrors },
  ];
  const activeOrganizations = organizations.filter((org) => org.status === "active");
  const paidPayments = payments.filter((payment) => payment.status === "paid");
  const paidRevenue = Number(overview?.paidRevenueIrr || paidPayments.reduce((sum, payment) => sum + Number(payment.amountIrr || 0), 0));
  const openErrors = Number(overview?.unresolvedErrors ?? errors.filter((error) => !error.resolvedAt).length);
  const pendingActionsCount = openErrors;
  const recentOrganizations = [...organizations]
    .sort((a: any, b: any) => safeDateValue(b.createdAt) - safeDateValue(a.createdAt))
    .slice(0, 6);
  const recentInvoices = [...invoices]
    .sort((a: any, b: any) => safeDateValue(b.createdAt || b.issuedAt) - safeDateValue(a.createdAt || a.issuedAt))
    .slice(0, 5);
  const recentPayments = [...payments]
    .sort((a: any, b: any) => safeDateValue(b.createdAt || b.paidAt || b.updatedAt) - safeDateValue(a.createdAt || a.paidAt || a.updatedAt))
    .slice(0, 5);
  const recentActivity = [
    ...payments.map((item) => ({ type: "پرداخت", title: item.organizationName || item.provider, status: item.status, at: item.createdAt || item.paidAt })),
    ...errors.map((item) => ({ type: "خطا", title: item.message, status: item.resolvedAt ? "resolved" : item.source, at: item.createdAt })),
  ].sort((a, b) => safeDateValue(b.at) - safeDateValue(a.at)).slice(0, 8);
  const paymentStatusCounts = payments.reduce((counts: Record<string, number>, payment) => {
    const key = payment.status || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const paymentStatusTotal: number = (Object.values(paymentStatusCounts) as number[]).reduce((sum, value) => sum + value, 0);

  const sectionMeta: Record<AdminTabKey, { title: string; subtitle: string; icon: React.ElementType; action?: React.ReactNode }> = {
    overview: {
      title: "نمای کلی پلتفرم",
      subtitle: "سلامت، درآمد، درخواست‌ها و وضعیت عملیاتی Logistic Plus",
      icon: LayoutDashboard,
    },
    organizations: {
      title: "شرکت‌ها و مشتریان SaaS",
      subtitle: "ایجاد دستی شرکت، وضعیت سازمان‌ها، پلن‌ها و دسترسی‌ها",
      icon: Building2,
    },
    subscriptions: {
      title: "اشتراک، محدودیت و کاربران سازمان",
      subtitle: "مدیریت پلن، محدودیت‌ها و کاربران شرکت‌ها",
      icon: ShieldCheck,
    },
    billing: {
      title: "مالی، پرداخت‌ها و فاکتورها",
      subtitle: "صدور فاکتور دستی، تایید پرداخت‌ها، رسیدها و وضعیت حساب‌ها",
      icon: ReceiptText,
    },
    errors: {
      title: "خطاها و پایداری",
      subtitle: "مرور لاگ خطاها، منبع رخداد و علامت‌گذاری موارد حل‌شده",
      icon: FileWarning,
    },
  };

  const activeSectionMeta = sectionMeta[tab];
  const ActiveSectionIcon = activeSectionMeta.icon;

  return (
    <div className={cn(embedded ? "space-y-5 font-sans" : "app-page max-w-7xl space-y-5 font-sans")} dir="rtl">
      {!embedded && <div data-testid="admin-legacy-tabbar" className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">پنل ادمین پلتفرم</h1>
              <p className="text-sm text-muted-foreground">مدیریت مشتریان SaaS، اشتراک‌ها، صورتحساب‌ها، پرداخت‌ها و خطاهای عملیاتی</p>
            </div>
          </div>
          <div className="max-w-full overflow-x-auto">
            <div className="flex min-w-max gap-1 rounded-xl border border-border bg-muted/35 p-1">
              {tabItems.map((item) => (
                <Button
                  key={item.key}
                  variant={tab === item.key ? "default" : "ghost"}
                  className="h-9 rounded-lg px-3 text-xs font-bold"
                  onClick={() => setTab(item.key)}
                >
                  {item.label}
                  {item.count ? (
                    <span className={cn("mr-2 rounded-full px-1.5 py-0.5 text-[10px]", tab === item.key ? "bg-primary-foreground/20" : "bg-background text-primary")}>
                      {Number(item.count).toLocaleString("fa-IR")}
                    </span>
                  ) : null}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>}

      {embedded && tab !== "overview" && !loading && (
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm" data-testid="admin-module-header">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <ActiveSectionIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">{activeSectionMeta.title}</h1>
                <p className="mt-1 max-w-3xl text-sm leading-7 text-muted-foreground">{activeSectionMeta.subtitle}</p>
              </div>
            </div>
            <Button variant="outline" className="rounded-xl text-xs font-bold" onClick={refresh}>
              <Activity className="ml-2 h-4 w-4" />
              بروزرسانی
            </Button>
          </div>
        </div>
      )}

      {loading && <AdminPanelSkeleton />}

      {tab === "overview" && !loading && (
        embedded ? (
          <div data-testid="admin-section-overview" className="space-y-6">
            <section data-testid="admin-command-header" className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm lg:p-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-primary/10 px-3 py-1 text-primary hover:bg-primary/10">
                      <ShieldCheck className="ml-1.5 h-3.5 w-3.5" />
                      Platform owner
                    </Badge>
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      {currentUser?.name || "ادمین پلتفرم"}
                    </Badge>
                  </div>
                  <h1 className="text-3xl font-black tracking-tight md:text-4xl">نمای کلی پلتفرم</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                    مرکز فرماندهی سلامت پلتفرم، درآمد، درخواست‌ها و عملیات Logistic Plus.
                  </p>
                </div>
                <div className="flex flex-col gap-3 xl:items-end">
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["API", platformHealth.api === "healthy" ? "سالم" : platformHealth.api === "down" ? "قطع" : "نامشخص", Server, platformHealth.api === "healthy" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"],
                      ["DB", platformHealth.db === "healthy" ? "سالم" : platformHealth.db === "down" ? "قطع" : "نامشخص", Database, platformHealth.db === "healthy" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"],
                      ["Mode", typeof window !== "undefined" && window.location.hostname.includes("logisticplus.ir") ? "Production" : "Local/Test", Globe2, "bg-slate-50 text-slate-700 border-slate-200"],
                    ].map(([label, value, Icon, tone]: any) => (
                      <div key={label} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black", tone)}>
                        <Icon className="h-3.5 w-3.5" />
                        <span>{label}: {value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] font-bold text-muted-foreground">
                    آخرین بروزرسانی: {platformHealth.checkedAt ? new Date(platformHealth.checkedAt).toLocaleString("fa-IR") : "نامشخص"}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                    <Button className="rounded-xl text-xs font-black" onClick={() => { setManualSignupOpen(true); setTab("organizations"); }}>
                      <UserPlus className="ml-2 h-4 w-4" />
                      شرکت جدید
                    </Button>
                    <Button variant="outline" className="rounded-xl text-xs font-bold" onClick={() => setTab("errors")}>مشاهده خطاها</Button>
                    <Button asChild variant="outline" className="rounded-xl text-xs font-bold">
                      <a href="/dashboard">بازگشت به اپ</a>
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <section data-testid="admin-command-hero" className="overflow-hidden rounded-3xl border border-primary/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.16),rgba(16,185,129,0.10)_45%,rgba(15,23,42,0.04))] p-6 shadow-sm lg:p-7">
              <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-center">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-[11px] font-black text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Command Center
                  </div>
                  <h2 className="text-2xl font-black tracking-tight md:text-3xl">امروز {numberFa(pendingActionsCount)} مورد نیازمند توجه دارید</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                    درخواست‌های ثبت‌نام، تماس، پرداخت‌های نیازمند بررسی و خطاهای باز از همین‌جا قابل پایش هستند.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button className="rounded-xl font-bold" onClick={() => setTab("organizations")}>
                      شروع بررسی
                      <ArrowUpLeft className="mr-2 h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="rounded-xl font-bold" onClick={refresh}>
                      بروزرسانی داده‌ها
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-background/75 p-4 shadow-sm">
                    <div className="text-[11px] font-black text-muted-foreground">درآمد تاییدشده</div>
                    <div className="mt-2 text-2xl font-black text-primary">{money(paidRevenue)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-background/75 p-4 shadow-sm">
                    <div className="text-[11px] font-black text-muted-foreground">مشتریان فعال</div>
                    <div className="mt-2 text-2xl font-black">{numberFa(activeOrganizations.length)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-background/75 p-4 shadow-sm">
                    <div className="text-[11px] font-black text-muted-foreground">وضعیت سیستم</div>
                    <div className="mt-2 text-lg font-black text-emerald-700">{platformHealth.api === "healthy" && platformHealth.db === "healthy" ? "پایدار" : "نیازمند بررسی"}</div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-background/75 p-4 shadow-sm">
                    <div className="text-[11px] font-black text-muted-foreground">اقدام‌های باز</div>
                    <div className="mt-2 text-2xl font-black text-amber-700">{numberFa(pendingActionsCount)}</div>
                  </div>
                </div>
              </div>
            </section>

            <section data-testid="admin-kpi-grid" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <DashboardKpiCard icon={Building2} label="مشتریان فعال" value={numberFa(activeOrganizations.length)} description={`از ${numberFa(organizations.length)} سازمان ثبت‌شده`} accent="bg-blue-50 text-blue-700" statusText="SaaS" />
              <DashboardKpiCard icon={CircleDollarSign} label="درآمد تاییدشده" value={money(paidRevenue)} description={`${numberFa(paidPayments.length)} پرداخت تاییدشده`} accent="bg-emerald-50 text-emerald-700" statusText="Paid" />
              <DashboardKpiCard icon={FileWarning} label="خطاهای باز" value={numberFa(openErrors)} description="موارد حل‌نشده یا اخیر" accent="bg-rose-50 text-rose-700" statusText={openErrors ? "Alert" : "OK"} />
              <DashboardKpiCard icon={Users} label="سازمان‌های فعال" value={numberFa(activeOrganizations.length)} description="وضعیت active در لیست سازمان‌ها" accent="bg-slate-100 text-slate-700" statusText="Org" />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="space-y-5">
                <DashboardPanel testId="admin-billing-panel" title="مالی و درآمد" description="خلاصه پرداخت‌ها، فاکتورها و توزیع وضعیت مالی" icon={ReceiptText} action={<Button variant="outline" className="rounded-xl text-xs font-bold" onClick={() => setTab("billing")}>مشاهده مالی</Button>}>
                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl bg-muted/35 p-4">
                      <div className="text-xs font-black text-muted-foreground">درآمد تاییدشده</div>
                      <div className="mt-2 text-3xl font-black text-primary">{money(paidRevenue)}</div>
                      <div className="mt-4 space-y-3">
                        <MiniBar label="پرداخت‌شده" value={Number(paymentStatusCounts.paid || 0)} total={paymentStatusTotal} tone="bg-emerald-500" />
                        <MiniBar label="در انتظار" value={Number(paymentStatusCounts.pending || 0)} total={paymentStatusTotal} tone="bg-amber-500" />
                        <MiniBar label="ناموفق" value={Number(paymentStatusCounts.failed || 0)} total={paymentStatusTotal} tone="bg-rose-500" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[...recentPayments, ...recentInvoices].slice(0, 5).length ? (
                        [...recentPayments, ...recentInvoices].slice(0, 5).map((item: any) => (
                          <CompactListItem
                            key={`${item.id}-${item.invoiceNumber || item.provider || "billing"}`}
                            title={item.organizationName || item.invoiceNumber || "رکورد مالی"}
                            meta={`${money(item.amountIrr || item.totalIrr || 0)} · ${formatDate(item.createdAt || item.dueAt || item.paidAt)}`}
                            badge={<StatusBadge status={item.status} />}
                          />
                        ))
                      ) : (
                        <EmptyDashboardState icon={CreditCard} title="رکورد مالی تازه‌ای وجود ندارد" description="بعد از پرداخت یا صدور فاکتور، خلاصه آن اینجا نمایش داده می‌شود." />
                      )}
                    </div>
                  </div>
                </DashboardPanel>

                <DashboardPanel testId="admin-organizations-panel" title="نمای سازمان‌ها" description="آخرین شرکت‌ها، پلن و وضعیت فعلی آنها" icon={Building2} action={<Button variant="outline" className="rounded-xl text-xs font-bold" onClick={() => setTab("organizations")}>مدیریت شرکت‌ها</Button>}>
                  <div className="grid gap-2">
                    {recentOrganizations.length ? recentOrganizations.map((org) => (
                      <CompactListItem
                        key={org.id}
                        title={org.name}
                        meta={`${org.planName || "بدون پلن"} · ${org.contactEmail || "بدون ایمیل"}`}
                        badge={<StatusBadge status={org.status} />}
                        action={<Button size="sm" variant="ghost" className="rounded-lg text-xs" onClick={() => { loadOrganization(org.id); setTab("subscriptions"); }}>جزئیات</Button>}
                      />
                    )) : (
                      <EmptyDashboardState icon={Building2} title="هنوز شرکتی ثبت نشده" description="از دکمه شرکت جدید برای ساخت اولین سازمان استفاده کنید." />
                    )}
                  </div>
                </DashboardPanel>
              </div>

              <aside className="space-y-5">
                <DashboardPanel testId="admin-errors-panel" title="خطاهای اخیر" description="خلاصه رخدادهای باز یا تازه" icon={FileWarning} action={<Button variant="outline" className="rounded-xl text-xs font-bold" onClick={() => setTab("errors")}>مشاهده خطاها</Button>}>
                  <div className="space-y-2">
                    {errors.slice(0, 4).length ? errors.slice(0, 4).map((error) => (
                      <CompactListItem key={error.id} title={error.message} meta={`${error.route || error.apiEndpoint || "بدون مسیر"} · ${formatDate(error.createdAt)}`} badge={<StatusBadge status={error.resolvedAt ? "resolved" : error.source} />} />
                    )) : (
                      <EmptyDashboardState icon={CheckCircle2} title="خطای فعالی وجود ندارد" description="همه چیز مرتب است." />
                    )}
                  </div>
                </DashboardPanel>


                <DashboardPanel testId="admin-health-panel" title="چک‌لیست سلامت پلتفرم" description="مواردی که از داده موجود قابل نمایش هستند" icon={HeartPulse}>
                  <div className="space-y-2">
                    {[
                      ["API health", platformHealth.api === "healthy" ? "سالم" : platformHealth.api === "down" ? "قطع" : "نامشخص", Server],
                      ["DB health", platformHealth.db === "healthy" ? "سالم" : platformHealth.db === "down" ? "قطع" : "نامشخص", Database],
                      ["Rate limit store", "نامشخص", ShieldCheck],
                      ["Document storage", "نامشخص", HardDrive],
                      ["APP public URL", typeof window !== "undefined" ? window.location.origin : "نامشخص", Globe2],
                    ].map(([label, value, Icon]: any) => (
                      <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-2.5 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate font-bold">{label}</span>
                        </div>
                        <span className="shrink-0 font-black text-muted-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </DashboardPanel>

                <DashboardPanel testId="admin-activity-panel" title="فعالیت اخیر" description="ترکیب رخدادهای قابل مشاهده از داده ادمین" icon={Clock3}>
                  <div className="space-y-2">
                    {recentActivity.length ? recentActivity.map((item, index) => (
                      <CompactListItem key={`${item.type}-${index}-${item.at || item.title}`} title={item.title || item.type} meta={`${item.type} · ${formatDate(item.at)}`} badge={<StatusBadge status={item.status} />} />
                    )) : (
                      <EmptyDashboardState icon={Activity} title="فعالیت تازه‌ای وجود ندارد" description="پس از ثبت رخدادهای پلتفرم، جریان فعالیت اینجا کامل می‌شود." />
                    )}
                  </div>
                </DashboardPanel>
              </aside>
            </section>
          </div>
        ) : (
          <div data-testid="admin-section-overview" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {cards.map(([label, value, Icon]: any) => (
                <Card key={label} className="rounded-xl border-border bg-card shadow-sm">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground">{label}</p>
                      <p className="mt-1 text-2xl font-black">{Number(value || 0).toLocaleString("fa-IR")}</p>
                    </div>
                    <Icon className="h-6 w-6 text-primary" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="rounded-xl border-border shadow-sm">
              <CardHeader><CardTitle className="text-base font-black">درآمد تاییدشده</CardTitle></CardHeader>
              <CardContent className="text-2xl font-black text-primary">{money(overview?.paidRevenueIrr || 0)}</CardContent>
            </Card>
          </div>
        )
      )}

      {tab === "organizations" && !loading && (
        <div data-testid="admin-section-organizations" className="space-y-4">
          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-black">
                  <UserPlus className="h-5 w-5 text-primary" />
                  ثبت دستی شرکت جدید
                </CardTitle>
                <Button type="button" variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={() => setManualSignupOpen((value) => !value)}>
                  {manualSignupOpen ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                  {manualSignupOpen ? "بستن فرم" : "باز کردن فرم"}
                </Button>
              </div>
            </CardHeader>
            {manualSignupOpen && <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">نام شرکت</Label>
                <Input className="h-10 rounded-xl" value={manualSignup.companyName} onChange={(event) => setManualSignup((current) => ({ ...current, companyName: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">نام مالک حساب</Label>
                <Input className="h-10 rounded-xl" value={manualSignup.ownerName} onChange={(event) => setManualSignup((current) => ({ ...current, ownerName: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">ایمیل مالک</Label>
                <Input dir="ltr" type="email" className="h-10 rounded-xl" value={manualSignup.ownerEmail} onChange={(event) => setManualSignup((current) => ({ ...current, ownerEmail: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">رمز عبور اولیه</Label>
                <Input dir="ltr" type="password" className="h-10 rounded-xl" value={manualSignup.password} onChange={(event) => setManualSignup((current) => ({ ...current, password: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">شماره تماس</Label>
                <Input dir="ltr" className="h-10 rounded-xl" value={manualSignup.contactPhone} onChange={(event) => setManualSignup((current) => ({ ...current, contactPhone: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">پلن</Label>
                <Select value={manualSignup.planId || plans[0]?.id || ""} onValueChange={(value) => setManualSignup((current) => ({ ...current, planId: value }))}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="انتخاب پلن" /></SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">دوره اشتراک</Label>
                <Select value={manualSignup.billingCycle} onValueChange={(value) => setManualSignup((current) => ({ ...current, billingCycle: value }))}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">ماهانه</SelectItem>
                    <SelectItem value="annual">سالانه</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">اندازه شرکت</Label>
                <Input className="h-10 rounded-xl" value={manualSignup.companySize} onChange={(event) => setManualSignup((current) => ({ ...current, companySize: event.target.value }))} />
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label className="text-xs font-bold">حجم تقریبی محموله</Label>
                <Input className="h-10 rounded-xl" value={manualSignup.expectedVolume} onChange={(event) => setManualSignup((current) => ({ ...current, expectedVolume: event.target.value }))} />
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label className="text-xs font-bold">یادداشت</Label>
                <Input className="h-10 rounded-xl" value={manualSignup.notes} onChange={(event) => setManualSignup((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <div className="flex items-end xl:col-span-4">
                <Button onClick={createCompanyManually} disabled={creatingCompany} className="h-10 rounded-xl font-bold">
                  {creatingCompany ? (
                    <ActionSkeleton inverted className="w-40" />
                  ) : (
                    <>
                      <UserPlus className="ml-2 h-4 w-4" />
                      ایجاد و فعال‌سازی شرکت
                    </>
                  )}
                </Button>
              </div>
            </CardContent>}
          </Card>

          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader><CardTitle className="text-base font-black">شرکت‌های مشتری</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-right text-xs">
                <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3">شرکت</th><th className="px-4 py-3">پلن</th><th className="px-4 py-3">کاربر</th><th className="px-4 py-3">وضعیت</th><th className="px-4 py-3">عملیات</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {organizations.length === 0 ? (
                    <EmptyTableRow colSpan={5}>
                      <EmptyState
                        icon={Building2}
                        title="هنوز شرکتی در پلتفرم ثبت نشده"
                        description="در محیط عملیاتی تمیز، فقط شرکت‌های واقعی بعد از ثبت‌نام یا ایجاد دستی اینجا دیده می‌شوند."
                        compact
                      />
                    </EmptyTableRow>
                  ) : (
                    organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3"><div className="font-black">{org.name}</div><div className="text-muted-foreground" dir="ltr">{org.contactEmail}</div></td>
                      <td className="px-4 py-3">{org.planName}</td>
                      <td className="px-4 py-3">{org.activeUserCount ?? org.userCount}</td>
                      <td className="px-4 py-3"><StatusBadge status={org.status} /></td>
                      <td className="px-4 py-3"><Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => { loadOrganization(org.id); setTab("subscriptions"); }}>مدیریت</Button></td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "subscriptions" && !loading && (
        <div data-testid="admin-section-subscriptions" className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader><CardTitle className="text-base font-black">انتخاب مشتری</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {organizations.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title="مشتری فعالی وجود ندارد"
                  description="بعد از اولین ثبت‌نام واقعی، تنظیمات اشتراک اینجا قابل مدیریت می‌شود."
                  compact
                />
              ) : (
                organizations.map((org) => (
                  <button key={org.id} onClick={() => loadOrganization(org.id)} className={cn("w-full rounded-xl border p-3 text-right text-sm transition", selectedOrgId === org.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                    <div className="font-black">{org.name}</div>
                    <div className="text-xs text-muted-foreground">{org.planName}</div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base font-black">
                <span>اشتراک، محدودیت و وضعیت {orgDetail?.name}</span>
                <StatusBadge status={orgDetail?.status} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-5">
                {Object.entries(limitLabels).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground">{label}</Label>
                    <Input type="number" value={limits[key] ?? ""} placeholder={String(orgDetail?.subscription?.effectiveLimits?.[key] ?? "")} onChange={(event) => setLimits((old) => ({ ...old, [key]: event.target.value }))} className="rounded-xl" />
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                {Object.entries(moduleLabels).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-xl border border-border p-3 text-xs font-bold">
                    <Checkbox checked={Boolean(limits[key] ?? orgDetail?.subscription?.effectiveFeatures?.[key])} onCheckedChange={(checked: any) => setLimits((old) => ({ ...old, [key]: Boolean(checked) }))} />
                    {label}
                  </label>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                {Object.entries(orgDetail?.usage || {}).map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-border bg-muted/25 p-3">
                    <div className="text-[11px] font-bold text-muted-foreground">{limitLabels[key] || key}</div>
                    <div className="mt-1 text-lg font-black">{Number(value || 0).toLocaleString("fa-IR")}</div>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border p-4"><div className="text-xs font-bold text-muted-foreground">وضعیت اشتراک</div><div className="mt-2"><StatusBadge status={orgBilling?.subscription?.status} /></div></div>
                <div className="rounded-xl border border-border p-4"><div className="text-xs font-bold text-muted-foreground">شروع دوره</div><div className="mt-2 text-sm font-black">{formatDate(orgBilling?.subscription?.currentPeriodStart)}</div></div>
                <div className="rounded-xl border border-border p-4"><div className="text-xs font-bold text-muted-foreground">پایان دوره</div><div className="mt-2 text-sm font-black">{formatDate(orgBilling?.subscription?.currentPeriodEnd)}</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveLimits} className="rounded-xl font-bold"><SlidersHorizontal className="ml-2 h-4 w-4" />ذخیره محدودیت‌ها</Button>
                <Button variant="outline" onClick={() => changeOrgStatus("activate")} className="rounded-xl font-bold"><CheckCircle2 className="ml-2 h-4 w-4" />فعال‌سازی سازمان</Button>
                <Button variant="outline" onClick={() => changeOrgStatus("suspend")} className="rounded-xl font-bold text-red-600"><XCircle className="ml-2 h-4 w-4" />تعلیق سازمان</Button>
                <Button variant="outline" onClick={() => changeSubscription("renew")} className="rounded-xl font-bold text-emerald-600"><CheckCircle2 className="ml-2 h-4 w-4" />تمدید اشتراک</Button>
                <Button variant="outline" onClick={() => changeSubscription("expire")} className="rounded-xl font-bold text-amber-700"><XCircle className="ml-2 h-4 w-4" />انقضای اشتراک</Button>
              </div>
              <div className="rounded-xl border border-border">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="flex items-center gap-2 text-sm font-black">
                    <Users className="h-4 w-4 text-primary" />
                    مدیریت کاربران سازمان
                  </div>
                  <Button type="button" variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={reloadOrgUsers}>به‌روزرسانی</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-right text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr><th className="px-4 py-3">کاربر</th><th className="px-4 py-3">ایمیل</th><th className="px-4 py-3">نقش</th><th className="px-4 py-3">وضعیت</th><th className="px-4 py-3">عملیات</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {orgUsers.length === 0 ? (
                        <EmptyTableRow colSpan={5}>
                          <EmptyState icon={Users} title="کاربری برای این سازمان ثبت نشده" description="بعد از ساخت یا تأیید سازمان، کاربران آن اینجا قابل مدیریت هستند." compact />
                        </EmptyTableRow>
                      ) : (
                        orgUsers.map((user) => {
                          const suspended = user.status === "suspended";
                          return (
                            <tr key={user.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-black">{user.name}</td>
                              <td className="px-4 py-3 text-muted-foreground" dir="ltr">{user.email}</td>
                              <td className="px-4 py-3">
                                <Select value={user.role} onValueChange={(role) => updateOrgUser(user.id, { role })} disabled={orgUserSaving === user.id}>
                                  <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {adminRoleOptions.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-4 py-3"><StatusBadge status={user.status || "active"} /></td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={orgUserSaving === user.id} onClick={() => {
                                    const name = window.prompt("نام جدید کاربر:", user.name);
                                    if (name && name !== user.name) updateOrgUser(user.id, { name });
                                  }}>ویرایش</Button>
                                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={orgUserSaving === user.id} onClick={() => resetOrgUserPassword(user.id)}><KeyRound className="ml-1 h-3.5 w-3.5" />رمز</Button>
                                  {suspended ? (
                                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs text-emerald-600" disabled={orgUserSaving === user.id} onClick={() => changeOrgUserStatus(user.id, "activate")}><UserCheck className="ml-1 h-3.5 w-3.5" />فعال</Button>
                                  ) : (
                                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs text-rose-600" disabled={orgUserSaving === user.id} onClick={() => changeOrgUserStatus(user.id, "suspend")}><UserX className="ml-1 h-3.5 w-3.5" />تعلیق</Button>
                                  )}
                                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs text-destructive" disabled={orgUserSaving === user.id || !suspended} onClick={() => deleteOrgUser(user.id)}><Trash2 className="ml-1 h-3.5 w-3.5" />حذف</Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "billing" && !loading && (
        <div data-testid="admin-section-billing" className="space-y-4">
          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader><CardTitle className="text-base font-black flex items-center gap-2"><ReceiptText className="h-5 w-5 text-primary" />صدور صورتحساب دستی</CardTitle></CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1.2fr_auto]">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">شرکت</Label>
                <Select value={newInvoice.organizationId || selectedOrgId} onValueChange={(value) => setNewInvoice((current) => ({ ...current, organizationId: value }))}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="انتخاب شرکت" /></SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">مبلغ ریال</Label>
                <Input inputMode="numeric" className="h-10 rounded-xl" value={newInvoice.amountIrr} onChange={(event) => setNewInvoice((current) => ({ ...current, amountIrr: event.target.value }))} placeholder="29000000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">شرح</Label>
                <Input className="h-10 rounded-xl" value={newInvoice.description} onChange={(event) => setNewInvoice((current) => ({ ...current, description: event.target.value }))} />
              </div>
              <div className="flex items-end">
                <Button onClick={createManualInvoice} className="h-10 rounded-xl font-bold">صدور</Button>
              </div>
            </CardContent>
          </Card>

          {selectedInvoice && (
            <Card className="rounded-xl border-border bg-primary/5 shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <CardTitle className="text-base font-black">جزئیات صورتحساب {selectedInvoice.invoiceNumber}</CardTitle>
                  <StatusBadge status={selectedInvoice.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-[11px] font-bold text-muted-foreground">شرکت</div><div className="mt-1 text-sm font-black">{selectedInvoice.organizationName}</div></div>
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-[11px] font-bold text-muted-foreground">مبلغ کل</div><div className="mt-1 text-sm font-black">{money(selectedInvoice.totalIrr)}</div></div>
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-[11px] font-bold text-muted-foreground">موعد پرداخت</div><div className="mt-1 text-sm font-black">{formatDate(selectedInvoice.dueAt)}</div></div>
                  <div className="rounded-xl border border-border bg-card p-3"><div className="text-[11px] font-bold text-muted-foreground">رسید</div><div className="mt-1 text-sm font-black">{selectedInvoice.receipt ? selectedInvoice.receipt.receiptNumber : "ثبت نشده"}</div></div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="mb-2 text-xs font-black">آیتم‌های صورتحساب</div>
                  <div className="space-y-2">
                    {(selectedInvoice.items || []).map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                        <span className="font-bold">{item.description}</span>
                        <span className="font-black">{money(item.totalAmountIrr)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader><CardTitle className="text-base font-black flex items-center gap-2"><ReceiptText className="h-5 w-5 text-primary" />صورتحساب‌ها</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-right text-xs">
                <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3">شماره</th><th className="px-4 py-3">شرکت</th><th className="px-4 py-3">مبلغ</th><th className="px-4 py-3">وضعیت</th><th className="px-4 py-3">موعد</th><th className="px-4 py-3">عملیات</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {invoices.length === 0 ? (
                    <EmptyTableRow colSpan={6}>
                      <EmptyState
                        icon={ReceiptText}
                        title="هنوز صورت‌حسابی صادر نشده"
                        description="صورت‌حساب‌های واقعی بعد از صدور دستی یا پرداخت اشتراک اینجا نمایش داده می‌شوند."
                        compact
                      />
                    </EmptyTableRow>
                  ) : (
                    invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-4 py-3 font-bold">{invoice.invoiceNumber}</td>
                      <td className="px-4 py-3">{invoice.organizationName}</td>
                      <td className="px-4 py-3 font-bold">{money(invoice.totalIrr)}</td>
                      <td className="px-4 py-3"><StatusBadge status={invoice.status} /></td>
                      <td className="px-4 py-3">{formatDate(invoice.dueAt)}</td>
                      <td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => loadInvoice(invoice.id)}>جزئیات</Button><Button size="sm" variant="outline" className="rounded-lg text-xs" disabled={invoice.status === "void" || invoice.status === "paid"} onClick={() => voidInvoice(invoice.id)}>ابطال</Button></div></td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader><CardTitle className="text-base font-black">پرداخت‌ها</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-right text-xs">
                <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3">شرکت</th><th className="px-4 py-3">مبلغ</th><th className="px-4 py-3">درگاه</th><th className="px-4 py-3">وضعیت</th><th className="px-4 py-3">رسید</th><th className="px-4 py-3">عملیات دستی</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {payments.length === 0 ? (
                    <EmptyTableRow colSpan={6}>
                      <EmptyState
                        icon={CreditCard}
                        title="پرداختی برای بررسی وجود ندارد"
                        description="پرداخت‌های واقعی بعد از شروع فرآیند مالی یا اتصال درگاه اینجا ثبت می‌شوند."
                        compact
                      />
                    </EmptyTableRow>
                  ) : (
                    payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-4 py-3">{payment.organizationName}</td>
                      <td className="px-4 py-3 font-bold">{money(payment.amountIrr)}</td>
                      <td className="px-4 py-3">{payment.provider}</td>
                      <td className="px-4 py-3"><StatusBadge status={payment.status} /></td>
                      <td className="px-4 py-3">{payment.receiptId ? "ثبت شده" : "ندارد"}</td>
                      <td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" className="rounded-lg text-xs" disabled={payment.status === "paid"} onClick={() => markPayment(payment.id, "mark-paid")}>تایید دستی</Button><Button size="sm" variant="outline" className="rounded-lg text-xs" disabled={payment.status === "failed"} onClick={() => markPayment(payment.id, "mark-failed")}>ناموفق</Button></div></td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "errors" && !loading && (
        <Card data-testid="admin-section-errors" className="rounded-xl border-border shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-base font-black">گزارش خطاها</CardTitle>
              <Select value={errorFilter} onValueChange={setErrorFilter}>
                <SelectTrigger className="w-44 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="unresolved">حل‌نشده</SelectItem><SelectItem value="resolved">حل‌شده</SelectItem><SelectItem value="all">همه</SelectItem></SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {errors.map((error) => (
              <div key={error.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-red-500" /><span className="font-black">{error.message}</span><StatusBadge status={error.source} /></div>
                    <div className="mt-2 text-xs text-muted-foreground">{error.organizationName || "بدون سازمان"} • {error.route || error.apiEndpoint || "بدون مسیر"} • {new Date(error.createdAt).toLocaleString("fa-IR")}</div>
                    {error.stack && <pre className="mt-3 max-h-28 overflow-auto rounded-lg bg-muted p-3 text-left text-[11px]" dir="ltr">{error.stack}</pre>}
                  </div>
                  {!error.resolvedAt && <Button size="sm" variant="outline" className="rounded-lg text-xs font-bold" onClick={() => resolveError(error.id)}>حل شد</Button>}
                </div>
              </div>
            ))}
            {!errors.length && (
              <EmptyState
                icon={AlertTriangle}
                title={errorFilter === "resolved" ? "خطای حل‌شده‌ای برای نمایش نیست" : "خطای فعالی برای نمایش وجود ندارد"}
                description="لاگ‌های خطای واقعی بعد از رخدادهای عملیاتی اینجا دیده می‌شوند؛ محیط تمیز نباید داده نمونه داشته باشد."
                compact
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
