import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shipmentApi } from "@/src/lib/shipmentApi";
import { shipmentV2Api } from "@/src/lib/shipmentV2Api";
import { useAppStore } from "@/src/store/useAppStore";
import type { Customer, Shipment } from "@/src/types";

type ShipmentEditFormData = {
  customerId: string;
  trackingNumber: string;
  origin: string;
  destination: string;
  dischargePort: string;
};

const formFromShipment = (shipment: Shipment): ShipmentEditFormData => ({
  customerId: shipment.customerId || "",
  trackingNumber: shipment.trackingNumber || "",
  origin: shipment.origin || "",
  destination: shipment.deliveryPort || shipment.destination || "",
  dischargePort: shipment.dischargePort || "",
});

const customerLabel = (customer: Customer) => {
  const name = customer.company || customer.name || customer.customerCode || customer.code || customer.id;
  const code = customer.customerCode || customer.code;
  return code && code !== name ? `${name} — ${code}` : name;
};

export function ShipmentEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useAppStore((state) => state.currentUser);
  const customers = useAppStore((state) => state.customers);
  const refreshCustomers = useAppStore((state) => state.refreshCustomers);
  const [shipment, setShipment] = React.useState<Shipment | null>(null);
  const [formData, setFormData] = React.useState<ShipmentEditFormData>({
    customerId: "",
    trackingNumber: "",
    origin: "",
    destination: "",
    dischargePort: "",
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    if (!id) return;
    setIsLoading(true);
    shipmentApi.get(id)
      .then((loaded) => {
        if (!isMounted) return;
        setShipment(loaded);
        setFormData(formFromShipment(loaded));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "بارگذاری محموله ناموفق بود.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [id]);

  React.useEffect(() => {
    if (!currentUser || customers.length > 0) return;
    void refreshCustomers().catch(() => {
      toast.error("بارگذاری مشتری‌ها ناموفق بود.");
    });
  }, [currentUser, customers.length, refreshCustomers]);

  const close = () => navigate(shipment ? `/shipments/${shipment.id}` : "/shipments");

  const saveShipment = async () => {
    if (!shipment) return;
    setIsSaving(true);
    try {
      const customerChanged = Boolean(formData.customerId) && formData.customerId !== shipment.customerId;
      if (shipment.hasV2Profile) {
        const profile = await shipmentV2Api.get(shipment.id);
        const base = profile.profile?.sections.base || {};
        await shipmentV2Api.updateSection(shipment.id, "base", {
          ...base,
          trackingNumber: formData.trackingNumber,
          origin: formData.origin,
          deliveryPort: formData.destination,
          dischargePort: formData.dischargePort,
        });
        if (customerChanged) {
          await shipmentApi.updateOperationalFields(shipment.id, {
            customerId: formData.customerId,
          });
        }
      } else {
        await shipmentApi.updateOperationalFields(shipment.id, {
          customerId: formData.customerId || undefined,
          trackingNumber: formData.trackingNumber,
          origin: formData.origin,
          destination: formData.destination,
          dischargePort: formData.dischargePort,
        });
      }
      toast.success("محموله بروزرسانی شد.");
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره محموله ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  };

  if (currentUser && !currentUser.permissions?.includes("shipments.update") && !currentUser.permissions?.includes("platform.admin")) {
    return (
      <div className="app-page flex min-h-[360px] flex-col items-center justify-center gap-3 text-center" dir="rtl">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-black text-foreground">ویرایش محموله فقط برای مدیر ارشد و مدیر عملیات فعال است.</p>
        <Button variant="outline" onClick={() => navigate(id ? `/shipments/${id}` : "/shipments")}>بازگشت</Button>
      </div>
    );
  }

  return (
    <div className="app-page min-h-[calc(100vh-6rem)]" dir="rtl">
      <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="max-w-lg rounded-2xl border-border bg-card" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-black">ویرایش اطلاعات اصلی محموله</DialogTitle>
            <DialogDescription className="text-xs font-bold">
              فقط مشتری، شماره رهگیری، مبدا، مقصد و محل تخلیه قابل تغییر است.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <p className="py-8 text-center text-sm font-bold text-muted-foreground">در حال بارگذاری...</p>
          ) : !shipment ? (
            <div className="py-8 text-center">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-bold text-muted-foreground">محموله مورد نظر یافت نشد.</p>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void saveShipment();
              }}
            >
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-muted-foreground">مشتری</Label>
                <select
                  value={formData.customerId}
                  onChange={(event) => setFormData((current) => ({ ...current, customerId: event.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-bold text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="shipment-edit-customer-select"
                >
                  <option value="" disabled>انتخاب مشتری</option>
                  {customers
                    .filter((customer) => !customer.isArchived || customer.id === formData.customerId)
                    .map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customerLabel(customer)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-muted-foreground">شماره رهگیری</Label>
                <Input
                  value={formData.trackingNumber}
                  onChange={(event) => setFormData((current) => ({ ...current, trackingNumber: event.target.value }))}
                  dir="ltr"
                  className="h-10 font-mono text-sm"
                  data-testid="shipment-edit-tracking-number-input"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-black text-muted-foreground">مبدا</Label>
                  <Input
                    value={formData.origin}
                    onChange={(event) => setFormData((current) => ({ ...current, origin: event.target.value }))}
                    className="h-10 text-sm"
                    data-testid="shipment-edit-origin-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black text-muted-foreground">مقصد</Label>
                  <Input
                    value={formData.destination}
                    onChange={(event) => setFormData((current) => ({ ...current, destination: event.target.value }))}
                    className="h-10 text-sm"
                    data-testid="shipment-edit-destination-input"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-black text-muted-foreground">محل تخلیه</Label>
                  <Input
                    value={formData.dischargePort}
                    onChange={(event) => setFormData((current) => ({ ...current, dischargePort: event.target.value }))}
                    className="h-10 text-sm"
                    data-testid="shipment-edit-discharge-port-input"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <Button type="button" variant="outline" onClick={close} disabled={isSaving}>
                  <X className="ml-1 h-4 w-4" />
                  انصراف
                </Button>
                <Button type="submit" disabled={isSaving} data-testid="shipment-edit-save">
                  <Save className="ml-1 h-4 w-4" />
                  ذخیره
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
