import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Search, Ship, Filter, Plus, Eye, MoreHorizontal, Calendar, MapPin, Truck, Check, ListChecks, CheckCircle2, Clock, MoreVertical, Edit, ArrowUpDown, ArrowUp, ArrowDown, Activity, Archive, Trash2, Trash, UserPlus, Package } from "lucide-react";
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
import { shipmentFormTemplatesApi } from "@/src/lib/shipmentFormTemplatesApi";
import type { ShipmentTypeOption } from "@/src/lib/shipmentFormTemplatesApi";
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

type ShipmentOperation = "import" | "export" | "transit" | "domestic";
type ShipmentTransportMethod = "sea" | "lenj" | "air" | "land";

type ShipmentCreateState = {
  shipmentDirection: ShipmentOperation;
  transportMethod: ShipmentTransportMethod;
  shipmentTypeCode: string;
  trackingNumber: string;
  customerId: string;
  customerName: string;
  origin: string;
  destination: string;
  estimatedDelivery: string;
  goodsSummary: string;
  assignedManagerId: string;
  containerCount: string;
};

const DEFAULT_CREATE_SHIPMENT_TYPE = "IMPORT_SEA_CONTAINER";

const createInitialShipmentState = (): ShipmentCreateState => ({
  shipmentDirection: "import",
  transportMethod: "sea",
  shipmentTypeCode: DEFAULT_CREATE_SHIPMENT_TYPE,
  trackingNumber: "",
  customerId: "",
  customerName: "",
  origin: "",
  destination: "",
  estimatedDelivery: "",
  goodsSummary: "",
  assignedManagerId: "",
  containerCount: "",
});

const shipmentWizardSteps = [
  "نوع عملیات",
  "روش حمل",
  "نوع محموله",
  "اطلاعات پایه",
  "بررسی",
];

const operationOptions: Array<{ value: ShipmentOperation; label: string; description: string }> = [
  { value: "import", label: "واردات", description: "ورود کالا به کشور و ادامه تا ترخیص یا تحویل" },
  { value: "export", label: "صادرات", description: "خروج کالا از کشور و پیگیری حمل و تحویل" },
  { value: "transit", label: "ترانزیت", description: "عبور کالا از مسیر داخلی یا مرزی" },
  { value: "domestic", label: "داخلی", description: "حمل و پیگیری داخل کشور" },
];

const transportMethodOptions: Array<{ value: ShipmentTransportMethod; label: string; description: string; icon: typeof Ship }> = [
  { value: "sea", label: "دریایی", description: "کانتینری، فله یا جنرال کارگو", icon: Ship },
  { value: "lenj", label: "لنج", description: "حمل سبک بندری با لنج", icon: Ship },
  { value: "air", label: "هوایی", description: "بار هوایی و AWB", icon: Activity },
  { value: "land", label: "زمینی", description: "کامیون، CMR و مرزهای زمینی", icon: Truck },
];

function shipmentMethodForType(type: ShipmentTypeOption): ShipmentTransportMethod {
  const code = type.code.toUpperCase();
  if (code.includes("LENJ")) return "lenj";
  if (type.transportMode === "air") return "air";
  if (type.transportMode === "land" || type.transportMode === "rail") return "land";
  return "sea";
}

function filterShipmentTypes(
  shipmentTypes: ShipmentTypeOption[],
  operation: ShipmentOperation,
  method: ShipmentTransportMethod
) {
  return shipmentTypes.filter((type) => type.direction === operation && shipmentMethodForType(type) === method);
}

function availableTransportMethods(shipmentTypes: ShipmentTypeOption[], operation: ShipmentOperation) {
  return transportMethodOptions.filter((option) =>
    shipmentTypes.some((type) => type.direction === operation && shipmentMethodForType(type) === option.value)
  );
}

function isSeaContainerShipment(typeCode: string) {
  return typeCode.toUpperCase().includes("SEA_CONTAINER");
}

