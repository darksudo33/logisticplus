import React from "react";
import { useNavigate } from "react-router-dom";
import { ArchiveRestore, Calendar, Eye, FileText, Filter, Loader2, RotateCcw, Save, Search, Ship, StickyNote, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/src/components/EmptyState";
import { useApiResource } from "@/src/lib/resourceState";
import { apiGet } from "@/src/lib/api";
import { shipmentFormTemplatesApi, type ShipmentTypeOption } from "@/src/lib/shipmentFormTemplatesApi";
import { shipmentApi, type ExitedShipment, type ExitedShipmentsFilters, type PostExitStatus } from "@/src/lib/shipmentApi";
import { useAppStore } from "@/src/store/useAppStore";
import type { Customer } from "@/src/types";

const POST_EXIT_STATUS_LABELS: Record<PostExitStatus, string> = {
  needs_follow_up: "نیاز به پیگیری",
  in_progress: "در حال پیگیری",
  settled: "تسویه شده",
  closed: "بسته شده",
};

const statusTone: Record<PostExitStatus, string> = {
  needs_follow_up: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  in_progress: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  settled: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  closed: "border-muted bg-muted text-muted-foreground",
};

function displayDate(value?: string | null) {
  if (!value) return "ثبت نشده";
  return String(value).slice(0, 10);
}

function cleanFilters(filters: ExitedShipmentsFilters): ExitedShipmentsFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
  ) as ExitedShipmentsFilters;
}

function typeLabel(types: ShipmentTypeOption[], code?: string) {
  const type = types.find((item) => item.code === code);
  return type?.labelFa || code || "ثبت نشده";
}

function customerOptionLabel(customer: Customer) {
  return customer.customerCode || customer.code || customer.id;
}

function shipmentCustomerCode(shipment: ExitedShipment) {
  return shipment.customerCode || shipment.customerId || shipment.customerDisplayName || shipment.customerName || "";
}

