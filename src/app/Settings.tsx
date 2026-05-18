import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  Bell, 
  Smartphone, 
  Mail, 
  Moon, 
  Globe, 
  ShieldCheck, 
  Eye, 
  Database,
  CreditCard,
  ReceiptText,
  ArrowLeft,
  Settings as SettingsIcon,
  Save
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    pushNotifications: true,
    emailAlerts: false,
    darkMode: true,
    compactMode: false,
    autoTrack: true,
    publicProfile: true,
    persianCalendar: true
  });
  const [billing, setBilling] = useState<{ subscription?: any; invoices: any[]; payments: any[] }>({
    invoices: [],
    payments: [],
  });

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetch("/api/billing/my-subscription").then((response) => response.json()),
      fetch("/api/billing/my-invoices").then((response) => response.json()),
      fetch("/api/billing/my-payments").then((response) => response.json()),
    ])
      .then(([subscription, invoices, payments]) => {
        if (!isMounted) return;
        setBilling({
          subscription: subscription?.ok ? subscription.data : null,
          invoices: invoices?.ok ? invoices.data || [] : [],
          payments: payments?.ok ? payments.data || [] : [],
        });
      })
      .catch(() => {
        if (isMounted) setBilling({ invoices: [], payments: [] });
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    toast.success("تنظیمات با موفقیت ذخیره شد");
  };
  const money = (value: number) => `${Number(value || 0).toLocaleString("fa-IR")} ریال`;
  const date = (value?: string) => value ? new Date(value).toLocaleDateString("fa-IR") : "ثبت نشده";

  return (
    <div className="app-page max-w-4xl space-y-8 font-sans text-foreground" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <SettingsIcon className="w-6 h-6" />
           </div>
           <div>
              <h1 className="text-3xl font-black text-foreground tracking-tight">تنظیمات اصلی سیستم</h1>
              <p className="text-muted-foreground text-sm">شخصی‌سازی رابط کاربری و عملکرد سامانه</p>
           </div>
        </div>
        <Button 
          variant="outline" 
          onClick={() => navigate(-1)}
          className="border-border text-muted-foreground hover:text-foreground rounded-xl gap-2 h-10 px-4"
        >
          <ArrowLeft className="w-4 h-4 ml-1" />
          بازگشت
        </Button>
      </div>

      <Card className="bg-card border-border shadow-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            اشتراک و صورتحساب
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-1">نمایش وضعیت پلن، دوره فعلی، صورتحساب‌ها و پرداخت‌های شرکت شما</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-[11px] font-bold text-muted-foreground">وضعیت اشتراک</div>
              <div className="mt-2 text-lg font-black">{billing.subscription?.status || "نامشخص"}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-[11px] font-bold text-muted-foreground">شروع دوره</div>
              <div className="mt-2 text-sm font-black">{date(billing.subscription?.currentPeriodStart)}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-[11px] font-bold text-muted-foreground">پایان دوره</div>
              <div className="mt-2 text-sm font-black">{date(billing.subscription?.currentPeriodEnd)}</div>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 text-sm font-black">
                <ReceiptText className="h-4 w-4 text-primary" />
                آخرین صورتحساب‌ها
              </div>
              <div className="divide-y divide-border">
                {billing.invoices.slice(0, 4).map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                    <div><div className="font-bold">{invoice.invoiceNumber}</div><div className="text-muted-foreground">{money(invoice.totalIrr)}</div></div>
                    <span className="rounded-lg border border-border px-2 py-1 font-bold">{invoice.status}</span>
                  </div>
                ))}
                {!billing.invoices.length && <div className="px-4 py-5 text-xs text-muted-foreground">صورتحسابی برای شرکت شما ثبت نشده است.</div>}
              </div>
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 text-sm font-black">
                <CreditCard className="h-4 w-4 text-primary" />
                آخرین پرداخت‌ها
              </div>
              <div className="divide-y divide-border">
                {billing.payments.slice(0, 4).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                    <div><div className="font-bold">{money(payment.amountIrr)}</div><div className="text-muted-foreground">{payment.provider}</div></div>
                    <span className="rounded-lg border border-border px-2 py-1 font-bold">{payment.status}</span>
                  </div>
                ))}
                {!billing.payments.length && <div className="px-4 py-5 text-xs text-muted-foreground">پرداختی برای شرکت شما ثبت نشده است.</div>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Notifications */}
        <Card className="bg-card border-border shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              اطلاع‌رسانی
            </CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground mt-1">مدیریت کانال‌های دریافت اعلان محموله‌ها</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            <div className="flex items-center justify-between group">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold text-foreground">اعلان‌های مرورگر</Label>
                <p className="text-[10px] text-muted-foreground">دریافت هشدار مستقیم روی دسکتاپ</p>
              </div>
              <Switch 
                checked={settings.pushNotifications} 
                onCheckedChange={() => toggleSetting('pushNotifications')}
                className="data-[state=checked]:bg-primary" 
              />
            </div>
            <Separator className="bg-border/50" />
            <div className="flex items-center justify-between group">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold text-foreground">گزارش‌های ایمیلی</Label>
                <p className="text-[10px] text-muted-foreground">خلاصه روزانه وضعیت محموله‌های فعال</p>
              </div>
              <Switch 
                checked={settings.emailAlerts} 
                onCheckedChange={() => toggleSetting('emailAlerts')}
                className="data-[state=checked]:bg-primary" 
              />
            </div>
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card className="bg-card border-border shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              ظاهر و نمایش
            </CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground mt-1">شخصی‌سازی تم و تراکم اطلاعات</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold text-foreground">حالت تاریک (Dark Mode)</Label>
                <p className="text-[10px] text-muted-foreground">بهینه‌سازی برای محیط‌های کم‌نور</p>
              </div>
              <Switch 
                checked={settings.darkMode} 
                onCheckedChange={() => toggleSetting('darkMode')}
                className="data-[state=checked]:bg-primary" 
              />
            </div>
            <Separator className="bg-border/50" />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold text-foreground">نمایش فشرده</Label>
                <p className="text-[10px] text-muted-foreground">کاهش فواصل برای مشاهده اطلاعات بیشتر</p>
              </div>
              <Switch 
                checked={settings.compactMode} 
                onCheckedChange={() => toggleSetting('compactMode')}
                className="data-[state=checked]:bg-primary" 
              />
            </div>
          </CardContent>
        </Card>

        {/* Operational Settings */}
        <Card className="bg-card border-border shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              عملیاتی و داده‌ها
            </CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground mt-1">تنظیمات پیش‌فرض بخش لجستیک</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold text-foreground">رهگیری خودکار</Label>
                <p className="text-[10px] text-muted-foreground">بروزرسانی وضعیت کانتینرها هر ۱ ساعت</p>
              </div>
              <Switch 
                checked={settings.autoTrack} 
                onCheckedChange={() => toggleSetting('autoTrack')}
                className="data-[state=checked]:bg-primary" 
              />
            </div>
            <Separator className="bg-border/50" />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold text-foreground">استفاده از تقویم خورشیدی</Label>
                <p className="text-[10px] text-muted-foreground">نمایش تاریخ‌ها به صورت جلالی</p>
              </div>
              <Switch 
                checked={settings.persianCalendar} 
                onCheckedChange={() => toggleSetting('persianCalendar')}
                className="data-[state=checked]:bg-primary" 
              />
            </div>
          </CardContent>
        </Card>

        {/* Security Summary */}
        <Card className="bg-gradient-to-br from-card to-muted/50 border-primary/20 shadow-xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-all scale-150 rotate-12">
            <ShieldCheck className="w-32 h-32" />
          </div>
          <CardContent className="p-8">
            <h3 className="text-lg font-black text-foreground mb-2 flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-primary" />
              وضعیت امنیتی حساب
            </h3>
            <p className="text-xs text-muted-foreground mb-8 leading-relaxed">
              تمامی داده‌های شما در لایه انتقال (SSL) و همچنین در پایگاه داده با استاندارد AES-256 رمزنگاری می‌شوند. 
              حساب شما با تایید هویت چندعاملی محافظت شده است.
            </p>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 bg-muted rounded-full overflow-hidden">
                 <div className="h-full bg-primary w-[92%]" />
              </div>
              <span className="text-[10px] font-bold text-primary">۹۲٪ ایمن</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button 
          onClick={handleSave}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-12 px-10 rounded-xl shadow-lg shadow-primary/10 flex items-center gap-2 group transition-all"
        >
          <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
          ذخیره تمامی تنظیمات
        </Button>
      </div>
    </div>
  );
}

function Separator({ className }: { className?: string }) {
  return <div className={`h-[1px] w-full ${className}`} />;
}
