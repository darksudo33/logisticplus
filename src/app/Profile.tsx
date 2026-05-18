import React, { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, Camera, Check, Lock, Mail, MapPin, Phone, ShieldCheck, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMockStore } from "@/src/store/useMockStore";

type NotificationKey = "shipmentUpdates" | "taskDeadlines" | "chatMessages";

const defaultNotificationPreferences: Record<NotificationKey, boolean> = {
  shipmentUpdates: true,
  taskDeadlines: true,
  chatMessages: true,
};

const normalizeUser = (user: any) => ({
  ...user,
  isOnline: user.isOnline ?? user.is_online ?? false,
  twoFactorEnabled: user.twoFactorEnabled ?? user.two_factor_enabled ?? false,
  notificationPreferences: user.notificationPreferences ?? user.notification_preferences ?? {},
});

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const currentUser = useMockStore((state) => state.currentUser);
  const updateCurrentUser = useMockStore((state) => state.updateCurrentUser);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialPreferences = useMemo(
    () => ({
      ...defaultNotificationPreferences,
      ...(currentUser?.notificationPreferences || {}),
    }),
    [currentUser?.notificationPreferences]
  );

  const [profileForm, setProfileForm] = useState({
    name: currentUser?.name || "",
    email: currentUser?.email || "",
    avatar: currentUser?.avatar || "",
    phone: currentUser?.phone || "",
    location: currentUser?.location || "",
    bio: currentUser?.bio || "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(currentUser?.twoFactorEnabled));
  const [notificationPreferences, setNotificationPreferences] = useState(initialPreferences);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("لطفا یک فایل تصویری انتخاب کنید.");
      return;
    }

    const avatar = await readFileAsDataUrl(file);
    setProfileForm((previous) => ({ ...previous, avatar }));
    toast.success("تصویر انتخاب شد. برای ثبت نهایی، پروفایل را ذخیره کنید.");
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileForm.name.trim()) {
      toast.error("نام و نام خانوادگی الزامی است.");
      return;
    }

    setSavingProfile(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Profile save failed.");

      updateCurrentUser(normalizeUser(payload.data));
      toast.success("پروفایل با موفقیت ذخیره شد.");
    } catch (error) {
      toast.error("ذخیره پروفایل انجام نشد.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordForm.newPassword.length < 8) {
      toast.error("رمز عبور جدید باید حداقل ۸ کاراکتر باشد.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("تکرار رمز عبور با رمز جدید یکسان نیست.");
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Password save failed.");

      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("رمز عبور با موفقیت تغییر کرد.");
    } catch (error) {
      toast.error("تغییر رمز عبور انجام نشد. رمز فعلی را بررسی کنید.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSecuritySave = async () => {
    setSavingSecurity(true);
    try {
      const response = await fetch("/api/profile/security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twoFactorEnabled }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Security save failed.");

      updateCurrentUser(normalizeUser(payload.data));
      toast.success("تنظیمات امنیتی ذخیره شد.");
    } catch (error) {
      toast.error("ذخیره تنظیمات امنیتی انجام نشد.");
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleNotificationsSave = async () => {
    setSavingNotifications(true);
    try {
      const response = await fetch("/api/profile/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: notificationPreferences }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Notification save failed.");

      updateCurrentUser(normalizeUser(payload.data));
      toast.success("تنظیمات اعلان‌ها ذخیره شد.");
    } catch (error) {
      toast.error("ذخیره اعلان‌ها انجام نشد.");
    } finally {
      setSavingNotifications(false);
    }
  };

  const notificationItems: Array<{ key: NotificationKey; title: string; description: string }> = [
    { key: "shipmentUpdates", title: "تغییر وضعیت محموله‌ها", description: "اعلان هنگام تغییر مرحله یا وضعیت بار" },
    { key: "taskDeadlines", title: "مهلت وظایف", description: "یادآوری برای کارهایی که به موعد نزدیک می‌شوند" },
    { key: "chatMessages", title: "پیام‌های چت", description: "اعلان پیام‌های داخلی و گروهی" },
  ];

  return (
    <div className="app-page max-w-5xl space-y-6 pb-24 text-foreground" dir="rtl">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-black tracking-tight">پروفایل کاربری</h1>
        <p className="text-sm font-medium text-muted-foreground">
          اطلاعات حساب، امنیت ورود و اعلان‌های خود را مدیریت کنید.
        </p>
      </div>

      <Card className="rounded-xl border-border bg-card">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative rounded-full"
              aria-label="انتخاب تصویر پروفایل"
            >
              <Avatar className="h-20 w-20 border border-border">
                <AvatarImage src={profileForm.avatar} className="object-cover" />
                <AvatarFallback className="bg-primary/10 text-xl font-black text-primary">
                  {(profileForm.name || "U")[0]}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 left-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm">
                <Camera className="h-4 w-4" />
              </span>
            </button>
            <div>
              <h2 className="text-lg font-black">{profileForm.name || currentUser?.name}</h2>
              <p className="text-xs font-bold text-muted-foreground">{currentUser?.role}</p>
              <p className="mt-1 text-xs text-muted-foreground">{profileForm.email}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            تغییر تصویر
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="profile" className="gap-4" style={{ flexDirection: "column" }}>
        <TabsList className="w-fit flex-none gap-1.5 rounded-xl bg-muted p-1.5" style={{ height: 48 }}>
          <TabsTrigger value="profile" className="min-w-28 flex-none gap-2 rounded-lg px-4 py-2 font-bold" style={{ height: 36 }}>
            <User className="h-4 w-4" />
            اطلاعات
          </TabsTrigger>
          <TabsTrigger value="security" className="min-w-28 flex-none gap-2 rounded-lg px-4 py-2 font-bold" style={{ height: 36 }}>
            <Lock className="h-4 w-4" />
            امنیت
          </TabsTrigger>
          <TabsTrigger value="notifications" className="min-w-28 flex-none gap-2 rounded-lg px-4 py-2 font-bold" style={{ height: 36 }}>
            <Bell className="h-4 w-4" />
            اعلان‌ها
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="rounded-xl border-border bg-card">
            <CardHeader>
              <CardTitle>اطلاعات اصلی</CardTitle>
              <CardDescription>این اطلاعات در حساب شما ذخیره می‌شود.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSave} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="نام و نام خانوادگی" icon={<User className="h-4 w-4" />}>
                    <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
                  </Field>
                  <Field label="ایمیل" icon={<Mail className="h-4 w-4" />}>
                    <Input value={profileForm.email} disabled />
                  </Field>
                  <Field label="شماره تماس" icon={<Phone className="h-4 w-4" />}>
                    <Input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} dir="ltr" />
                  </Field>
                  <Field label="موقعیت" icon={<MapPin className="h-4 w-4" />}>
                    <Input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} />
                  </Field>
                </div>
                <div className="space-y-2">
                  <Label>بیوگرافی</Label>
                  <textarea
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                    className="min-h-28 w-full rounded-lg border border-input bg-muted/40 p-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/35"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingProfile} className="min-w-36 gap-2">
                    {savingProfile ? (
                      <ActionSkeleton inverted className="w-28" />
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        ذخیره پروفایل
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="rounded-xl border-border bg-card">
              <CardHeader>
                <CardTitle>تغییر رمز عبور</CardTitle>
                <CardDescription>رمز جدید باید حداقل ۸ کاراکتر باشد.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordSave} className="space-y-4">
                  <Input type="password" placeholder="رمز عبور فعلی" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
                  <Input type="password" placeholder="رمز عبور جدید" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
                  <Input type="password" placeholder="تکرار رمز عبور جدید" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
                  <Button type="submit" disabled={savingPassword} className="w-full">
                    {savingPassword ? <ActionSkeleton inverted className="w-32" /> : "تغییر رمز عبور"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border bg-card">
              <CardHeader>
                <CardTitle>امنیت ورود</CardTitle>
                <CardDescription>تنظیمات امنیتی حساب کاربری.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-black">تایید دو مرحله‌ای</p>
                      <p className="text-xs text-muted-foreground">وضعیت این گزینه در حساب ذخیره می‌شود.</p>
                    </div>
                  </div>
                  <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
                </div>
                <Button onClick={handleSecuritySave} disabled={savingSecurity} className="w-full">
                  {savingSecurity ? <ActionSkeleton inverted className="w-28" /> : "ذخیره امنیت"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="rounded-xl border-border bg-card">
            <CardHeader>
              <CardTitle>تنظیمات اعلان‌ها</CardTitle>
              <CardDescription>انتخاب کنید چه اعلان‌هایی برای شما فعال باشد.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationItems.map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4">
                  <div>
                    <p className="text-sm font-black">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch
                    checked={notificationPreferences[item.key]}
                    onCheckedChange={(checked) =>
                      setNotificationPreferences((previous) => ({ ...previous, [item.key]: checked }))
                    }
                  />
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <Button onClick={handleNotificationsSave} disabled={savingNotifications}>
                  {savingNotifications ? <ActionSkeleton inverted className="w-32" /> : "ذخیره اعلان‌ها"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-xs font-black text-muted-foreground">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}
