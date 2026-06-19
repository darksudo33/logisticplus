import React from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  FileText,
  Loader2,
  PackageSearch,
  Search,
  Ship,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SHIPMENT_STATUS_VALUES, shipmentStatusLabel } from "@/src/shared/shipment-statuses.js";

type DashboardMetric = {
  key: "activeShipments" | "documents" | "activeEmployees" | "tasks";
  label: string;
  value: number;
  actionUrl?: string | null;
};

type DashboardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  shipmentId?: string | null;
  actionUrl: string;
};

type DashboardShipment = {
  id: string;
  shipmentCode: string;
  customerCode?: string;
  status: string;
  destination?: string;
  estimatedDelivery?: string;
  updatedAt?: string;
  actionUrl: string;
};

type DashboardHomeData = {
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
  metrics: DashboardMetric[];
  myActiveTasks: DashboardTask[];
  lastUpdatedShipments: DashboardShipment[];
};

type ShipmentSearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  description?: string;
  url?: string;
};

const metricIcons: Record<DashboardMetric["key"], LucideIcon> = {
  activeShipments: Ship,
  documents: FileText,
  activeEmployees: Users,
  tasks: ClipboardList,
};

const metricTones: Record<DashboardMetric["key"], string> = {
  activeShipments: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300",
  documents: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  activeEmployees: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300",
  tasks: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
};

const statusLabels: Record<string, string> = {
  TODO: "باز",
  IN_PROGRESS: "در حال انجام",
  BLOCKED: "متوقف",
  DONE: "انجام شده",
};

const priorityLabels: Record<string, string> = {
  URGENT: "فوری",
  HIGH: "بالا",
  MEDIUM: "متوسط",
  LOW: "کم",
};

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("fa-IR");
}

function formatShortDate(value?: string) {
  if (!value) return "ثبت نشده";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}


function statusText(status: string) {
  const normalized = String(status || "").toUpperCase();
  if (SHIPMENT_STATUS_VALUES.includes(normalized)) return shipmentStatusLabel(normalized);
  return statusLabels[normalized] || status || "ثبت نشده";
}

function priorityText(priority: string) {
  return priorityLabels[String(priority || "").toUpperCase()] || priority || "متوسط";
}

function priorityTone(priority: string) {
  const normalized = String(priority || "").toUpperCase();
  if (normalized === "URGENT") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300";
  if (normalized === "HIGH") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
  return "border-border bg-muted/50 text-muted-foreground";
}

function MetricCard({ metric }: { metric: DashboardMetric; key?: React.Key }) {
  const navigate = useNavigate();
  const Icon = metricIcons[metric.key];
  const content = (
    <>
      <span className="flex min-w-0 items-start gap-2.5">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", metricTones[metric.key])}>
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 pt-0.5">
          <span className="block truncate text-[12px] font-black leading-5 text-muted-foreground">{metric.label}</span>
          <span className="mt-1 block text-2xl font-black leading-none text-foreground tabular-nums">{formatNumber(metric.value)}</span>
        </span>
      </span>
      {metric.actionUrl ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
      ) : null}
    </>
  );

  const className =
    "group flex min-h-[86px] w-full items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 text-right shadow-none transition-colors hover:border-primary/30";

  if (!metric.actionUrl) {
    return (
      <div className={className} data-testid={`dashboard-metric-${metric.key}`}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => navigate(metric.actionUrl || "/dashboard")}
      data-testid={`dashboard-metric-${metric.key}`}
    >
      {content}
    </button>
  );
}

function ShipmentQuickSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ShipmentSearchResult[]>([]);
  const [error, setError] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);

  const openShipment = React.useCallback(
    (result: ShipmentSearchResult) => {
      navigate(result.url || `/shipments/${result.id}`);
    },
    [navigate]
  );

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const searchTerm = query.trim();
    setError("");
    setResults([]);

    if (searchTerm.length < 2) {
      setError("برای جستجو حداقل دو کاراکتر وارد کنید.");
      return;
    }

    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q: searchTerm, type: "shipments", limit: "6" });
      const response = await fetch(`/api/search?${params.toString()}`, { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        navigate("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.error?.message || "جستجوی محموله ناموفق بود.");
      }
      const shipmentResults = (payload.results || []).filter((item: ShipmentSearchResult) => item.type === "shipment");
      if (shipmentResults.length === 1) {
        openShipment(shipmentResults[0]);
        return;
      }
      setResults(shipmentResults);
      if (shipmentResults.length === 0) {
        setError("محموله‌ای با این شماره پیدا نشد.");
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "جستجوی محموله ناموفق بود.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card data-testid="dashboard-shipment-search-section">
      <CardHeader className="pb-0">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PackageSearch className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-black">جستجوی سریع محموله</CardTitle>
            <CardDescription className="mt-1 text-xs font-bold">
              شماره محموله را وارد کنید تا پرونده از مسیر اصلی محموله باز شود.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (error) setError("");
              }}
              placeholder="جستجوی شماره محموله..."
              className="h-10 rounded-lg bg-background pr-9 text-sm font-bold"
              data-testid="dashboard-shipment-search-input"
            />
          </div>
          <Button type="submit" className="h-10 px-4 text-xs font-black" disabled={isSearching} data-testid="dashboard-shipment-search-submit">
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            جستجو
          </Button>
        </form>

        {error ? (
          <p className="mt-2 flex items-center gap-1 text-xs font-bold text-destructive" data-testid="dashboard-shipment-search-error">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        ) : null}

        {results.length > 0 ? (
          <div className="mt-3 grid gap-2" data-testid="dashboard-shipment-search-results">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-right transition-colors hover:border-primary/30 hover:bg-primary/5"
                onClick={() => openShipment(result)}
                data-testid="dashboard-shipment-search-result"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-sm font-black text-primary">{result.title}</span>
                  <span className="mt-1 block truncate text-xs font-bold text-muted-foreground">{result.subtitle || result.description || "محموله"}</span>
                </span>
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DocumentShipmentQuickSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState("");

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const searchTerm = query.trim();
    setError("");
    if (searchTerm.length < 2) {
      setError("برای جستجو حداقل دو کاراکتر وارد کنید.");
      return;
    }
    navigate(`/documents/management-center?shipment=${encodeURIComponent(searchTerm)}`);
  };

  return (
    <Card data-testid="dashboard-document-shipment-search-section">
      <CardHeader className="pb-0">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
            <FileSearch className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-black">جستجوی پرونده اسناد</CardTitle>
            <CardDescription className="mt-1 text-xs font-bold">
              شماره محموله یا رهگیری را وارد کنید تا مرکز مدیریت اسناد همان پرونده باز شود.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (error) setError("");
              }}
              placeholder="جستجوی شماره محموله برای اسناد..."
              className="h-10 rounded-lg bg-background pr-9 text-sm font-bold"
              data-testid="dashboard-document-shipment-search-input"
            />
          </div>
          <Button
            type="submit"
            className="h-10 px-4 text-xs font-black"
            data-testid="dashboard-document-shipment-search-submit"
          >
            <Search className="h-4 w-4" />
            جستجو
          </Button>
        </form>

        {error ? (
          <p className="mt-2 flex items-center gap-1 text-xs font-bold text-destructive" data-testid="dashboard-document-shipment-search-error">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MyTasksPanel({ tasks }: { tasks: DashboardTask[] }) {
  const navigate = useNavigate();

  return (
    <Card data-testid="dashboard-my-tasks">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <CardTitle className="text-base font-black">وظایف فعال من</CardTitle>
          <CardDescription className="mt-1 text-xs font-bold">{formatNumber(tasks.length)} وظیفه باز</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" className="text-xs font-black" onClick={() => navigate("/tasks")}>
          همه وظایف
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
        {tasks.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/25 p-4" data-empty-state data-testid="dashboard-my-tasks-empty">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm font-bold text-muted-foreground">وظیفه فعالی برای شما ثبت نشده است.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="grid min-w-0 gap-2 rounded-lg border border-border bg-background p-3 text-right transition-colors hover:border-primary/30 hover:bg-primary/5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                onClick={() => navigate(task.actionUrl || "/tasks")}
                data-testid="dashboard-my-task"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-foreground">{task.title}</span>
                  <span className="mt-1 block text-xs font-bold text-muted-foreground">
                    {statusText(task.status)} · موعد: {task.dueDate || "ثبت نشده"}
                  </span>
                </span>
                <Badge variant="outline" className={cn("h-6 rounded-lg text-[11px] font-black", priorityTone(task.priority))}>
                  {priorityText(task.priority)}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LastShipmentsPanel({ shipments }: { shipments: DashboardShipment[] }) {
  const navigate = useNavigate();

  return (
    <Card data-testid="dashboard-last-shipments">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <CardTitle className="text-base font-black">آخرین محموله‌های بروزرسانی‌شده</CardTitle>
          <CardDescription className="mt-1 text-xs font-bold">حداکثر پنج پرونده آخر</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" className="text-xs font-black" onClick={() => navigate("/shipments")}>
          همه محموله‌ها
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
        {shipments.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/25 p-4" data-empty-state data-testid="dashboard-last-shipments-empty">
            <Ship className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-bold text-muted-foreground">هنوز محموله‌ای برای نمایش وجود ندارد.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {shipments.map((shipment) => (
              <button
                key={shipment.id}
                type="button"
                className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3 text-right transition-colors hover:border-primary/30 hover:bg-primary/5 md:grid-cols-[minmax(140px,0.9fr)_minmax(120px,0.7fr)_minmax(96px,0.5fr)_auto] md:items-center"
                onClick={() => navigate(shipment.actionUrl)}
                data-testid="dashboard-last-shipment"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-sm font-black text-primary">{shipment.shipmentCode}</span>
                  <span className="mt-1 block truncate text-xs font-bold text-muted-foreground">{shipment.customerCode || "بدون کد مشتری"}</span>
                </span>
                <span className="truncate text-xs font-bold text-muted-foreground">{shipment.destination || "مقصد ثبت نشده"}</span>
                <Badge variant="outline" className="h-6 w-fit rounded-lg text-[11px] font-black">
                  {statusText(shipment.status)}
                </Badge>
                <span className="text-xs font-bold text-muted-foreground">بروزرسانی: {formatShortDate(shipment.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardLoading() {
  return (
    <div className="app-page space-y-4 rtl" dir="rtl">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm font-bold text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال بارگذاری داشبورد...
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<DashboardHomeData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const loadDashboard = React.useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard", { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        navigate("/login");
        return;
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(payload?.error?.message || "داشبورد بارگذاری نشد.");
      }
      setData(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "داشبورد بارگذاری نشد.");
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  React.useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (isLoading) return <DashboardLoading />;

  if (error || !data) {
    return (
      <div className="app-page rtl" dir="rtl">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error || "داشبورد بارگذاری نشد."}
            </p>
            <Button type="button" className="w-fit text-xs font-black" onClick={() => void loadDashboard()}>
              تلاش دوباره
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-page space-y-4 rtl" dir="rtl" data-testid="dashboard-home">
      <header className="space-y-1.5">
        <h1 className="text-xl font-black text-foreground md:text-2xl" data-testid="dashboard-greeting">
          سلام، {data.currentUser.name}
        </h1>
        <p className="max-w-3xl text-xs font-bold leading-6 text-muted-foreground md:text-sm">
          به پنل لاجستیک پلاس خوش آمدید، نمای آرام و متمرکز از وضعیت امروز
        </p>
      </header>

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="شاخص‌های امروز">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </section>

      <ShipmentQuickSearch />

      <DocumentShipmentQuickSearch />

      <MyTasksPanel tasks={data.myActiveTasks} />

      <LastShipmentsPanel shipments={data.lastUpdatedShipments} />
    </div>
  );
}
