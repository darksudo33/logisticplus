import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Anchor,
  ArrowRight,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileText,
  Landmark,
  Loader2,
  NotebookText,
  Package,
  RotateCw,
  Save,
  Ship,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/src/lib/api";
import { shipmentV2Api } from "@/src/lib/shipmentV2Api";
import { useAppDataStore } from "@/src/store/useMockStore";
import type {
  ShipmentV2BaseSection,
  ShipmentV2FlowCode,
  ShipmentV2GoodsRow,
  ShipmentV2GoodsSection,
  ShipmentV2NotesSection,
  ShipmentV2ProfileResponse,
  ShipmentV2SectionKey,
  ShipmentV2SectionPayload,
} from "@/src/types";

type EditableSectionProps = {
  canUpdate: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
  isEditing: boolean;
  testIdPrefix: string;
};

const sectionDefinitions: Array<{
  key: ShipmentV2SectionKey;
  title: string;
  icon: typeof Package;
}> = [
  { key: "base", title: "اطلاعات پایه", icon: Package },
  { key: "orderRegistration", title: "ثبت سفارش", icon: ClipboardList },
  { key: "goods", title: "مشخصات کالا", icon: Ship },
  { key: "declarationKootaj", title: "اظهار و کوتاژ", icon: FileText },
  { key: "permits", title: "مجوز ها", icon: ShieldCheck },
  { key: "payments", title: "پرداخت ها", icon: CreditCard },
  { key: "banking", title: "اطلاعات بانکی", icon: Landmark },
  { key: "notes", title: "یادداشت ها", icon: NotebookText },
];

const flowLabels: Record<ShipmentV2FlowCode, string> = {
  IMPORT_LANJ: "واردات → لنج",
  IMPORT_SHIP: "واردات → کشتی",
};

const lenjTypeLabels: Record<string, string> = {
  TEH_LENJI: "ته لنجی",
  MALVANI: "ملوانی",
};

const statusLabels: Record<string, string> = {
  PENDING: "در انتظار ثبت",
  BOOKED: "رزرو شده",
  IN_TRANSIT: "در حال حمل",
  ARRIVED: "رسیده به بندر",
  CUSTOMS: "در گمرک",
  CLEARED: "ترخیص شده",
  DELIVERED: "تحویل شده",
  CLOSED: "بسته شده",
};

