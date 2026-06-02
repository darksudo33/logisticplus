import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Search, Ship, Filter, Plus, Eye, MoreHorizontal, Calendar, MapPin, Truck, Check, ListChecks, CheckCircle2, Clock, MoreVertical, Edit, ArrowUpDown, ArrowUp, ArrowDown, Activity, Archive, Trash2, Trash, UserPlus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Customer, ShipmentStep, ShipmentStatus, Task } from "../types";
import { apiGet } from "@/src/lib/api";
import { useApiResource } from "@/src/lib/resourceState";
import { shipmentApi } from "@/src/lib/shipmentApi";

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

export default function Shipments() {
  const navigate = useNavigate();
  const shipmentsResource = useApiResource(React.useCallback(() => shipmentApi.list(), []), []);
  const customersResource = useApiResource(React.useCallback(() => apiGet<Customer[]>("/api/customers"), []), []);
  const tasksResource = useApiResource(React.useCallback(() => apiGet<Task[]>("/api/tasks"), []), []);
  const shipments = shipmentsResource.data;
  const customers = customersResource.data;
  const tasks = tasksResource.data;
  const [shipmentSteps, setShipmentSteps] = useState<ShipmentStep[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  // New Shipment Form State
  const [newShipment, setNewShipment] = useState({
    trackingNumber: "",
    containerNumber: "",
    customerId: "",
    customerName: "",
    origin: "",
    destination: "",
    estimatedDelivery: "",
  });

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

  const handleAddShipment = async () => {
    const customer = customers.find(c => c.id === newShipment.customerId);
    try {
      await shipmentApi.create({
      ...newShipment,
      customerName: customer?.name || "مشتری متفرقه",
      status: "PENDING",
      freeTimeDays: 7
    });
      await shipmentsResource.refresh();
      toast.success("محموله ثبت شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت محموله ناموفق بود.");
      return;
    }
    setIsAddDialogOpen(false);
    setNewShipment({
      trackingNumber: "",
      containerNumber: "",
      customerId: "",
      customerName: "",
      origin: "",
      destination: "",
      estimatedDelivery: "",
    });
  };

  const handleArchiveShipment = async (id: string) => {
    try {
      await shipmentApi.archive(id);
      await shipmentsResource.refresh();
      toast.success("محموله به بایگانی منتقل شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بایگانی محموله ناموفق بود.");
    }
  };

  const handleShipmentStatus = async (id: string, status: ShipmentStatus) => {
    try {
      await shipmentApi.updateOperationalFields(id, { status });
      await shipmentsResource.refresh();
      toast.success("وضعیت محموله بروزرسانی شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بروزرسانی وضعیت ناموفق بود.");
    }
  };

  const processedShipments = React.useMemo(() => {
    return [...shipments]
      .filter(s => {
        const isNotArchived = !s.isArchived;
        const matchesSearch = s.trackingNumber.includes(searchTerm) || s.containerNumber.includes(searchTerm);
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
    const active = shipments.filter(s => !s.isArchived && !["DELIVERED", "CLOSED"].includes(s.status)).length;
    const customs = shipments.filter(s => !s.isArchived && s.status === "CUSTOMS").length;
    const delivered = shipments.filter(s => !s.isArchived && s.status === "DELIVERED").length;
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
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger
            render={(triggerProps) => (
              <Button {...triggerProps} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-10 w-full sm:w-auto text-xs font-bold px-4 rounded-xl">
                <Plus className="w-3.5 h-3.5" />
                ثبت محموله جدید
              </Button>
            )}
          />
          <DialogContent className="bg-card border-border text-foreground text-right" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">افزودن محموله جدید</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs text-right">
                جزئیات محموله جدید را برای رهگیری در سیستم وارد کنید.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tracking" className="text-xs text-muted-foreground">شماره رهگیری (B/L)</Label>
                  <Input 
                    id="tracking" 
                    placeholder="شماره رهگیری را وارد کنید" 
                    className="bg-muted border-border text-xs h-9 ltr" 
                    value={newShipment.trackingNumber}
                    onChange={e => setNewShipment({...newShipment, trackingNumber: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="container" className="text-xs text-muted-foreground">شماره کانتینر</Label>
                  <Input 
                    id="container" 
                    placeholder="شماره کانتینر را وارد کنید" 
                    className="bg-muted border-border text-xs h-9 ltr" 
                    value={newShipment.containerNumber}
                    onChange={e => setNewShipment({...newShipment, containerNumber: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer" className="text-xs text-muted-foreground">مشتری</Label>
                <select 
                  id="customer"
                  className="w-full bg-muted border-border text-xs h-9 rounded-md px-3 outline-none focus:ring-1 focus:ring-primary/50"
                  value={newShipment.customerId}
                  onChange={e => setNewShipment({...newShipment, customerId: e.target.value})}
                >
                  <option value="">انتخاب مشتری...</option>
                  {customers.filter((customer) => !customer.isArchived).map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.company})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="origin" className="text-xs text-muted-foreground">مبداء</Label>
                  <Input 
                    id="origin" 
                    className="bg-muted border-border text-xs h-9" 
                    value={newShipment.origin}
                    onChange={e => setNewShipment({...newShipment, origin: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="destination" className="text-xs text-muted-foreground">مقصد (بندر)</Label>
                  <Input 
                    id="destination" 
                    className="bg-muted border-border text-xs h-9" 
                    value={newShipment.destination}
                    onChange={e => setNewShipment({...newShipment, destination: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eta" className="text-xs text-muted-foreground">تاریخ تحویل تخمینی (ETA)</Label>
                <Input 
                  id="eta" 
                  placeholder="۱۴۰۳/۰۴/۱۵"
                  className="bg-muted border-border text-xs h-9" 
                  value={newShipment.estimatedDelivery}
                  onChange={e => setNewShipment({...newShipment, estimatedDelivery: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void handleAddShipment()} className="w-full bg-primary text-primary-foreground font-bold h-10">
                ایجاد محموله
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
            
            return (
              <Card key={shipment.id} className="bg-card border-border rounded-xl overflow-hidden shadow-sm p-4">
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
                     <span className="text-[11px] text-foreground font-bold truncate">{shipment.customerName}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">تحویل تخمینی</span>
                     <span className="text-[11px] text-foreground font-mono">{shipment.estimatedDelivery}</span>
                  </div>
               </div>

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

               <div className="flex items-center justify-between border-t border-border/30 pt-4">
                  <div className="flex items-center gap-2">
                     <div className="flex flex-col">
                        <span className="text-[11px] text-foreground font-bold">{shipment.origin}</span>
                        <span className="text-[9px] text-muted-foreground">مبدأ</span>
                     </div>
                     <ArrowUpDown className="w-3 h-3 text-muted-foreground rotate-90 opacity-50" />
                     <div className="flex flex-col">
                        <span className="text-[11px] text-foreground font-bold">{shipment.destination}</span>
                        <span className="text-[9px] text-muted-foreground">مقصد</span>
                     </div>
                  </div>
                  <StatusBadge status={shipment.status} />
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
            secondaryAction={shipments.length === 0 ? { label: "ثبت محموله", onClick: () => setIsAddDialogOpen(true), icon: Plus, variant: "outline" } : undefined}
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

                    return (
                      <tr key={shipment.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-5 py-4">
                          <span className="font-mono text-sm font-bold text-primary">{shipment.trackingNumber}</span>
                        </td>
                        <td className="px-5 py-4 font-mono text-[11px] text-muted-foreground">{shipment.containerNumber}</td>
                        <td className="px-5 py-4 text-muted-foreground">{shipment.origin}</td>
                        <td className="px-5 py-4 text-muted-foreground">{shipment.destination}</td>
                        <td className="px-5 py-4 font-medium text-foreground">{shipment.customerName}</td>
                        <td className="px-5 py-4">
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
                                 <DropdownMenuItem 
                                   className="text-xs cursor-pointer hover:bg-muted flex items-center gap-2 rounded-lg"
                                   onClick={() => navigate(`/shipments/${shipment.id}`)}
                                 >
                                   <Activity className="w-3.5 h-3.5 text-primary" />
                                   تغییر وضعیت جزئی
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
                      secondaryAction={shipments.length === 0 ? { label: "ثبت محموله", onClick: () => setIsAddDialogOpen(true), icon: Plus, variant: "outline" } : undefined}
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
    </div>
  );
}
