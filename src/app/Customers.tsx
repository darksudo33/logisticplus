import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Building2,
  Calendar,
  Edit3,
  Eye,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Star,
  Trash,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { EmptyState, EmptyTableRow, resetFiltersAction } from "@/src/components/EmptyState";
import { useAppStore } from "@/src/store/useAppStore";
import type { Customer } from "@/src/types";

type CustomerPhoneDraft = {
  id?: string;
  phoneNumber: string;
  phoneLabel: string;
  note: string;
  isPrimary: boolean;
  sortOrder: number;
};

type CustomerFormState = Pick<Customer, "name" | "company" | "email" | "address"> & {
  customerCode: string;
  referrer: string;
  notes: string;
  phoneNumbers: CustomerPhoneDraft[];
};

function emptyPhoneDraft(isPrimary = false, sortOrder = 0): CustomerPhoneDraft {
  return {
    phoneNumber: "",
    phoneLabel: isPrimary ? "اصلی" : "",
    note: "",
    isPrimary,
    sortOrder,
  };
}

function emptyCustomerForm(): CustomerFormState {
  return {
    customerCode: "",
    name: "",
    company: "",
    email: "",
    address: "",
    referrer: "",
    notes: "",
    phoneNumbers: [emptyPhoneDraft(true, 0)],
  };
}

function customerCode(customer: Customer | null | undefined) {
  return customer?.customerCode || customer?.code || customer?.id || "";
}

function phoneDraftsFromCustomer(customer: Customer): CustomerPhoneDraft[] {
  const phones = Array.isArray(customer.phoneNumbers) && customer.phoneNumbers.length
    ? customer.phoneNumbers
    : customer.phone
      ? [{ id: "", phoneNumber: customer.phone, phoneLabel: "اصلی", note: "", isPrimary: true, sortOrder: 0 }]
      : [];
  if (!phones.length) return [emptyPhoneDraft(true, 0)];
  return phones.map((phone, index) => ({
    id: phone.id,
    phoneNumber: phone.phoneNumber || "",
    phoneLabel: phone.phoneLabel || (phone.isPrimary ? "اصلی" : ""),
    note: phone.note || "",
    isPrimary: Boolean(phone.isPrimary) || index === 0,
    sortOrder: Number.isFinite(Number(phone.sortOrder)) ? Number(phone.sortOrder) : index * 10,
  }));
}

function customerFormFromCustomer(customer: Customer): CustomerFormState {
  return {
    customerCode: customerCode(customer),
    name: customer.name || "",
    company: customer.company || "",
    email: customer.email || "",
    address: customer.address || "",
    referrer: customer.referrer || "",
    notes: customer.notes || "",
    phoneNumbers: phoneDraftsFromCustomer(customer),
  };
}

function normalizePhoneDrafts(phoneNumbers: CustomerPhoneDraft[]) {
  const trimmed = phoneNumbers
    .map((phone, index) => ({
      id: phone.id,
      phoneNumber: phone.phoneNumber.trim(),
      phoneLabel: phone.phoneLabel.trim(),
      note: phone.note.trim(),
      isPrimary: Boolean(phone.isPrimary),
      sortOrder: Number.isFinite(Number(phone.sortOrder)) ? Number(phone.sortOrder) : index * 10,
    }))
    .filter((phone) => phone.phoneNumber);
  if (trimmed.length && !trimmed.some((phone) => phone.isPrimary)) trimmed[0].isPrimary = true;
  const primaryIndex = trimmed.findIndex((phone) => phone.isPrimary);
  return trimmed.map((phone, index) => ({
    ...phone,
    isPrimary: index === primaryIndex,
    sortOrder: index * 10,
  }));
}

function customerDisplayName(customer: Customer) {
  return customer.name || customer.company || customerCode(customer);
}

