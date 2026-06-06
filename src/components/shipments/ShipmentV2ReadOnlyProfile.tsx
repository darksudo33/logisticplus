import React from "react";
import { Link } from "react-router-dom";
import {
  Anchor,
  CreditCard,
  ExternalLink,
  FileText,
  Landmark,
  NotebookText,
  Package,
  ShieldCheck,
  Ship,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  BusinessEntityContact,
  CommercialCard,
  Customer,
  MalvaniProfile,
  Shipment,
  ShipmentV2GoodsRow,
  ShipmentV2CurrencyCode,
  ShipmentV2CustomsRoute,
  ShipmentV2FlowCode,
  ShipmentV2ProfileResponse,
  ShipmentV2Sections,
  ShipmentV2ShipmentSummary,
} from "@/src/types";

const EMPTY_TEXT = "ثبت نشده";

const statusLabels: Record<string, string> = {
  PENDING: "در انتظار",
  BOOKED: "رزرو شده",
  IN_TRANSIT: "در مسیر",
  ARRIVED: "رسیده",
  CUSTOMS: "گمرک",
  CLEARED: "ترخیص شده",
  DELIVERED: "تحویل شده",
  CLOSED: "بسته شده",
};

const flowLabels: Record<ShipmentV2FlowCode, string> = {
  IMPORT_LANJ: "واردات لنج",
  IMPORT_SHIP: "واردات کشتی",
};

const customsRouteLabels: Record<ShipmentV2CustomsRoute, string> = {
  GREEN: "سبز",
  YELLOW: "زرد",
  RED: "قرمز",
  DIRECT_CARRIAGE: "حمل یکسره",
};

const currencyLabels: Record<ShipmentV2CurrencyCode, string> = {
  EUR: "یورو",
  CNY: "یوان",
  USD: "دلار",
  AED: "درهم",
  IRR: "ریال",
};

const customsTaxStatusLabels: Record<string, string> = {
  PAYABLE: "نیاز به پرداخت",
  GOOD_STANDING: "خوش حسابی",
};

const malvaniActiveStatusLabels: Record<string, string> = {
  ACTIVE: "فعال",
  INACTIVE: "غیرفعال",
  NEEDS_REVIEW: "نیازمند بررسی",
};

const emptySections: ShipmentV2Sections = {
  base: {},
  orderRegistration: {},
  goods: { goodsRows: [] },
  declarationKootaj: {},
  permits: { permitRows: [] },
  payments: {},
  banking: {},
  notes: { internalNote: "" },
};

function displayValue(value?: React.ReactNode) {
  if (value === null || value === undefined || value === "") return EMPTY_TEXT;
  return value;
}