export default function Shipments() {
  const navigate = useNavigate();
  const shipmentsResource = useApiResource(React.useCallback(() => shipmentApi.list(), []), []);
  const customersResource = useApiResource(React.useCallback(() => apiGet<Customer[]>("/api/customers"), []), []);
  const tasksResource = useApiResource(React.useCallback(() => apiGet<Task[]>("/api/tasks"), []), []);
  const shipmentTypesResource = useApiResource(React.useCallback(() => shipmentFormTemplatesApi.listTypes(), []), []);
  const shipmentTemplatesResource = useApiResource(React.useCallback(() => shipmentFormTemplatesApi.list(), []), []);
  const shipments = shipmentsResource.data;
  const customers = customersResource.data;
  const tasks = tasksResource.data;
  const shipmentTypes = shipmentTypesResource.data;
  const shipmentTemplates = shipmentTemplatesResource.data;
  const refreshStoreShipments = useAppDataStore(state => state.refreshShipments);
  const currentUser = useAppDataStore(state => state.currentUser);
  const users = useAppDataStore(state => state.users);
  const [shipmentSteps, setShipmentSteps] = useState<ShipmentStep[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState<string | null>(null);
  const [exitedArchiveTarget, setExitedArchiveTarget] = useState<string | null>(null);
  const [exitedArchiveReason, setExitedArchiveReason] = useState("");
  const [isExitedArchiveSaving, setIsExitedArchiveSaving] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  const [newShipment, setNewShipment] = useState<ShipmentCreateState>(() => createInitialShipmentState());

  useEffect(() => {
    if (!shipmentTypes.length) return;
    setNewShipment((current) => {
      const currentType = shipmentTypes.find((type) => type.code === current.shipmentTypeCode);
      if (
        currentType &&
        currentType.direction === current.shipmentDirection &&
        shipmentMethodForType(currentType) === current.transportMethod
      ) {
        return current;
      }

      const methods = availableTransportMethods(shipmentTypes, current.shipmentDirection);
      const transportMethod = methods.some((method) => method.value === current.transportMethod)
        ? current.transportMethod
        : methods[0]?.value || current.transportMethod;
      const shipmentTypeCode =
        filterShipmentTypes(shipmentTypes, current.shipmentDirection, transportMethod)[0]?.code ||
        current.shipmentTypeCode;

      if (transportMethod === current.transportMethod && shipmentTypeCode === current.shipmentTypeCode) {
        return current;
      }
      return { ...current, transportMethod, shipmentTypeCode };
    });
  }, [shipmentTypes]);

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

  const handleCreateDialogOpenChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    setCreateStep(0);
    if (!open) {
      setNewShipment(createInitialShipmentState());
    }
  };

  const handleOperationSelect = (shipmentDirection: ShipmentOperation) => {
    const methods = availableTransportMethods(shipmentTypes, shipmentDirection);
    const transportMethod = methods[0]?.value || "sea";
    const shipmentTypeCode = filterShipmentTypes(shipmentTypes, shipmentDirection, transportMethod)[0]?.code || "";
    setNewShipment((current) => ({ ...current, shipmentDirection, transportMethod, shipmentTypeCode }));
  };

  const handleTransportMethodSelect = (transportMethod: ShipmentTransportMethod) => {
    const shipmentTypeCode = filterShipmentTypes(shipmentTypes, newShipment.shipmentDirection, transportMethod)[0]?.code || "";
    setNewShipment((current) => ({ ...current, transportMethod, shipmentTypeCode }));
  };

  const handleShipmentTypeSelect = (shipmentTypeCode: string) => {
    setNewShipment((current) => ({ ...current, shipmentTypeCode }));
  };

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find((item) => item.id === customerId);
    setNewShipment((current) => ({ ...current, customerId, customerName: customer?.name || "" }));
  };

  const handleAddShipment = async () => {
    const customer = customers.find((item) => item.id === newShipment.customerId);
    const selectedType = shipmentTypes.find((type) => type.code === newShipment.shipmentTypeCode);
    const trackingNumber = newShipment.trackingNumber.trim() || `LP-${Date.now()}`;
    const containerCount = newShipment.containerCount.trim() ? Number(newShipment.containerCount) : undefined;

    try {
      const created = await shipmentApi.create({
        trackingNumber,
        shipmentTypeCode: newShipment.shipmentTypeCode,
        shipmentDirection: selectedType?.direction || newShipment.shipmentDirection,
        transportMode: selectedType?.transportMode || (newShipment.transportMethod === "air" ? "air" : newShipment.transportMethod === "land" ? "land" : "sea"),
        customerId: newShipment.customerId || undefined,
        customerName: customer?.name || newShipment.customerName || "مشتری متفرقه",
        origin: newShipment.origin.trim(),
        destination: newShipment.destination.trim(),
        estimatedDelivery: newShipment.estimatedDelivery || undefined,
        assignedManagerId: newShipment.assignedManagerId || undefined,
        containerCount: isSeaContainerShipment(newShipment.shipmentTypeCode) ? containerCount : undefined,
        notes: newShipment.goodsSummary.trim() || undefined,
        status: "PENDING",
        freeTimeDays: 7,
      });
      await refreshShipmentViews();
      toast.success("محموله ایجاد شد. اکنون می‌توانید اطلاعات تکمیلی را ثبت کنید.");
      handleCreateDialogOpenChange(false);
      navigate(`/shipments/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت محموله ناموفق بود.");
    }
  };

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

  const selectedShipmentType = shipmentTypes.find((type) => type.code === newShipment.shipmentTypeCode) || null;
  const selectedShipmentTemplate = shipmentTemplates.find((template) => template.shipmentTypeCode === newShipment.shipmentTypeCode) || null;
  const createTemplateFields = selectedShipmentTemplate?.sections
    .flatMap((section) => section.fields)
    .filter((field) => field.isVisible && (field.showInCreateForm || field.isImportant))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 8) || [];
  const createProgress = ((createStep + 1) / shipmentWizardSteps.length) * 100;
  const visibleTransportMethods = availableTransportMethods(shipmentTypes, newShipment.shipmentDirection);
  const visibleShipmentTypes = filterShipmentTypes(shipmentTypes, newShipment.shipmentDirection, newShipment.transportMethod);
  const activeOperation = operationOptions.find((option) => option.value === newShipment.shipmentDirection);
  const activeTransportMethod = transportMethodOptions.find((option) => option.value === newShipment.transportMethod);
  const selectedCustomer = customers.find((customer) => customer.id === newShipment.customerId);
  const activeUsers = users.filter((user) => user.status !== "suspended");
  const basicInfoComplete = Boolean(newShipment.customerId && newShipment.origin.trim() && newShipment.destination.trim());
  const currentStepCanContinue =
    createStep === 0 ||
    (createStep === 1 && visibleTransportMethods.length > 0) ||
    (createStep === 2 && Boolean(newShipment.shipmentTypeCode)) ||
    (createStep === 3 && basicInfoComplete) ||
    createStep === 4;
  const showContainerCount = isSeaContainerShipment(newShipment.shipmentTypeCode);

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
          variant="outline"
          data-testid="open-shipment-v2-create"
          className="h-10 w-full gap-2 rounded-xl px-4 text-xs font-bold sm:w-auto"
          onClick={() => navigate("/shipments/new-v2")}
        >
          <Package className="h-3.5 w-3.5" />
          پرونده V2
        </Button>
        <Dialog open={isAddDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
          <DialogTrigger
            render={(triggerProps) => (
              <Button {...triggerProps} data-testid="open-shipment-dialog" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-10 w-full sm:w-auto text-xs font-bold px-4 rounded-xl">
                <Plus className="w-3.5 h-3.5" />
                ثبت محموله جدید
              </Button>
            )}
          />
          <DialogContent className="max-h-[calc(100vh-2rem)] overflow-hidden bg-card border-border text-foreground text-right sm:max-w-3xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">ثبت محموله جدید</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs text-right">
                ابتدا نوع عملیات و روش حمل را انتخاب کنید؛ جزئیات تخصصی بعد از ایجاد محموله در صفحه جزئیات تکمیل می‌شود.
              </DialogDescription>
            </DialogHeader>

            <div data-testid="shipment-wizard-step" className="min-h-0 space-y-4">
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {shipmentWizardSteps.map((step, index) => (
                  <div
                    key={step}
                    className={cn(
                      "min-w-0 rounded-md border px-2 py-2 text-center text-[10px] font-black transition-colors",
                      index === createStep
                        ? "border-primary bg-primary text-primary-foreground"
                        : index < createStep
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-border bg-muted/60 text-muted-foreground"
                    )}
                  >
                    <span className="block text-[11px] sm:hidden">{index + 1}</span>
                    <span className="hidden truncate sm:block">{step}</span>
                  </div>
                ))}
              </div>
              <Progress value={createProgress} className="gap-1" />

              <div className="max-h-[min(58vh,520px)] overflow-y-auto pr-1">
                {createStep === 0 ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-black text-foreground">نوع عملیات</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">مسیر کلی پرونده را انتخاب کنید تا روش‌های حمل مرتبط نمایش داده شود.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {operationOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          data-testid={"shipment-operation-" + option.value}
                          aria-pressed={newShipment.shipmentDirection === option.value}
                          onClick={() => handleOperationSelect(option.value)}
                          className={cn(
                            "rounded-lg border p-3 text-right transition-colors",
                            newShipment.shipmentDirection === option.value
                              ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                              : "border-border bg-muted/40 hover:bg-muted"
                          )}
                        >
                          <span className="block text-sm font-black text-foreground">{option.label}</span>
                          <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {createStep === 1 ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-black text-foreground">روش حمل</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">برای {activeOperation?.label || "این عملیات"} روش حمل را انتخاب کنید.</p>
                    </div>
                    {shipmentTypesResource.isLoading ? (
                      <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs font-bold text-muted-foreground">در حال دریافت روش‌های حمل...</div>
                    ) : visibleTransportMethods.length ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {visibleTransportMethods.map((option) => {
                          const Icon = option.icon;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              data-testid={"shipment-method-" + option.value}
                              aria-pressed={newShipment.transportMethod === option.value}
                              onClick={() => handleTransportMethodSelect(option.value)}
                              className={cn(
                                "flex items-start gap-3 rounded-lg border p-3 text-right transition-colors",
                                newShipment.transportMethod === option.value
                                  ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                                  : "border-border bg-muted/40 hover:bg-muted"
                              )}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-black text-foreground">{option.label}</span>
                                <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{option.description}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div data-testid="shipment-method-empty" className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs font-bold leading-5 text-muted-foreground">
                        برای این نوع عملیات هنوز قالب فعال تعریف نشده است. واردات و صادرات آماده استفاده هستند.
                      </div>
                    )}
                  </div>
                ) : null}

                {createStep === 2 ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-black text-foreground">نوع محموله</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">قالب اطلاعاتی محموله بر اساس انتخاب این مرحله فعال می‌شود.</p>
                    </div>
                    <div className="grid gap-2">
                      {visibleShipmentTypes.map((type) => (
                        <button
                          key={type.code}
                          type="button"
                          data-testid={"shipment-type-" + type.code}
                          aria-pressed={newShipment.shipmentTypeCode === type.code}
                          onClick={() => handleShipmentTypeSelect(type.code)}
                          className={cn(
                            "rounded-lg border p-3 text-right transition-colors",
                            newShipment.shipmentTypeCode === type.code
                              ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                              : "border-border bg-muted/40 hover:bg-muted"
                          )}
                        >
                          <span className="block text-sm font-black text-foreground">{type.labelFa}</span>
                          {type.description ? <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{type.description}</span> : null}
                        </button>
                      ))}
                    </div>
                    {selectedShipmentType && createTemplateFields.length ? (
                      <div className="rounded-lg border border-border bg-muted/50 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <ListChecks className="h-4 w-4 text-primary" />
                          <p className="text-xs font-black text-foreground">فیلدهای مهمی که در جزئیات فعال می‌شود</p>
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {createTemplateFields.map((field) => (
                            <div key={field.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-background px-2 py-1.5">
                              <span className="truncate text-[11px] font-bold text-foreground">{field.labelFa}</span>
                              {field.isRequired ? <Badge variant="outline" className="shrink-0 text-[10px] font-black">اجباری</Badge> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {createStep === 3 ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-black text-foreground">اطلاعات پایه محموله</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">فقط اطلاعات لازم برای ایجاد پرونده را وارد کنید. شماره رهگیری اختیاری است و در صورت خالی بودن خودکار ساخته می‌شود.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="customer" className="text-xs text-muted-foreground">مشتری</Label>
                        <select
                          id="customer"
                          data-testid="shipment-create-customer"
                          className="h-9 w-full rounded-md border border-border bg-muted px-3 text-xs outline-none focus:ring-1 focus:ring-primary/50"
                          value={newShipment.customerId}
                          onChange={(event) => handleCustomerSelect(event.target.value)}
                        >
                          <option value="">انتخاب مشتری...</option>
                          {customers.filter((customer) => !customer.isArchived).map((customer) => (
                            <option key={customer.id} value={customer.id}>{customer.name} ({customer.company})</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="origin" className="text-xs text-muted-foreground">مبدا</Label>
                        <Input
                          id="origin"
                          data-testid="shipment-create-origin"
                          className="h-9 border-border bg-muted text-xs"
                          value={newShipment.origin}
                          onChange={(event) => setNewShipment({ ...newShipment, origin: event.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="destination" className="text-xs text-muted-foreground">مقصد</Label>
                        <Input
                          id="destination"
                          data-testid="shipment-create-destination"
                          className="h-9 border-border bg-muted text-xs"
                          value={newShipment.destination}
                          onChange={(event) => setNewShipment({ ...newShipment, destination: event.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tracking" className="text-xs text-muted-foreground">شماره رهگیری / مرجع</Label>
                        <Input
                          id="tracking"
                          data-testid="shipment-create-tracking"
                          placeholder="اختیاری"
                          className="h-9 border-border bg-muted text-xs ltr"
                          value={newShipment.trackingNumber}
                          onChange={(event) => setNewShipment({ ...newShipment, trackingNumber: event.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="eta" className="text-xs text-muted-foreground">تاریخ تقریبی تحویل</Label>
                        <Input
                          id="eta"
                          type="date"
                          data-testid="shipment-create-date"
                          className="h-9 border-border bg-muted text-xs"
                          value={newShipment.estimatedDelivery}
                          onChange={(event) => setNewShipment({ ...newShipment, estimatedDelivery: event.target.value })}
                        />
                      </div>
                      {showContainerCount ? (
                        <div className="space-y-1.5">
                          <Label htmlFor="container-count" className="text-xs text-muted-foreground">تعداد کانتینر</Label>
                          <Input
                            id="container-count"
                            type="number"
                            min="0"
                            data-testid="shipment-create-container-count"
                            className="h-9 border-border bg-muted text-xs"
                            value={newShipment.containerCount}
                            onChange={(event) => setNewShipment({ ...newShipment, containerCount: event.target.value })}
                          />
                        </div>
                      ) : null}
                      <div className="space-y-1.5">
                        <Label htmlFor="assigned-manager" className="text-xs text-muted-foreground">مسئول پرونده</Label>
                        <select
                          id="assigned-manager"
                          data-testid="shipment-create-assigned-manager"
                          className="h-9 w-full rounded-md border border-border bg-muted px-3 text-xs outline-none focus:ring-1 focus:ring-primary/50"
                          value={newShipment.assignedManagerId}
                          onChange={(event) => setNewShipment({ ...newShipment, assignedManagerId: event.target.value })}
                        >
                          <option value="">بدون مسئول مشخص</option>
                          {activeUsers.map((user) => (
                            <option key={user.id} value={user.id}>{user.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="goods-summary" className="text-xs text-muted-foreground">خلاصه کالا / یادداشت اولیه</Label>
                        <textarea
                          id="goods-summary"
                          data-testid="shipment-create-goods-summary"
                          rows={3}
                          className="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/50"
                          value={newShipment.goodsSummary}
                          onChange={(event) => setNewShipment({ ...newShipment, goodsSummary: event.target.value })}
                        />
                      </div>
                    </div>
                    {!basicInfoComplete ? (
                      <p className="text-[11px] font-bold text-amber-600">برای ادامه، مشتری، مبدا و مقصد را وارد کنید.</p>
                    ) : null}
                  </div>
                ) : null}

                {createStep === 4 ? (
                  <div data-testid="shipment-wizard-review" className="space-y-3">
                    <div>
                      <p className="text-sm font-black text-foreground">بررسی و ایجاد محموله</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">بعد از ایجاد، صفحه جزئیات باز می‌شود تا اطلاعات تخصصی و قالب کامل را تکمیل کنید.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        ["نوع عملیات", activeOperation?.label],
                        ["روش حمل", activeTransportMethod?.label],
                        ["نوع محموله", selectedShipmentType?.labelFa],
                        ["مشتری", selectedCustomer?.name],
                        ["مبدا", newShipment.origin],
                        ["مقصد", newShipment.destination],
                        ["شماره رهگیری", newShipment.trackingNumber || "ایجاد خودکار"],
                        ["تاریخ تحویل", newShipment.estimatedDelivery || "ثبت نشده"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-md border border-border bg-muted/40 p-3">
                          <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
                          <p className="mt-1 min-h-5 break-words text-xs font-black text-foreground">{value || "-"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="-mx-5 -mb-5 flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                data-testid="shipment-wizard-back"
                className="h-10 w-full sm:w-auto"
                onClick={() => {
                  if (createStep === 0) {
                    handleCreateDialogOpenChange(false);
                    return;
                  }
                  setCreateStep((step) => Math.max(step - 1, 0));
                }}
              >
                {createStep === 0 ? "انصراف" : "مرحله قبل"}
              </Button>
              {createStep < shipmentWizardSteps.length - 1 ? (
                <Button
                  type="button"
                  data-testid="shipment-wizard-next"
                  disabled={!currentStepCanContinue}
                  className="h-10 w-full bg-primary text-primary-foreground font-bold sm:w-auto"
                  onClick={() => setCreateStep((step) => Math.min(step + 1, shipmentWizardSteps.length - 1))}
                >
                  مرحله بعد
                </Button>
              ) : (
                <Button
                  type="button"
                  data-testid="submit-shipment"
                  disabled={!currentStepCanContinue || !selectedShipmentType}
                  onClick={() => void handleAddShipment()}
                  className="h-10 w-full bg-primary text-primary-foreground font-bold sm:w-auto"
                >
                  ایجاد محموله
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                         <DropdownMenuItem
                           className="text-xs cursor-pointer hover:bg-muted flex items-center gap-2 rounded-lg"
                           onClick={() => navigate(`/shipments/${shipment.id}/v2`)}
                         >
                           <Package className="w-3.5 h-3.5 text-primary" />
                           پرونده V2
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
            secondaryAction={shipments.length === 0 ? { label: "ثبت محموله", onClick: () => handleCreateDialogOpenChange(true), icon: Plus, variant: "outline" } : undefined}
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
                                 <DropdownMenuItem
                                   className="text-xs cursor-pointer hover:bg-muted flex items-center gap-2 rounded-lg"
                                   onClick={() => navigate(`/shipments/${shipment.id}/v2`)}
                                 >
                                   <Package className="w-3.5 h-3.5 text-primary" />
                                   پرونده V2
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
                      secondaryAction={shipments.length === 0 ? { label: "ثبت محموله", onClick: () => handleCreateDialogOpenChange(true), icon: Plus, variant: "outline" } : undefined}
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
