import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/src/store/useAppStore";
import type { ActivityLog } from "@/src/types";
import { 
  History, 
  User, 
  Clock, 
  Package, 
  FileText, 
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Search,
  Filter,
  ArrowDownCircle,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { EmptyState, resetFiltersAction } from "@/src/components/EmptyState";

const actionLabels: Record<string, string> = {
  "shipment.create": "ثبت محموله",
  "shipment.update": "ویرایش محموله",
  "shipment.status_change": "تغییر وضعیت محموله",
  "shipment.archive": "بایگانی محموله",
  "shipment.restore": "بازگردانی محموله",
  "shipment_step.update": "به‌روزرسانی مرحله حمل",
  "shipment_task.create_or_activate": "ایجاد وظیفه مرحله",
  "task.create": "ثبت وظیفه",
  "task.update": "ویرایش وظیفه",
  "task.complete": "تکمیل وظیفه",
  "task.block": "مسدود کردن وظیفه",
  "task.cancel": "لغو وظیفه",
  "document.upload": "بارگذاری سند",
  "document.update": "ویرایش سند",
  "document.replace": "جایگزینی فایل سند",
  "document.archive": "بایگانی سند",
  "document.visibility": "تغییر دسترسی سند",
  "document.visibility.update": "تغییر دسترسی سند",
  "user.create": "ایجاد کاربر",
  "user.update": "ویرایش کاربر",
  "user.role_change": "تغییر نقش کاربر",
  "user.suspend": "تعلیق کاربر",
  "user.activate": "فعال‌سازی کاربر",
  "records.replace": "همگام‌سازی داده‌ها",
};

const normalizeEntityType = (entityType: string) => {
  const value = String(entityType || "").toUpperCase();
  if (value === "SHIPMENT_STEP") return "SHIPMENT_STEP";
  if (value.includes("SHIPMENT")) return "SHIPMENT";
  if (value.includes("DOCUMENT")) return "DOCUMENT";
  if (value.includes("TASK")) return "TASK";
  if (value.includes("USER")) return "USER";
  if (value.includes("CUSTOMER")) return "CUSTOMER";
  return value || "SYSTEM";
};

const buildServerLogDetails = (row: any, actionText: string) => {
  const after = row.after_json || {};
  const before = row.before_json || {};
  const step = after.step || after.after?.step;
  const task = after.workflowTask || after.after?.workflowTask || after;
  const trackingNumber = after.trackingNumber || before.trackingNumber || after.shipment_code || before.shipment_code;
  const documentTitle = after.title || after.file_name || after.name;
  const userTitle = after.name || after.email || before.name || before.email;

  if (trackingNumber) return `${actionText} برای محموله ${trackingNumber} ثبت شد.`;
  if (step?.name) return `${actionText} برای مرحله «${step.name}» ثبت شد.`;
  if (task?.title && normalizeEntityType(row.entity_type) === "TASK") return `${actionText}: ${task.title}`;
  if (documentTitle && normalizeEntityType(row.entity_type) === "DOCUMENT") return `${actionText}: ${documentTitle}`;
  if (userTitle && normalizeEntityType(row.entity_type) === "USER") return `${actionText}: ${userTitle}`;
  return row.summary || actionText;
};

const mapServerLog = (row: any): ActivityLog => {
  const actionText = actionLabels[row.action] || row.action || "رویداد سیستم";
  const entityType = normalizeEntityType(row.entity_type);
  return {
    id: row.id,
    userName: row.actor_name || row.actor_email || "سیستم",
    action: actionText,
    entityType,
    entityId: row.entity_id || row.id,
    shipmentId: row.after_json?.step?.shipmentId || row.after_json?.shipmentId,
    details: buildServerLogDetails(row, actionText),
    createdAt: row.created_at,
  };
};

export default function ChangeLog() {
  const navigate = useNavigate();
  const { activityLogs, currentUser } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [serverLogs, setServerLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (currentUser?.role !== "CEO") return;
    let cancelled = false;
    fetch("/api/changes?limit=150")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Could not load changes.");
        if (!cancelled) {
          setServerLogs((payload.data || []).filter((row: any) => row.action !== "records.replace").map(mapServerLog));
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setServerLogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.role]);

  const logs = useMemo(() => {
    const merged = new Map<string, ActivityLog>();
    [...serverLogs, ...activityLogs].forEach((log) => {
      if (!merged.has(log.id)) merged.set(log.id, log);
    });
    return Array.from(merged.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [activityLogs, serverLogs]);

  if (currentUser?.role !== "CEO") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4" dir="rtl">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-destructive/10 rounded-3xl flex items-center justify-center mb-8 border border-destructive/20"
        >
          <ShieldAlert className="w-12 h-12 text-destructive" />
        </motion.div>
        <h2 className="text-3xl font-black text-foreground mb-3">عدم دسترسی کافی</h2>
        <p className="text-muted-foreground max-w-sm mx-auto leading-relaxed">
          متأسفیم، بخش لاگ تغییرات سیستمی تنها برای مدیریت کل (CEO) قابل مشاهده است. 
          در صورت نیاز به دسترسی با بخش پشتیبانی فنی تماس بگیرید.
        </p>
      </div>
    );
  }

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeFilter) {
      return matchesSearch && log.entityType === activeFilter;
    }
    return matchesSearch;
  });
  const resetChangeFilters = () => {
    setSearchTerm("");
    setActiveFilter(null);
  };
  const logStats = [
    { label: "کل رخدادها", value: logs.length, icon: History, tone: "text-primary bg-primary/10" },
    { label: "محموله", value: logs.filter(log => log.entityType === "SHIPMENT" || log.entityType === "SHIPMENT_STEP").length, icon: Package, tone: "text-blue-600 bg-blue-500/10" },
    { label: "اسناد", value: logs.filter(log => log.entityType === "DOCUMENT").length, icon: FileText, tone: "text-emerald-600 bg-emerald-500/10" },
    { label: "کاربران", value: logs.filter(log => log.entityType === "USER").length, icon: User, tone: "text-orange-600 bg-orange-500/10" },
  ];

  const getLogIcon = (entityType: string) => {
    switch (entityType) {
      case "SHIPMENT": return <Package className="w-4 h-4" />;
      case "SHIPMENT_STEP": return <Package className="w-4 h-4" />;
      case "DOCUMENT": return <FileText className="w-4 h-4" />;
      case "TASK": return <CheckCircle className="w-4 h-4" />;
      case "USER": return <User className="w-4 h-4" />;
      default: return <Layers className="w-4 h-4" />;
    }
  };

  const getEntityColor = (entityType: string) => {
    switch (entityType) {
      case "SHIPMENT": return "text-primary bg-primary/10";
      case "SHIPMENT_STEP": return "text-primary bg-primary/10";
      case "DOCUMENT": return "text-purple-600 dark:text-purple-400 bg-purple-500/10";
      case "TASK": return "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10";
      case "USER": return "text-orange-600 dark:text-orange-400 bg-orange-500/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  const getEntityLabel = (entityType: string) => {
    const labels: Record<string, string> = {
      SHIPMENT: "محموله",
      SHIPMENT_STEP: "مرحله حمل",
      DOCUMENT: "مدرک",
      TASK: "وظیفه",
      USER: "کاربر",
      CUSTOMER: "مشتری"
    };
    return labels[entityType] || entityType;
  };

  return (
    <div className="app-page space-y-5 pb-20 md:pb-6 max-w-[1600px]" dir="rtl">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 md:p-5 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-black text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <History className="w-6 h-6 text-primary" />
            </div>
            تاریخچه سیستم
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm font-medium mr-1.5 opacity-80 leading-6">رهگیری تمامی فعالیت‌های امنیتی و تغییرات عملیاتی</p>
        </div>
        <div className="flex items-center gap-3 bg-muted/50 p-2 rounded-xl border border-border w-fit">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <span className="text-[11px] font-bold text-foreground/80">CEO ACCESS ONLY</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {logStats.map((stat) => (
          <Card key={stat.label} className="bg-card border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-black text-foreground mt-1">{stat.value}</p>
              </div>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", stat.tone)}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            placeholder="جستجوی کاربر، عملیات یا جزئیات..." 
            className="bg-card border-border pr-12 focus:ring-primary h-11 rounded-xl text-sm font-medium transition-all focus:border-primary/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="md:col-span-4 flex gap-2">
          <Button variant="outline" className="flex-1 h-11 border-border bg-card text-muted-foreground gap-2 px-4 rounded-xl hover:text-foreground transition-all group">
            <Filter className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold">فیلترهای زمانی</span>
          </Button>
          <Button variant="outline" className="w-11 h-11 border-border bg-card flex items-center justify-center rounded-xl hover:bg-primary/10 hover:border-primary/50 transition-all">
            <Calendar className="w-5 h-5 text-primary" />
          </Button>
        </div>
      </div>

      {/* Entity Type Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <Button 
          variant={activeFilter === null ? "default" : "outline"}
          onClick={() => setActiveFilter(null)}
          className={cn(
            "rounded-full h-9 px-5 text-xs font-black whitespace-nowrap transition-all shrink-0",
            activeFilter === null ? "bg-primary text-primary-foreground" : "border-border bg-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          همه فعالیت‌ها
        </Button>
        {["SHIPMENT", "SHIPMENT_STEP", "TASK", "DOCUMENT", "USER"].map((type) => (
          <Button
            key={type}
            variant={activeFilter === type ? "default" : "outline"}
            onClick={() => setActiveFilter(type)}
            className={cn(
              "rounded-full h-9 px-5 text-xs font-black whitespace-nowrap transition-all shrink-0",
              activeFilter === type ? "bg-primary text-primary-foreground" : "border-border bg-transparent text-muted-foreground hover:text-primary"
            )}
          >
            {getEntityLabel(type)}
          </Button>
        ))}
      </div>

      {/* Timeline Layout */}
      <div className="relative">
        {/* Continuous Line (Desktop Only) */}
        <div className="absolute right-[45px] top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 via-border to-transparent hidden md:block" />

        <div className="space-y-4 md:space-y-6">
          <AnimatePresence mode="popLayout">
            {filteredLogs.map((log, index) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
                className="relative group px-1"
              >
                {/* Timeline Marker (Desktop Only) */}
                <div className="absolute right-[33px] top-8 w-6 h-6 rounded-full bg-background border-2 border-border group-hover:border-primary transition-colors z-10 hidden md:flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground group-hover:bg-primary transition-colors" />
                </div>

                <Card className="bg-card border-border rounded-xl hover:border-primary/40 transition-all hover:bg-card/90 shadow-sm md:mr-16">
                  <CardContent className="p-4 md:p-5">
                    <div className="flex flex-col md:flex-row gap-5 items-start md:items-center">
                      {/* Left Side: User & Meta */}
                      <div className="flex items-center gap-4 w-full md:w-auto shrink-0">
                        <div className="relative">
                          <Avatar className="w-12 h-12 md:w-14 md:h-14 border-2 border-border ring-4 ring-background">
                            <AvatarFallback className="bg-gradient-to-br from-muted to-card text-lg font-black text-primary">
                              {log.userName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className={cn(
                            "absolute -bottom-1 -left-1 w-6 h-6 rounded-lg flex items-center justify-center ring-2 ring-background shadow-lg",
                            getEntityColor(log.entityType)
                          )}>
                            {getLogIcon(log.entityType)}
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-foreground">{log.userName}</span>
                          <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-xs">
                            <Clock className="w-3 h-3" />
                            {log.createdAt?.split?.(/[T ]/)?.[0]} • {log.createdAt?.split?.(/[T ]/)?.[1]?.substring(0, 5)}
                          </div>
                        </div>
                      </div>

                      {/* Middle: Action & Details */}
                      <div className="flex-1 space-y-2 w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-muted text-foreground border-none text-xs font-black px-3 py-1 rounded-lg">
                            {log.action}
                          </Badge>
                          <div className="h-4 w-px bg-border hidden sm:block mx-1" />
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-tighter">
                            {getEntityLabel(log.entityType)} ID: #{String(log.entityId || log.id).slice(-4).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs md:text-sm text-foreground/70 font-medium leading-relaxed bg-muted/20 p-4 rounded-2xl border border-border/50 group-hover:border-primary/20 transition-colors">
                          {log.details || "جزئیات خاصی برای این فعالیت ثبت نشده است."}
                        </p>
                      </div>

                      {/* Right: Interaction */}
                      <div className="shrink-0 w-full md:w-auto mt-2 md:mt-0 flex gap-2">
                         {log.entityType === 'TASK' && (
                           <Button 
                             variant="outline" 
                             size="sm" 
                             className="flex-1 md:flex-none h-10 px-4 text-[11px] font-black border-border text-emerald-600 dark:text-emerald-400 hover:bg-emerald-400/10 hover:border-emerald-500 rounded-xl transition-all"
                             onClick={() => {
                               const task = useAppStore.getState().tasks.find(t => t.id === log.entityId);
                               if (task && task.status !== 'DONE') {
                                 useAppStore.getState().updateTaskStatus(log.entityId, 'DONE');
                               }
                             }}
                           >
                             <CheckCircle className="w-3.5 h-3.5 ml-2" />
                             تکمیل فوری
                           </Button>
                         )}
                         <Button 
                           variant="ghost" 
                           size="sm" 
                           className="flex-1 md:flex-none h-10 px-5 text-[11px] font-black text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-xl border border-border md:border-transparent group/btn whitespace-nowrap"
                           onClick={() => {
                             if (log.entityType === 'SHIPMENT') navigate(`/shipments/${log.entityId}`);
                             if (log.entityType === 'SHIPMENT_STEP') navigate(`/shipments/${log.shipmentId || log.entityId}`);
                             if (log.entityType === 'TASK') navigate(`/tasks`);
                             if (log.entityType === 'USER') navigate(`/management`);
                             if (log.entityType === 'DOCUMENT') navigate(`/documents`);
                             if (log.entityType === 'CUSTOMER') navigate(`/customers`);
                           }}
                         >
                           {log.entityType === 'SHIPMENT' || log.entityType === 'SHIPMENT_STEP' ? 'مشاهده محموله' : 
                            log.entityType === 'TASK' ? 'مدیریت وظایف' : 
                            log.entityType === 'USER' ? 'پروفایل کاربر' : 'بررسی جزئیات'}
                           <ArrowRight className="w-3.5 h-3.5 mr-2 -rotate-180 group-hover/btn:-translate-x-1 transition-transform" />
                         </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredLogs.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl"
          >
            <EmptyState
              icon={AlertCircle}
              title={logs.length === 0 ? "هنوز رویدادی ثبت نشده" : "رویدادی با این فیلترها پیدا نشد"}
              description={
                logs.length === 0
                  ? "در دیتابیس تمیز، تاریخچه بعد از اولین اقدام واقعی مثل ساخت مشتری، محموله یا سند پر می‌شود."
                  : "رویدادهای موجود ممکن است پشت جستجو یا نوع انتخاب‌شده پنهان شده باشند."
              }
              primaryAction={logs.length === 0 ? undefined : resetFiltersAction(resetChangeFilters)}
            />
          </motion.div>
        )}
      </div>

      {filteredLogs.length > 5 && (
        <div className="flex items-center justify-center pt-8">
          <Button variant="outline" className="h-11 px-6 border-primary/30 bg-transparent text-primary text-sm font-black gap-3 rounded-xl hover:bg-primary/10 hover:border-primary transition-all">
            <ArrowDownCircle className="w-5 h-5 animate-bounce" />
            بارگذاری ۲۰ لاگ قدیمی‌تر
          </Button>
        </div>
      )}
    </div>
  );
}
