import React from "react";
import { useNavigate } from "react-router-dom";
import { Anchor, ArrowRight, Check, Loader2, Package, Plus, Save, Search, Ship, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiGet } from "@/src/lib/api";
import { useApiResource } from "@/src/lib/resourceState";
import { shipmentV2Api } from "@/src/lib/shipmentV2Api";
import { toEnglishDigits } from "@/src/components/ShamsiDateTimeField";
import { useAppDataStore } from "@/src/store/useMockStore";
import type { Customer, ShipmentV2FlowCode, ShipmentV2GoodsRow, ShipmentV2LenjType } from "@/src/types";

type DraftGoodsRow = Omit<ShipmentV2GoodsRow, "quantity" | "weight" | "cbm" | "pcs"> & {
  id: string;
  quantity: string;
  weight: string;
  cbm: string;
  pcs: string;
};

type CreateState = {
  flowCode: ShipmentV2FlowCode;
  codeMode: "new" | "existing";
  trackingNumber: string;
  customerId: string;
  origin: string;
  dischargePort: string;
  deliveryPort: string;
  consigneeName: string;
  lenjType: "" | ShipmentV2LenjType;
  container20Count: string;
  container40Count: string;
  goodsRows: DraftGoodsRow[];
};

const flowOptions: Array<{
  value: ShipmentV2FlowCode;
  title: string;
  description: string;
  icon: typeof Anchor;
}> = [
  {
    value: "IMPORT_LANJ",
    title: "واردات → لنج",
    description: "پرونده واردات دریایی سبک با ساختار تمیز V2.",
    icon: Anchor,
  },
  {
    value: "IMPORT_SHIP",
    title: "واردات → کشتی",
    description: "پرونده واردات کشتی یا کانتینری با پروفایل عملیاتی V2.",
    icon: Ship,
  },
];

const lenjTypeOptions: Array<{ value: ShipmentV2LenjType; label: string }> = [
  { value: "TEH_LENJI", label: "ته لنجی" },
  { value: "MALVANI", label: "ملوانی" },
];

const initialState: CreateState = {
  flowCode: "IMPORT_LANJ",
  codeMode: "new",
  trackingNumber: "",
  customerId: "",
  origin: "",
  dischargePort: "",
  deliveryPort: "",
  consigneeName: "",
  lenjType: "TEH_LENJI",
  container20Count: "",
  container40Count: "",
  goodsRows: [{ id: "goods-create-empty", description: "", packagingType: "", quantity: "", weight: "", cbm: "", pcs: "" }],
};

