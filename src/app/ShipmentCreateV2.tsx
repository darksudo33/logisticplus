import React from "react";
import { useNavigate } from "react-router-dom";
import { Anchor, ArrowRight, Loader2, Package, Save, Ship, Users } from "lucide-react";
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
import { useAppDataStore } from "@/src/store/useMockStore";
import type { Customer, ShipmentV2FlowCode, ShipmentV2LenjType } from "@/src/types";

type CreateState = {
  flowCode: ShipmentV2FlowCode;
  trackingNumber: string;
  customerId: string;
  shipmentTitle: string;
  origin: string;
  dischargePort: string;
  deliveryPort: string;
  consigneeName: string;
  lenjType: "" | ShipmentV2LenjType;
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
  trackingNumber: "",
  customerId: "",
  shipmentTitle: "",
  origin: "",
  dischargePort: "",
  deliveryPort: "",
  consigneeName: "",
  lenjType: "TEH_LENJI",
};

function validateCreateState(state: CreateState) {
  const errors: Record<string, string> = {};
  if (!state.customerId) errors.customerId = "مشتری را انتخاب کنید.";
  if (!state.shipmentTitle.trim()) errors.shipmentTitle = "عنوان محموله را وارد کنید.";
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
  const customersResource = useApiResource(React.useCallback(() => apiGet<Customer[]>("/api/customers"), []), []);
  const customers = customersResource.data;
  const [state, setState] = React.useState<CreateState>(initialState);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);

  const selectedFlow = flowOptions.find((flow) => flow.value === state.flowCode) || flowOptions[0];

  const updateField = <TKey extends keyof CreateState>(key: TKey, value: CreateState[TKey]) => {
    setErrors((current) => ({ ...current, [key]: "" }));
    setState((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async () => {
    const nextErrors = validateCreateState(state);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setIsSaving(true);
    try {
      const response = await shipmentV2Api.create({
        flowCode: state.flowCode,
        trackingNumber: state.trackingNumber.trim() || undefined,
        customerId: state.customerId,
        shipmentTitle: state.shipmentTitle.trim(),
        origin: state.origin.trim(),
        dischargePort: state.dischargePort.trim(),
        deliveryPort: state.deliveryPort.trim(),
        consigneeName: state.flowCode === "IMPORT_SHIP" ? state.consigneeName.trim() || undefined : undefined,
        lenjType: state.flowCode === "IMPORT_LANJ" ? state.lenjType || null : null,
      });
      await refreshShipments?.();
      toast.success("پرونده محموله V2 ایجاد شد.");
      navigate(`/shipments/${response.shipment.id}/v2`);
    } catch (error) {
      console.error("Create Shipment V2 failed", error);
      toast.error("ایجاد پرونده V2 ناموفق بود.");
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
                <select
                  id="shipment-v2-customer"
                  data-testid="shipment-v2-customer"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/50"
                  value={state.customerId}
                  onChange={(event) => updateField("customerId", event.target.value)}
                  disabled={customersResource.isLoading}
                >
                  <option value="">{customersResource.isLoading ? "در حال بارگذاری..." : "انتخاب مشتری"}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name || customer.company || customer.id}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.customerId} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shipment-v2-tracking" className="text-xs font-bold text-muted-foreground">
                  شماره رهگیری
                </Label>
                <Input
                  id="shipment-v2-tracking"
                  data-testid="shipment-v2-tracking"
                  className="h-10 text-xs"
                  value={state.trackingNumber}
                  onChange={(event) => updateField("trackingNumber", event.target.value)}
                  placeholder="در صورت خالی بودن خودکار ساخته می‌شود"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shipment-v2-title" className="text-xs font-bold text-muted-foreground">
                  عنوان محموله
                </Label>
                <Input
                  id="shipment-v2-title"
                  data-testid="shipment-v2-title"
                  className="h-10 text-xs"
                  value={state.shipmentTitle}
                  onChange={(event) => updateField("shipmentTitle", event.target.value)}
                />
                <FieldError message={errors.shipmentTitle} />
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
