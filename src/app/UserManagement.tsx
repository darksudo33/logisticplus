import React, { useEffect, useMemo, useState } from "react";
import { useMockStore } from "../store/useMockStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState, EmptyTableRow, resetFiltersAction } from "@/src/components/EmptyState";
import { User, UserRole } from "../types";
import {
  CheckCircle2,
  Filter,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Search,
  Shield,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";

const roleOptions: { value: UserRole; label: string; tone: string }[] = [
  { value: "CEO", label: "مدیر ارشد", tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  { value: "MANAGER", label: "مدیر عملیات", tone: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { value: "OPERATIONS", label: "کارشناس لجستیک", tone: "bg-primary/10 text-primary" },
  { value: "CUSTOMER_SERVICE", label: "خدمات مشتری", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { value: "FINANCE", label: "امور مالی", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
];

const statusLabels: Record<string, { label: string; tone: string }> = {
  active: { label: "فعال", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  suspended: { label: "تعلیق‌شده", tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  pending: { label: "در انتظار", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

const apiMessage = (code?: string, fallback?: string) => {
  const messages: Record<string, string> = {
    DUPLICATE_EMAIL: "کاربری با این ایمیل قبلا ثبت شده است.",
    PLAN_LIMIT_REACHED: "ظرفیت کاربران این پلن تکمیل شده است.",
    SELF_SUSPEND_BLOCKED: "امکان تعلیق حساب خودتان وجود ندارد.",
    SELF_ROLE_CHANGE_BLOCKED: "امکان تغییر نقش مدیر ارشد خودتان وجود ندارد.",
    FORBIDDEN: "شما دسترسی لازم برای این عملیات را ندارید.",
    VALIDATION_ERROR: "اطلاعات واردشده معتبر نیست.",
  };
  return messages[code || ""] || fallback || "عملیات مدیریت کاربر ناموفق بود.";
};

const roleLabel = (role?: string) => roleOptions.find((item) => item.value === role)?.label || role || "نامشخص";
const roleTone = (role?: string) => roleOptions.find((item) => item.value === role)?.tone || "bg-muted text-muted-foreground";
const userStatus = (user: User) => user.status || "active";
const isActiveUser = (user: User) => userStatus(user) !== "suspended";

const formatDate = (value?: string) => {
  if (!value) return "ثبت نشده";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "ثبت نشده";
  }
};

export default function UserManagement() {
  const users = useMockStore((state) => state.users);
  const currentUser = useMockStore((state) => state.currentUser);
  const loadCurrentUserRecords = useMockStore((state) => state.loadCurrentUserRecords);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [userLimit, setUserLimit] = useState<number | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "OPERATIONS" as UserRole,
  });

  useEffect(() => {
    loadCurrentUserRecords().catch(() => undefined);
    fetch("/api/billing/my-subscription")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.ok) {
          const limit = Number(payload.data?.effectiveLimits?.users || 0);
          setUserLimit(limit > 0 ? limit : null);
        }
      })
      .catch(() => setUserLimit(null));
  }, [loadCurrentUserRecords]);

  const activeUsers = useMemo(() => users.filter(isActiveUser), [users]);
  const suspendedUsers = useMemo(() => users.filter((user) => userStatus(user) === "suspended"), [users]);
  const managementUsers = useMemo(
    () => users.filter((user) => user.role === "CEO" || user.role === "MANAGER"),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !normalizedSearch ||
        user.name.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch);
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      const matchesStatus = statusFilter === "ALL" || userStatus(user) === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);
  const teammateCount = useMemo(() => users.filter((user) => user.id !== currentUser?.id).length, [users, currentUser?.id]);
  const resetUserFilters = () => {
    setSearchTerm("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
  };

  const saveUser = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      throw new Error(apiMessage(payload?.error?.code, payload?.error?.message));
    }
    await loadCurrentUserRecords();
    return payload?.data;
  };

  const resetCreateForm = () => {
    setNewUser({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "OPERATIONS",
    });
  };

  const handleCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password) {
      toast.error("نام، ایمیل و رمز عبور را کامل وارد کنید.");
      return;
    }
    if (newUser.password.length < 8) {
      toast.error("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      return;
    }
    if (newUser.password !== newUser.confirmPassword) {
      toast.error("تکرار رمز عبور با رمز انتخابی یکسان نیست.");
      return;
    }

    setIsSaving(true);
    try {
      await saveUser("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: newUser.name.trim(),
          email: newUser.email.trim(),
          password: newUser.password,
          role: newUser.role,
        }),
      });
      setIsAddUserOpen(false);
      resetCreateForm();
      toast.success("کاربر جدید فعال شد و می‌تواند وارد پنل شرکت شود.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ایجاد کاربر ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRoleChange = async (user: User, nextRole: UserRole) => {
    if (user.role === nextRole) return;
    if (user.id === currentUser?.id && nextRole !== "CEO") {
      toast.error("امکان تغییر نقش مدیر ارشد خودتان وجود ندارد.");
      return;
    }
    setIsSaving(true);
    try {
      await saveUser(`/api/users/${user.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      toast.success("نقش کاربر به‌روزرسانی شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر نقش ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  };

  const openSuspendDialog = (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("امکان تعلیق حساب خودتان وجود ندارد.");
      return;
    }
    setSelectedUser(user);
    setIsSuspendDialogOpen(true);
  };

  const handleSuspendUser = async () => {
    if (!selectedUser) return;
    setIsSaving(true);
    try {
      await saveUser(`/api/users/${selectedUser.id}/suspend`, { method: "POST" });
      toast.success("دسترسی کاربر به پنل شرکت تعلیق شد.");
      setIsSuspendDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعلیق کاربر ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivateUser = async (user: User) => {
    setIsSaving(true);
    try {
      await saveUser(`/api/users/${user.id}/activate`, { method: "POST" });
      toast.success("دسترسی کاربر دوباره فعال شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فعال‌سازی کاربر ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  };

  if (currentUser?.role !== "CEO") {
    return (
      <div className="app-page max-w-3xl font-sans" dir="rtl">
        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-black text-foreground">
              <Shield className="h-5 w-5 text-primary" />
              دسترسی محدود
            </CardTitle>
            <CardDescription className="text-right">
              مدیریت کاربران داخلی فقط برای مدیر ارشد شرکت فعال است.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-page max-w-6xl space-y-5 font-sans" dir="rtl">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between md:p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
            <Users className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">مدیریت پرسنل</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              کاربران داخلی همین شرکت، نقش‌ها و وضعیت دسترسی آن‌ها.
            </p>
          </div>
        </div>

        <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
          <DialogTrigger
            render={(triggerProps) => (
              <Button
                {...triggerProps}
                className="h-10 rounded-xl bg-primary px-5 font-black text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <UserPlus className="ml-2 h-5 w-5" />
                افزودن کاربر جدید
              </Button>
            )}
          />
          <DialogContent className="bg-card text-right text-foreground sm:max-w-[520px]" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-xl font-black">تعریف همکار جدید</DialogTitle>
              <DialogDescription className="text-right text-muted-foreground">
                کاربر پس از ثبت، فعال است و فقط به پنل همین شرکت دسترسی دارد.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground">نام و نام خانوادگی</Label>
                  <Input
                    value={newUser.name}
                    onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
                    className="h-11 rounded-xl border-border bg-background"
                    placeholder="مثال: مرتضی کریمی"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground">ایمیل سازمانی</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
                    className="h-11 rounded-xl border-border bg-background"
                    dir="ltr"
                    placeholder="m.karimi@company.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground">نقش سازمانی</Label>
                <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value as UserRole })}>
                  <SelectTrigger className="h-11 rounded-xl border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card text-foreground" dir="rtl">
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground">رمز عبور اولیه</Label>
                  <Input
                    type="password"
                    value={newUser.password}
                    onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
                    className="h-11 rounded-xl border-border bg-background"
                    dir="ltr"
                    placeholder="حداقل ۸ کاراکتر"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground">تکرار رمز عبور</Label>
                  <Input
                    type="password"
                    value={newUser.confirmPassword}
                    onChange={(event) => setNewUser({ ...newUser, confirmPassword: event.target.value })}
                    className="h-11 rounded-xl border-border bg-background"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button onClick={handleCreateUser} disabled={isSaving} className="h-11 flex-1 rounded-xl font-black">
                {isSaving ? (
                  <ActionSkeleton inverted className="w-40" />
                ) : (
                  <>
                    <LockKeyhole className="ml-2 h-4 w-4" />
                    ایجاد و فعال‌سازی کاربر
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsAddUserOpen(false)} className="h-11 rounded-xl">
                انصراف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card className="rounded-xl border-border bg-card p-4 shadow-sm md:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted-foreground">کل کاربران</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">{users.length} نفر</div>
        </Card>
        <Card className="rounded-xl border-border bg-card p-4 shadow-sm md:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted-foreground">فعال</span>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600">{activeUsers.length} نفر</div>
        </Card>
        <Card className="rounded-xl border-border bg-card p-4 shadow-sm md:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted-foreground">مدیریتی</span>
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-black text-primary">{managementUsers.length} نفر</div>
        </Card>
        <Card className="rounded-xl border-dashed border-border bg-card p-4 shadow-sm md:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted-foreground">ظرفیت پلن</span>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {userLimit ? `${activeUsers.length} / ${userLimit}` : `${activeUsers.length} / نامحدود`}
          </div>
        </Card>
      </div>

      {teammateCount === 0 && (
        <EmptyState
          icon={UserPlus}
          title="هنوز عضو تیم اضافه نشده"
          description="برای شروع کار واقعی، بعد از حساب مدیر ارشد می‌توانید اولین همکار عملیاتی یا مالی را با دسترسی مشخص اضافه کنید."
          primaryAction={{ label: "افزودن عضو تیم", onClick: () => setIsAddUserOpen(true), icon: UserPlus }}
          compact
        />
      )}

      <Card className="overflow-hidden rounded-xl border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border bg-background/60">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base font-black">کاربران شرکت</CardTitle>
              <CardDescription className="mt-1 text-xs">
                کاربران تعلیق‌شده امکان ورود به پنل را ندارند، اما برای سابقه و گزارش‌ها نگهداری می‌شوند.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-72">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="جستجو بر اساس نام یا ایمیل..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-10 rounded-xl border-border bg-background pr-10 text-xs"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-10 rounded-xl border-border bg-background text-xs sm:w-40">
                  <Filter className="ml-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card text-foreground" dir="rtl">
                  <SelectItem value="ALL">همه نقش‌ها</SelectItem>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 rounded-xl border-border bg-background text-xs sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card text-foreground" dir="rtl">
                  <SelectItem value="ALL">همه وضعیت‌ها</SelectItem>
                  <SelectItem value="active">فعال</SelectItem>
                  <SelectItem value="suspended">تعلیق‌شده</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-right">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-bold text-muted-foreground">
                  <th className="px-5 py-4">کاربر</th>
                  <th className="px-5 py-4">ایمیل و شناسه</th>
                  <th className="px-5 py-4">نقش</th>
                  <th className="px-5 py-4">وضعیت</th>
                  <th className="px-5 py-4">آخرین حضور</th>
                  <th className="px-5 py-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const status = statusLabels[userStatus(user)] || statusLabels.active;
                    const isSelf = user.id === currentUser?.id;
                    const isSuspended = userStatus(user) === "suspended";
                    return (
                      <tr key={user.id} className={cn("transition-colors hover:bg-muted/40", isSuspended && "opacity-70")}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Avatar className="h-10 w-10 border border-border">
                                <AvatarImage src={user.avatar} />
                                <AvatarFallback className="bg-muted text-xs font-black text-primary">
                                  {user.name?.slice(0, 2) || "ک"}
                                </AvatarFallback>
                              </Avatar>
                              {user.isOnline && isActiveUser(user) && (
                                <div className="absolute -bottom-0.5 -left-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-emerald-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-foreground">{user.name}</div>
                              {isSelf && <div className="mt-0.5 text-[11px] font-bold text-primary">شما</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
                              <Mail className="h-3.5 w-3.5" />
                              {user.email}
                            </span>
                            <span className="text-[11px] text-muted-foreground/70" dir="ltr">ID: {user.id}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Badge className={cn("border-none px-2 py-1 text-[11px] font-bold", roleTone(user.role))}>
                            {roleLabel(user.role)}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          <Badge className={cn("border-none px-2 py-1 text-[11px] font-bold", status.tone)}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">{formatDate(user.lastSeenAt)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={(triggerProps) => (
                                  <Button {...triggerProps} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                )}
                              />
                              <DropdownMenuContent className="w-56 bg-card text-right text-foreground shadow-lg" align="end" dir="rtl">
                                <DropdownMenuGroup>
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground">تغییر نقش</DropdownMenuLabel>
                                  {roleOptions.map((role) => (
                                    <DropdownMenuItem
                                      key={role.value}
                                      disabled={isSaving || (isSelf && role.value !== "CEO")}
                                      onClick={() => handleRoleChange(user, role.value)}
                                      className="rounded-lg text-xs"
                                    >
                                      {user.role === role.value && <CheckCircle2 className="ml-2 h-3.5 w-3.5 text-primary" />}
                                      {role.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator className="bg-border" />
                                {isSuspended ? (
                                  <DropdownMenuItem
                                    disabled={isSaving}
                                    onClick={() => handleActivateUser(user)}
                                    className="rounded-lg text-xs font-bold text-emerald-600 focus:bg-emerald-500/10"
                                  >
                                    <UserCheck className="ml-2 h-3.5 w-3.5" />
                                    فعال‌سازی دوباره
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    disabled={isSaving || isSelf}
                                    onClick={() => openSuspendDialog(user)}
                                    className="rounded-lg text-xs font-bold text-rose-600 focus:bg-rose-500/10"
                                  >
                                    <UserX className="ml-2 h-3.5 w-3.5" />
                                    تعلیق دسترسی
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <EmptyTableRow colSpan={6}>
                    <EmptyState
                      icon={Users}
                      title={users.length === 0 ? "هنوز کاربری ثبت نشده" : "کاربری با این فیلترها پیدا نشد"}
                      description={
                        users.length === 0
                          ? "برای ساخت تیم، اولین کاربر را با نقش و رمز اولیه امن اضافه کنید."
                          : "کاربران موجود ممکن است پشت جستجو، نقش یا وضعیت انتخاب‌شده پنهان شده باشند."
                      }
                      primaryAction={
                        users.length === 0
                          ? { label: "افزودن کاربر", onClick: () => setIsAddUserOpen(true), icon: UserPlus }
                          : resetFiltersAction(resetUserFilters)
                      }
                      compact
                    />
                  </EmptyTableRow>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isSuspendDialogOpen} onOpenChange={setIsSuspendDialogOpen}>
        <DialogContent className="bg-card text-right text-foreground sm:max-w-[430px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-rose-600">
              <UserX className="h-5 w-5" />
              تعلیق دسترسی کاربر
            </DialogTitle>
            <DialogDescription className="text-right text-muted-foreground">
              کاربر تعلیق‌شده دیگر نمی‌تواند وارد پنل شرکت شود. سوابق قبلی او برای گزارش‌ها باقی می‌ماند.
              {selectedUser && <span className="mt-2 block font-black text-foreground">کاربر: {selectedUser.name}</span>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="destructive" onClick={handleSuspendUser} disabled={isSaving} className="h-10 flex-1 rounded-xl font-black">
              {isSaving ? <ActionSkeleton className="w-28 bg-destructive/25" /> : "تایید تعلیق"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsSuspendDialogOpen(false)} className="h-10 rounded-xl">
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {suspendedUsers.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground">
          {suspendedUsers.length} کاربر تعلیق‌شده در لیست نگهداری می‌شود تا مدیر شرکت بتواند در صورت نیاز آن‌ها را دوباره فعال کند.
        </div>
      )}
    </div>
  );
}
