import React from "react";
import { Activity, AlertTriangle, BellRing, Building2, CheckCircle2, ChevronDown, ChevronUp, CreditCard, Mail, MessageSquareText, PhoneCall, ReceiptText, Send, ShieldCheck, SlidersHorizontal, UserPlus, XCircle } from "lucide-react";
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

type TabKey = "overview" | "organizations" | "contacts" | "requests" | "subscriptions" | "sms" | "billing" | "errors";
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
type ContactRequest = {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  preferredContactMethod?: string;
  message?: string;
  status: string;
  createdAt?: string;
};
type SmsDelivery = {
  id: string;
  organizationId: string;
  organizationName?: string;
  userName?: string;
  recipientType?: string;
  recipientName?: string;
  recipientPhone?: string;
  status: string;
  provider?: string;
  sourceType?: string;
  providerResponse?: Record<string, any>;
  skipReason?: string;
  errorMessage?: string;
  createdAt?: string;
  sentAt?: string;
};
type SmsTemplate = {
  key: string;
  label: string;
  body: string;
  enabled: boolean;
  updatedAt?: string;
};
type SmsAnalytics = {
  summary: {
    totalSent: number;
    sentThisMonth: number;
    failed: number;
    skipped: number;
    queued: number;
  };
  recipients: Array<{
    organizationName?: string;
    recipientType?: string;
    recipientName?: string;
    recipientPhone?: string;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    lastStatus?: string;
    lastActivityAt?: string;
  }>;
};

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

