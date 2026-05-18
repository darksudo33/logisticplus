import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  MapPin,
  Package,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { PublicTrackingSkeleton } from "@/src/components/SkeletonStates";

type PublicDocument = {
  id: string;
  title: string;
  fileName?: string;
  fileSize?: string;
  downloadUrl: string;
};

type PublicStep = {
  id: string;
  label: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | string;
  order: number;
  completedAt?: string | null;
};

type PublicTrackingPayload = {
  shipment: {
    code: string;
    publicStatusLabel: string;
    publicStatusDescription: string;
    origin?: string;
    destination?: string;
    estimatedDelivery?: string;
    lastPublicUpdate?: string;
  };
  steps?: PublicStep[];
  documents: PublicDocument[];
  company: {
    name: string;
    contactText: string;
  };
};

const unavailableMessage = "این لینک رهگیری در دسترس نیست یا غیرفعال شده است.";

const statusTranslations: Record<string, string> = {
  "Shipment is being prepared": "محموله در حال آماده سازی است",
  "Shipment is booked": "حمل محموله رزرو شده است",
  "Shipment is in transit": "محموله در مسیر حمل است",
  "Shipment has arrived": "محموله به مقصد یا بندر رسیده است",
  "Shipment is in customs review": "محموله در حال بررسی گمرکی است",
  "Shipment is cleared": "محموله ترخیص شده است",
  "Shipment is delivered": "محموله تحویل شده است",
  "Shipment is closed": "پرونده حمل بسته شده است",
  "Shipment is being prepared for customs": "محموله برای بررسی گمرکی آماده می شود",
};

const descriptionTranslations: Record<string, string> = {
  "Your shipment is being handled by our operations team.":
    "محموله شما توسط تیم عملیات در حال پیگیری است.",
  "Documents are under review and the operations team will publish the next safe update soon.":
    "اسناد در حال بررسی است و به محض آماده شدن، وضعیت بعدی برای شما نمایش داده می شود.",
};

function localizeStatus(value?: string) {
  if (!value) return "وضعیت محموله به روز شد";
  return statusTranslations[value] || value;
}

function localizeDescription(value?: string) {
  if (!value) return "جزئیات قابل نمایش برای مشتری هنوز ثبت نشده است.";
  return descriptionTranslations[value] || value;
}

function formatPublicDate(value?: string) {
  if (!value) return "منتشر نشده";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function DetailTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-black text-slate-950">{value || "منتشر نشده"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function stepStatusLabel(status: string) {
  if (status === "COMPLETED") return "انجام شده";
  if (status === "IN_PROGRESS") return "در حال انجام";
  return "در انتظار";
}

