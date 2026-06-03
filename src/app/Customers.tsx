import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMockStore } from "@/src/store/useMockStore";
import { Search, UserPlus, Phone, Mail, Building2, Calendar, MoreVertical, Eye, Trash, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import type { Customer } from "@/src/types";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState, EmptyTableRow, resetFiltersAction } from "@/src/components/EmptyState";
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

type CustomerFormState = Pick<Customer, "name" | "company" | "email" | "phone" | "address"> & {
  referrer: string;
  notes: string;
};

const emptyCustomerForm: CustomerFormState = {
  name: "",
  company: "",
  email: "",
  phone: "",
  address: "",
  referrer: "",
  notes: "",
};

export default function Customers() {
  const navigate = useNavigate();
  const customers = useMockStore(state => state.customers);
  const currentUser = useMockStore(state => state.currentUser);
  const loadCurrentUserRecords = useMockStore(state => state.loadCurrentUserRecords);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState<CustomerFormState>(emptyCustomerForm);
  const isCeo = currentUser?.role === "CEO";

  const saveCustomer = async (url: string, options: RequestInit = {}) => {
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

  const handleCreateCustomer = async () => {
    const customerPayload: CustomerFormState = {
      name: newCustomer.name.trim(),
      company: newCustomer.company.trim(),
      email: newCustomer.email.trim(),
      phone: newCustomer.phone.trim(),
      address: newCustomer.address.trim(),
      referrer: newCustomer.referrer.trim(),
      notes: newCustomer.notes.trim(),
    };

    if (!customerPayload.name && !customerPayload.company) {
      toast.error("نام مشتری یا نام شرکت را وارد کنید.");
      return;
    }

    setIsSavingCustomer(true);
    try {
      await saveCustomer("/api/customers", {
        method: "POST",
        body: JSON.stringify(customerPayload),
      });
      setNewCustomer(emptyCustomerForm);
      setIsAddDialogOpen(false);
      toast.success("مشتری ذخیره شد.");
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
      const searchableFields = isCeo
        ? [customer.name, customer.company, customer.email, customer.phone, customer.address, customer.referrer, customer.notes]
        : [customer.name, customer.company];
      const searchable = searchableFields.join(" ").toLowerCase();
      return searchable.includes(term);
    });
  }, [activeCustomers, isCeo, searchTerm]);
  const resetCustomerFilters = () => setSearchTerm("");

  const customerStats = React.useMemo(() => {
    const totalShipments = activeCustomers.reduce((sum, customer) => sum + ((customer as any).shipmentsCount || 0), 0);
    const withEmail = activeCustomers.filter(customer => Boolean(customer.email)).length;
    const withPhone = activeCustomers.filter(customer => Boolean(customer.phone)).length;
    const baseStats = [
      { label: "کل مشتریان", value: activeCustomers.length, icon: Building2, tone: "blue" },
      { label: "مجموع محموله ها", value: totalShipments, icon: Calendar, tone: "emerald" },
    ];
    if (!isCeo) return baseStats;
    return [
      ...baseStats,
      { label: "ایمیل ثبت شده", value: withEmail, icon: Mail, tone: "indigo" },
      { label: "شماره تماس", value: withPhone, icon: Phone, tone: "amber" },
    ];
  }, [activeCustomers, isCeo]);
  const selectedCustomer = activeCustomers.find(c => c.id === customerToDelete);
  const tableColumnCount = isCeo ? 6 : 5;
  const handleAddDialogOpenChange = (open: boolean) => {
    if (isSavingCustomer) return;
    setIsAddDialogOpen(open);
    if (!open) setNewCustomer(emptyCustomerForm);
  };

  return (
    <div className="app-page space-y-5 text-foreground font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight text-foreground">پایگاه مشتریان</h1>
          <p className="text-[12px] text-muted-foreground">مدیریت اطلاعات و تاریخچه همکاری با شرکای تجاری.</p>
        </div>
        
        {isCeo ? (
        <Dialog open={isAddDialogOpen} onOpenChange={handleAddDialogOpenChange}>
          <DialogTrigger
            render={
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-10 w-full sm:w-auto text-xs font-bold px-4 flex items-center justify-center rounded-xl">
                <UserPlus className="w-3.5 h-3.5" />
                مشتری جدید
              </Button>
            }
          />
          <DialogContent className="bg-popover border-border text-foreground text-right sm:max-w-[620px]" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground">ثبت مشتری جدید</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">اطلاعات مشتری را برای ثبت در سیستم وارد کنید.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="name" className="text-xs text-muted-foreground">نام و نام خانوادگی</Label>
                <Input id="name" autoComplete="name" className="bg-muted border-border text-xs h-9" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="company" className="text-xs text-muted-foreground">نام شرکت</Label>
                <Input id="company" autoComplete="organization" className="bg-muted border-border text-xs h-9" value={newCustomer.company} onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="email" className="text-xs text-muted-foreground">ایمیل</Label>
                <Input id="email" type="email" autoComplete="email" dir="ltr" className="bg-muted border-border text-xs h-9 text-left" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="phone" className="text-xs text-muted-foreground">شماره تماس</Label>
                <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" className="bg-muted border-border text-xs h-9 text-left" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="referrer" className="text-xs text-muted-foreground">معرف</Label>
                <Input id="referrer" className="bg-muted border-border text-xs h-9" value={newCustomer.referrer} onChange={(e) => setNewCustomer({ ...newCustomer, referrer: e.target.value })} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="address" className="text-xs text-muted-foreground">آدرس</Label>
                <Input id="address" autoComplete="street-address" className="bg-muted border-border text-xs h-9" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="notes" className="text-xs text-muted-foreground">یادداشت داخلی</Label>
                <textarea
                  id="notes"
                  className="min-h-20 rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                  value={newCustomer.notes}
                  onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full bg-primary text-primary-foreground font-bold h-10 text-xs" onClick={handleCreateCustomer} disabled={isSavingCustomer}>
                {isSavingCustomer ? (
                  <ActionSkeleton inverted className="w-32" />
                ) : (
                  <>
                    <UserPlus className="ml-2 h-4 w-4" />
                    ذخیره مشتری
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
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
            placeholder={isCeo ? "جستجوی نام، شرکت، ایمیل یا شماره تماس..." : "جستجوی نام یا شرکت..."}
            className="bg-muted border-border pr-10 h-10 text-xs focus-visible:ring-primary/50 rounded-xl"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card className="bg-card border-border rounded-xl overflow-hidden shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[12px] min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-4 font-medium text-muted-foreground">نام کامل</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">شرکت</th>
                  {isCeo ? <th className="px-5 py-4 font-medium text-muted-foreground">اطلاعات تماس</th> : null}
                  <th className="px-5 py-4 font-medium text-muted-foreground">تعداد محموله</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">تاریخ ایجاد</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCustomers.length === 0 ? (
                  <EmptyTableRow colSpan={tableColumnCount}>
                    <EmptyState
                      icon={UserPlus}
                      title={activeCustomers.length === 0 ? "هنوز مشتری ثبت نشده" : "مشتری‌ای با این جستجو پیدا نشد"}
                      description={activeCustomers.length === 0 ? "اولین مشتری را اضافه کنید تا بتوانید محموله، سند و لینک رهگیری را به او وصل کنید." : "عبارت جستجو را تغییر دهید یا فیلترها را پاک کنید."}
                      primaryAction={isCeo && activeCustomers.length === 0 ? { label: "ثبت مشتری جدید", onClick: () => setIsAddDialogOpen(true), icon: UserPlus } : resetFiltersAction(resetCustomerFilters)}
                      compact
                    />
                  </EmptyTableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="font-bold text-foreground">{customer.name || customer.company}</div>
                    </td>
                    <td className="px-5 py-4 text-foreground font-medium">{customer.company || "ثبت نشده"}</td>
                    {isCeo ? <td className="px-5 py-4">
                      <div className="flex flex-col gap-0.5">
                        {customer.email ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-primary" dir="ltr">
                            <Mail className="w-3 h-3" /> {customer.email}
                          </div>
                        ) : null}
                        {customer.phone ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" dir="ltr">
                            <Phone className="w-3 h-3" /> {customer.phone}
                          </div>
                        ) : null}
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
                        {!customer.email && !customer.phone && !customer.address && !customer.referrer ? (
                          <span className="text-[11px] font-bold text-muted-foreground">اطلاعات تماس ثبت نشده</span>
                        ) : null}
                      </div>
                    </td> : null}
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
                        {isCeo ? <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                aria-label={`عملیات ${customer.name || customer.company}`}
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent className="bg-popover border-border text-foreground text-right shadow-2xl" align="end" dir="rtl">
                            <DropdownMenuItem className="text-xs cursor-pointer hover:bg-muted rounded-lg">مشاهده تاریخچه</DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-xs cursor-pointer hover:bg-destructive/10 text-destructive font-bold rounded-lg"
                              onClick={() => {
                                setCustomerToDelete(customer.id);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              حذف مشتری
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu> : null}
                      </div>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DeleteConfirmDialog 
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setCustomerToDelete(null);
        }}
        onConfirm={async () => {
          if (customerToDelete) {
            await saveCustomer(`/api/customers/${customerToDelete}/archive`, { method: "POST" });
            toast.message("مشتری به سطل زباله منتقل شد", {
              description: "می‌توانید تا ۷ روز آینده آن را از بخش بایگانی بازیابی کنید.",
              icon: <Trash className="w-4 h-4 text-red-500" />
            });
          }
        }}
        itemName={selectedCustomer?.name || selectedCustomer?.company}
      />
    </div>
  );
}