export default function AdminPanel() {
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [loading, setLoading] = React.useState(true);
  const [overview, setOverview] = React.useState<any>(null);
  const [organizations, setOrganizations] = React.useState<Organization[]>([]);
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [selectedOrgId, setSelectedOrgId] = React.useState("");
  const [orgDetail, setOrgDetail] = React.useState<any>(null);
  const [orgBilling, setOrgBilling] = React.useState<any>(null);
  const [requests, setRequests] = React.useState<any[]>([]);
  const [contactRequests, setContactRequests] = React.useState<ContactRequest[]>([]);
  const [smsDeliveries, setSmsDeliveries] = React.useState<SmsDelivery[]>([]);
  const [smsAnalytics, setSmsAnalytics] = React.useState<SmsAnalytics | null>(null);
  const [smsTemplates, setSmsTemplates] = React.useState<SmsTemplate[]>([]);
  const [smsRunning, setSmsRunning] = React.useState(false);
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
    const [detail, billing] = await Promise.all([
      api<any>(`/api/admin/organizations/${id}`),
      api<any>(`/api/admin/organizations/${id}/billing`),
    ]);
    setSelectedOrgId(id);
    setOrgDetail(detail);
    setOrgBilling(billing);
    setLimits(detail.subscription?.limitsOverride || {});
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [overviewData, orgData, planData, requestData, contactData, smsData, smsAnalyticsData, smsTemplateData, paymentData, invoiceData, errorData] = await Promise.all([
        api<any>("/api/admin/overview"),
        api<Organization[]>("/api/admin/organizations"),
        api<Plan[]>("/api/plans"),
        api<any[]>("/api/admin/signup-requests"),
        api<ContactRequest[]>("/api/admin/contact-requests"),
        api<SmsDelivery[]>("/api/admin/sms-deliveries?limit=100"),
        api<SmsAnalytics>("/api/admin/sms-analytics"),
        api<SmsTemplate[]>("/api/admin/sms-templates"),
        api<any[]>("/api/admin/payments"),
        api<any[]>("/api/admin/billing/invoices"),
        api<any[]>(`/api/admin/error-logs?resolved=${errorFilter}`),
      ]);
      setOverview(overviewData);
      setOrganizations(orgData);
      setPlans(planData);
      setManualSignup((current) => ({ ...current, planId: current.planId || planData[0]?.id || "" }));
      setRequests(requestData);
      setContactRequests(contactData);
      setSmsDeliveries(smsData);
      setSmsAnalytics(smsAnalyticsData);
      setSmsTemplates(smsTemplateData);
      setPayments(paymentData);
      setInvoices(invoiceData);
      setErrors(errorData);
      await loadOrganization(selectedOrgId || orgData[0]?.id || "");
    } catch (error: any) {
      toast.error(error.message || "دسترسی به پنل ادمین ممکن نیست");
    } finally {
      setLoading(false);
    }
  }, [errorFilter, loadOrganization, selectedOrgId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const reviewSignup = async (id: string, action: "approve" | "reject") => {
    try {
      await api(`/api/admin/signup-requests/${id}/${action}`, { method: "POST" });
      toast.success(action === "approve" ? "درخواست تایید شد" : "درخواست رد شد");
      refresh();
    } catch (error: any) {
      toast.error(error.message || "بررسی درخواست انجام نشد");
    }
  };

  const resolveContact = async (id: string) => {
    try {
      await api(`/api/admin/contact-requests/${id}/resolve`, { method: "POST" });
      toast.success("درخواست تماس حل‌شده علامت خورد");
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "درخواست تماس به‌روزرسانی نشد");
    }
  };

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

  const enableSmsAddonAndPrepareInvoice = async () => {
    if (!selectedOrgId) return;
    const nextLimits = { ...limits, smsNotifications: true };
    const cleaned = Object.fromEntries(Object.entries(nextLimits).filter(([, value]) => value !== "" && value !== null && value !== undefined));
    const data = await api<any>(`/api/admin/organizations/${selectedOrgId}/subscription`, {
      method: "PATCH",
      body: JSON.stringify({ limitsOverride: cleaned }),
    });
    setLimits(data.limitsOverride || {});
    setNewInvoice((current) => ({
      ...current,
      organizationId: selectedOrgId,
      description: "افزونه پرداختی SMS هشدار جلسات، دمیوراژ و وظایف فوری",
    }));
    await loadOrganization(selectedOrgId);
    toast.success("SMS برای مشتری فعال شد؛ صدور فاکتور دستی آماده است");
    setTab("billing");
  };

  const runSmsWorker = async () => {
    setSmsRunning(true);
    try {
      const result = await api<any>("/api/admin/sms-deliveries/run-worker", {
        method: "POST",
        body: JSON.stringify({ limit: 50 }),
      });
      toast.success(`SMS worker: ${Number(result.sent || 0).toLocaleString("fa-IR")} ارسال ثبت شد`);
      setSmsDeliveries(await api<SmsDelivery[]>("/api/admin/sms-deliveries?limit=100"));
      setSmsAnalytics(await api<SmsAnalytics>("/api/admin/sms-analytics"));
    } catch (error: any) {
      toast.error(error.message || "اجرای SMS worker انجام نشد");
    } finally {
      setSmsRunning(false);
    }
  };

  const saveSmsTemplate = async (template: SmsTemplate) => {
    const updated = await api<SmsTemplate>(`/api/admin/sms-templates/${encodeURIComponent(template.key)}`, {
      method: "PATCH",
      body: JSON.stringify({ body: template.body, enabled: template.enabled }),
    });
    setSmsTemplates((items) => items.map((item) => (item.key === updated.key ? updated : item)));
    toast.success("قالب پیامک ذخیره شد");
  };

  const changeOrgStatus = async (action: "activate" | "suspend") => {
    if (!selectedOrgId) return;
    await api(`/api/admin/organizations/${selectedOrgId}/${action}`, { method: "POST" });
    toast.success(action === "activate" ? "سازمان فعال شد" : "سازمان تعلیق شد");
    refresh();
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
    ["در انتظار تایید", overview?.pendingApprovals, ShieldCheck],
    ["درخواست تماس", overview?.pendingContactRequests, MessageSquareText],
    ["پرداخت‌شده و منتظر بررسی", overview?.paidPendingReview, CreditCard],
    ["خطاهای باز", overview?.unresolvedErrors, AlertTriangle],
  ];

  const tabItems: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: "نمای کلی" },
    { key: "organizations", label: "مشتریان", count: organizations.length },
    { key: "contacts", label: "تماس‌ها", count: overview?.pendingContactRequests },
    { key: "requests", label: "ثبت‌نام‌ها", count: overview?.pendingApprovals },
    { key: "subscriptions", label: "اشتراک و محدودیت" },
    { key: "sms", label: "SMS", count: smsAnalytics?.summary?.queued },
    { key: "billing", label: "صورتحساب و پرداخت" },
    { key: "errors", label: "خطاها", count: overview?.unresolvedErrors },
  ];
  const selectedSmsDeliveries = smsDeliveries
    .filter((item) => !selectedOrgId || item.organizationId === selectedOrgId)
    .slice(0, 10);

  return (
    <div className="app-page max-w-7xl space-y-5 font-sans" dir="rtl">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
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
      </div>

      {loading && <AdminPanelSkeleton />}

      {tab === "overview" && !loading && (
        <div className="space-y-4">
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
      )}

      {tab === "organizations" && !loading && (
        <div className="space-y-4">
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

      {tab === "requests" && !loading && (
        <Card className="rounded-xl border-border shadow-sm">
          <CardHeader><CardTitle className="text-base font-black">درخواست‌های ثبت‌نام</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3">شرکت</th><th className="px-4 py-3">مالک</th><th className="px-4 py-3">پلن</th><th className="px-4 py-3">پرداخت</th><th className="px-4 py-3">وضعیت</th><th className="px-4 py-3">عملیات</th></tr></thead>
              <tbody className="divide-y divide-border">
                {requests.length === 0 ? (
                  <EmptyTableRow colSpan={6}>
                    <EmptyState
                      icon={UserPlus}
                      title="درخواست ثبت‌نامی در انتظار بررسی نیست"
                      description="وقتی شرکت واقعی ثبت‌نام کند یا پرداختی نیاز به بررسی داشته باشد، همین‌جا نمایش داده می‌شود."
                      compact
                    />
                  </EmptyTableRow>
                ) : (
                  requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-4 py-3 font-bold">{request.companyName}</td>
                    <td className="px-4 py-3"><div>{request.contactName}</div><div className="text-muted-foreground" dir="ltr">{request.contactEmail}</div></td>
                    <td className="px-4 py-3">{request.planName}</td>
                    <td className="px-4 py-3"><StatusBadge status={request.paymentStatus} /></td>
                    <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                    <td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" className="rounded-lg text-xs" disabled={request.status === "approved" || request.paymentStatus !== "paid"} title={request.paymentStatus !== "paid" ? "ابتدا پرداخت را تایید کنید" : undefined} onClick={() => reviewSignup(request.id, "approve")}>تایید</Button><Button size="sm" variant="outline" className="rounded-lg text-xs" disabled={request.status === "rejected"} onClick={() => reviewSignup(request.id, "reject")}>رد</Button></div></td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "contacts" && !loading && (
        <Card className="rounded-xl border-border shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-black">
                <MessageSquareText className="h-5 w-5 text-primary" />
                درخواست‌های تماس
              </CardTitle>
              <div className="text-xs font-bold text-muted-foreground">
                {Number(contactRequests.filter((item) => item.status === "new").length).toLocaleString("fa-IR")} درخواست باز
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">شرکت</th>
                  <th className="px-4 py-3">مخاطب</th>
                  <th className="px-4 py-3">راه ارتباطی</th>
                  <th className="px-4 py-3">درخواست</th>
                  <th className="px-4 py-3">وضعیت</th>
                  <th className="px-4 py-3">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contactRequests.length === 0 ? (
                  <EmptyTableRow colSpan={6}>
                    <EmptyState
                      icon={MessageSquareText}
                      title="هنوز درخواست تماسی ثبت نشده"
                      description="فرم صفحه تماس فقط درخواست‌های واقعی کاربران عمومی را اینجا نمایش می‌دهد."
                      compact
                    />
                  </EmptyTableRow>
                ) : (
                  contactRequests.map((request) => (
                    <tr key={request.id} className="align-top hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-black">{request.companyName}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{formatDate(request.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold">{request.contactName}</div>
                        {request.contactEmail ? (
                          <div className="mt-1 flex items-center gap-1 text-muted-foreground" dir="ltr">
                            <Mail className="h-3.5 w-3.5" />
                            {request.contactEmail}
                          </div>
                        ) : null}
                        {request.contactPhone ? (
                          <div className="mt-1 flex items-center gap-1 text-muted-foreground" dir="ltr">
                            <PhoneCall className="h-3.5 w-3.5" />
                            {request.contactPhone}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-bold">{preferredContactMethodLabel(request.preferredContactMethod)}</td>
                      <td className="max-w-xs px-4 py-3 leading-6 text-muted-foreground">{request.message || "بدون توضیحات"}</td>
                      <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg text-xs font-bold"
                          disabled={request.status === "resolved"}
                          onClick={() => resolveContact(request.id)}
                        >
                          حل شد
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "subscriptions" && !loading && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
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
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-black text-emerald-800">
                      <BellRing className="h-4 w-4" />
                      افزونه SMS هشدارها
                    </div>
                    <p className="mt-2 text-xs leading-6 text-emerald-900/75">
                      پلن Enterprise این قابلیت را پیش‌فرض دارد؛ برای پلن‌های پایین‌تر می‌توانید آن را به‌عنوان افزونه پرداختی فعال کنید و از جریان صورتحساب دستی فاکتور صادر کنید.
                    </p>
                  </div>
                  <Button type="button" variant="outline" className="shrink-0 rounded-xl border-emerald-500/30 text-xs font-bold text-emerald-800 hover:bg-emerald-100" onClick={enableSmsAddonAndPrepareInvoice}>
                    <ReceiptText className="ml-2 h-4 w-4" />
                    فعال‌سازی و آماده‌سازی فاکتور
                  </Button>
                </div>
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
                <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-black">
                      <Send className="h-4 w-4 text-primary" />
                      آخرین پیامک‌ها
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">صف، ارسال، خطا و skip برای مشتری انتخاب‌شده</p>
                  </div>
                  <Button type="button" variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={runSmsWorker} disabled={smsRunning}>
                    {smsRunning ? (
                      <ActionSkeleton className="w-24" />
                    ) : (
                      <>
                        <Send className="ml-2 h-4 w-4" />
                        اجرای worker
                      </>
                    )}
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr><th className="px-4 py-3">وضعیت</th><th className="px-4 py-3">گیرنده</th><th className="px-4 py-3">منبع</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">نتیجه</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedSmsDeliveries.length === 0 ? (
                        <EmptyTableRow colSpan={5}>
                          <EmptyState
                            icon={BellRing}
                            title="هنوز پیامکی برای این مشتری ثبت نشده"
                            description="بعد از رخدادهای جلسه، دمیوراژ یا وظایف فوری، نتیجه ارسال یا skip اینجا دیده می‌شود."
                            compact
                          />
                        </EmptyTableRow>
                      ) : (
                        selectedSmsDeliveries.map((delivery) => (
                          <tr key={delivery.id} className="align-top hover:bg-muted/30">
                            <td className="px-4 py-3"><StatusBadge status={delivery.status} /></td>
                            <td className="px-4 py-3">
                              <div className="font-bold">{delivery.userName || "کاربر نامشخص"}</div>
                              <div className="mt-1 text-muted-foreground" dir="ltr">{delivery.recipientPhone || "بدون شماره"}</div>
                            </td>
                            <td className="px-4 py-3 font-bold">{delivery.sourceType || "manual"}</td>
                            <td className="px-4 py-3">{delivery.provider || "sms.ir"}</td>
                            <td className="max-w-xs px-4 py-3 text-muted-foreground">
                              {delivery.errorMessage || delivery.skipReason || (delivery.providerResponse?.dryRun ? "dry-run" : delivery.sentAt ? "sent" : formatDate(delivery.createdAt))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "sms" && !loading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["ارسال موفق", smsAnalytics?.summary.totalSent, Send],
              ["ارسال ماه جاری", smsAnalytics?.summary.sentThisMonth, BellRing],
              ["ناموفق", smsAnalytics?.summary.failed, AlertTriangle],
              ["Skip", smsAnalytics?.summary.skipped, XCircle],
              ["در صف", smsAnalytics?.summary.queued, BellRing],
            ].map(([label, value, Icon]: any) => (
              <Card key={label} className="rounded-xl border-border shadow-sm">
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
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-black">
                  <Send className="h-5 w-5 text-primary" />
                  گزارش ارسال بر اساس گیرنده
                </CardTitle>
                <Button type="button" variant="outline" className="h-9 rounded-xl text-xs font-bold" onClick={runSmsWorker} disabled={smsRunning}>
                  {smsRunning ? (
                    <ActionSkeleton className="w-24" />
                  ) : (
                    <>
                      <Send className="ml-2 h-4 w-4" />
                      اجرای worker
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-right text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr><th className="px-4 py-3">گیرنده</th><th className="px-4 py-3">شرکت</th><th className="px-4 py-3">شماره</th><th className="px-4 py-3">موفق</th><th className="px-4 py-3">ناموفق</th><th className="px-4 py-3">Skip</th><th className="px-4 py-3">آخرین وضعیت</th><th className="px-4 py-3">آخرین فعالیت</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {smsAnalytics?.recipients?.length ? (
                    smsAnalytics.recipients.map((recipient) => (
                      <tr key={`${recipient.organizationName}-${recipient.recipientType}-${recipient.recipientPhone}-${recipient.recipientName}`} className="hover:bg-muted/30">
                        <td className="px-4 py-3"><div className="font-black">{recipient.recipientName || "نامشخص"}</div><div className="text-muted-foreground">{recipient.recipientType === "customer" ? "مشتری" : "کاربر"}</div></td>
                        <td className="px-4 py-3">{recipient.organizationName || "-"}</td>
                        <td className="px-4 py-3" dir="ltr">{recipient.recipientPhone || "بدون شماره"}</td>
                        <td className="px-4 py-3 font-black text-emerald-700">{Number(recipient.sentCount || 0).toLocaleString("fa-IR")}</td>
                        <td className="px-4 py-3 font-black text-red-700">{Number(recipient.failedCount || 0).toLocaleString("fa-IR")}</td>
                        <td className="px-4 py-3 font-black text-amber-700">{Number(recipient.skippedCount || 0).toLocaleString("fa-IR")}</td>
                        <td className="px-4 py-3"><StatusBadge status={recipient.lastStatus} /></td>
                        <td className="px-4 py-3">{formatDate(recipient.lastActivityAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={8}>
                      <EmptyState
                        icon={BellRing}
                        title="هنوز پیامکی ثبت نشده"
                        description="پس از ساخت اولین پیامک، تعداد ارسال‌ها بر اساس گیرنده اینجا دیده می‌شود."
                        compact
                      />
                    </EmptyTableRow>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base font-black"><BellRing className="h-5 w-5 text-primary" />قالب‌های پیامک</CardTitle></CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {smsTemplates.map((template) => (
                <div key={template.key} className="rounded-xl border border-border p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black">{template.label}</div>
                      <div className="text-[11px] text-muted-foreground" dir="ltr">{template.key}</div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-bold">
                      <Checkbox checked={template.enabled} onCheckedChange={(checked: any) => setSmsTemplates((items) => items.map((item) => item.key === template.key ? { ...item, enabled: Boolean(checked) } : item))} />
                      فعال
                    </label>
                  </div>
                  <textarea
                    dir="rtl"
                    className="min-h-28 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm leading-7 outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                    value={template.body}
                    onChange={(event) => setSmsTemplates((items) => items.map((item) => item.key === template.key ? { ...item, body: event.target.value } : item))}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-muted-foreground">#mtg# #time# #ship# #task# #status#</span>
                    <Button type="button" size="sm" className="rounded-lg text-xs font-bold" onClick={() => saveSmsTemplate(template)}>
                      ذخیره
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base font-black"><Activity className="h-5 w-5 text-primary" />آخرین پیامک‌ها و پاسخ Provider</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-right text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr><th className="px-4 py-3">وضعیت</th><th className="px-4 py-3">گیرنده</th><th className="px-4 py-3">منبع</th><th className="px-4 py-3">پیام</th><th className="px-4 py-3">نتیجه</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {smsDeliveries.length ? smsDeliveries.slice(0, 25).map((delivery) => (
                    <tr key={delivery.id} className="align-top hover:bg-muted/30">
                      <td className="px-4 py-3"><StatusBadge status={delivery.status} /></td>
                      <td className="px-4 py-3"><div className="font-bold">{delivery.recipientName || delivery.userName || "نامشخص"}</div><div className="text-muted-foreground" dir="ltr">{delivery.recipientPhone || "بدون شماره"}</div></td>
                      <td className="px-4 py-3 font-bold">{delivery.sourceType || "-"}</td>
                      <td className="max-w-sm px-4 py-3 leading-6 text-muted-foreground">{delivery.message}</td>
                      <td className="max-w-xs px-4 py-3 text-muted-foreground">{delivery.errorMessage || delivery.skipReason || (delivery.providerResponse?.dryRun ? "dry-run" : delivery.sentAt ? "sent" : formatDate(delivery.createdAt))}</td>
                    </tr>
                  )) : (
                    <EmptyTableRow colSpan={5}>
                      <EmptyState icon={Activity} title="هنوز لاگ پیامکی وجود ندارد" description="جزئیات ارسال و خطاهای SMS.ir پس از اولین تلاش ارسال اینجا ثبت می‌شود." compact />
                    </EmptyTableRow>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "billing" && !loading && (
        <div className="space-y-4">
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
        <Card className="rounded-xl border-border shadow-sm">
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