function optionalNumber(value: string) {
  const trimmed = toEnglishDigits(value)
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".")
    .trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumDraftGoodsMetric(rows: DraftGoodsRow[], key: "quantity" | "weight" | "cbm" | "pcs") {
  const values = rows
    .map((row) => optionalNumber(row[key]))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function customerOptionLabel(customer: Customer) {
  return customer.customerCode || customer.code || customer.id;
}

function customerDisplayName(customer: Customer) {
  const code = customerOptionLabel(customer);
  return [customer.company, customer.name]
    .filter((value) => value && value !== code)
    .join(" - ");
}

function normalizeCustomerSearch(value: string) {
  return toEnglishDigits(value || "").trim().toLowerCase();
}

function customerSearchTokens(customer: Customer) {
  return [
    customer.customerCode,
    customer.code,
    customer.id,
    customer.company,
    customer.name,
    customer.phone,
    customer.email,
  ]
    .map((value) => normalizeCustomerSearch(String(value || "")))
    .filter(Boolean);
}

function customerSearchRank(customer: Customer, query: string) {
  const codeTokens = [customer.customerCode, customer.code, customer.id]
    .map((value) => normalizeCustomerSearch(String(value || "")))
    .filter(Boolean);
  if (codeTokens.some((token) => token === query)) return 0;
  if (codeTokens.some((token) => token.startsWith(query))) return 1;
  if (codeTokens.some((token) => token.includes(query))) return 2;
  return 3;
}

function formatDraftGoodsTotal(value: number | null) {
  if (value === null) return "ثبت نشده";
  return value.toLocaleString("fa-IR", { maximumFractionDigits: 6 });
}

function validateCreateState(state: CreateState) {
  const errors: Record<string, string> = {};
  if (state.codeMode === "existing" && !state.trackingNumber.trim()) {
    errors.trackingNumber = "فرمت کد محموله معتبر نیست. مثال صحیح: 14050316020";
  }
  if (!state.customerId) errors.customerId = "مشتری را انتخاب کنید.";
  if (!state.origin.trim()) errors.origin = "مبدا را وارد کنید.";
  if (!state.dischargePort.trim()) errors.dischargePort = "بندر تخلیه را وارد کنید.";
  if (!state.deliveryPort.trim()) errors.deliveryPort = "بندر تحویل را وارد کنید.";
  if (state.flowCode === "IMPORT_LANJ" && !state.lenjType) errors.lenjType = "نوع لنج را انتخاب کنید.";
  return errors;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-[11px] font-bold text-red-600">{message}</p> : null;
}

export default function ShipmentCreateV2() {
  const navigate = useNavigate();
  const refreshShipments = useAppDataStore((state) => state.refreshShipments);
  const currentUser = useAppDataStore((state) => state.currentUser);
  const customersResource = useApiResource(React.useCallback(() => apiGet<Customer[]>("/api/customers"), []), []);
  const customers = customersResource.data;
  const [state, setState] = React.useState<CreateState>(initialState);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = React.useState(false);

  const selectedFlow = flowOptions.find((flow) => flow.value === state.flowCode) || flowOptions[0];
  const showContainerCounts = state.flowCode === "IMPORT_SHIP";
  const currentUserRole = String(currentUser?.role || "").toUpperCase();
  const canUseExistingCode = currentUserRole === "CEO" || currentUserRole === "MANAGER" || currentUser?.permissions?.includes("platform.admin");
  const selectedCustomer = React.useMemo(
    () => customers.find((customer) => customer.id === state.customerId) || null,
    [customers, state.customerId]
  );
  const customerSearchQuery = normalizeCustomerSearch(customerSearch);
  const customerSuggestions = React.useMemo(() => {
    if (!customerSearchQuery) return [];
    return customers
      .filter((customer) => customerSearchTokens(customer).some((token) => token.includes(customerSearchQuery)))
      .sort((a, b) => customerSearchRank(a, customerSearchQuery) - customerSearchRank(b, customerSearchQuery))
      .slice(0, 8);
  }, [customers, customerSearchQuery]);

  React.useEffect(() => {
    if (!canUseExistingCode && state.codeMode === "existing") {
      setState((current) => ({ ...current, codeMode: "new", trackingNumber: "" }));
    }
  }, [canUseExistingCode, state.codeMode]);

  React.useEffect(() => {
    if (selectedCustomer) {
      setCustomerSearch(customerOptionLabel(selectedCustomer));
    }
  }, [selectedCustomer]);

  const updateField = <TKey extends keyof CreateState>(key: TKey, value: CreateState[TKey]) => {
    setErrors((current) => ({ ...current, [key]: "" }));
    setState((current) => ({ ...current, [key]: value }));
  };

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value);
    setIsCustomerDropdownOpen(true);
    setErrors((current) => ({ ...current, customerId: "" }));
    setState((current) => (current.customerId ? { ...current, customerId: "" } : current));
  };

  const selectCustomer = (customer: Customer) => {
    updateField("customerId", customer.id);
    setCustomerSearch(customerOptionLabel(customer));
    setIsCustomerDropdownOpen(false);
  };

  const updateGoodsRow = (rowId: string, updates: Partial<DraftGoodsRow>) => {
    setState((current) => ({
      ...current,
      goodsRows: current.goodsRows.map((row) => (row.id === rowId ? { ...row, ...updates } : row)),
    }));
  };

  const addGoodsRow = () => {
    setState((current) => ({
      ...current,
      goodsRows: [
        ...current.goodsRows,
        {
          id: `goods-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          description: "",
          packagingType: "",
          quantity: "",
          weight: "",
          cbm: "",
          pcs: "",
        },
      ],
    }));
  };

  const removeGoodsRow = (rowId: string) => {
    setState((current) => {
      const nextRows = current.goodsRows.filter((row) => row.id !== rowId);
      return {
        ...current,
        goodsRows: nextRows.length
          ? nextRows
          : [{ id: "goods-create-empty", description: "", packagingType: "", quantity: "", weight: "", cbm: "", pcs: "" }],
      };
    });
  };

  const buildGoodsRows = () =>
    state.goodsRows
      .map((row) => ({
        description: row.description.trim(),
        packagingType: (row.packagingType || "").trim(),
        quantity: optionalNumber(row.quantity),
        weight: optionalNumber(row.weight),
        cbm: optionalNumber(row.cbm),
        pcs: optionalNumber(row.pcs),
      }))
      .filter((row) => row.description);

  const handleSubmit = async () => {
    const nextErrors = validateCreateState(state);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setIsSaving(true);
    try {
      const container20Count = optionalNumber(state.container20Count);
      const container40Count = optionalNumber(state.container40Count);
      const response = await shipmentV2Api.create({
        flowCode: state.flowCode,
        codeMode: state.codeMode,
        trackingNumber: state.codeMode === "existing" ? state.trackingNumber.trim() || undefined : undefined,
        customerId: state.customerId,
        origin: state.origin.trim(),
        dischargePort: state.dischargePort.trim(),
        deliveryPort: state.deliveryPort.trim(),
        consigneeName: state.flowCode === "IMPORT_SHIP" ? state.consigneeName.trim() || undefined : undefined,
        lenjType: state.flowCode === "IMPORT_LANJ" ? state.lenjType || null : null,
        container20Count: showContainerCounts && container20Count !== null ? container20Count : undefined,
        container40Count: showContainerCounts && container40Count !== null ? container40Count : undefined,
        goodsRows: buildGoodsRows(),
      });
      await refreshShipments?.();
      toast.success("پرونده محموله V2 ایجاد شد.");
      navigate(`/shipments/${response.shipment.id}/v2`);
    } catch (error) {
      console.error("Create Shipment V2 failed", error);
      const message = error instanceof Error ? error.message : "ایجاد پرونده V2 ناموفق بود.";
      setErrors((current) => ({ ...current, trackingNumber: message }));
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="app-page space-y-5 font-sans" dir="rtl" data-testid="shipment-v2-create-page">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg"
              onClick={() => navigate("/shipments")}
              aria-label="بازگشت"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-black tracking-tight text-foreground">ثبت محموله V2</h1>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                فقط جریان واردات و اطلاعات پایه لازم برای ساخت پرونده جدید ثبت می‌شود.
              </p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="w-fit rounded-lg px-3 py-1 text-[11px] font-black">
          منبع عملیاتی جدید
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-black text-foreground">جریان محموله</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">در این نسخه فقط دو مسیر واردات فعال است.</p>
          </div>
          <div className="grid gap-3">
            {flowOptions.map((flow) => {
              const Icon = flow.icon;
              const selected = state.flowCode === flow.value;
              return (
                <button
                  key={flow.value}
                  type="button"
                  data-testid={`shipment-v2-flow-${flow.value}`}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-xl border p-4 text-right transition-colors",
                    selected ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "border-border bg-card hover:bg-muted/40"
                  )}
                  onClick={() => {
                    setErrors({});
                    setState((current) => ({
                      ...current,
                      flowCode: flow.value,
                      lenjType: flow.value === "IMPORT_LANJ" ? current.lenjType || "TEH_LENJI" : "",
                    }));
                  }}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-background text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-foreground">{flow.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{flow.description}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border/60 p-4">
            <CardTitle className="flex items-center gap-2 text-sm font-black">
              <Package className="h-4 w-4 text-primary" />
              اطلاعات پایه پرونده
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-[11px] font-black text-muted-foreground">جریان انتخاب‌شده</p>
              <p className="mt-1 text-sm font-black text-foreground">{selectedFlow.title}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="shipment-v2-customer" className="text-xs font-bold text-muted-foreground">
                  مشتری
                </Label>
                <div
                  className="relative"
                  onBlur={(event) => {
                    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) {
                      setIsCustomerDropdownOpen(false);
                    }
                  }}
                >
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="shipment-v2-customer"
                      data-testid="shipment-v2-customer"
                      className="h-10 rounded-md bg-background pr-9 pl-9 text-xs font-bold"
                      value={customerSearch}
                      onChange={(event) => handleCustomerSearchChange(event.target.value)}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setIsCustomerDropdownOpen(false);
                        }
                        if (event.key === "Enter" && customerSuggestions[0]) {
                          event.preventDefault();
                          selectCustomer(customerSuggestions[0]);
                        }
                      }}
                      disabled={customersResource.isLoading}
                      placeholder={customersResource.isLoading ? "در حال بارگذاری..." : "کد مشتری را تایپ کنید"}
                      role="combobox"
                      aria-expanded={isCustomerDropdownOpen}
                      aria-controls="shipment-v2-customer-suggestions"
                      aria-autocomplete="list"
                      autoComplete="off"
                    />
                    {state.customerId ? (
                      <Check className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                    ) : null}
                  </div>

                  {isCustomerDropdownOpen && !customersResource.isLoading ? (
                    <div
                      id="shipment-v2-customer-suggestions"
                      data-testid="shipment-v2-customer-suggestions"
                      role="listbox"
                      className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-background p-1 text-xs shadow-lg"
                    >
                      {!customerSearchQuery ? (
                        <p className="px-3 py-2 font-bold text-muted-foreground">برای جستجو، کد مشتری را وارد کنید.</p>
                      ) : customerSuggestions.length ? (
                        customerSuggestions.map((customer, index) => {
                          const displayName = customerDisplayName(customer);
                          const optionLabel = customerOptionLabel(customer);
                          return (
                            <button
                              key={customer.id}
                              type="button"
                              data-testid={`shipment-v2-customer-suggestion-${index}`}
                              role="option"
                              aria-selected={customer.id === state.customerId}
                              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-right hover:bg-muted focus:bg-muted focus:outline-none"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectCustomer(customer)}
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-black text-foreground">{optionLabel}</span>
                                {displayName ? (
                                  <span className="mt-0.5 block truncate text-[11px] font-bold text-muted-foreground">{displayName}</span>
                                ) : null}
                              </span>
                              {customer.id === state.customerId ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-3 py-2 font-bold text-muted-foreground">مشتری با این کد پیدا نشد.</p>
                      )}
                    </div>
                  ) : null}
                </div>
                {selectedCustomer ? (
                  <p className="text-[11px] font-bold text-muted-foreground">
                    مشتری انتخاب‌شده: <span className="font-black text-foreground">{customerOptionLabel(selectedCustomer)}</span>
                    {customerDisplayName(selectedCustomer) ? ` - ${customerDisplayName(selectedCustomer)}` : ""}
                  </p>
                ) : null}
                <FieldError message={errors.customerId} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs font-bold text-muted-foreground">نوع ثبت کد محموله</Label>
                <div className="grid gap-2 sm:grid-cols-2" data-testid="shipment-v2-code-mode">
                  <button
                    type="button"
                    data-testid="shipment-v2-code-mode-new"
                    aria-pressed={state.codeMode === "new"}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-right text-xs font-black transition-colors",
                      state.codeMode === "new" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted/40"
                    )}
                    onClick={() => {
                      setErrors((current) => ({ ...current, trackingNumber: "" }));
                      setState((current) => ({ ...current, codeMode: "new", trackingNumber: "" }));
                    }}
                  >
                    محموله جدید
                  </button>
                  {canUseExistingCode ? (
                    <button
                      type="button"
                      data-testid="shipment-v2-code-mode-existing"
                      aria-pressed={state.codeMode === "existing"}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-right text-xs font-black transition-colors",
                        state.codeMode === "existing" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted/40"
                      )}
                      onClick={() => {
                        setErrors((current) => ({ ...current, trackingNumber: "" }));
                        setState((current) => ({ ...current, codeMode: "existing" }));
                      }}
                    >
                      ثبت محموله موجود
                    </button>
                  ) : null}
                </div>
                {state.codeMode === "existing" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="shipment-v2-tracking" className="text-xs font-bold text-muted-foreground">
                      کد محموله موجود
                    </Label>
                    <Input
                      id="shipment-v2-tracking"
                      data-testid="shipment-v2-tracking"
                      className="h-10 text-left font-mono text-xs"
                      dir="ltr"
                      inputMode="numeric"
                      value={state.trackingNumber}
                      onChange={(event) => updateField("trackingNumber", event.target.value)}
                      placeholder="14050316020"
                    />
                    <FieldError message={errors.trackingNumber} />
                  </div>
                ) : (
                  <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-[11px] font-bold text-muted-foreground">
                    کد محموله به صورت خودکار ساخته می‌شود
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shipment-v2-origin" className="text-xs font-bold text-muted-foreground">
                  مبدا
                </Label>
                <Input
                  id="shipment-v2-origin"
                  data-testid="shipment-v2-origin"
                  className="h-10 text-xs"
                  value={state.origin}
                  onChange={(event) => updateField("origin", event.target.value)}
                />
                <FieldError message={errors.origin} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shipment-v2-discharge-port" className="text-xs font-bold text-muted-foreground">
                  بندر تخلیه
                </Label>
                <Input
                  id="shipment-v2-discharge-port"
                  data-testid="shipment-v2-discharge-port"
                  className="h-10 text-xs"
                  value={state.dischargePort}
                  onChange={(event) => updateField("dischargePort", event.target.value)}
                />
                <FieldError message={errors.dischargePort} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shipment-v2-delivery-port" className="text-xs font-bold text-muted-foreground">
                  بندر تحویل
                </Label>
                <Input
                  id="shipment-v2-delivery-port"
                  data-testid="shipment-v2-delivery-port"
                  className="h-10 text-xs"
                  value={state.deliveryPort}
                  onChange={(event) => updateField("deliveryPort", event.target.value)}
                />
                <FieldError message={errors.deliveryPort} />
              </div>

              {state.flowCode === "IMPORT_SHIP" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="shipment-v2-consignee" className="text-xs font-bold text-muted-foreground">
                    کانساینی
                  </Label>
                  <Input
                    id="shipment-v2-consignee"
                    data-testid="shipment-v2-consignee"
                    className="h-10 text-xs"
                    value={state.consigneeName}
                    onChange={(event) => updateField("consigneeName", event.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="shipment-v2-lenj-type" className="text-xs font-bold text-muted-foreground">
                    نوع لنج
                  </Label>
                  <select
                    id="shipment-v2-lenj-type"
                    data-testid="shipment-v2-lenj-type"
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/50"
                    value={state.lenjType}
                    onChange={(event) => updateField("lenjType", event.target.value as CreateState["lenjType"])}
                  >
                    {lenjTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <FieldError message={errors.lenjType} />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/15 p-3" data-testid="shipment-v2-create-goods-section">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-black text-foreground">مشخصات کالا</h2>
                  <p className="mt-1 text-[11px] font-bold leading-5 text-muted-foreground">
                    این بخش با همان ساختار مشخصات کالا در جزئیات محموله ذخیره می‌شود.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-fit gap-1.5 rounded-md px-2.5 text-[11px] font-black"
                  onClick={addGoodsRow}
                  data-testid="shipment-v2-create-goods-add"
                >
                  <Plus className="h-3.5 w-3.5" />
                  افزودن کالا
                </Button>
              </div>

              {showContainerCounts ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">کانتینر ۲۰ فوت</Label>
                    <Input
                      className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                      inputMode="decimal"
                      value={state.container20Count}
                      onChange={(event) => updateField("container20Count", event.target.value)}
                      data-testid="shipment-v2-create-container20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground sm:text-xs">کانتینر ۴۰ فوت</Label>
                    <Input
                      className="h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                      inputMode="decimal"
                      value={state.container40Count}
                      onChange={(event) => updateField("container40Count", event.target.value)}
                      data-testid="shipment-v2-create-container40"
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                {state.goodsRows.map((row, index) => (
                  <div key={row.id} className="rounded-lg border border-border bg-background/80 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black text-muted-foreground">کالای {(index + 1).toLocaleString("fa-IR")}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md text-muted-foreground hover:text-red-600"
                        onClick={() => removeGoodsRow(row.id)}
                        aria-label={`حذف کالای ${index + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      data-testid={`shipment-v2-create-goods-row-${index}-description`}
                      className="mt-1.5 h-8 rounded-lg text-[11px] font-bold sm:h-9 sm:text-xs"
                      placeholder="شرح کالا"
                      value={row.description}
                      onChange={(event) => updateGoodsRow(row.id, { description: event.target.value })}
                    />
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                      <Input
                        data-testid={`shipment-v2-create-goods-row-${index}-quantity`}
                        className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs"
                        inputMode="decimal"
                        placeholder="تعداد"
                        value={row.quantity}
                        onChange={(event) => updateGoodsRow(row.id, { quantity: event.target.value })}
                      />
                      <Input
                        data-testid={`shipment-v2-create-goods-row-${index}-weight`}
                        className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs"
                        inputMode="decimal"
                        placeholder="وزن"
                        value={row.weight}
                        onChange={(event) => updateGoodsRow(row.id, { weight: event.target.value })}
                      />
                      <Input
                        data-testid={`shipment-v2-create-goods-row-${index}-cbm`}
                        className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs"
                        inputMode="decimal"
                        placeholder="CBM"
                        value={row.cbm}
                        onChange={(event) => updateGoodsRow(row.id, { cbm: event.target.value })}
                      />
                      <Input
                        data-testid={`shipment-v2-create-goods-row-${index}-pcs`}
                        className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs"
                        inputMode="decimal"
                        placeholder="PCS"
                        value={row.pcs}
                        onChange={(event) => updateGoodsRow(row.id, { pcs: event.target.value })}
                      />
                      <Input
                        data-testid={`shipment-v2-create-goods-row-${index}-packaging`}
                        className="h-8 min-w-0 rounded-lg px-2 text-[11px] font-bold sm:h-9 sm:text-xs"
                        placeholder="بسته بندی"
                        value={row.packagingType || ""}
                        onChange={(event) => updateGoodsRow(row.id, { packagingType: event.target.value })}
                      />
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5" data-testid="shipment-v2-create-goods-total">
                  <p className="text-[10px] font-black text-primary">مجموع</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {[
                      ["تعداد", sumDraftGoodsMetric(state.goodsRows, "quantity"), "quantity"],
                      ["وزن", sumDraftGoodsMetric(state.goodsRows, "weight"), "weight"],
                      ["CBM", sumDraftGoodsMetric(state.goodsRows, "cbm"), "cbm"],
                      ["PCS", sumDraftGoodsMetric(state.goodsRows, "pcs"), "pcs"],
                    ].map(([label, value, key]) => (
                      <div key={key as string} className="min-w-0 rounded-md bg-background/80 px-2 py-1" data-testid={`shipment-v2-create-goods-total-${key}`}>
                        <p className="truncate text-[9px] font-black text-muted-foreground">{label}</p>
                        <p className="mt-0.5 truncate text-[11px] font-black text-foreground">{formatDraftGoodsTotal(value as number | null)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {!customersResource.isLoading && !customers.length ? (
              <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-bold text-amber-700 md:flex-row md:items-center md:justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  برای ثبت محموله ابتدا یک مشتری بسازید.
                </span>
                <Button type="button" variant="outline" className="h-8 rounded-lg text-xs font-black" onClick={() => navigate("/customers")}>
                  ثبت مشتری
                </Button>
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-10 rounded-lg text-xs font-black" onClick={() => navigate("/shipments")}>
                انصراف
              </Button>
              <Button
                type="button"
                data-testid="shipment-v2-submit"
                className="h-10 gap-2 rounded-lg text-xs font-black"
                onClick={() => void handleSubmit()}
                disabled={isSaving || customersResource.isLoading || !customers.length}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                ثبت پرونده V2
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