function formatDateTime(value?: string | null) {
  if (!value) return EMPTY_TEXT;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(value?: string | null) {
  if (!value) return EMPTY_TEXT;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("fa-IR-u-ca-persian");
}

function displayMoney(amount?: number | null, currency?: ShipmentV2CurrencyCode) {
  if (amount === null || amount === undefined) return EMPTY_TEXT;
  return `${amount.toLocaleString("fa-IR")} ${currencyLabels[currency || "IRR"]}`;
}

type GoodsMetricKey = "quantity" | "weight" | "cbm" | "pcs";

function sumGoodsMetric(rows: ShipmentV2GoodsRow[], key: GoodsMetricKey) {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function formatGoodsMetric(value?: number | null) {
  if (value === null || value === undefined) return EMPTY_TEXT;
  return value.toLocaleString("fa-IR", { maximumFractionDigits: 6 });
}

function ProfileGoodsTotalsRow({ rows }: { rows: ShipmentV2GoodsRow[] }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5" data-testid="document-management-goods-total">
      <p className="text-[10px] font-black text-primary">مجموع</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          ["تعداد", "quantity"],
          ["وزن", "weight"],
          ["CBM", "cbm"],
          ["PCS", "pcs"],
        ].map(([label, key]) => (
          <div key={key} className="min-w-0 rounded-md bg-background/80 px-2 py-1" data-testid={`document-management-goods-total-${key}`}>
            <p className="truncate text-[9px] font-black text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate text-[11px] font-black text-foreground">
              {formatGoodsMetric(sumGoodsMetric(rows, key as GoodsMetricKey))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function inferFlowCode(shipment: ShipmentV2ShipmentSummary): ShipmentV2FlowCode {
  const typeCode = (shipment.shipmentTypeCode || "").toUpperCase();
  return typeCode.includes("LENJ") || typeCode.includes("LANJ") ? "IMPORT_LANJ" : "IMPORT_SHIP";
}

function commercialCardDisplayName(card?: CommercialCard | null) {
  if (!card) return "";
  return card.holderName || card.cardNumber || card.id || "";
}

function malvaniDisplayName(profile?: MalvaniProfile | null) {
  if (!profile) return "";
  return profile.displayName || profile.captainName || profile.lenjName || profile.id || "";
}

function activeContacts(contacts?: BusinessEntityContact[]) {
  return (contacts || []).filter((contact) => !contact.archivedAt);
}

function isActiveShipment(shipment: Shipment) {
  return !shipment.isArchived && !shipment.isExitedArchived && !["DELIVERED", "CLOSED"].includes(shipment.status);
}

function ReadField({
  label,
  children,
  wide,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn("min-w-0 rounded-lg border border-border bg-background px-3 py-2", wide && "md:col-span-2")}
    >
      <p className="truncate text-[11px] font-bold text-muted-foreground">{label}</p>
      <div className="mt-1 min-h-5 whitespace-pre-wrap break-words text-xs font-black leading-6 text-foreground">
        {displayValue(children)}
      </div>
    </div>
  );
}

function ProfileSection({
  title,
  icon: Icon,
  children,
  testId,
}: {
  title: string;
  icon: typeof Package;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section data-testid={testId} className="border-t border-border/70 px-4 py-4 first:border-t-0 sm:px-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-black text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function DialogFactRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-2.5 py-2">
      <span className="shrink-0 text-[10px] font-black text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-left text-[11px] font-black text-foreground" dir="auto">
        {displayValue(value)}
      </span>
    </div>
  );
}

function ContactList({
  contacts,
  emptyText,
  testId,
}: {
  contacts: BusinessEntityContact[];
  emptyText: string;
  testId: string;
}) {
  const rows = activeContacts(contacts);
  if (!rows.length) {
    return (
      <div data-testid={testId} className="rounded-lg border border-dashed border-border bg-muted/20 px-2.5 py-2 text-[11px] font-bold text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div data-testid={testId} className="grid gap-1.5">
      {rows.map((contact) => (
        <div key={contact.id} className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
            <p className="min-w-0 break-words text-[11px] font-black text-foreground">{contact.contactName}</p>
            {contact.isPrimary ? (
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[9px] font-black">
                اصلی
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-muted-foreground">
            {contact.roleTitle ? <span>{contact.roleTitle}</span> : null}
            <span dir="ltr">{contact.phoneNumber}</span>
            {contact.phoneLabel ? <span>{contact.phoneLabel}</span> : null}
          </div>
          {contact.note ? <p className="mt-1 text-[10px] font-bold leading-4 text-muted-foreground">{contact.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function ShipmentV2ReadOnlyProfile({
  data,
  customers,
  shipments,
  commercialCards,
  malvaniProfiles,
  documentCount,
}: {
  data: ShipmentV2ProfileResponse;
  customers: Customer[];
  shipments: Shipment[];
  commercialCards: CommercialCard[];
  malvaniProfiles: MalvaniProfile[];
  documentCount: number;
}) {
  const shipment = data.shipment;
  const flowCode = data.profile?.flowCode || inferFlowCode(shipment);
  const sections: ShipmentV2Sections = {
    ...emptySections,
    ...(data.profile?.sections || {}),
    base: {
      origin: shipment.origin || "",
      deliveryPort: shipment.destination || "",
      statusText: "",
      currentStage: "",
      orderRegistrationNumber: "",
      commercialCardDisplayName: "",
      malvaniDisplayName: "",
      ...(data.profile?.sections.base || {}),
    },
    goods: {
      ...emptySections.goods,
      ...(data.profile?.sections.goods || {}),
    },
    declarationKootaj: {
      ...emptySections.declarationKootaj,
      ...(data.profile?.sections.declarationKootaj || {}),
    },
    permits: {
      ...emptySections.permits,
      ...(data.profile?.sections.permits || {}),
    },
    payments: {
      ...emptySections.payments,
      ...(data.profile?.sections.payments || {}),
    },
    banking: {
      ...emptySections.banking,
      ...(data.profile?.sections.banking || {}),
    },
    notes: {
      ...emptySections.notes,
      ...(data.profile?.sections.notes || {}),
    },
  };
  const base = sections.base;
  const isLanj = flowCode === "IMPORT_LANJ";
  const credentialLabel = isLanj ? "ملوانی" : "کارت بازرگانی";
  const credentialId = isLanj ? base.malvaniProfileId : base.commercialCardId;
  const credentialDisplay = isLanj ? base.malvaniDisplayName : base.commercialCardDisplayName;
  const linkedCommercialCard = commercialCards.find((card) => (
    card.id === credentialId ||
    commercialCardDisplayName(card) === credentialDisplay
  )) || null;
  const linkedMalvaniProfile = malvaniProfiles.find((profile) => (
    profile.id === credentialId ||
    malvaniDisplayName(profile) === credentialDisplay
  )) || null;
  const [dialog, setDialog] = React.useState<"customer" | "credential" | null>(null);
  const customer = customers.find((item) => item.id === shipment.customerId) || null;
  const customerIdentifier = customer?.customerCode || customer?.code || shipment.customerCode || shipment.customerId || shipment.customerName || "";
  const activeCustomerShipments = React.useMemo(() => {
    const rows = shipments.filter((item) => item.customerId === shipment.customerId && isActiveShipment(item));
    if (rows.length || !shipment.customerId) return rows;
    return [{
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      containerNumber: "",
      customerId: shipment.customerId,
      customerName: customerIdentifier,
      origin: shipment.origin,
      destination: shipment.destination,
      status: shipment.status,
      createdAt: shipment.createdAt || "",
      estimatedDelivery: shipment.estimatedDelivery,
      freeTimeDays: 0,
    } as Shipment];
  }, [shipment, shipments]);
  const canOpenCredential = Boolean(isLanj ? linkedMalvaniProfile : linkedCommercialCard);
  const showContainerCounts = flowCode === "IMPORT_SHIP";
  const goodsRows = sections.goods.goodsRows || [];
  const permitRows = sections.permits.permitRows || [];
  const updatedAt = data.profile?.updatedAt || shipment.updatedAt || shipment.createdAt;

  return (
    <>
      <article data-testid="document-management-shipment-profile" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="border-b border-border bg-muted/20 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-primary">{flowLabels[flowCode]}</p>
              <h2 className="mt-1 truncate text-lg font-black text-foreground">
                {displayValue(shipment.trackingNumber)}
              </h2>
            </div>
            <Badge variant="outline" className="rounded-lg px-2 py-1 text-[11px] font-black">
              {statusLabels[shipment.status] || shipment.status}
            </Badge>
          </div>
        </header>

        <ProfileSection title="اطلاعات پایه" icon={Package} testId="document-management-profile-base">
          <div className="grid grid-flow-row-dense grid-cols-2 gap-2 md:grid-cols-2">
            <ReadField label="کد محموله" testId="document-management-base-code">
              <span className="block break-all text-left font-mono" dir="ltr">{shipment.trackingNumber}</span>
            </ReadField>
            <ReadField label="مشتری" testId="document-management-base-customer">
              {customerIdentifier ? (
                <button
                  type="button"
                  data-testid="document-management-customer-button"
                  className="inline-flex max-w-full items-center gap-1 text-right text-primary underline-offset-4 hover:underline"
                  onClick={() => setDialog("customer")}
                >
                  <span className="truncate">{customerIdentifier}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </button>
              ) : EMPTY_TEXT}
            </ReadField>
            <ReadField label="وضعیت">
              {base.statusText || statusLabels[shipment.status] || shipment.status}
            </ReadField>
            <ReadField label="شماره ثبت سفارش">
              <span dir="ltr">{displayValue(base.orderRegistrationNumber)}</span>
            </ReadField>
            <ReadField label={credentialLabel} testId="document-management-business-credential">
              {canOpenCredential ? (
                <button
                  type="button"
                  data-testid="document-management-business-credential-button"
                  className="inline-flex max-w-full items-center gap-1 text-right text-primary underline-offset-4 hover:underline"
                  onClick={() => setDialog("credential")}
                >
                  <span className="truncate">{displayValue(credentialDisplay)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </button>
              ) : (
                displayValue(credentialDisplay)
              )}
            </ReadField>
            <ReadField label="تعداد اسناد">
              {documentCount.toLocaleString("fa-IR")}
            </ReadField>
            <ReadField label="مبدا">
              {base.origin || shipment.origin}
            </ReadField>
            <ReadField label="بندر تحویل">
              {base.deliveryPort || shipment.destination}
            </ReadField>
            <ReadField label="بندر تخلیه">
              {base.dischargePort}
            </ReadField>
            <ReadField label="گیرنده کالا">
              {base.consigneeName}
            </ReadField>
            <ReadField label="مرحله فعلی" wide>
              {base.currentStage}
            </ReadField>
            <ReadField label="آخرین به‌روزرسانی" wide>
              {formatDateTime(updatedAt)}
            </ReadField>
          </div>
        </ProfileSection>

        <ProfileSection title="مشخصات کالا" icon={Ship} testId="document-management-profile-goods">
          <div className="grid gap-2">
            {showContainerCounts ? (
              <div className="grid grid-cols-2 gap-2">
                <ReadField label="کانتینر ۲۰ فوت">{sections.goods.container20Count?.toLocaleString("fa-IR")}</ReadField>
                <ReadField label="کانتینر ۴۰ فوت">{sections.goods.container40Count?.toLocaleString("fa-IR")}</ReadField>
              </div>
            ) : null}
            {goodsRows.length ? (
              <div className="grid gap-1.5">
                {goodsRows.map((row, index) => (
                  <div key={`${row.description}-${index}`} className="rounded-lg border border-border bg-background px-3 py-2">
                    <p className="text-xs font-black text-foreground">{displayValue(row.description)}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-muted-foreground">
                      <span>بسته‌بندی: {displayValue(row.packagingType)}</span>
                      <span>تعداد: {formatGoodsMetric(row.quantity)}</span>
                      <span>وزن: {formatGoodsMetric(row.weight)}</span>
                      <span>CBM: {formatGoodsMetric(row.cbm)}</span>
                      <span>PCS: {formatGoodsMetric(row.pcs)}</span>
                    </div>
                  </div>
                ))}
                <ProfileGoodsTotalsRow rows={goodsRows} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-xs font-bold text-muted-foreground">
                مشخصات کالا ثبت نشده است.
              </div>
            )}
          </div>
        </ProfileSection>

        <ProfileSection title="اظهار و کوتاژ" icon={FileText} testId="document-management-profile-declaration">
          <div className="grid grid-cols-2 gap-2">
            <ReadField label="شماره کوتاژ"><span dir="ltr">{displayValue(sections.declarationKootaj.cotageNumber)}</span></ReadField>
            <ReadField label="مسیر گمرکی">
              {sections.declarationKootaj.customsRoute ? customsRouteLabels[sections.declarationKootaj.customsRoute] : EMPTY_TEXT}
            </ReadField>
            <ReadField label="تاریخ ثبت کوتاژ">{formatDate(sections.declarationKootaj.cotageRegistrationDate)}</ReadField>
            <ReadField label="ارزش کل">{displayMoney(sections.declarationKootaj.totalValueAmount, sections.declarationKootaj.totalValueCurrency)}</ReadField>
            <ReadField label="مبلغ نهایی پرداختی" wide>
              {displayMoney(sections.declarationKootaj.finalPaidAmount, sections.declarationKootaj.finalPaidCurrency)}
            </ReadField>
          </div>
        </ProfileSection>

        <ProfileSection title="مجوزها" icon={ShieldCheck} testId="document-management-profile-permits">
          {permitRows.length ? (
            <div className="grid gap-1.5">
              {permitRows.map((row, index) => (
                <div key={`${row.permitName}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="min-w-0 break-words text-xs font-black text-foreground">{row.permitName}</span>
                  <Badge variant="outline" className="shrink-0 rounded-md text-[10px] font-black">
                    {displayValue(row.permitState)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-xs font-bold text-muted-foreground">
              مجوزی ثبت نشده است.
            </div>
          )}
        </ProfileSection>

        <ProfileSection title="پرداخت‌ها" icon={CreditCard} testId="document-management-profile-payments">
          <div className="grid grid-cols-2 gap-2">
            <ReadField label="پرداخت گمرکی">{sections.payments.customsPaymentPaid ? "پرداخت شده" : "بدون پرداخت"}</ReadField>
            <ReadField label="مبلغ گمرکی">{displayMoney(sections.payments.customsAmount, sections.payments.customsAmountCurrency)}</ReadField>
            <ReadField label="مابه‌التفاوت گمرکی">{displayMoney(sections.payments.customsDifferenceAmount, sections.payments.customsDifferenceCurrency)}</ReadField>
            <ReadField label="پرداخت مابه‌التفاوت">{sections.payments.customsDifferencePaid ? "پرداخت شده" : "بدون پرداخت"}</ReadField>
            <ReadField label="وضعیت مالیات">{sections.payments.customsTaxStatus ? customsTaxStatusLabels[sections.payments.customsTaxStatus] : EMPTY_TEXT}</ReadField>
            <ReadField label="مبلغ مالیات">{displayMoney(sections.payments.customsTaxAmount, sections.payments.customsTaxCurrency)}</ReadField>
          </div>
        </ProfileSection>

        <ProfileSection title="بانکی" icon={Landmark} testId="document-management-profile-banking">
          <div className="grid grid-cols-2 gap-2">
            <ReadField label="بانک">{sections.banking.bankName}</ReadField>
            <ReadField label="کد شعبه">{sections.banking.branchCode}</ReadField>
            <ReadField label="نام شعبه">{sections.banking.branchName}</ReadField>
            <ReadField label="کد ابزار پرداخت">{sections.banking.paymentInstrumentCode}</ReadField>
            <ReadField label="کد ساتا" wide>{sections.banking.sataCode}</ReadField>
          </div>
        </ProfileSection>

        <ProfileSection title="یادداشت‌ها" icon={NotebookText} testId="document-management-profile-notes">
          <div className="rounded-lg border border-border bg-background px-3 py-3 text-xs font-bold leading-6 text-foreground">
            {displayValue(sections.notes.internalNote)}
          </div>
        </ProfileSection>
      </article>

      <Dialog open={dialog === "customer"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent data-testid="document-management-customer-dialog" className="max-h-[90vh] overflow-y-auto rounded-xl border-border bg-card p-4 text-right text-foreground sm:max-w-xl" dir="rtl">
          <DialogHeader className="gap-1 border-b border-border/60 pb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-black">
              <Package className="h-4 w-4 text-primary" />
              {displayValue(customerIdentifier)}
            </DialogTitle>
            <DialogDescription className="text-right text-[11px] font-bold text-muted-foreground">
              شناسه مشتری و محموله‌های فعال
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <DialogFactRow label="کد مشتری" value={customerIdentifier} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground">محموله‌های فعال</p>
            <div data-testid="document-management-customer-active-shipments" className="grid gap-1.5">
              {activeCustomerShipments.length ? activeCustomerShipments.map((item) => (
                <Link
                  key={item.id}
                  to={`/shipments/${item.id}`}
                  className="group rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-right hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => setDialog(null)}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-[11px] font-black text-primary" dir="ltr">
                      {item.trackingNumber}
                    </span>
                    <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[9px] font-black">
                      {statusLabels[item.status] || item.status}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-[10px] font-bold text-muted-foreground">
                    {[item.origin, item.destination].filter(Boolean).join(" ← ") || EMPTY_TEXT}
                  </p>
                </Link>
              )) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-2.5 py-2 text-[11px] font-bold text-muted-foreground">
                  محموله فعالی برای این مشتری ثبت نشده است.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "credential"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent data-testid="document-management-business-credential-dialog" className="max-h-[90vh] overflow-y-auto rounded-xl border-border bg-card p-4 text-right text-foreground sm:max-w-xl" dir="rtl">
          {!isLanj && linkedCommercialCard ? (
            <>
              <DialogHeader className="gap-1 border-b border-border/60 pb-3">
                <DialogTitle className="flex items-center gap-2 text-sm font-black">
                  <CreditCard className="h-4 w-4 text-primary" />
                  {displayValue(commercialCardDisplayName(linkedCommercialCard))}
                </DialogTitle>
                <DialogDescription className="text-right text-[11px] font-bold text-muted-foreground">
                  اطلاعات کارت بازرگانی لینک شده به محموله
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <DialogFactRow label="شماره کارت" value={linkedCommercialCard.cardNumber} />
                <DialogFactRow label="تاریخ صدور" value={formatDate(linkedCommercialCard.issueDate)} />
                <DialogFactRow label="تاریخ انقضا" value={formatDate(linkedCommercialCard.expirationDate)} />
                <DialogFactRow label="شناسه ملی" value={linkedCommercialCard.nationalId} />
                <DialogFactRow label="مسئول" value={linkedCommercialCard.responsibleName} />
                <DialogFactRow label="اسناد" value={(linkedCommercialCard.documents?.length || 0).toLocaleString("fa-IR")} />
                {linkedCommercialCard.description ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
                    <p className="text-[10px] font-black text-muted-foreground">توضیحات</p>
                    <p className="mt-1 text-[11px] font-bold leading-5 text-foreground">{linkedCommercialCard.description}</p>
                  </div>
                ) : null}
                <div className="pt-1">
                  <p className="mb-1.5 text-[10px] font-black text-muted-foreground">مخاطبین</p>
                  <ContactList
                    contacts={(linkedCommercialCard.contacts || []) as BusinessEntityContact[]}
                    emptyText="مخاطبی برای این کارت ثبت نشده است."
                    testId="document-management-business-credential-contacts"
                  />
                </div>
              </div>
            </>
          ) : null}
          {isLanj && linkedMalvaniProfile ? (
            <>
              <DialogHeader className="gap-1 border-b border-border/60 pb-3">
                <DialogTitle className="flex items-center gap-2 text-sm font-black">
                  <Anchor className="h-4 w-4 text-primary" />
                  {displayValue(malvaniDisplayName(linkedMalvaniProfile))}
                </DialogTitle>
                <DialogDescription className="text-right text-[11px] font-bold text-muted-foreground">
                  اطلاعات ملوانی لینک شده به محموله
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <DialogFactRow label="نام ناخدا" value={linkedMalvaniProfile.captainName} />
                <DialogFactRow label="نام لنج" value={linkedMalvaniProfile.lenjName} />
                <DialogFactRow label="شماره/شناسه لنج" value={linkedMalvaniProfile.lenjRegistrationNumber} />
                <DialogFactRow label="نوع لنج" value={linkedMalvaniProfile.lenjType} />
                <DialogFactRow label="بندر اصلی" value={linkedMalvaniProfile.homePort} />
                <DialogFactRow label="وضعیت" value={malvaniActiveStatusLabels[linkedMalvaniProfile.activeStatus] || linkedMalvaniProfile.activeStatus} />
                {linkedMalvaniProfile.note ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
                    <p className="text-[10px] font-black text-muted-foreground">یادداشت</p>
                    <p className="mt-1 text-[11px] font-bold leading-5 text-foreground">{linkedMalvaniProfile.note}</p>
                  </div>
                ) : null}
                <div className="pt-1">
                  <p className="mb-1.5 text-[10px] font-black text-muted-foreground">مخاطبین</p>
                  <ContactList
                    contacts={(linkedMalvaniProfile.contacts || []) as BusinessEntityContact[]}
                    emptyText="مخاطبی برای این ملوانی ثبت نشده است."
                    testId="document-management-business-credential-contacts"
                  />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