export default function Customers() {
  const navigate = useNavigate();
  const customers = useAppStore((state) => state.customers);
  const currentUser = useAppStore((state) => state.currentUser);
  const loadCurrentUserRecords = useAppStore((state) => state.loadCurrentUserRecords);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(() => emptyCustomerForm());
  const isCeo = currentUser?.role === "CEO";

  if (currentUser && !isCeo) {
    return <Navigate to="/dashboard" replace />;
  }

  const saveCustomerRequest = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error?.message || "Customer request failed.");
    }
    await loadCurrentUserRecords();
    return payload?.data;
  };

  const openCreateDialog = () => {
    setEditingCustomerId(null);
    setCustomerForm(emptyCustomerForm());
    setIsFormDialogOpen(true);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setCustomerForm(customerFormFromCustomer(customer));
    setIsFormDialogOpen(true);
  };

  const handleFormDialogOpenChange = (open: boolean) => {
    if (isSavingCustomer) return;
    setIsFormDialogOpen(open);
    if (!open) {
      setEditingCustomerId(null);
      setCustomerForm(emptyCustomerForm());
    }
  };

  const updatePhoneDraft = (index: number, updates: Partial<CustomerPhoneDraft>) => {
    setCustomerForm((current) => ({
      ...current,
      phoneNumbers: current.phoneNumbers.map((phone, phoneIndex) => (
        phoneIndex === index ? { ...phone, ...updates } : phone
      )),
    }));
  };

  const markPrimaryPhone = (index: number) => {
    setCustomerForm((current) => ({
      ...current,
      phoneNumbers: current.phoneNumbers.map((phone, phoneIndex) => ({
        ...phone,
        isPrimary: phoneIndex === index,
        phoneLabel: phoneIndex === index && !phone.phoneLabel ? "اصلی" : phone.phoneLabel,
      })),
    }));
  };

  const addPhoneRow = () => {
    setCustomerForm((current) => ({
      ...current,
      phoneNumbers: [
        ...current.phoneNumbers,
        emptyPhoneDraft(current.phoneNumbers.length === 0, current.phoneNumbers.length * 10),
      ],
    }));
  };

  const removePhoneRow = (index: number) => {
    setCustomerForm((current) => {
      const nextPhones = current.phoneNumbers.filter((_, phoneIndex) => phoneIndex !== index);
      if (!nextPhones.length) nextPhones.push(emptyPhoneDraft(true, 0));
      if (!nextPhones.some((phone) => phone.isPrimary)) nextPhones[0].isPrimary = true;
      return { ...current, phoneNumbers: nextPhones };
    });
  };

  const handleSaveCustomer = async () => {
    const phoneNumbers = normalizePhoneDrafts(customerForm.phoneNumbers);
    const primaryPhone = phoneNumbers.find((phone) => phone.isPrimary)?.phoneNumber || phoneNumbers[0]?.phoneNumber || "";
    const customerPayload = {
      customerCode: customerForm.customerCode.trim(),
      name: customerForm.name.trim(),
      company: customerForm.company.trim(),
      email: customerForm.email.trim(),
      phone: primaryPhone,
      phoneNumbers,
      address: customerForm.address.trim(),
      referrer: customerForm.referrer.trim(),
      notes: customerForm.notes.trim(),
    };

    if (!customerPayload.name && !customerPayload.company) {
      toast.error("نام مشتری یا نام شرکت را وارد کنید.");
      return;
    }

    setIsSavingCustomer(true);
    try {
      if (editingCustomerId) {
        await saveCustomerRequest(`/api/customers/${encodeURIComponent(editingCustomerId)}`, {
          method: "PATCH",
          body: JSON.stringify(customerPayload),
        });
        toast.success("اطلاعات مشتری بروزرسانی شد.");
      } else {
        await saveCustomerRequest("/api/customers", {
          method: "POST",
          body: JSON.stringify(customerPayload),
        });
        toast.success("مشتری ذخیره شد.");
      }
      setCustomerForm(emptyCustomerForm());
      setEditingCustomerId(null);
      setIsFormDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره مشتری ناموفق بود.");
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const activeCustomers = React.useMemo(() => customers.filter((customer) => !customer.isArchived), [customers]);
  const filteredCustomers = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return activeCustomers;
    return activeCustomers.filter((customer) => {
      const phones = (customer.phoneNumbers || []).map((phone) => `${phone.phoneNumber} ${phone.phoneLabel} ${phone.note}`).join(" ");
      const searchable = [
        customerCode(customer),
        customer.name,
        customer.company,
        customer.email,
        customer.phone,
        phones,
        customer.address,
        customer.referrer,
        customer.notes,
      ].join(" ").toLowerCase();
      return searchable.includes(term);
    });
  }, [activeCustomers, searchTerm]);
  const resetCustomerFilters = () => setSearchTerm("");

  const customerStats = React.useMemo(() => {
    const totalShipments = activeCustomers.reduce((sum, customer) => sum + ((customer as any).shipmentsCount || 0), 0);
    const withEmail = activeCustomers.filter((customer) => Boolean(customer.email)).length;
    const withPhone = activeCustomers.filter((customer) => Boolean(customer.phone || customer.phoneNumbers?.length)).length;
    return [
      { label: "کل مشتریان", value: activeCustomers.length, icon: Building2, tone: "blue" },
      { label: "مجموع محموله ها", value: totalShipments, icon: Calendar, tone: "emerald" },
      { label: "ایمیل ثبت شده", value: withEmail, icon: Mail, tone: "indigo" },
      { label: "شماره تماس", value: withPhone, icon: Phone, tone: "amber" },
    ];
  }, [activeCustomers]);

  const selectedCustomer = activeCustomers.find((customer) => customer.id === customerToDelete);

  return (
    <div className="app-page space-y-5 text-foreground font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight text-foreground">پایگاه مشتریان</h1>
          <p className="text-[12px] text-muted-foreground">اطلاعات محرمانه مشتریان فقط برای مدیرعامل قابل مشاهده و ویرایش است.</p>
        </div>

        <Button
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-10 w-full sm:w-auto text-xs font-bold px-4 flex items-center justify-center rounded-xl"
          onClick={openCreateDialog}
        >
          <UserPlus className="w-3.5 h-3.5" />
          مشتری جدید
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {customerStats.map((stat) => {
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
                  stat.tone === "emerald" && "bg-emerald-50 text-emerald-600",
                  stat.tone === "indigo" && "bg-indigo-50 text-indigo-600",
                  stat.tone === "amber" && "bg-amber-50 text-amber-600"
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
            placeholder="جستجوی کد، نام، شرکت، ایمیل یا شماره تماس..."
            className="bg-muted border-border pr-10 h-10 text-xs focus-visible:ring-primary/50 rounded-xl"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      </div>

      <Card className="bg-card border-border rounded-xl overflow-hidden shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[12px] min-w-[860px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-4 font-medium text-muted-foreground">کد مشتری</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">نام کامل</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">شرکت</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">اطلاعات تماس</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">تعداد محموله</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">تاریخ ایجاد</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCustomers.length === 0 ? (
                  <EmptyTableRow colSpan={7}>
                    <EmptyState
                      icon={UserPlus}
                      title={activeCustomers.length === 0 ? "هنوز مشتری ثبت نشده" : "مشتری‌ای با این جستجو پیدا نشد"}
                      description={activeCustomers.length === 0 ? "اولین مشتری را اضافه کنید تا بتوانید محموله، سند و لینک رهگیری را به او وصل کنید." : "عبارت جستجو را تغییر دهید یا فیلترها را پاک کنید."}
                      primaryAction={activeCustomers.length === 0 ? { label: "ثبت مشتری جدید", onClick: openCreateDialog, icon: UserPlus } : resetFiltersAction(resetCustomerFilters)}
                      compact
                    />
                  </EmptyTableRow>
                ) : (
                  filteredCustomers.map((customer) => {
                    const phones = customer.phoneNumbers?.length
                      ? customer.phoneNumbers
                      : customer.phone
                        ? [{ phoneNumber: customer.phone, phoneLabel: "اصلی", isPrimary: true }]
                        : [];
                    return (
                      <tr key={customer.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-5 py-4">
                          <span className="font-mono text-[11px] font-black text-primary" dir="ltr">{customerCode(customer)}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-bold text-foreground">{customer.name || "ثبت نشده"}</div>
                        </td>
                        <td className="px-5 py-4 text-foreground font-medium">{customer.company || "ثبت نشده"}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-0.5">
                            {customer.email ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-primary" dir="ltr">
                                <Mail className="w-3 h-3" /> {customer.email}
                              </div>
                            ) : null}
                            {phones.slice(0, 3).map((phone, index) => (
                              <div key={`${phone.phoneNumber}-${index}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground" dir="ltr">
                                <Phone className="w-3 h-3" />
                                <span>{phone.phoneNumber}</span>
                                {phone.phoneLabel ? <span dir="rtl">({phone.phoneLabel})</span> : null}
                                {phone.isPrimary ? <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> : null}
                              </div>
                            ))}
                            {customer.address ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <MapPin className="w-3 h-3" /> <span className="max-w-[220px] truncate">{customer.address}</span>
                              </div>
                            ) : null}
                            {customer.referrer ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <UserPlus className="w-3 h-3" /> <span className="max-w-[220px] truncate">معرف: {customer.referrer}</span>
                              </div>
                            ) : null}
                            {!customer.email && phones.length === 0 && !customer.address && !customer.referrer ? (
                              <span className="text-[11px] font-bold text-muted-foreground">اطلاعات تماس ثبت نشده</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <Badge className="bg-primary/10 text-primary border-none h-5 px-2 py-0 text-[10px] font-bold">
                            {(customer as any).shipmentsCount || 0}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{customer.createdAt}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1 opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:text-primary-foreground hover:bg-primary/20"
                              onClick={() => navigate(`/customers/${customer.id}`)}
                              title="مشاهده جزئیات کامل"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                    aria-label={`عملیات ${customerDisplayName(customer)}`}
                                  >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </Button>
                                }
                              />
                              <DropdownMenuContent className="bg-popover border-border text-foreground text-right shadow-2xl" align="end" dir="rtl">
                                <DropdownMenuItem
                                  className="text-xs cursor-pointer hover:bg-muted rounded-lg"
                                  onClick={() => openEditDialog(customer)}
                                >
                                  <Edit3 className="ml-1.5 h-3.5 w-3.5" />
                                  ویرایش مشتری
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-xs cursor-pointer hover:bg-muted rounded-lg">مشاهده تاریخچه</DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-xs cursor-pointer hover:bg-destructive/10 text-destructive font-bold rounded-lg"
                                  onClick={() => {
                                    setCustomerToDelete(customer.id);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash className="ml-1.5 h-3.5 w-3.5" />
                                  حذف مشتری
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormDialogOpen} onOpenChange={handleFormDialogOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto bg-popover border-border text-foreground text-right sm:max-w-[760px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">
              {editingCustomerId ? "ویرایش مشتری" : "ثبت مشتری جدید"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              کد مشتری برای نمایش در صفحات عملیاتی استفاده می‌شود؛ نام و اطلاعات تماس فقط در همین بخش محرمانه می‌ماند.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="customerCode" className="text-xs text-muted-foreground">کد مشتری</Label>
              <Input
                id="customerCode"
                dir="ltr"
                placeholder="CUS-0001"
                className="bg-muted border-border text-xs h-9 text-left font-mono"
                value={customerForm.customerCode}
                onChange={(event) => setCustomerForm({ ...customerForm, customerCode: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="name" className="text-xs text-muted-foreground">نام و نام خانوادگی</Label>
              <Input
                id="name"
                autoComplete="name"
                className="bg-muted border-border text-xs h-9"
                value={customerForm.name}
                onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="company" className="text-xs text-muted-foreground">نام شرکت</Label>
              <Input
                id="company"
                autoComplete="organization"
                className="bg-muted border-border text-xs h-9"
                value={customerForm.company}
                onChange={(event) => setCustomerForm({ ...customerForm, company: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email" className="text-xs text-muted-foreground">ایمیل</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                className="bg-muted border-border text-xs h-9 text-left"
                value={customerForm.email}
                onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">شماره‌های تماس</Label>
                <Button type="button" variant="outline" className="h-8 rounded-lg px-3 text-[11px] font-bold" onClick={addPhoneRow}>
                  <Plus className="ml-1 h-3.5 w-3.5" />
                  شماره جدید
                </Button>
              </div>
              <div className="grid gap-2">
                {customerForm.phoneNumbers.map((phone, index) => (
                  <div key={index} className="rounded-lg border border-border bg-muted/30 p-2.5">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,.7fr)_auto_auto]">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`customerPhone-${index}`} className="text-[11px] text-muted-foreground">
                          شماره تماس {index + 1}
                        </Label>
                        <Input
                          id={`customerPhone-${index}`}
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          dir="ltr"
                          className="bg-background border-border text-xs h-9 text-left"
                          value={phone.phoneNumber}
                          onChange={(event) => updatePhoneDraft(index, { phoneNumber: event.target.value })}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`customerPhoneLabel-${index}`} className="text-[11px] text-muted-foreground">برچسب</Label>
                        <Input
                          id={`customerPhoneLabel-${index}`}
                          className="bg-background border-border text-xs h-9"
                          placeholder="اصلی، مالی، مدیر..."
                          value={phone.phoneLabel}
                          onChange={(event) => updatePhoneDraft(index, { phoneLabel: event.target.value })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant={phone.isPrimary ? "default" : "outline"}
                        className="self-end h-9 rounded-lg px-3 text-[11px] font-bold"
                        onClick={() => markPrimaryPhone(index)}
                      >
                        <Star className={cn("ml-1 h-3.5 w-3.5", phone.isPrimary && "fill-current")} />
                        اصلی
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="self-end h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => removePhoneRow(index)}
                        aria-label={`حذف شماره ${index + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 grid gap-1.5">
                      <Label htmlFor={`customerPhoneNote-${index}`} className="text-[11px] text-muted-foreground">یادداشت شماره</Label>
                      <Input
                        id={`customerPhoneNote-${index}`}
                        className="bg-background border-border text-xs h-9"
                        value={phone.note}
                        onChange={(event) => updatePhoneDraft(index, { note: event.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="referrer" className="text-xs text-muted-foreground">معرف</Label>
              <Input
                id="referrer"
                className="bg-muted border-border text-xs h-9"
                value={customerForm.referrer}
                onChange={(event) => setCustomerForm({ ...customerForm, referrer: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="address" className="text-xs text-muted-foreground">آدرس</Label>
              <Input
                id="address"
                autoComplete="street-address"
                className="bg-muted border-border text-xs h-9"
                value={customerForm.address}
                onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="notes" className="text-xs text-muted-foreground">یادداشت داخلی</Label>
              <textarea
                id="notes"
                className="min-h-20 rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                value={customerForm.notes}
                onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full bg-primary text-primary-foreground font-bold h-10 text-xs" onClick={handleSaveCustomer} disabled={isSavingCustomer}>
              {isSavingCustomer ? (
                <ActionSkeleton inverted className="w-32" />
              ) : (
                <>
                  <UserPlus className="ml-2 h-4 w-4" />
                  {editingCustomerId ? "ذخیره تغییرات مشتری" : "ذخیره مشتری"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setCustomerToDelete(null);
        }}
        onConfirm={async () => {
          if (customerToDelete) {
            await saveCustomerRequest(`/api/customers/${customerToDelete}/archive`, { method: "POST" });
            toast.message("مشتری به سطل زباله منتقل شد", {
              description: "می‌توانید تا ۷ روز آینده آن را از بخش بایگانی بازیابی کنید.",
              icon: <Trash className="w-4 h-4 text-red-500" />,
            });
          }
        }}
        itemName={selectedCustomer ? `${customerCode(selectedCustomer)} - ${customerDisplayName(selectedCustomer)}` : ""}
      />
    </div>
  );
}