function displayValue(value?: string | number | null) {
  if (value === undefined || value === null || value === "") return "ثبت نشده";
  return String(value);
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function SectionCard({
  sectionKey,
  title,
  icon: Icon,
  children,
}: {
  sectionKey: ShipmentV2SectionKey;
  title: string;
  icon: typeof Package;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-xl border-border bg-card shadow-sm" data-testid={`shipment-v2-section-${sectionKey}`}>
      <CardHeader className="border-b border-border/60 p-4">
        <CardTitle className="flex items-center gap-2 text-sm font-black">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function SectionActions({ canUpdate, isSaving, isEditing, onEdit, onCancel, onSave, testIdPrefix }: EditableSectionProps) {
  if (!canUpdate) return null;
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
      {isEditing ? (
        <>
          <Button type="button" variant="outline" data-testid={`${testIdPrefix}-cancel`} className="h-9 rounded-lg text-xs font-black" onClick={onCancel} disabled={isSaving}>
            <X className="ml-1 h-3.5 w-3.5" />
            انصراف
          </Button>
          <Button type="button" data-testid={`${testIdPrefix}-save`} className="h-9 rounded-lg text-xs font-black" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Save className="ml-1 h-3.5 w-3.5" />}
            ذخیره
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" data-testid={`${testIdPrefix}-edit`} className="h-9 rounded-lg text-xs font-black" onClick={onEdit}>
          ویرایش
        </Button>
      )}
    </div>
  );
}

function BaseSection({
  data,
  flowCode,
  canUpdate,
  isSaving,
  onSave,
}: {
  data: ShipmentV2BaseSection;
  flowCode: ShipmentV2FlowCode;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (payload: ShipmentV2BaseSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<ShipmentV2BaseSection>(data);

  React.useEffect(() => {
    if (!isEditing) setDraft(data);
  }, [data, isEditing]);

  const updateDraft = (key: keyof ShipmentV2BaseSection, value: string | null) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-4">
      {isEditing ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">عنوان محموله</Label>
            <Input className="h-9 text-xs" value={draft.shipmentTitle || ""} onChange={(event) => updateDraft("shipmentTitle", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">مبدا</Label>
            <Input className="h-9 text-xs" value={draft.origin || ""} onChange={(event) => updateDraft("origin", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">بندر تخلیه</Label>
            <Input className="h-9 text-xs" value={draft.dischargePort || ""} onChange={(event) => updateDraft("dischargePort", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground">بندر تحویل</Label>
            <Input className="h-9 text-xs" value={draft.deliveryPort || ""} onChange={(event) => updateDraft("deliveryPort", event.target.value)} />
          </div>
          {flowCode === "IMPORT_SHIP" ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">کانساینی</Label>
              <Input className="h-9 text-xs" value={draft.consigneeName || ""} onChange={(event) => updateDraft("consigneeName", event.target.value)} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">نوع لنج</Label>
              <select
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/50"
                value={draft.lenjType || ""}
                onChange={(event) => updateDraft("lenjType", event.target.value || null)}
              >
                <option value="">ثبت نشده</option>
                <option value="TEH_LENJI">ته لنجی</option>
                <option value="MALVANI">ملوانی</option>
              </select>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-3">
          {[
            ["عنوان محموله", data.shipmentTitle],
            ["مبدا", data.origin],
            ["بندر تخلیه", data.dischargePort],
            ["بندر تحویل", data.deliveryPort],
            flowCode === "IMPORT_SHIP" ? ["کانساینی", data.consigneeName] : ["نوع لنج", data.lenjType ? lenjTypeLabels[data.lenjType] : ""],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-[10px] font-black text-muted-foreground">{label}</p>
              <p className="mt-1 min-h-5 break-words text-xs font-black text-foreground">{displayValue(value)}</p>
            </div>
          ))}
        </div>
      )}
      <SectionActions
        canUpdate={canUpdate}
        isSaving={isSaving}
        isEditing={isEditing}
        testIdPrefix="shipment-v2-base"
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setDraft(data);
          setIsEditing(false);
        }}
        onSave={() => {
          onSave(draft);
          setIsEditing(false);
        }}
      />
    </div>
  );
}

function GoodsSection({
  data,
  canUpdate,
  isSaving,
  onSave,
}: {
  data: ShipmentV2GoodsSection;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (payload: ShipmentV2GoodsSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [container20Count, setContainer20Count] = React.useState("");
  const [container40Count, setContainer40Count] = React.useState("");
  const [rows, setRows] = React.useState<Array<ShipmentV2GoodsRow & { id: string }>>([]);

  const resetDraft = React.useCallback(() => {
    setContainer20Count(data.container20Count === null || data.container20Count === undefined ? "" : String(data.container20Count));
    setContainer40Count(data.container40Count === null || data.container40Count === undefined ? "" : String(data.container40Count));
    const goodsRows = data.goodsRows || [];
    setRows(
      goodsRows.length
        ? goodsRows.map((row, index) => ({ ...row, id: `goods-${index}-${row.description}` }))
        : [{ id: "goods-empty", description: "", quantity: null, weight: null, cbm: null }]
    );
  }, [data]);

  React.useEffect(() => {
    if (!isEditing) resetDraft();
  }, [isEditing, resetDraft]);

  const updateRow = (rowId: string, updates: Partial<ShipmentV2GoodsRow>) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...updates } : row)));
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      { id: `goods-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, description: "", quantity: null, weight: null, cbm: null },
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== rowId);
      return next.length ? next : [{ id: "goods-empty", description: "", quantity: null, weight: null, cbm: null }];
    });
  };

  const handleSave = () => {
    const goodsRows = rows
      .map((row) => ({
        description: row.description.trim(),
        quantity: row.quantity ?? null,
        weight: row.weight ?? null,
        cbm: row.cbm ?? null,
      }))
      .filter((row) => row.description);
    onSave({
      container20Count: optionalNumber(container20Count),
      container40Count: optionalNumber(container40Count),
      goodsRows,
    });
    setIsEditing(false);
  };

  const savedRows = data.goodsRows || [];

  return (
    <div className="space-y-4">
      {isEditing ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">کانتینر ۲۰ فوت</Label>
              <Input className="h-9 text-xs" inputMode="numeric" value={container20Count} onChange={(event) => setContainer20Count(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">کانتینر ۴۰ فوت</Label>
              <Input className="h-9 text-xs" inputMode="numeric" value={container40Count} onChange={(event) => setContainer40Count(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black text-muted-foreground">ردیف‌های کالا</p>
              <Button type="button" variant="outline" className="h-8 rounded-lg text-[11px] font-black" onClick={addRow}>
                افزودن کالا
              </Button>
            </div>
            {rows.map((row, index) => (
              <div key={row.id} className="grid gap-2 rounded-lg border border-border bg-muted/20 p-2 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))_auto]">
                <Input className="h-9 text-xs" placeholder="شرح کالا" value={row.description} onChange={(event) => updateRow(row.id, { description: event.target.value })} />
                <Input className="h-9 text-xs" inputMode="decimal" placeholder="تعداد" value={row.quantity ?? ""} onChange={(event) => updateRow(row.id, { quantity: optionalNumber(event.target.value) })} />
                <Input className="h-9 text-xs" inputMode="decimal" placeholder="وزن" value={row.weight ?? ""} onChange={(event) => updateRow(row.id, { weight: optionalNumber(event.target.value) })} />
                <Input className="h-9 text-xs" inputMode="decimal" placeholder="CBM" value={row.cbm ?? ""} onChange={(event) => updateRow(row.id, { cbm: optionalNumber(event.target.value) })} />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-red-600" onClick={() => removeRow(row.id)} aria-label={`حذف کالای ${index + 1}`}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-[10px] font-black text-muted-foreground">کانتینر ۲۰ فوت</p>
              <p className="mt-1 text-xs font-black text-foreground">{displayValue(data.container20Count)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-[10px] font-black text-muted-foreground">کانتینر ۴۰ فوت</p>
              <p className="mt-1 text-xs font-black text-foreground">{displayValue(data.container40Count)}</p>
            </div>
          </div>
          {savedRows.length ? (
            <div className="space-y-2">
              {savedRows.map((row, index) => (
                <div key={`${row.description}-${index}`} className="grid gap-2 rounded-lg border border-border bg-muted/25 p-3 text-xs md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))]">
                  <p className="font-black text-foreground">{index + 1}. {row.description}</p>
                  <p className="text-muted-foreground">تعداد: <span className="font-black text-foreground">{displayValue(row.quantity)}</span></p>
                  <p className="text-muted-foreground">وزن: <span className="font-black text-foreground">{displayValue(row.weight)}</span></p>
                  <p className="text-muted-foreground">CBM: <span className="font-black text-foreground">{displayValue(row.cbm)}</span></p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-xs font-bold text-muted-foreground">
              هنوز کالایی در V2 ثبت نشده است.
            </div>
          )}
        </div>
      )}
      <SectionActions
        canUpdate={canUpdate}
        isSaving={isSaving}
        isEditing={isEditing}
        testIdPrefix="shipment-v2-goods"
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          resetDraft();
          setIsEditing(false);
        }}
        onSave={handleSave}
      />
    </div>
  );
}

function NotesSection({
  data,
  canUpdate,
  isSaving,
  onSave,
}: {
  data: ShipmentV2NotesSection;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (payload: ShipmentV2NotesSection) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(data.internalNote || "");

  React.useEffect(() => {
    if (!isEditing) setDraft(data.internalNote || "");
  }, [data.internalNote, isEditing]);

  return (
    <div className="space-y-4">
      {isEditing ? (
        <textarea
          data-testid="shipment-v2-notes-input"
          className="min-h-32 w-full resize-y rounded-md border border-border bg-background p-3 text-xs leading-6 outline-none focus:ring-1 focus:ring-primary/50"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <div className="min-h-20 rounded-lg border border-border bg-muted/25 p-3 text-xs font-bold leading-6 text-foreground">
          {draft.trim() || "یادداشتی ثبت نشده است."}
        </div>
      )}
      <SectionActions
        canUpdate={canUpdate}
        isSaving={isSaving}
        isEditing={isEditing}
        testIdPrefix="shipment-v2-notes"
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setDraft(data.internalNote || "");
          setIsEditing(false);
        }}
        onSave={() => {
          onSave({ internalNote: draft });
          setIsEditing(false);
        }}
      />
    </div>
  );
}

function EmptyV2Section() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center">
      <FileCheck2 className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-2 text-xs font-bold text-muted-foreground">هنوز فیلدی برای این بخش در V2 فعال نشده است.</p>
    </div>
  );
}

export default function ShipmentDetailV2() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useAppDataStore((state) => state.currentUser);
  const canUpdate = Boolean(currentUser?.permissions?.includes("shipments.update"));
  const [data, setData] = React.useState<ShipmentV2ProfileResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isInitializing, setIsInitializing] = React.useState(false);
  const [savingSection, setSavingSection] = React.useState<ShipmentV2SectionKey | null>(null);
  const [errorMessage, setErrorMessage] = React.useState("");

  const loadProfile = React.useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await shipmentV2Api.get(id);
      setData(response);
    } catch (error) {
      console.error("Load Shipment V2 failed", error);
      const message = error instanceof ApiError && error.status === 404
        ? "محموله پیدا نشد."
        : "بارگذاری پرونده V2 ناموفق بود.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const initializeProfile = async () => {
    if (!id) return;
    setIsInitializing(true);
    try {
      const response = await shipmentV2Api.initialize(id);
      setData(response);
      toast.success("پرونده V2 برای این محموله ساخته شد.");
    } catch (error) {
      console.error("Initialize Shipment V2 failed", error);
      toast.error("ساخت پرونده V2 ناموفق بود.");
    } finally {
      setIsInitializing(false);
    }
  };

  const saveSection = async (sectionKey: ShipmentV2SectionKey, payload: ShipmentV2SectionPayload) => {
    if (!id) return;
    setSavingSection(sectionKey);
    try {
      const response = await shipmentV2Api.updateSection(id, sectionKey, payload);
      setData(response);
      toast.success("بخش پرونده ذخیره شد.");
    } catch (error) {
      console.error("Update Shipment V2 section failed", error);
      toast.error("ذخیره بخش پرونده ناموفق بود.");
    } finally {
      setSavingSection(null);
    }
  };

  if (isLoading) {
    return (
      <div className="app-page flex min-h-[50vh] items-center justify-center font-sans" dir="rtl">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بارگذاری پرونده V2
        </div>
      </div>
    );
  }

  if (errorMessage || !data) {
    return (
      <div className="app-page space-y-4 font-sans" dir="rtl">
        <Button type="button" variant="outline" className="h-9 rounded-lg text-xs font-black" onClick={() => navigate("/shipments")}>
          بازگشت به محموله‌ها
        </Button>
        <Card className="rounded-xl border-border bg-card">
          <CardContent className="p-6 text-center text-sm font-bold text-muted-foreground">{errorMessage || "پرونده در دسترس نیست."}</CardContent>
        </Card>
      </div>
    );
  }

  const { shipment, profile } = data;
  const flowCode = profile?.flowCode || "IMPORT_SHIP";

  return (
    <div className="app-page space-y-5 font-sans" dir="rtl" data-testid="shipment-v2-detail-page">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
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
              <div className="min-w-0">
                <p className="font-mono text-sm font-black text-primary">{shipment.trackingNumber}</p>
                <h1 className="mt-1 break-words text-xl font-black tracking-tight text-foreground">
                  {profile?.sections.base.shipmentTitle || shipment.customerName || "پرونده محموله V2"}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-lg text-[11px] font-black">
                {flowLabels[flowCode]}
              </Badge>
              <Badge variant="outline" className="rounded-lg text-[11px] font-black">
                {statusLabels[shipment.status] || shipment.status}
              </Badge>
              <Badge variant="outline" className="rounded-lg text-[11px] font-black">
                {shipment.customerName || "بدون مشتری"}
              </Badge>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <Button type="button" variant="outline" className="h-9 rounded-lg text-xs font-black" onClick={() => navigate(`/shipments/${shipment.id}`)}>
              جزئیات قبلی
            </Button>
            <Button type="button" variant="outline" className="h-9 rounded-lg text-xs font-black" onClick={() => navigate("/daily-status")}>
              کوتاژ روزانه
            </Button>
            <Button type="button" variant="outline" className="h-9 rounded-lg text-xs font-black" onClick={() => navigate("/documents")}>
              اسناد
            </Button>
          </div>
        </div>
      </div>

      {!profile ? (
        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardContent className="space-y-4 p-6 text-center">
            <Anchor className="mx-auto h-8 w-8 text-primary" />
            <div>
              <h2 className="text-base font-black text-foreground">پرونده V2 هنوز برای این محموله ساخته نشده است.</h2>
              <p className="mt-2 text-xs font-bold leading-6 text-muted-foreground">
                ساخت پرونده V2 یک پروفایل خالی و تمیز ایجاد می‌کند و داده‌های قدیمی جزئیات یا کوتاژ را کپی نمی‌کند.
              </p>
            </div>
            {canUpdate ? (
              <Button type="button" className="h-10 rounded-lg text-xs font-black" onClick={() => void initializeProfile()} disabled={isInitializing}>
                {isInitializing ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <RotateCw className="ml-1 h-4 w-4" />}
                شروع پرونده V2
              </Button>
            ) : (
              <p className="text-xs font-bold text-muted-foreground">برای ساخت پرونده V2 به دسترسی ویرایش محموله نیاز است.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sectionDefinitions.map((section) => {
            const Icon = section.icon;
            if (section.key === "base") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <BaseSection
                      data={profile.sections.base}
                      flowCode={profile.flowCode}
                      canUpdate={canUpdate}
                      isSaving={savingSection === "base"}
                      onSave={(payload) => void saveSection("base", payload)}
                    />
                  </SectionCard>
                </React.Fragment>
              );
            }
            if (section.key === "goods") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <GoodsSection
                      data={profile.sections.goods}
                      canUpdate={canUpdate}
                      isSaving={savingSection === "goods"}
                      onSave={(payload) => void saveSection("goods", payload)}
                    />
                  </SectionCard>
                </React.Fragment>
              );
            }
            if (section.key === "notes") {
              return (
                <React.Fragment key={section.key}>
                  <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                    <NotesSection
                      data={profile.sections.notes}
                      canUpdate={canUpdate}
                      isSaving={savingSection === "notes"}
                      onSave={(payload) => void saveSection("notes", payload)}
                    />
                  </SectionCard>
                </React.Fragment>
              );
            }
            return (
              <React.Fragment key={section.key}>
                <SectionCard sectionKey={section.key} title={section.title} icon={Icon}>
                  <EmptyV2Section />
                </SectionCard>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