function stepStatusStyle(status: string) {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "IN_PROGRESS") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function CustomerStepsBox({ steps = [] }: { steps?: PublicStep[] }) {
  const completed = steps.filter((step) => step.status === "COMPLETED").length;
  const inProgress = steps.find((step) => step.status === "IN_PROGRESS");
  const progress = steps.length ? Math.round((completed / steps.length) * 100) : 0;

  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-col gap-3 text-base font-black text-slate-950 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            مراحل محموله
          </span>
          <Badge className="w-fit border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
            {completed} از {steps.length || 0} مرحله انجام شده
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.length ? (
          <>
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="flex items-center justify-between gap-4 text-xs font-bold text-slate-600">
                <span>پیشرفت کلی</span>
                <span dir="ltr">{progress}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-3 text-xs font-medium leading-6 text-blue-900">
                {inProgress
                  ? `مرحله فعلی: ${inProgress.label}`
                  : completed === steps.length
                    ? "تمام مراحل قابل نمایش این محموله تکمیل شده است."
                    : "مرحله بعدی پس از به روزرسانی تیم عملیات نمایش داده می شود."}
              </p>
            </div>

            <div className="space-y-2">
              {steps.map((step, index) => (
                <div
                  key={step.id || `${step.order}-${step.label}`}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-slate-500 shadow-sm">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-black leading-6 text-slate-950">{step.label}</p>
                      <Badge className={`w-fit shrink-0 ${stepStatusStyle(step.status)}`}>
                        {stepStatusLabel(step.status)}
                      </Badge>
                    </div>
                    {step.completedAt && (
                      <p className="mt-1 text-xs font-medium text-slate-500">تکمیل شده در {step.completedAt}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
            <Truck className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-600">هنوز مرحله ای برای نمایش عمومی ثبت نشده است.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PublicTrackingResult({ data }: { data: PublicTrackingPayload }) {
  const statusLabel = useMemo(
    () => localizeStatus(data.shipment.publicStatusLabel),
    [data.shipment.publicStatusLabel]
  );
  const statusDescription = useMemo(
    () => localizeDescription(data.shipment.publicStatusDescription),
    [data.shipment.publicStatusDescription]
  );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="border-b border-blue-100 bg-blue-50/70 px-5 py-4 md:px-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit border-blue-200 bg-white text-blue-700 hover:bg-white">
                رهگیری امن مشتری
              </Badge>
              <div>
                <p className="text-xs font-bold text-slate-500">شماره محموله</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 md:text-4xl" dir="ltr">
                  {data.shipment.code}
                </h1>
              </div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-white p-4 md:min-w-72">
              <div className="flex items-center gap-2 text-blue-700">
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-xs font-black">آخرین وضعیت قابل نمایش</p>
              </div>
              <h2 className="mt-3 text-xl font-black leading-8 text-slate-950">{statusLabel}</h2>
              <p className="mt-2 text-sm font-medium leading-7 text-slate-600">{statusDescription}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-[1.1fr_0.9fr] md:p-7">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500">مسیر حمل</p>
                <p className="mt-1 text-base font-black text-slate-950">
                  {data.shipment.origin || "مبدا نامشخص"} به {data.shipment.destination || "مقصد نامشخص"}
                </p>
              </div>
              <Truck className="h-8 w-8 text-blue-600" />
            </div>
            <div className="mt-5 flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-blue-600" />
              <div className="h-0.5 flex-1 bg-blue-200" />
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
            </div>
            <div className="mt-2 flex justify-between gap-4 text-xs font-bold text-slate-500">
              <span className="truncate">{data.shipment.origin || "مبدا"}</span>
              <span className="truncate text-left">{data.shipment.destination || "مقصد"}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-500">آخرین به روزرسانی</p>
            <p className="mt-2 text-sm font-black leading-7 text-slate-950">
              {formatPublicDate(data.shipment.lastPublicUpdate)}
            </p>
            <p className="mt-3 text-xs font-medium leading-6 text-slate-500">
              فقط اطلاعات امن و قابل نمایش برای مشتری در این صفحه منتشر می شود.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <DetailTile icon={<MapPin className="h-5 w-5" />} label="مبدا" value={data.shipment.origin} />
        <DetailTile icon={<Package className="h-5 w-5" />} label="مقصد" value={data.shipment.destination} />
        <DetailTile
          icon={<Calendar className="h-5 w-5" />}
          label="زمان تقریبی تحویل"
          value={data.shipment.estimatedDelivery}
        />
      </div>

      <CustomerStepsBox steps={data.steps} />

      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-black text-slate-950">
            <FileText className="h-5 w-5 text-blue-600" />
            اسناد قابل مشاهده برای مشتری
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.documents.length ? (
            data.documents.map((document) => (
              <a
                key={document.id}
                href={document.downloadUrl}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{document.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {[document.fileName, document.fileSize].filter(Boolean).join(" | ") || "سند اشتراک گذاری شده"}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
                  <Download className="h-4 w-4" />
                </div>
              </a>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
              <FileText className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-600">
                هنوز سندی برای نمایش به مشتری منتشر نشده است.
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                هر زمان تیم عملیات سندی را برای مشتری فعال کند، همین جا نمایش داده می شود.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm font-medium leading-7 text-blue-900">
        برای سوال درباره این محموله، لطفا با نماینده عملیات خود در لجستیک پلاس تماس بگیرید.
      </div>
    </div>
  );
}

function PublicTrackSearch() {
  const [shipmentCode, setShipmentCode] = useState("");
  const [verification, setVerification] = useState("");
  const [data, setData] = useState<PublicTrackingPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setData(null);
    try {
      const response = await fetch("/api/public/track/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentCode, verification }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || unavailableMessage);
      setData(payload.data);
    } catch {
      setError("برای این اطلاعات، رهگیری قابل نمایش پیدا نشد.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicShell>
      <Card className="rounded-2xl border-blue-100 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-black text-slate-950">جستجوی امن محموله</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <Input
              value={shipmentCode}
              onChange={(event) => setShipmentCode(event.target.value)}
              placeholder="شماره محموله"
              className="h-11 text-right"
              dir="ltr"
            />
            <Input
              value={verification}
              onChange={(event) => setVerification(event.target.value)}
              placeholder="ایمیل یا شماره تماس مشتری"
              className="h-11 text-right"
            />
            <Button disabled={loading || !shipmentCode || !verification} className="h-11 gap-2">
              {loading ? (
                <ActionSkeleton inverted className="w-20" />
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  جستجو
                </>
              )}
            </Button>
          </form>
          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        </CardContent>
      </Card>
      {loading && <PublicTrackingSkeleton />}
      {data && <PublicTrackingResult data={data} />}
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 font-sans" dir="rtl">
      <header className="sticky top-0 z-10 border-b border-blue-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">لجستیک پلاس</p>
              <p className="truncate text-xs font-semibold text-slate-500">رهگیری امن محموله</p>
            </div>
          </div>
          <Link
            to="/track/search"
            className="shrink-0 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
          >
            جستجوی محموله
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:py-8">
        <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-black text-blue-700">پرتال مشتری</p>
          <h1 className="mt-2 text-2xl font-black leading-10 text-slate-950 md:text-3xl">
            وضعیت محموله خود را با اطلاعات امن و به روز مشاهده کنید
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-7 text-slate-600">
            این صفحه فقط اطلاعات تایید شده برای مشتری را نمایش می دهد و شامل اطلاعات داخلی، مالی یا عملیاتی محرمانه نیست.
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}

export default function PublicTrack() {
  const { token } = useParams();
  const [data, setData] = useState<PublicTrackingPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/public/track/${encodeURIComponent(token || "")}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || unavailableMessage);
        if (!cancelled) setData(payload.data);
      })
      .catch(() => {
        if (!cancelled) setError(unavailableMessage);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <PublicShell>
      {loading && <PublicTrackingSkeleton />}
      {!loading && error && (
        <Card className="rounded-2xl border-red-100 bg-white shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <div>
              <h1 className="text-xl font-black text-slate-950">رهگیری در دسترس نیست</h1>
              <p className="mt-2 text-sm font-medium leading-7 text-slate-500">{error}</p>
            </div>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/track/search">
                <ArrowRight className="h-4 w-4" />
                جستجوی امن محموله
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {!loading && data && <PublicTrackingResult data={data} />}
    </PublicShell>
  );
}

export { PublicTrackSearch };