export default function ExitedShipments() {
  const navigate = useNavigate();
  const currentUser = useAppStore((state) => state.currentUser);
  const users = useAppStore((state) => state.users);
  const [draftFilters, setDraftFilters] = React.useState<ExitedShipmentsFilters>({ limit: 100 });
  const [appliedFilters, setAppliedFilters] = React.useState<ExitedShipmentsFilters>({ limit: 100 });
  const [restoreTarget, setRestoreTarget] = React.useState<ExitedShipment | null>(null);
  const [followUpTarget, setFollowUpTarget] = React.useState<ExitedShipment | null>(null);
  const [followUpDraft, setFollowUpDraft] = React.useState<{
    postExitStatus: PostExitStatus;
    postExitNote: string;
    postExitFollowUpAt: string;
  }>({
    postExitStatus: "needs_follow_up",
    postExitNote: "",
    postExitFollowUpAt: "",
  });
  const [savingKey, setSavingKey] = React.useState("");

  const canRestore = Boolean(currentUser?.permissions?.includes("shipments.archive"));
  const canUpdatePostExit = Boolean(currentUser?.permissions?.includes("shipments.update"));

  const shipmentsResource = useApiResource(
    React.useCallback(() => shipmentApi.listExited(cleanFilters(appliedFilters)), [appliedFilters]),
    [] as ExitedShipment[]
  );
  const customersResource = useApiResource(React.useCallback(() => apiGet<Customer[]>("/api/customers"), []), [] as Customer[]);
  const typesResource = useApiResource(React.useCallback(() => shipmentFormTemplatesApi.listTypes(), []), [] as ShipmentTypeOption[]);

  const updateFilter = (key: keyof ExitedShipmentsFilters, value: string) => {
    setDraftFilters((current) => ({
      ...current,
      [key]: value || undefined,
    }));
  };

  const applyFilters = (event?: React.FormEvent) => {
    event?.preventDefault();
    setAppliedFilters({ ...cleanFilters(draftFilters), limit: 100 });
  };

  const resetFilters = () => {
    const reset = { limit: 100 };
    setDraftFilters(reset);
    setAppliedFilters(reset);
  };

  const openFollowUp = (shipment: ExitedShipment) => {
    setFollowUpTarget(shipment);
    setFollowUpDraft({
      postExitStatus: shipment.postExitStatus || "needs_follow_up",
      postExitNote: shipment.postExitNote || "",
      postExitFollowUpAt: displayDate(shipment.postExitFollowUpAt) === "ثبت نشده" ? "" : displayDate(shipment.postExitFollowUpAt),
    });
  };

  const restoreShipment = async () => {
    if (!restoreTarget) return;
    setSavingKey(`restore-${restoreTarget.id}`);
    try {
      await shipmentApi.restoreFromExitedArchive(restoreTarget.id);
      await shipmentsResource.refresh();
      setRestoreTarget(null);
      toast.success("محموله به لیست فعال برگشت.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بازگردانی محموله ناموفق بود.");
    } finally {
      setSavingKey("");
    }
  };

  const saveFollowUp = async () => {
    if (!followUpTarget) return;
    setSavingKey(`follow-up-${followUpTarget.id}`);
    try {
      await shipmentApi.updatePostExit(followUpTarget.id, {
        postExitStatus: followUpDraft.postExitStatus,
        postExitNote: followUpDraft.postExitNote || null,
        postExitFollowUpAt: followUpDraft.postExitFollowUpAt || null,
      });
      await shipmentsResource.refresh();
      setFollowUpTarget(null);
      toast.success("پیگیری بعد از خروج ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره پیگیری ناموفق بود.");
    } finally {
      setSavingKey("");
    }
  };

  const shipments = shipmentsResource.data;

  return (
    <div className="app-page space-y-5 font-sans" dir="rtl" data-testid="exited-shipments-page">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-black tracking-normal text-foreground">محموله‌های خروج‌شده</h1>
          <p className="mt-1 max-w-3xl text-xs font-bold leading-6 text-muted-foreground">
            محموله‌هایی که از مرحله خروج عبور کرده‌اند و برای پیگیری‌های بعد از خروج نگهداری می‌شوند.
          </p>
        </div>
        <Badge variant="outline" className="h-8 w-fit rounded-full px-3 text-xs">
          {shipments.length.toLocaleString("fa-IR")} محموله
        </Badge>
      </div>

      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border p-4">
          <CardTitle className="flex items-center gap-2 text-sm font-black">
            <Filter className="h-4 w-4 text-primary" />
            فیلتر و جستجو
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="sm:col-span-2 xl:col-span-2">
              <Label className="text-[11px] font-black text-muted-foreground">جستجو</Label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={draftFilters.q || ""}
                  onChange={(event) => updateFilter("q", event.target.value)}
                  placeholder="شماره محموله، مشتری، کوتاژ یا اظهارنامه"
                  className="h-10 rounded-lg pr-10 text-xs"
                  data-testid="exited-shipments-search"
                />
              </div>
            </div>

            <div>
              <Label className="text-[11px] font-black text-muted-foreground">مشتری</Label>
              <select
                value={draftFilters.customerId || ""}
                onChange={(event) => updateFilter("customerId", event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-bold"
              >
                <option value="">همه مشتریان</option>
                {customersResource.data.filter((customer) => !customer.isArchived).map((customer) => (
                  <option key={customer.id} value={customer.id}>{customerOptionLabel(customer)}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[11px] font-black text-muted-foreground">نوع محموله</Label>
              <select
                value={draftFilters.shipmentTypeCode || ""}
                onChange={(event) => updateFilter("shipmentTypeCode", event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-bold"
              >
                <option value="">همه نوع‌ها</option>
                {typesResource.data.map((type) => (
                  <option key={type.code} value={type.code}>{type.labelFa}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[11px] font-black text-muted-foreground">وضعیت پیگیری</Label>
              <select
                value={draftFilters.postExitStatus || ""}
                onChange={(event) => updateFilter("postExitStatus", event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-bold"
              >
                <option value="">همه وضعیت‌ها</option>
                {Object.entries(POST_EXIT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[11px] font-black text-muted-foreground">مسئول</Label>
              <select
                value={draftFilters.assignedManagerId || ""}
                onChange={(event) => updateFilter("assignedManagerId", event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-bold"
              >
                <option value="">همه مسئول‌ها</option>
                {users.filter((user) => user.status !== "suspended").map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[11px] font-black text-muted-foreground">از تاریخ خروج</Label>
              <Input type="date" value={draftFilters.exitDateFrom || ""} onChange={(event) => updateFilter("exitDateFrom", event.target.value)} className="mt-1 h-10 rounded-lg text-xs" />
            </div>
            <div>
              <Label className="text-[11px] font-black text-muted-foreground">تا تاریخ خروج</Label>
              <Input type="date" value={draftFilters.exitDateTo || ""} onChange={(event) => updateFilter("exitDateTo", event.target.value)} className="mt-1 h-10 rounded-lg text-xs" />
            </div>

            <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
              <Button type="submit" className="h-10 rounded-lg px-5 text-xs font-black">
                اعمال فیلتر
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-lg px-5 text-xs font-black" onClick={resetFilters}>
                پاک کردن
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {shipmentsResource.isLoading ? (
        <Card className="rounded-xl border-border bg-card">
          <CardContent className="flex min-h-[260px] items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            در حال بارگیری محموله‌های خروج‌شده...
          </CardContent>
        </Card>
      ) : shipmentsResource.error ? (
        <Card className="rounded-xl border-destructive/20 bg-destructive/5">
          <CardContent className="p-4 text-xs font-bold text-destructive">{shipmentsResource.error}</CardContent>
        </Card>
      ) : shipments.length === 0 ? (
        <EmptyState
          icon={Ship}
          title="هنوز محموله خروج‌شده‌ای ثبت نشده است."
          description="بعد از انتقال محموله‌های خروج‌شده از صفحه جزئیات یا لیست محموله‌ها، اینجا برای پیگیری بلندمدت نمایش داده می‌شوند."
        />
      ) : (
        <div className="grid gap-3">
          {shipments.map((shipment) => {
            const postExitStatus = shipment.postExitStatus || "needs_follow_up";
            return (
              <Card key={shipment.id} className="rounded-xl border-border bg-card shadow-sm" data-testid="exited-shipment-card" data-shipment-id={shipment.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-black text-primary">{shipment.trackingNumber}</span>
                        <Badge variant="outline" className="h-6 rounded-full border-amber-500/30 bg-amber-500/10 px-2 text-[10px] text-amber-700">
                          خروج‌شده
                        </Badge>
                        <Badge variant="outline" className={`h-6 rounded-full px-2 text-[10px] ${statusTone[postExitStatus]}`}>
                          {POST_EXIT_STATUS_LABELS[postExitStatus]}
                        </Badge>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <Fact icon={UserRound} label="مشتری" value={shipmentCustomerCode(shipment)} />
                        <Fact icon={Ship} label="نوع محموله" value={typeLabel(typesResource.data, shipment.shipmentTypeCode)} />
                        <Fact icon={FileText} label="کوتاژ / اظهارنامه" value={[shipment.cotageNumber, shipment.declarationReference].filter(Boolean).join(" / ") || "ثبت نشده"} />
                        <Fact icon={Calendar} label="خروج / آخرین بروزرسانی" value={`${displayDate(shipment.exitDate)} / ${displayDate(shipment.lastUpdatedAt)}`} />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        <SmallFact label="وضعیت ترخیص" value={shipment.releaseStatus || "ثبت نشده"} />
                        <SmallFact label="مسئول" value={shipment.assignedManagerName || "تعیین نشده"} />
                        <SmallFact label="پیگیری بعدی" value={displayDate(shipment.postExitFollowUpAt)} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:w-64 xl:justify-end">
                      <Button type="button" variant="outline" className="h-9 rounded-lg text-xs font-black" onClick={() => navigate(`/shipments/${shipment.id}`)} data-testid="exited-shipment-view">
                        <Eye className="ml-1 h-3.5 w-3.5" />
                        مشاهده جزئیات
                      </Button>
                      {canUpdatePostExit ? (
                        <Button type="button" variant="outline" className="h-9 rounded-lg text-xs font-black" onClick={() => openFollowUp(shipment)} data-testid="exited-shipment-follow-up">
                          <StickyNote className="ml-1 h-3.5 w-3.5" />
                          ثبت یادداشت پیگیری
                        </Button>
                      ) : null}
                      {canRestore ? (
                        <Button type="button" className="h-9 rounded-lg text-xs font-black" onClick={() => setRestoreTarget(shipment)} data-testid="exited-shipment-restore">
                          <ArchiveRestore className="ml-1 h-3.5 w-3.5" />
                          بازگردانی به فعال
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(restoreTarget)} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <DialogContent className="max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">بازگردانی به محموله‌های فعال</DialogTitle>
            <DialogDescription className="text-sm leading-7 text-muted-foreground">
              این محموله دوباره در لیست محموله‌های فعال و صفحات عملیاتی نمایش داده می‌شود.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setRestoreTarget(null)} disabled={Boolean(savingKey)} data-testid="exited-shipment-restore-cancel">
              انصراف
            </Button>
            <Button type="button" onClick={() => void restoreShipment()} disabled={Boolean(savingKey)} data-testid="exited-shipment-restore-confirm">
              {savingKey ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <RotateCcw className="ml-1 h-4 w-4" />}
              بازگردانی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(followUpTarget)} onOpenChange={(open) => !open && setFollowUpTarget(null)}>
        <DialogContent className="max-w-lg text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">ثبت یادداشت پیگیری</DialogTitle>
            <DialogDescription className="text-sm leading-7 text-muted-foreground">
              وضعیت، یادداشت و تاریخ پیگیری بعدی فقط برای تیم داخلی نمایش داده می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="text-xs font-black">وضعیت پیگیری بعد از خروج</Label>
              <select
                value={followUpDraft.postExitStatus}
                onChange={(event) => setFollowUpDraft((current) => ({ ...current, postExitStatus: event.target.value as PostExitStatus }))}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-bold"
                data-testid="exited-shipment-follow-up-status"
              >
                {Object.entries(POST_EXIT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs font-black">تاریخ پیگیری بعدی</Label>
              <Input
                type="date"
                value={followUpDraft.postExitFollowUpAt}
                onChange={(event) => setFollowUpDraft((current) => ({ ...current, postExitFollowUpAt: event.target.value }))}
                className="mt-1 h-10 rounded-lg text-xs"
                data-testid="exited-shipment-follow-up-date"
              />
            </div>
            <div>
              <Label className="text-xs font-black">یادداشت پیگیری</Label>
              <textarea
                value={followUpDraft.postExitNote}
                onChange={(event) => setFollowUpDraft((current) => ({ ...current, postExitNote: event.target.value }))}
                placeholder="مثلاً: پیگیری تسویه ضمانت‌نامه یا مدارک نهایی..."
                className="mt-1 min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="exited-shipment-follow-up-note"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setFollowUpTarget(null)} disabled={Boolean(savingKey)} data-testid="exited-shipment-follow-up-cancel">
              انصراف
            </Button>
            <Button type="button" onClick={() => void saveFollowUp()} disabled={Boolean(savingKey)} data-testid="exited-shipment-follow-up-save">
              {savingKey ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/35 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="truncate text-xs font-black text-foreground">{value || "ثبت نشده"}</p>
    </div>
  );
}

function SmallFact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2">
      <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-foreground">{value || "ثبت نشده"}</p>
    </div>
  );
}
