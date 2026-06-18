import React from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  PackageSearch,
  Search,
  Ship,
  Sparkles,
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
  aiAssistant: {
    name: string;
    status: string;
    subtitle: string;
  };
};

type ShipmentSearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  description?: string;
  url?: string;
};

type AiActiveEntity = {
  type: "shipment" | "customer";
  id: string;
  code?: string;
  label?: string;
};

type AiSource = {
  type:
    | "shipment"
    | "customer"
    | "document"
    | "malvani"
    | "captain"
    | "workflow"
    | "task"
    | "cheque"
    | "tariff"
    | "rate"
    | "public_tracking"
    | "chat"
    | "archive"
    | "audit"
    | "user"
    | "system";
  id?: string;
  label: string;
  url?: string;
};

type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tone?: "direct" | "conversational" | "clarification";
  responseMode?: "direct_answer" | "short_summary" | "report";
  sources?: AiSource[];
  suggestions?: string[];
  activeEntity?: AiActiveEntity;
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

function createChatMessageId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function hasPersianText(value: string) {
  return /[\u0600-\u06ff]/.test(value);
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

function AiAssistantCard({ assistant }: { assistant: DashboardHomeData["aiAssistant"] }) {
  const navigate = useNavigate();
  const [draft, setDraft] = React.useState("");
  const [messages, setMessages] = React.useState<AiChatMessage[]>([]);
  const [activeEntity, setActiveEntity] = React.useState<AiActiveEntity | null>(null);
  const [error, setError] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [conversationId] = React.useState(() => createChatMessageId("dashboard-ai"));
  const threadEndRef = React.useRef<HTMLDivElement | null>(null);

  const latestAssistantId = React.useMemo(
    () => [...messages].reverse().find((item) => item.role === "assistant")?.id,
    [messages]
  );

  React.useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isSubmitting]);

  const sendMessage = React.useCallback(async (rawMessage: string) => {
    const trimmedMessage = rawMessage.trim();
    setError("");

    if (!trimmedMessage) {
      setError("متن سوال را وارد کنید.");
      return;
    }

    const recentMessages = messages.slice(-8).map((item) => ({
      role: item.role,
      content: item.content,
    }));
    const userMessage: AiChatMessage = {
      id: createChatMessageId("user"),
      role: "user",
      content: trimmedMessage,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedMessage,
          context: "dashboard",
          conversationId,
          recentMessages,
          ...(activeEntity ? { activeEntity } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        navigate("/login");
        return;
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(payload?.error?.message || "پاسخ همیار آماده نشد.");
      }
      const responseData = payload.data || {};
      const assistantMessage: AiChatMessage = {
        id: responseData.id || createChatMessageId("assistant"),
        role: "assistant",
        content: responseData.answer || "همیار لاجستیک هنوز پاسخی برای این سوال ندارد.",
        tone: responseData.tone || "direct",
        responseMode: responseData.responseMode || "direct_answer",
        sources: Array.isArray(responseData.sources) ? responseData.sources : [],
        suggestions: Array.isArray(responseData.suggestions) ? responseData.suggestions : [],
        activeEntity: responseData.activeEntity,
      };
      setMessages((current) => [...current, assistantMessage]);
      setActiveEntity(responseData.activeEntity || null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "پاسخ همیار آماده نشد.");
    } finally {
      setIsSubmitting(false);
    }
  }, [activeEntity, conversationId, messages, navigate]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(draft);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void sendMessage(draft);
  };

  const openSource = (sourceItem: AiSource) => {
    if (!sourceItem.url) return;
    navigate(sourceItem.url);
  };

  return (
    <Card data-testid="dashboard-ai-assistant">
      <CardHeader className="pb-0">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-black">{assistant.name}</CardTitle>
            <CardDescription className="mt-1 text-xs font-bold">{assistant.subtitle}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="rounded-lg border border-border bg-background/70">
          <div className="flex max-h-[360px] min-h-[180px] flex-col gap-3 overflow-y-auto p-3" data-testid="dashboard-ai-thread">
            {messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/25 p-3 text-sm font-bold leading-7 text-muted-foreground">
                سوال کوتاه بپرسید؛ مثلاً وضعیت یک محموله، شماره ناخدا یا شماره تماس مشتری.
              </div>
            ) : null}

            {messages.map((item) => {
              const isUser = item.role === "user";
              const isLatestAssistant = item.id === latestAssistantId;
              const isPersianAssistantText = !isUser && hasPersianText(item.content);
              return (
                <div
                  key={item.id}
                  className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
                  data-testid={isUser ? "dashboard-ai-user-message" : "dashboard-ai-assistant-message"}
                >
                  <div
                    className={cn(
                      "max-w-[88%] break-words rounded-lg px-3 py-2 text-sm font-bold leading-7 shadow-none",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "ai-chat-message-text border border-border bg-muted/40 text-foreground",
                      !isUser && (isPersianAssistantText ? "ai-chat-message-text-rtl" : "ai-chat-message-text-ltr")
                    )}
                    dir={!isUser ? (isPersianAssistantText ? "rtl" : "ltr") : undefined}
                    data-testid={isLatestAssistant ? "dashboard-ai-answer" : undefined}
                  >
                    {item.content}
                  </div>

                  {!isUser && item.sources?.length ? (
                    <div className="mt-2 flex max-w-[88%] flex-wrap gap-1.5" data-testid="dashboard-ai-source-chips">
                      {item.sources.map((sourceItem, index) => (
                        <button
                          key={`${sourceItem.type}-${sourceItem.id || sourceItem.label}-${index}`}
                          type="button"
                          className={cn(
                            "h-7 max-w-full truncate rounded-lg border border-border bg-background px-2 text-[11px] font-black text-muted-foreground transition-colors",
                            sourceItem.url ? "hover:border-primary/40 hover:text-primary" : "cursor-default"
                          )}
                          onClick={() => openSource(sourceItem)}
                          disabled={!sourceItem.url}
                          data-testid="dashboard-ai-source-chip"
                        >
                          {sourceItem.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {!isUser && isLatestAssistant && item.suggestions?.length ? (
                    <div className="mt-2 flex max-w-[88%] flex-wrap gap-1.5" data-testid="dashboard-ai-suggestions">
                      {item.suggestions.slice(0, 4).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="min-h-7 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-black leading-5 text-primary transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-60"
                          onClick={() => void sendMessage(suggestion)}
                          disabled={isSubmitting}
                          data-testid="dashboard-ai-suggestion-chip"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {isSubmitting ? (
              <div className="flex items-start" data-testid="dashboard-ai-typing">
                <div className="flex max-w-[88%] items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-bold text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  همیار لاجستیک در حال بررسی...
                </div>
              </div>
            ) : null}
            <div ref={threadEndRef} />
          </div>
        </div>

        <form className="mt-3 space-y-2" onSubmit={handleSubmit}>
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="مثلاً: وضعیت محموله 14051102036 چیه؟"
            className="min-h-12 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold leading-7 outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25"
            data-testid="dashboard-ai-input"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Badge variant="outline" className="h-6 w-fit rounded-lg text-[11px] font-black">
              {activeEntity?.label || (assistant.status === "placeholder" ? "نسخه آزمایشی امن" : "فعال")}
            </Badge>
            <Button type="submit" className="h-9 px-4 text-xs font-black" disabled={isSubmitting} data-testid="dashboard-ai-submit">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              ارسال
            </Button>
          </div>
        </form>

        {error ? (
          <p className="mt-3 flex items-center gap-1 text-xs font-bold text-destructive">
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
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/25 p-4" data-testid="dashboard-my-tasks-empty">
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
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/25 p-4">
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

      <AiAssistantCard assistant={data.aiAssistant} />

      <MyTasksPanel tasks={data.myActiveTasks} />

      <LastShipmentsPanel shipments={data.lastUpdatedShipments} />
    </div>
  );
}
