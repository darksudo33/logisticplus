import React from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "@/src/store/useAppStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Mail, Phone, MapPin, Calendar, Ship, Package, CheckCircle2, Clock, AlertCircle, StickyNote } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { isShipmentTerminalStatus, shipmentStatusLabel } from "@/src/shared/shipment-statuses.js";

const StatusBadge = ({ status }: { status: string }) => {
  const configs: Record<string, string> = {
    LOADING: "bg-slate-500/10 text-slate-600 dark:text-slate-500 border-slate-500/20",
    IN_TRANSIT: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-500 border-indigo-500/20",
    ARRIVED: "bg-purple-500/10 text-purple-600 dark:text-purple-500 border-purple-500/20",
    KOOTAJ_DONE: "bg-orange-500/10 text-orange-600 dark:text-orange-500 border-orange-500/20",
    EXITED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20",
  };

  const className = configs[status] || "bg-slate-500/10 text-slate-600 dark:text-slate-500 border-slate-500/20";

  return (
    <Badge variant="outline" className={cn("px-2 py-0 text-[10px] font-bold rounded-full border", className)}>
      {shipmentStatusLabel(status)}
    </Badge>
  );
};

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const customers = useAppStore(state => state.customers);
  const shipments = useAppStore(state => state.shipments);
  const currentUser = useAppStore(state => state.currentUser);
  const [remoteShipments, setRemoteShipments] = React.useState<any[]>([]);
  const canManageCustomers = currentUser?.role === "CEO" || currentUser?.role === "MANAGER";

  React.useEffect(() => {
    let isActive = true;
    async function loadCustomerShipments() {
      if (!id) return;
      try {
        const response = await fetch(`/api/customers/${id}/shipments`, { credentials: "include" });
        const json = await response.json();
        if (isActive && json.ok) setRemoteShipments(json.data || []);
      } catch {
        if (isActive) setRemoteShipments([]);
      }
    }
    loadCustomerShipments();
    return () => {
      isActive = false;
    };
  }, [id]);

  if (currentUser && !canManageCustomers) {
    return <Navigate to="/dashboard" replace />;
  }

  const customer = customers.find(c => c.id === id && !c.isArchived);
  const customerShipments = remoteShipments.length > 0 ? remoteShipments : shipments.filter(s => s.customerId === id);

  if (!customer) {
    return (
      <div className="p-10 text-center">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground">مشتری مورد نظر یافت نشد</h2>
        <Button 
          variant="link" 
          onClick={() => navigate("/customers")}
          className="text-primary mt-4"
        >
          بازگشت به لیست مشتریان
        </Button>
      </div>
    );
  }

  const activeShipments = customerShipments.filter(s => !isShipmentTerminalStatus(s.status) && !s.isArchived && !s.isExitedArchived);
  const canViewPrivateDetails = canManageCustomers && customer.canViewPrivateDetails !== false;
  const displayCustomerCode = customer.customerCode || customer.code || customer.id;
  const phoneNumbers = customer.phoneNumbers?.length
    ? customer.phoneNumbers
    : customer.phone
      ? [{ phoneNumber: customer.phone, phoneLabel: "اصلی", isPrimary: true }]
      : [];

  return (
    <div className="app-page space-y-6 text-foreground">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate("/customers")}
          className="h-9 w-9 bg-muted text-muted-foreground hover:text-foreground rounded-xl"
        >
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{customer.name}</h1>
          <p className="text-[12px] text-muted-foreground">{customer.company}</p>
          <p className="text-[11px] font-mono font-black text-primary" dir="ltr">{displayCustomerCode}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Information Card */}
        {canViewPrivateDetails ? <Card className="bg-card border-border rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-foreground">اطلاعات تماس و آدرس</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
              <Mail className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground font-bold uppercase">ایمیل</span>
                <span className="text-xs text-foreground" dir="ltr">{customer.email || "ثبت نشده"}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
              <Phone className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground font-bold uppercase">تلفن تماس</span>
                <span className="text-xs text-foreground" dir="ltr">{customer.phone || "ثبت نشده"}</span>
              </div>
            </div>
            {phoneNumbers.length > 1 ? (
              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                <Phone className="w-4 h-4 text-primary mt-1" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">همه شماره‌ها</span>
                  <div className="mt-1 grid gap-1">
                    {phoneNumbers.map((phone, index) => (
                      <span key={`${phone.phoneNumber}-${index}`} className="text-xs text-foreground" dir="ltr">
                        {phone.phoneNumber}
                        {phone.phoneLabel ? <span dir="rtl"> ({phone.phoneLabel})</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
              <MapPin className="w-4 h-4 text-primary mt-1" />
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground font-bold uppercase">آدرس</span>
                <span className="text-xs text-foreground leading-relaxed">{customer.address || "ثبت نشده"}</span>
              </div>
            </div>
            {customer.notes ? (
              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                <StickyNote className="w-4 h-4 text-primary mt-1" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">یادداشت داخلی</span>
                  <span className="text-xs text-foreground leading-relaxed">{customer.notes}</span>
                </div>
              </div>
            ) : null}
            {customer.referrer ? (
              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                <StickyNote className="w-4 h-4 text-primary mt-1" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">معرف</span>
                  <span className="text-xs text-foreground leading-relaxed">{customer.referrer}</span>
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
              <Calendar className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground font-bold uppercase">عضویت از</span>
                <span className="text-xs text-foreground">{customer.createdAt}</span>
              </div>
            </div>
          </CardContent>
        </Card> : null}

        {/* Statistics Summary */}
        <div className={cn(canViewPrivateDetails ? "lg:col-span-2" : "lg:col-span-3", "grid grid-cols-1 md:grid-cols-3 gap-4")}>
          <Card className="bg-card border-border rounded-2xl shadow-none p-5 flex flex-col items-center justify-center text-center">
             <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-3">
               <Package className="w-6 h-6 text-blue-500" />
             </div>
             <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">کل محموله‌ها</span>
             <span className="text-3xl font-black text-foreground">{customerShipments.length}</span>
          </Card>
          
          <Card className="bg-card border-border rounded-2xl shadow-none p-5 flex flex-col items-center justify-center text-center">
             <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-3">
               <CheckCircle2 className="w-6 h-6 text-emerald-500" />
             </div>
             <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">تحویل شده</span>
             <span className="text-3xl font-black text-foreground">{customerShipments.filter(s => s.status === "EXITED").length}</span>
          </Card>

          <Card className="bg-primary border-none rounded-2xl shadow-lg p-5 flex flex-col items-center justify-center text-center">
             <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
               <Clock className="w-6 h-6 text-primary-foreground" />
             </div>
             <span className="text-[10px] font-black text-primary-foreground/70 uppercase tracking-widest mb-1">محموله فعال</span>
             <span className="text-3xl font-black text-primary-foreground">{activeShipments.length}</span>
          </Card>

          {/* Active Shipments List */}
          <Card className="md:col-span-3 bg-card border-border rounded-2xl shadow-none overflow-hidden">
            <CardHeader className="border-b border-border py-4">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <Ship className="w-4 h-4 text-primary" />
                محموله‌های فعال و در جریان
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="px-5 py-4 font-medium text-muted-foreground">شناسه / رهگیری</th>
                      <th className="px-5 py-4 font-medium text-muted-foreground">مسیر (مبدا - مقصد)</th>
                      <th className="px-5 py-4 font-medium text-muted-foreground">وضعیت فعلی</th>
                      <th className="px-5 py-4 font-medium text-muted-foreground">تحویل تخمینی</th>
                      <th className="px-5 py-4 font-medium text-muted-foreground">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeShipments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-20 text-center text-muted-foreground">
                          هیچ محموله فعالی در حال حاضر وجود ندارد.
                        </td>
                      </tr>
                    ) : (
                      activeShipments.map((shipment) => (
                        <tr key={shipment.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-foreground">#{shipment.trackingNumber}</span>
                              <span className="text-[10px] text-muted-foreground font-mono italic">Container: {shipment.containerNumber}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{shipment.origin}</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground/50 rotate-180" />
                              <span className="text-primary font-bold">{shipment.destination}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge status={shipment.status} />
                          </td>
                          <td className="px-5 py-4 text-muted-foreground font-medium">
                            {shipment.estimatedDelivery}
                          </td>
                          <td className="px-5 py-4">
                            <Button 
                              variant="outline" 
                              className="border-border hover:bg-muted text-muted-foreground hover:text-primary text-[10px] h-7 px-3 rounded-lg"
                              onClick={() => navigate(`/shipments/${shipment.id}`)}
                            >
                              مشاهده جزئیات
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
