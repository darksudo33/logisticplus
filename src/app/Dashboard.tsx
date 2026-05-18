import React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMockStore } from "../store/useMockStore";
import {
  AlertTriangle,
  CheckCircle,
  CheckSquare,
  Clock,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  PlusCircle,
  Ship,
  TrendingUp,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { differenceInSeconds, format, parse } from "date-fns-jalali";
import { EmptyState, EmptyTableRow, SetupChecklist } from "@/src/components/EmptyState";

const cardBase = "rounded-lg border-border bg-card shadow-none transition-all";

const QuickAccessButton = ({ icon: Icon, label, path }: { key?: string; icon: any; label: string; path: string }) => {
  const navigate = useNavigate();

  return (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className="min-w-0">
      <Button
        variant="ghost"
        onClick={() => navigate(path)}
        className="group h-16 w-full justify-start gap-2.5 rounded-lg border border-border bg-card px-3.5 text-right hover:border-primary/30 hover:bg-primary/5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className="truncate text-[13px] font-black text-foreground">{label}</span>
      </Button>
    </motion.div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    IN_TRANSIT: "bg-blue-500/10 text-blue-600 dark:text-blue-500",
    ARRIVED: "bg-green-500/10 text-green-600 dark:text-green-500",
    CUSTOMS: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
    CLEARED: "bg-violet-500/10 text-violet-600 dark:text-violet-500",
    DELIVERED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500",
    PENDING: "bg-slate-500/10 text-slate-600 dark:text-slate-500",
  };
  const labels: Record<string, string> = {
    IN_TRANSIT: "در حال حمل",
    ARRIVED: "رسیده به بندر",
    CUSTOMS: "در انتظار گمرک",
    CLEARED: "ترخیص شده",
    DELIVERED: "تحویل نهایی",
    PENDING: "در انتظار ثبت",
  };

  return <Badge className={cn("h-5.5 border-none px-2 text-[10px] font-black", styles[status])}>{labels[status] || status}</Badge>;
};

const PriorityBadge = ({ priority }: { priority: string }) => (
  <Badge
    className={cn(
      "h-5.5 border-none px-2 text-[10px] font-black",
      priority === "URGENT" && "bg-rose-500 text-white",
      priority === "HIGH" && "bg-amber-500 text-black",
      priority !== "URGENT" && priority !== "HIGH" && "bg-muted text-muted-foreground"
    )}
  >
    {priority === "URGENT" ? "فوری" : priority === "HIGH" ? "بالا" : "عادی"}
  </Badge>
);

const getRiskMeta = (days: number) => {
  if (days < 2) return { label: "ریسک فوری", className: "bg-rose-500 text-white", bar: "bg-rose-500" };
  if (days < 5) return { label: "نیازمند پیگیری", className: "bg-amber-500 text-black", bar: "bg-amber-500" };
  return { label: "تحت کنترل", className: "bg-blue-500 text-white", bar: "bg-primary" };
};

type DashboardApiData = {
  summary?: {
    activeShipments?: number;
    customsShipments?: number;
    openTasks?: number;
    completedTasks?: number;
    dueSoonCheques?: number;
    returnedCheques?: number;
    upcomingMeetings?: number;
    missingMeetingDocuments?: number;
  };
  latestShipments?: any[];
  priorityShipments?: any[];
  myTasks?: any[];
  alerts?: any[];
  management?: any;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const shipments = useMockStore((state) => state.shipments);
  const tasks = useMockStore((state) => state.tasks);
  const customers = useMockStore((state) => state.customers);
  const documents = useMockStore((state) => state.documents);
  const currentUser = useMockStore((state) => state.currentUser);
  const [dashboardData, setDashboardData] = React.useState<DashboardApiData | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const loadDashboard = async () => {
      try {
        const endpoints = ["summary", "latest-shipments", "priority-shipments", "my-tasks", "alerts", "management"];
        const responses = await Promise.all(endpoints.map((endpoint) => fetch(`/api/dashboard/${endpoint}`)));
        const payloads = await Promise.all(responses.map((response) => response.json()));
        if (cancelled) return;
        setDashboardData({
          summary: payloads[0]?.data,
          latestShipments: payloads[1]?.data,
          priorityShipments: payloads[2]?.data,
          myTasks: payloads[3]?.data,
          alerts: payloads[4]?.data,
          management: payloads[5]?.data,
        });
      } catch {
        if (!cancelled) setDashboardData(null);
      }
    };
    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = format(new Date(), "yyyy/MM/dd");
  const activeCustomers = customers.filter((customer) => !customer.isArchived);
  const visibleShipments = shipments.filter((shipment) => !shipment.isArchived);
  const activeShipments = shipments.filter((s) => !s.isArchived && s.status !== "DELIVERED" && s.status !== "CLOSED");
  const customsShipments = shipments.filter((s) => !s.isArchived && s.status === "CUSTOMS");
  const openTodayTasks = tasks.filter((t) => t.status !== "DONE" && t.dueDate === today);
  const completedTasks = tasks.filter((t) => t.status === "DONE");
  const demurrageRisk = shipments.filter((s) => s.status === "ARRIVED" && (s.freeTimeDays || 14) < 5);
  const summary = dashboardData?.summary;

  const quickLinks = [
    { icon: Ship, label: "محموله‌ها", path: "/shipments" },
    { icon: Users, label: "مشتریان", path: "/customers" },
    { icon: CheckSquare, label: "وظایف", path: "/tasks" },
    { icon: FileText, label: "اسناد", path: "/documents" },
    { icon: CreditCard, label: "چک‌ها", path: "/cheques" },
  ];

  const activeDocuments = documents.filter((document) => !document.isArchived);
  const setupItems = [
    {
      label: "ثبت اولین مشتری",
      description: "پروفایل شرکت یا مخاطب اصلی را بسازید.",
      done: activeCustomers.length > 0,
      to: "/customers",
      icon: Users,
    },
    {
      label: "ایجاد اولین محموله",
      description: "شماره رهگیری، مسیر و وضعیت اولیه را وارد کنید.",
      done: visibleShipments.length > 0,
      to: "/shipments",
      icon: Ship,
    },
    {
      label: "بارگذاری اولین سند",
      description: "اسناد داخلی یا قابل نمایش برای مشتری را اضافه کنید.",
      done: activeDocuments.length > 0,
      to: "/documents",
      icon: FileText,
    },
    {
      label: "فعال کردن رهگیری مشتری",
      description: "بعد از ثبت محموله، لینک رهگیری عمومی را بسازید.",
      done: visibleShipments.some((shipment) => Boolean((shipment as any).publicTrackingToken || (shipment as any).customerAccessToken)),
      to: "/shipments",
      icon: PlusCircle,
    },
  ];

  const recentShipments = React.useMemo(() => dashboardData?.latestShipments?.length ? dashboardData.latestShipments : visibleShipments.slice(0, 8), [dashboardData, visibleShipments]);
  const recentTasks = React.useMemo(() => tasks.slice(0, 4), [tasks]);

  const myTasks = React.useMemo(() => {
    if (dashboardData?.myTasks?.length) return dashboardData.myTasks;
    if (!currentUser) return [];
    return tasks
      .filter((task) => task.assignedToUserId === currentUser.id && task.status !== "DONE")
      .sort((a, b) => {
        const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
      })
      .slice(0, 4);
  }, [tasks, currentUser, dashboardData]);

  const stats = [
    {
      title: "محموله‌های فعال",
      value: (summary?.activeShipments ?? activeShipments.length).toLocaleString("fa-IR"),
      detail: `${visibleShipments.length.toLocaleString("fa-IR")} محموله ثبت شده`,
      icon: Package,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "در انتظار ترخیص",
      value: (summary?.customsShipments ?? customsShipments.length).toLocaleString("fa-IR"),
      detail: `${(summary?.customsShipments ?? customsShipments.length).toLocaleString("fa-IR")} مورد در گمرک`,
      icon: TrendingUp,
      tone: "text-amber-600",
      bg: "bg-amber-500/10",
    },
    {
      title: "وظایف امروز",
      value: (summary?.openTasks ?? openTodayTasks.length).toLocaleString("fa-IR"),
      detail: `${(summary?.completedTasks ?? completedTasks.length).toLocaleString("fa-IR")} وظیفه تکمیل شده`,
      icon: CheckCircle,
      tone: "text-emerald-600",
      bg: "bg-emerald-500/10",
    },
    {
      title: "ریسک دموراژ",
      value: demurrageRisk.length.toLocaleString("fa-IR"),
      detail: demurrageRisk.length ? "نیازمند پیگیری فوری" : "مورد فوری وجود ندارد",
      icon: AlertTriangle,
      tone: "text-rose-600",
      bg: "bg-rose-500/10",
    },
  ];

  const criticalShipments = React.useMemo(() => {
    const sourceShipments = dashboardData?.priorityShipments?.length ? dashboardData.priorityShipments : visibleShipments;
    return sourceShipments
      .filter((s) => ["ARRIVED", "CUSTOMS", "IN_TRANSIT"].includes(s.status))
      .map((s) => {
        let daysRem = 5;
        try {
          if (s.estimatedDelivery) {
            const delivery = parse(s.estimatedDelivery, "yyyy/MM/dd", new Date());
            daysRem = differenceInSeconds(delivery, new Date()) / (24 * 3600);
          }
        } catch (error) {
          daysRem = 5;
        }

        return { ...s, daysRemaining: Math.max(0, daysRem) };
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 3);
  }, [visibleShipments, dashboardData]);

  return (
    <div className="app-page space-y-5 font-sans rtl">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-black text-foreground md:text-2xl">خوش آمدید، {currentUser?.name || "مدیر"} عزیز</h1>
        <p className="text-xs font-bold text-muted-foreground">نمای آرام و متمرکز از وضعیت امروز عملیات، ترخیص و وظایف تیم.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className={cn(cardBase, "min-h-[118px] hover:border-primary/30")}>
            <CardContent className="flex h-full flex-col justify-between gap-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-black text-foreground">{stat.title}</p>
                  <p className="mt-1 text-[11px] font-bold text-muted-foreground">{stat.detail}</p>
                </div>
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", stat.bg)}>
                  <stat.icon className={cn("h-4.5 w-4.5", stat.tone)} />
                </span>
              </div>
              <p className="text-3xl font-black leading-none text-foreground tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <SetupChecklist items={setupItems} />

      <section className="space-y-2.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              محموله‌های بحرانی
            </h2>
            <p className="mt-1 text-[11px] font-bold text-muted-foreground">بر اساس نزدیک‌ترین زمان تحویل یا پایان فری‌تایم مرتب شده‌اند.</p>
          </div>
          <Button variant="ghost" className="h-8 justify-start text-xs font-black text-primary" onClick={() => navigate("/shipments")}>
            مشاهده همه محموله‌ها
          </Button>
        </div>

        {criticalShipments.length === 0 ? (
          <EmptyState
            icon={Ship}
            title="هنوز محموله بحرانی ندارید"
            description="بعد از ثبت اولین محموله، موارد نزدیک به تحویل یا پایان فری‌تایم اینجا دیده می‌شوند."
            primaryAction={{ label: "ثبت محموله", to: "/shipments", icon: PlusCircle }}
            secondaryAction={{ label: "ثبت مشتری", to: "/customers", icon: Users, variant: "outline" }}
            compact
          />
        ) : (
          <div className="grid auto-rows-fr grid-cols-1 gap-3 lg:grid-cols-3">
            {criticalShipments.map((shipment) => {
            const days = Math.floor(shipment.daysRemaining);
            const hours = Math.floor((shipment.daysRemaining % 1) * 24);
            const progress = Math.min(100, Math.max(8, 100 - (shipment.daysRemaining / (shipment.freeTimeDays || 14)) * 100));
            const risk = getRiskMeta(days);

            return (
              <button
                key={shipment.id}
                type="button"
                onClick={() => navigate(`/shipments/${shipment.id}`)}
                className="h-full rounded-xl text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className={cn(cardBase, "h-full overflow-hidden hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm")}>
                  <CardContent className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-black text-primary">{shipment.trackingNumber}</p>
                        <p className="mt-1.5 truncate text-sm font-black text-foreground">{shipment.customerName}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusBadge status={shipment.status} />
                        <Badge className={cn("h-5.5 border-none px-2 text-[10px] font-black", risk.className)}>{risk.label}</Badge>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted-foreground">زمان باقی‌مانده</span>
                        {days < 2 ? <AlertTriangle className="h-3.5 w-3.5 text-rose-500" /> : <Clock className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black leading-none text-foreground tabular-nums">{days}</span>
                        <span className="text-xs font-bold text-muted-foreground">روز</span>
                        <span className="mx-1 text-muted-foreground/40">/</span>
                        <span className="text-xl font-black text-foreground tabular-nums">{hours}</span>
                        <span className="text-xs font-bold text-muted-foreground">ساعت</span>
                      </div>
                    </div>

                    <div className="mt-auto space-y-2">
                      <div className="flex justify-between text-[11px] font-bold text-muted-foreground">
                        <span>مصرف فری‌تایم</span>
                        <span className={cn(progress > 80 ? "text-rose-500" : "text-primary")}>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full transition-all duration-1000", risk.bar)} style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Card className={cardBase}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border p-3.5">
              <CardTitle className="text-sm font-black text-foreground">وظایف من</CardTitle>
              <Badge variant="outline" className="h-6 border-primary/30 px-2 text-xs font-black text-primary">
                {myTasks.length.toLocaleString("fa-IR")} وظیفه
              </Badge>
            </CardHeader>
            <CardContent className={cn("p-3.5", myTasks.length ? "space-y-2.5" : "py-4")}>
              {myTasks.length === 0 ? (
                <EmptyState
                  icon={CheckSquare}
                  title="وظیفه فعالی برای شما ثبت نشده"
                  description="برای شروع کار تیم، یک تسک عملیاتی بسازید یا بعد از ثبت محموله وظایف مرتبط را اضافه کنید."
                  primaryAction={{ label: "تعریف وظیفه", to: "/tasks", icon: PlusCircle }}
                  compact
                />
              ) : myTasks.length === -1 ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3.5">
                  <p className="text-xs font-bold text-muted-foreground">برنامه کاری شما برای امروز تکمیل است.</p>
                  <Button variant="ghost" className="h-8 text-xs font-black text-primary" onClick={() => navigate("/tasks")}>
                    مشاهده وظایف
                  </Button>
                </div>
              ) : (
                myTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => navigate("/tasks")}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-right transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-black text-foreground">{task.title}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {task.dueDate}
                      </p>
                    </div>
                    <PriorityBadge priority={task.priority} />
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className={cardBase}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border p-3.5">
              <CardTitle className="text-sm font-black text-foreground">پیگیری عملیاتی تیم</CardTitle>
              <Button variant="outline" className="h-8 rounded-lg border-dashed text-xs font-bold" onClick={() => navigate("/tasks")}>
                افزودن تسک
              </Button>
            </CardHeader>
            <CardContent className="grid gap-2.5 p-3.5 sm:grid-cols-2">
              {recentTasks.length === 0 ? (
                <div className="sm:col-span-2">
                  <EmptyState
                    icon={CheckSquare}
                    title="هنوز تسکی برای تیم تعریف نشده"
                    description="اولین وظیفه را برای پیگیری تماس، سند، ترخیص یا تحویل ثبت کنید."
                    primaryAction={{ label: "افزودن تسک", to: "/tasks", icon: PlusCircle }}
                    compact
                  />
                </div>
              ) : (
                recentTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => navigate("/tasks")}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-right transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-black text-foreground">{task.title}</p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">{task.assignedToName}</p>
                  </div>
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      task.priority === "URGENT" ? "bg-rose-500" : task.priority === "HIGH" ? "bg-amber-500" : "bg-primary"
                    )}
                  />
                </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-black text-foreground">
              <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
              دسترسی سریع
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
            {quickLinks.map((link) => (
              <QuickAccessButton key={link.path} icon={link.icon} label={link.label} path={link.path} />
            ))}
          </div>
        </section>
      </div>

      <Card className={cn(cardBase, "overflow-hidden")}>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border p-3.5">
          <CardTitle className="text-sm font-black text-foreground">بارهای اخیر</CardTitle>
          <Button variant="ghost" className="h-8 text-xs font-black text-primary" onClick={() => navigate("/shipments")}>
            مشاهده همه
          </Button>
        </CardHeader>
        <CardContent className="p-0 text-right">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[13px]">
              <thead className="border-b border-border bg-muted/40 text-xs font-black text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">شماره رهگیری</th>
                  <th className="px-4 py-3">مشتری</th>
                  <th className="px-4 py-3">وضعیت</th>
                  <th className="px-4 py-3">تحویل تخمینی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentShipments.length === 0 ? (
                  <EmptyTableRow colSpan={4}>
                    <EmptyState
                      icon={Ship}
                      title="هنوز باری ثبت نشده"
                      description="بعد از ثبت اولین محموله، آخرین بارها و وضعیت آن‌ها در این جدول نمایش داده می‌شوند."
                      primaryAction={{ label: "ثبت محموله", to: "/shipments", icon: PlusCircle }}
                      compact
                    />
                  </EmptyTableRow>
                ) : (
                  recentShipments.map((shipment) => (
                    <tr
                      key={shipment.id}
                      className="cursor-pointer transition-colors hover:bg-primary/5"
                      onClick={() => navigate(`/shipments/${shipment.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-[13px] font-black text-primary">{shipment.trackingNumber}</td>
                      <td className="px-4 py-3 font-bold text-foreground">{shipment.customerName}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={shipment.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-muted-foreground">{shipment.estimatedDelivery}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
