import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ChevronRight, 
  Save, 
  X, 
  Ship, 
  MapPin, 
  Calendar, 
  Hash,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shipmentApi } from "@/src/lib/shipmentApi";
import { shipmentFormTemplatesApi, type ShipmentTypeOption } from "@/src/lib/shipmentFormTemplatesApi";
import { SHIPMENT_STATUS_OPTIONS } from "@/src/shared/shipment-statuses.js";
import { Shipment, ShipmentStatus } from "@/src/types";
import { toast } from "sonner";

type ShipmentEditFormData = {
  shipmentTypeCode: string;
  shipmentDirection: NonNullable<Shipment["shipmentDirection"]>;
  transportMode: Exclude<Shipment["transportMode"], undefined>;
  trackingNumber: string;
  containerNumber: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  estimatedDelivery: string;
  freeTimeDays: number;
};

export function ShipmentEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shipmentTypes, setShipmentTypes] = useState<ShipmentTypeOption[]>([]);

  const [formData, setFormData] = useState<ShipmentEditFormData>({
    shipmentTypeCode: "IMPORT_SEA_CONTAINER",
    shipmentDirection: "import",
    transportMode: "sea",
    trackingNumber: "",
    containerNumber: "",
    origin: "",
    destination: "",
    status: "" as ShipmentStatus,
    estimatedDelivery: "",
    freeTimeDays: 0
  });

  useEffect(() => {
    let isMounted = true;
    if (!id) return;
    setIsLoading(true);
    shipmentApi.get(id)
      .then((loaded) => {
        if (!isMounted) return;
        setShipment(loaded);
      setFormData({
          shipmentTypeCode: loaded.shipmentTypeCode || "IMPORT_SEA_CONTAINER",
          shipmentDirection: loaded.shipmentDirection || "import",
          transportMode: loaded.transportMode || "sea",
          trackingNumber: loaded.trackingNumber,
          containerNumber: loaded.containerNumber,
          origin: loaded.origin,
          destination: loaded.destination,
          status: loaded.status,
          estimatedDelivery: loaded.estimatedDelivery,
          freeTimeDays: loaded.freeTimeDays
      });
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

  useEffect(() => {
    let isMounted = true;
    shipmentFormTemplatesApi.listTypes()
      .then((loaded) => {
        if (isMounted) setShipmentTypes(loaded);
      })
      .catch((error) => {
        console.error("Shipment types failed:", error);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return <div className="app-page text-sm text-muted-foreground">در حال بارگذاری...</div>;
  }

  if (!shipment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">محموله مورد نظر یافت نشد.</p>
        <Button variant="outline" onClick={() => navigate("/shipments")}>
          بازگشت به لیست محموله‌ها
        </Button>
      </div>
    );
  }

  const saveShipment = async () => {
    const selectedType = shipmentTypes.find((type) => type.code === formData.shipmentTypeCode);
    try {
      const updated = await shipmentApi.updateOperationalFields(shipment.id, {
        ...formData,
        shipmentDirection: selectedType?.direction || formData.shipmentDirection,
        transportMode: selectedType?.transportMode || formData.transportMode,
      });
      setShipment(updated);
      toast.success("محموله بروزرسانی شد.");
      navigate(`/shipments/${shipment.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره محموله ناموفق بود.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void saveShipment();
  };

  const statusOptions = SHIPMENT_STATUS_OPTIONS as { value: ShipmentStatus; label: string }[];
  const selectedType = shipmentTypes.find((type) => type.code === formData.shipmentTypeCode) || null;

  return (
    <div className="app-page space-y-6 text-foreground" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground overflow-x-auto whitespace-nowrap pb-1">
          <span className="cursor-pointer hover:text-foreground" onClick={() => navigate("/dashboard")}>پنل مدیریت</span>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="cursor-pointer hover:text-foreground" onClick={() => navigate("/shipments")}>محموله‌ها</span>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-foreground font-bold">ویرایش {shipment.trackingNumber}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex-1 sm:flex-none h-10 border-border hover:bg-accent text-xs px-4 rounded-xl" onClick={() => navigate(`/shipments/${shipment.id}`)}>
            <X className="w-3.5 h-3.5 ml-2" />
            انصراف
          </Button>
          <Button className="flex-1 sm:flex-none h-10 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 rounded-xl" onClick={() => void saveShipment()}>
            <Save className="w-3.5 h-3.5 ml-2" />
            ذخیره
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card border-border rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="border-b border-border p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Save className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-foreground">ویرایش اطلاعات پایه</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">مشخصات اصلی و رهگیری محموله را در این بخش ویرایش کنید</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground pr-1 flex items-center gap-2">
                      <Hash className="w-3 h-3 text-primary" />
                      شماره رهگیری (Tracking Number)
                    </Label>
                    <Input 
                      className="bg-background border-border h-11 text-sm focus:ring-primary font-mono text-left" 
                      value={formData.trackingNumber}
                      onChange={e => setFormData({...formData, trackingNumber: e.target.value})}
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground pr-1 flex items-center gap-2">
                      <Ship className="w-3 h-3 text-primary" />
                      شماره کانتینر
                    </Label>
                    <Input 
                      className="bg-background border-border h-11 text-sm focus:ring-primary font-mono text-left" 
                      value={formData.containerNumber}
                      onChange={e => setFormData({...formData, containerNumber: e.target.value})}
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground pr-1 flex items-center gap-2">
                      <MapPin className="w-3 h-3 text-primary" />
                      مبدا
                    </Label>
                    <Input 
                      className="bg-background border-border h-11 text-sm focus:ring-primary" 
                      value={formData.origin}
                      onChange={e => setFormData({...formData, origin: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground pr-1 flex items-center gap-2">
                      <MapPin className="w-3 h-3 text-primary" />
                      مقصد
                    </Label>
                    <Input 
                      className="bg-background border-border h-11 text-sm focus:ring-primary" 
                      value={formData.destination}
                      onChange={e => setFormData({...formData, destination: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground pr-1 flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-primary" />
                      تاریخ تقریبی تحویل
                    </Label>
                    <Input 
                      type="date"
                      className="bg-background border-border h-11 text-sm focus:ring-primary" 
                      value={formData.estimatedDelivery}
                      onChange={e => setFormData({...formData, estimatedDelivery: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground pr-1 flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-primary" />
                      تعداد روزهای فری تایم
                    </Label>
                    <Input 
                      type="number"
                      className="bg-background border-border h-11 text-sm focus:ring-primary" 
                      value={formData.freeTimeDays}
                      onChange={e => setFormData({...formData, freeTimeDays: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-card border-border rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="border-b border-border p-6">
              <CardTitle className="text-sm font-bold text-foreground">وضعیت محموله</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground pr-1">وضعیت فعلی</Label>
                  <select 
                    className="w-full bg-background border border-border rounded-xl h-11 text-xs px-3 focus:ring-1 focus:ring-primary outline-none text-foreground"
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value as ShipmentStatus})}
                  >
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground pr-1">نوع محموله</Label>
                  <select
                    className="w-full bg-background border border-border rounded-xl h-11 text-xs px-3 focus:ring-1 focus:ring-primary outline-none text-foreground"
                    value={formData.shipmentTypeCode}
                    onChange={e => {
                      const nextType = shipmentTypes.find((type) => type.code === e.target.value);
                      setFormData({
                        ...formData,
                        shipmentTypeCode: e.target.value,
                        shipmentDirection: nextType?.direction || formData.shipmentDirection,
                        transportMode: nextType?.transportMode || formData.transportMode,
                      });
                    }}
                    data-testid="shipment-edit-type-select"
                  >
                    {shipmentTypes.map((type) => (
                      <option key={type.code} value={type.code}>{type.labelFa}</option>
                    ))}
                  </select>
                  {selectedType ? (
                    <p className="text-[10px] font-bold leading-5 text-muted-foreground">{selectedType.description}</p>
                  ) : null}
                </div>
                
                <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 text-center">
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mb-1 italic">قالب فرم</p>
                  <p className="text-[11px] text-muted-foreground">تغییر نوع محموله قالب نمایش و ویرایش را عوض می‌کند، اما داده‌های قبلی کوتاژ و فیلدهای اختصاصی حذف نمی‌شوند.</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-amber-500/5 border-amber-500/20 rounded-3xl overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-600 dark:text-amber-500 mb-1">راهنمای ویرایش</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    تغییر شماره رهگیری باعث به‌روزرسانی کد رهگیری در تمامی بخش‌ها و پنل مشتری خواهد شد. لطفاً قبل از ذخیره، شماره کانتینر را مجدداً چک کنید.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
