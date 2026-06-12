import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Search, Ship, Filter, Plus, Eye, MoreHorizontal, Check, ListChecks, CheckCircle2, MoreVertical, Edit, ArrowUpDown, ArrowUp, ArrowDown, Archive, Trash2, Trash, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { EmptyState, EmptyTableRow, resetFiltersAction } from "@/src/components/EmptyState";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Shipment, ShipmentStep, ShipmentStatus, Task } from "../types";
import { apiGet } from "@/src/lib/api";
import { useApiResource } from "@/src/lib/resourceState";
import { shipmentApi } from "@/src/lib/shipmentApi";
import { useAppDataStore } from "@/src/store/useMockStore";

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    IN_TRANSIT: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    ARRIVED: "bg-green-500/10 text-green-600 dark:text-green-400",
    CUSTOMS: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    CLEARED: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    DELIVERED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    PENDING: "bg-slate-500/10 text-slate-600 dark:text-slate-500",
    BOOKED: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    CLOSED: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  const labels: Record<string, string> = {
    IN_TRANSIT: "درحال حمل",
    ARRIVED: "رسیده به بندر",
    CUSTOMS: "در انتظار گمرک",
    CLEARED: "ترخیص شده",
    DELIVERED: "تحویل نهایی",
    PENDING: "در انتظار ثبت",
    BOOKED: "رزرو شده",
    CLOSED: "بسته شده",
  };
  return <Badge className={`${styles[status] || ""} border-none py-0.5 px-2 text-[10px] font-bold`}>{labels[status] || status}</Badge>;
};

const shipmentCustomerDisplay = (shipment: Shipment) =>
  shipment.customerCode || shipment.customerName || shipment.customerId || "";

const shipmentOriginDisplay = (shipment: Shipment) => shipment.origin || "";

const shipmentDestinationDisplay = (shipment: Shipment) =>
  shipment.deliveryPort || shipment.destination || "";

const shipmentDisplayStatusText = (shipment: Shipment) =>
  String(shipment.displayStatusText || "").trim();

export default function Shipments() {
  const navigate = useNavigate();
  const shipmentsResource = useApiResource(React.useCallback(() => shipmentApi.list(), []), []);
  const tasksResource = useApiResource(React.useCallback(() => apiGet<Task[]>("/api/tasks"), []), []);
  const shipments = shipmentsResource.data;
  const tasks = tasksResource.data;
  const refreshStoreShipments = useAppDataStore(state => state.refreshShipments);
  const currentUser = useAppDataStore(state => state.currentUser);
  const [shipmentSteps, setShipmentSteps] = useState<ShipmentStep[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState<string | null>(null);
  const [exitedArchiveTarget, setExitedArchiveTarget] = useState<string | null>(null);
  const [exitedArchiveReason, setExitedArchiveReason] = useState("");
  const [isExitedArchiveSaving, setIsExitedArchiveSaving] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  useEffect(() => {
    let isMounted = true;
    if (!shipments.length) {
      setShipmentSteps([]);
      return;
    }

    Promise.all(
      shipments.map((shipment) =>
        apiGet<ShipmentStep[]>(`/api/shipments/${encodeURIComponent(shipment.id)}/steps`).catch(() => [])
      )
    ).then((stepGroups) => {
      if (isMounted) setShipmentSteps(stepGroups.flat());
    });

    return () => {
      isMounted = false;
    };
  }, [shipments]);

  const refreshShipmentViews = React.useCallback(async () => {
    await shipmentsResource.refresh();
    try {
      await refreshStoreShipments();
    } catch (error) {
      console.error("Could not refresh shared shipment store.", error);
    }
  }, [refreshStoreShipments, shipmentsResource.refresh]);

  const handleArchiveShipment = async (id: string) => {
    try {
      await shipmentApi.archive(id);
      await refreshShipmentViews();
      toast.success("محموله به بایگانی منتقل شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بایگانی محموله ناموفق بود.");
    }
  };

  const handleMoveToExitedArchive = async () => {
    if (!exitedArchiveTarget) return;
    setIsExitedArchiveSaving(true);
    try {
      await shipmentApi.moveToExitedArchive(exitedArchiveTarget, {
        reason: exitedArchiveReason.trim() || null,
      });
      await refreshShipmentViews();
      setExitedArchiveTarget(null);
      setExitedArchiveReason("");
      toast.success("محموله به محموله‌های خروج‌شده منتقل شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "انتقال محموله ناموفق بود.");
    } finally {
      setIsExitedArchiveSaving(false);
    }
  };

  const handleShipmentStatus = async (id: string, status: ShipmentStatus) => {
    try {
      await shipmentApi.updateOperationalFields(id, { status });
      await refreshShipmentViews();
      toast.success("وضعیت محموله بروزرسانی شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بروزرسانی وضعیت ناموفق بود.");
    }
  };

  const processedShipments = React.useMemo(() => {
    return [...shipments]
      .filter(s => {
        const isNotArchived = !s.isArchived && !s.isExitedArchived;
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const searchableText = [
          s.trackingNumber,
          s.containerNumber,
          s.customerCode,
          s.customerName,
          s.customerId,
          s.origin,
          s.destination,
          s.dischargePort,
          s.deliveryPort,
          s.displayStatusText,
          s.currentStage,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
        const matchesStatus = statusFilter === "ALL" || s.status === statusFilter;
        return isNotArchived && matchesSearch && matchesStatus;
      })
      .sort((a: any, b: any) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;
        if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
        if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
        return 0;
      });
  }, [shipments, searchTerm, statusFilter, sortConfig]);
  const resetShipmentFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
  };

  const shipmentStats = React.useMemo(() => {
    const active = shipments.filter(s => !s.isArchived && !s.isExitedArchived && !["DELIVERED", "CLOSED"].includes(s.status)).length;
    const customs = shipments.filter(s => !s.isArchived && !s.isExitedArchived && s.status === "CUSTOMS").length;
    const delivered = shipments.filter(s => !s.isArchived && !s.isExitedArchived && s.status === "DELIVERED").length;
    const pendingTasks = tasks.filter(t => t.status !== "DONE").length;
    return [
      { label: "محموله فعال", value: active, icon: Ship, tone: "blue" },
      { label: "در گمرک", value: customs, icon: Filter, tone: "amber" },
      { label: "تحویل شده", value: delivered, icon: CheckCircle2, tone: "emerald" },
      { label: "وظایف باز", value: pendingTasks, icon: ListChecks, tone: "rose" },
    ];
  }, [shipments, tasks]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const handleViewDetails = (shipment: any) => {
    navigate(`/shipments/${shipment.id}`);
  };

  const canMoveToExitedArchive = Boolean(currentUser?.permissions?.includes("shipments.archive"));
  const isExitArchiveEligible = (shipment: { status: ShipmentStatus }) =>
    canMoveToExitedArchive && ["CLEARED", "DELIVERED", "CLOSED"].includes(shipment.status);

  const statusOptions = [
    { value: "ALL", label: "همه وضعیت‌ها" },
    { value: "PENDING", label: "در انتظار ثبت" },
    { value: "BOOKED", label: "رزرو شده" },
    { value: "IN_TRANSIT", label: "در حال حمل" },
    { value: "ARRIVED", label: "رسیده به بندر" },
    { value: "CUSTOMS", label: "در انتظار گمرک" },
    { value: "CLEARED", label: "ترخیص شده" },
    { value: "DELIVERED", label: "تحویل نهایی" },
  ];

  return (
    <div className="app-page space-y-5 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight text-foreground">مدیریت محموله‌ها</h1>
          <p className="text-[12px] text-muted-foreground">لیست کامل و وضعیت جزئی بارهای در جریان.</p>
        </div>
        
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            type="button"
            data-testid="open-shipment-v2-create"
            className="h-10 w-full gap-2 rounded-xl px-4 text-xs font-bold sm:w-auto"
            onClick={() => navigate("/shipments/new-v2")}
          >
            <Plus className="h-3.5 w-3.5" />
            ثبت محموله جدید
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {shipmentStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="rounded-xl border-border bg-card shadow-sm">
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-2xl font-black text-foreground">{stat.value}</p>
                </div>
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  stat.tone === "blue" && "bg-blue-50 text-blue-600",
                  stat.tone === "amber" && "bg-amber-50 text-amber-600",
                  stat.tone === "emerald" && "bg-emerald-50 text-emerald-600",
                  stat.tone === "rose" && "bg-rose-50 text-rose-600"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-card p-3 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input 
            placeholder="جستجو با شماره پیگیری یا کانتینر..." 
            className="bg-muted border-border pr-10 h-10 text-xs focus-visible:ring-primary/50 rounded-xl"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={(triggerProps) => (
              <Button {...triggerProps} variant="outline" className="border-border bg-muted gap-2 h-10 text-xs text-muted-foreground hover:bg-accent rounded-xl">
                <Filter className="w-3.5 h-3.5" />
                {statusOptions.find(o => o.value === statusFilter)?.label || "فیلتر"}
              </Button>
            )}
          />
          <DropdownMenuContent className="bg-card border-border text-foreground w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[10px] text-muted-foreground">فیلتر بر اساس وضعیت</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                {statusOptions.map(option => (
                  <DropdownMenuRadioItem 
                    key={option.value} 
                    value={option.value}
                    className="text-xs cursor-pointer focus:bg-muted"
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="md:hidden space-y-4">
        {processedShipments.length > 0 ? (
          processedShipments.map((shipment) => {
            const stepsForShipment = shipmentSteps.filter(s => s.shipmentId === shipment.id);
            const totalSteps = stepsForShipment.length;
            const completedSteps = stepsForShipment.filter(s => s.status === 'COMPLETED').length;
            let progressValue = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
            
            if (shipment.status === 'DELIVERED') progressValue = 100;
            else if (shipment.status === 'CLEARED' && progressValue < 80) progressValue = 85;
            else if (shipment.status === 'ARRIVED' && progressValue < 50) progressValue = 60;
            const customerDisplay = shipmentCustomerDisplay(shipment);
            const originDisplay = shipmentOriginDisplay(shipment);
            const destinationDisplay = shipmentDestinationDisplay(shipment);
            const displayStatusText = shipmentDisplayStatusText(shipment);
            
            return (
              <Card key={shipment.id} data-testid={`shipment-mobile-card-${shipment.id}`} className="bg-card border-border rounded-xl overflow-hidden shadow-sm p-4">
               <div className="flex items-start justify-between mb-4">
                  <div className="flex flex-col gap-1">
                     <span className="font-mono text-sm font-black text-primary">{shipment.trackingNumber}</span>
                     <span className="text-[10px] text-muted-foreground font-mono">{shipment.containerNumber}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-primary bg-primary/10 h-10 w-10 hover:bg-primary/20 rounded-xl shadow-lg shadow-primary/5"
                      onClick={() => handleViewDetails(shipment)}
                    >
                      <Eye className="w-5 h-5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={(triggerProps) => (
                          <Button {...triggerProps} variant="ghost" size="icon" className="text-muted-foreground h-9 w-9 hover:text-foreground hover:bg-card rounded-xl">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        )}
                      />
                      <DropdownMenuContent className="bg-card border-border text-foreground w-52 shadow-2xl" align="end" dir="rtl">
                         <DropdownMenuItem 
                           className="text-xs cursor-pointer hover:bg-muted flex items-center gap-2 rounded-lg"
                           onClick={() => navigate(`/shipments/${shipment.id}/edit`)}
                         >
                           <Edit className="w-3.5 h-3.5" />
                           ویرایش محموله
                         </DropdownMenuItem>
                          {(shipment.status === "DELIVERED" || shipment.status === "CLOSED") && (
                            <DropdownMenuItem 
                              className="text-xs cursor-pointer hover:bg-amber-500/10 text-amber-500 font-bold flex items-center gap-2 rounded-lg"
                              onClick={() => void handleArchiveShipment(shipment.id)}
                            >
                              <Archive className="w-3.5 h-3.5" />
                              بایگانی محموله
                            </DropdownMenuItem>
                          )}
                          {isExitArchiveEligible(shipment) && (
                            <DropdownMenuItem
                              className="text-xs cursor-pointer hover:bg-primary/10 text-primary font-bold flex items-center gap-2 rounded-lg"
                              onClick={() => {
                                setExitedArchiveTarget(shipment.id);
                                setExitedArchiveReason("");
                              }}
                            >
                              <Archive className="w-3.5 h-3.5" />
                              انتقال به محموله‌های خروج‌شده
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem 
                            className="text-xs cursor-pointer hover:bg-red-500/10 text-red-500 font-bold flex items-center gap-2 rounded-lg"
                            onClick={() => {
                              setShipmentToDelete(shipment.id);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            حذف محموله
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-[10px] text-muted-foreground font-black px-2 py-1">تغییر وضعیت</DropdownMenuLabel>
                          </DropdownMenuGroup>
                         {statusOptions.filter(o => o.value !== "ALL").map(status => (
                           <DropdownMenuItem 
                             key={status.value} 
                             className="text-xs cursor-pointer hover:bg-muted flex justify-between items-center rounded-lg"
                             onClick={() => void handleShipmentStatus(shipment.id, status.value as ShipmentStatus)}
                           >
                             <span className="font-medium">{status.label}</span>
                             {shipment.status === status.value && <Check className="w-3 h-3 text-primary" />}
                           </DropdownMenuItem>
                         ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 mb-4 bg-background/50 p-3 rounded-xl border border-border/50">
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">مشتری</span>
                     <span data-testid={`shipment-mobile-customer-${shipment.id}`} className="text-[11px] text-foreground font-bold truncate">{customerDisplay}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">تحویل تخمینی</span>
                     <span className="text-[11px] text-foreground font-mono">{shipment.estimatedDelivery}</span>
                  </div>
               </div>

               {!displayStatusText ? (
                <div className="mb-4 space-y-1.5 px-1">
                  <div className="flex justify-between items-center text-[9px] font-bold">
                    <span className="text-muted-foreground">پیشرفت فرآیند</span>
                    <span className="text-primary">
                      {Math.round(progressValue)}%
                    </span>
                  </div>
                  <Progress 
                    value={progressValue} 
                    className="h-1 bg-muted" 
                  />
                </div>
               ) : null}

               <div className="flex items-center justify-between border-t border-border/30 pt-4">
                  <div className="flex items-center gap-2">
                     <div className="flex flex-col">
                        <span data-testid={`shipment-mobile-origin-${shipment.id}`} className="text-[11px] text-foreground font-bold">{originDisplay}</span>
                        <span className="text-[9px] text-muted-foreground">مبدأ</span>
                     </div>
                     <ArrowUpDown className="w-3 h-3 text-muted-foreground rotate-90 opacity-50" />
                     <div className="flex flex-col">
                        <span data-testid={`shipment-mobile-destination-${shipment.id}`} className="text-[11px] text-foreground font-bold">{destinationDisplay}</span>
                        <span className="text-[9px] text-muted-foreground">مقصد</span>
                     </div>
                  </div>
                  <div data-testid={`shipment-mobile-status-${shipment.id}`} className="flex max-w-[45%] flex-col items-end gap-1">
                    {displayStatusText ? (
                      <>
                        <Badge className="border-none bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {displayStatusText}
                        </Badge>
                        {shipment.currentStage ? (
                          <span className="max-w-full truncate text-[9px] font-bold text-muted-foreground">{shipment.currentStage}</span>
                        ) : null}
                      </>
                    ) : (
                      <StatusBadge status={shipment.status} />
                    )}
                  </div>
               </div>
            </Card>
            );
          })
        ) : (
          <EmptyState
            icon={Ship}
            title={shipments.length === 0 ? "هنوز محموله‌ای ثبت نشده" : "محموله‌ای با این فیلترها پیدا نشد"}
            description={shipments.length === 0 ? "برای شروع عملیات، ابتدا مشتری را ثبت کنید و سپس اولین محموله را بسازید." : "جستجو یا وضعیت انتخاب‌شده را تغییر دهید تا محموله‌های موجود نمایش داده شوند."}
            primaryAction={shipments.length === 0 ? { label: "ثبت مشتری", to: "/customers", icon: UserPlus } : resetFiltersAction(resetShipmentFilters)}
            secondaryAction={shipments.length === 0 ? { label: "ثبت محموله", to: "/shipments/new-v2", icon: Plus, variant: "outline" } : undefined}
          />
        )}
      </div>

      <Card className="bg-card border-border rounded-xl overflow-hidden hidden md:block shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[12px] min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-4 font-medium text-muted-foreground">شماره رهگیری</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">کانتینر</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">مبدأ</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">مقصد</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">مشتری</th>
                  <th 
                    className="px-5 py-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => requestSort('status')}
                  >
                    <div className="flex items-center gap-2">
                      وضعیت
                      {getSortIcon('status')}
                    </div>
                  </th>
                  <th 
                    className="px-5 py-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => requestSort('estimatedDelivery')}
                  >
                    <div className="flex items-center gap-2">
                      تحویل تخمینی
                      {getSortIcon('estimatedDelivery')}
                    </div>
                  </th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {processedShipments.length > 0 ? (
                  processedShipments.map((shipment) => {
                    const stepsForShipment = shipmentSteps.filter(s => s.shipmentId === shipment.id);
                    const totalSteps = stepsForShipment.length;
                    const completedSteps = stepsForShipment.filter(s => s.status === 'COMPLETED').length;
                    let progressValue = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
                    
                    if (shipment.status === 'DELIVERED') progressValue = 100;
                    else if (shipment.status === 'CLEARED' && progressValue < 80) progressValue = 85;
                    else if (shipment.status === 'ARRIVED' && progressValue < 50) progressValue = 60;
                    const customerDisplay = shipmentCustomerDisplay(shipment);
                    const originDisplay = shipmentOriginDisplay(shipment);
                    const destinationDisplay = shipmentDestinationDisplay(shipment);
                    const displayStatusText = shipmentDisplayStatusText(shipment);

                    return (
                      <tr key={shipment.id} data-testid={`shipment-row-${shipment.id}`} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-5 py-4">
                          <span className="font-mono text-sm font-bold text-primary">{shipment.trackingNumber}</span>
                        </td>
                        <td className="px-5 py-4 font-mono text-[11px] text-muted-foreground">{shipment.containerNumber}</td>
                        <td data-testid={`shipment-row-origin-${shipment.id}`} className="px-5 py-4 text-muted-foreground">{originDisplay}</td>
                        <td data-testid={`shipment-row-destination-${shipment.id}`} className="px-5 py-4 text-muted-foreground">{destinationDisplay}</td>
                        <td data-testid={`shipment-row-customer-${shipment.id}`} className="px-5 py-4 font-medium text-foreground">{customerDisplay}</td>
                        <td data-testid={`shipment-row-status-${shipment.id}`} className="px-5 py-4">
                          {displayStatusText ? (
                            <div className="flex min-w-[120px] flex-col items-start gap-1">
                              <Badge className="border-none bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                {displayStatusText}
                              </Badge>
                              {shipment.currentStage ? (
                                <span className="max-w-[160px] truncate text-[10px] font-bold text-muted-foreground">{shipment.currentStage}</span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5 min-w-[120px]">
                              <div className="flex justify-between items-center text-[10px]">
                                <StatusBadge status={shipment.status} />
                                <span className="font-bold text-primary">
                                  {Math.round(progressValue)}%
                                </span>
                              </div>
                              <Progress
                                value={progressValue}
                                className="h-1.5 bg-muted"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground font-mono">{shipment.estimatedDelivery}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-primary bg-primary/5 h-9 w-9 hover:bg-primary/20 border border-primary/10 rounded-lg"
                              onClick={() => handleViewDetails(shipment)}
                            >
                              <Eye className="w-4.5 h-4.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={(triggerProps) => (
                                  <Button {...triggerProps} variant="ghost" size="icon" className="text-muted-foreground h-8 w-8 hover:text-foreground hover:bg-muted font-black">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                )}
                              />
                              <DropdownMenuContent className="bg-card border-border text-foreground w-48 shadow-2xl" align="end" dir="rtl">
                                 <DropdownMenuItem 
                                   className="text-xs cursor-pointer hover:bg-muted flex items-center gap-2 rounded-lg"
                                   onClick={() => navigate(`/shipments/${shipment.id}/edit`)}
                                 >
                                   <Edit className="w-3.5 h-3.5" />
                                   ویرایش محموله
                                 </DropdownMenuItem>
                                 {(shipment.status === "DELIVERED" || shipment.status === "CLOSED") && (
                                   <DropdownMenuItem 
                                     className="text-xs cursor-pointer hover:bg-amber-500/10 text-amber-500 font-bold flex items-center gap-2 rounded-lg"
                                     onClick={() => void handleArchiveShipment(shipment.id)}
                                   >
                                     <Archive className="w-3.5 h-3.5" />
                                     بایگانی محموله
                                   </DropdownMenuItem>
                                 )}
                                 {isExitArchiveEligible(shipment) && (
                                   <DropdownMenuItem
                                     className="text-xs cursor-pointer hover:bg-primary/10 text-primary font-bold flex items-center gap-2 rounded-lg"
                                     onClick={() => {
                                       setExitedArchiveTarget(shipment.id);
                                       setExitedArchiveReason("");
                                     }}
                                   >
                                     <Archive className="w-3.5 h-3.5" />
                                     انتقال به محموله‌های خروج‌شده
                                   </DropdownMenuItem>
                                 )}
                                 <DropdownMenuSeparator className="bg-border" />
                                 <DropdownMenuItem 
                                   className="text-xs cursor-pointer hover:bg-red-500/10 text-red-500 font-bold flex items-center gap-2 rounded-lg"
                                   onClick={() => {
                                     setShipmentToDelete(shipment.id);
                                     setIsDeleteDialogOpen(true);
                                   }}
                                 >
                                   <Trash2 className="w-3.5 h-3.5" />
                                   حذف محموله
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator className="bg-border" />
                                 <DropdownMenuGroup>
                                   <DropdownMenuLabel className="text-[10px] text-muted-foreground font-black px-2 py-1">تغییر وضعیت</DropdownMenuLabel>
                                 </DropdownMenuGroup>
                                 {statusOptions.filter(o => o.value !== "ALL").map(status => (
                                   <DropdownMenuItem 
                                     key={status.value} 
                                     className="text-xs cursor-pointer hover:bg-muted flex justify-between items-center rounded-lg"
                                     onClick={() => void handleShipmentStatus(shipment.id, status.value as ShipmentStatus)}
                                   >
                                     <span className="font-medium">{status.label}</span>
                                     {shipment.status === status.value && <Check className="w-3 h-3 text-primary" />}
                                   </DropdownMenuItem>
                                 ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <EmptyTableRow colSpan={8}>
                    <EmptyState
                      icon={Ship}
                      title={shipments.length === 0 ? "هنوز محموله‌ای ثبت نشده" : "محموله‌ای با این فیلترها پیدا نشد"}
                      description={shipments.length === 0 ? "برای شروع عملیات، ابتدا مشتری را ثبت کنید و سپس اولین محموله را بسازید." : "جستجو یا وضعیت انتخاب‌شده را تغییر دهید تا محموله‌های موجود نمایش داده شوند."}
                      primaryAction={shipments.length === 0 ? { label: "ثبت مشتری", to: "/customers", icon: UserPlus } : resetFiltersAction(resetShipmentFilters)}
                      secondaryAction={shipments.length === 0 ? { label: "ثبت محموله", to: "/shipments/new-v2", icon: Plus, variant: "outline" } : undefined}
                      compact
                    />
                  </EmptyTableRow>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DeleteConfirmDialog 
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          if (shipmentToDelete) {
            void handleArchiveShipment(shipmentToDelete);
            toast.message("محموله به سطل زباله منتقل شد", {
              description: "می‌توانید تا ۷ روز آینده آن را از بخش بایگانی بازیابی کنید.",
              icon: <Trash className="w-4 h-4 text-red-500" />
            });
          }
        }}
        itemName={shipments.find(s => s.id === shipmentToDelete)?.trackingNumber}
      />

      <Dialog open={Boolean(exitedArchiveTarget)} onOpenChange={(open) => {
        if (!open && !isExitedArchiveSaving) {
          setExitedArchiveTarget(null);
          setExitedArchiveReason("");
        }
      }}>
        <DialogContent className="max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">انتقال به محموله‌های خروج‌شده</DialogTitle>
            <DialogDescription className="text-sm leading-7 text-muted-foreground">
              این محموله از لیست محموله‌های فعال خارج می‌شود اما حذف نخواهد شد. اطلاعات، اسناد، گفتگوها و سوابق آن برای پیگیری‌های بعد از خروج باقی می‌ماند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-black">دلیل انتقال</Label>
            <Input
              value={exitedArchiveReason}
              onChange={(event) => setExitedArchiveReason(event.target.value)}
              placeholder="مثلاً: خروج از گمرک و شروع پیگیری تسویه"
              className="h-10 rounded-lg text-xs"
            />
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setExitedArchiveTarget(null)} disabled={isExitedArchiveSaving}>
              انصراف
            </Button>
            <Button type="button" onClick={() => void handleMoveToExitedArchive()} disabled={isExitedArchiveSaving}>
              {isExitedArchiveSaving ? "در حال انتقال..." : "انتقال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
