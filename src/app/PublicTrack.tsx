import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock3,
  Download,
  FileText,
  HelpCircle,
  MapPin,
  ShieldCheck,
  Truck,
  Route as RouteIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicTrackingSkeleton } from "@/src/components/SkeletonStates";

type PublicDocument = {
  id: string;
  title: string;
  fileName?: string;
  fileSize?: string;
  createdAt?: string;
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
    currentPublicPhase?: string;
    currentPublicLabel?: string;
    completedPublicStepsCount?: number;
    totalPublicStepsCount?: number;
    publicNote?: string;
  };
  steps?: PublicStep[];
  documents: PublicDocument[];
  company: {
    name: string;
    contactText: string;
  };
};

const unavailableMessage = "این لینک رهگیری در دسترس نیست یا غیرفعال شده است.";

const descriptionTranslations: Record<string, string> = {
  "Your shipment is being handled by our operations team.":
    "محموله شما توسط تیم عملیات در حال پیگیری است.",
  "Documents are under review and the operations team will publish the next safe update soon.":
    "اسناد در حال بررسی است و به محض آماده شدن، وضعیت بعدی برای شما نمایش داده می شود.",
};

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

const unknownValue = "ثبت نشده";

const publicStages = [
  {
    id: "registered",
    label: "ثبت محموله",
    summary: "اطلاعات محموله ثبت شده است",
    guidance: "پس از تکمیل بررسی اطلاعات، وضعیت بعدی محموله در این صفحه نمایش داده می‌شود.",
  },
  {
    id: "review",
    label: "آماده‌سازی و بررسی اطلاعات",
    summary: "اطلاعات پرونده در حال بررسی است",
    guidance: "پس از تکمیل بررسی اطلاعات، وضعیت بعدی محموله در این صفحه نمایش داده می‌شود.",
  },
  {
    id: "transit",
    label: "حمل و ورود",
    summary: "محموله در مسیر حمل یا ورود است",
    guidance: "پس از دریافت اطلاعات ورود، وضعیت محموله به‌روزرسانی می‌شود.",
  },
  {
    id: "clearance",
    label: "فرآیند ترخیص",
    summary: "پرونده در مرحله بررسی و ترخیص قرار دارد",
    guidance: "پرونده در مرحله بررسی و ترخیص قرار دارد. نتیجه بعدی پس از ثبت به‌روزرسانی می‌شود.",
  },
  {
    id: "delivery",
    label: "خروج و تحویل",
    summary: "محموله در مرحله خروج یا تحویل است",
    guidance: "فرآیند محموله تکمیل شده است.",
  },
] as const;

type PublicStageState = "completed" | "current" | "pending" | "issue";

function cleanPublicValue(value?: string, fallback = unknownValue) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizePublicText(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function isFinalPublicStatus(text: string) {
  return [
    "delivered",
    "closed",
    "تحویل",
    "تکمیل",
    "بسته",
  ].some((keyword) => text.includes(keyword));
}

function hasSafeIssueStatus(text: string) {
  return ["issue", "review needed", "نیازمند بررسی"].some((keyword) => text.includes(keyword));
}

function publicStageIndex(shipment: PublicTrackingPayload["shipment"]) {
  const statusText = normalizePublicText([
    shipment.publicStatusLabel,
    shipment.publicStatusDescription,
    shipment.currentPublicPhase,
    shipment.currentPublicLabel,
  ].filter(Boolean).join(" "));

  if (isFinalPublicStatus(statusText)) return 4;
  if (statusText.includes("cleared") || statusText.includes("خروج")) return 4;
  if (statusText.includes("customs") || statusText.includes("clearance") || statusText.includes("ترخیص") || statusText.includes("گمرک")) return 3;
  if (statusText.includes("transit") || statusText.includes("arrived") || statusText.includes("حمل") || statusText.includes("ورود") || statusText.includes("رسیده")) return 2;
  if (statusText.includes("booked") || statusText.includes("prepared") || statusText.includes("آماده") || statusText.includes("بررسی")) return 1;

  const total = Number(shipment.totalPublicStepsCount || 0);
  const completed = Number(shipment.completedPublicStepsCount || 0);
  if (total > 0) {
    const ratio = Math.max(0, Math.min(1, completed / total));
    return Math.max(0, Math.min(publicStages.length - 1, Math.floor(ratio * publicStages.length)));
  }
  return 0;
}

function timelineForShipment(shipment: PublicTrackingPayload["shipment"]) {
  const currentIndex = publicStageIndex(shipment);
  const statusText = normalizePublicText([
    shipment.publicStatusLabel,
    shipment.currentPublicLabel,
    shipment.publicNote,
  ].filter(Boolean).join(" "));
  const final = isFinalPublicStatus(statusText) || (
    Number(shipment.totalPublicStepsCount || 0) > 0 &&
    Number(shipment.completedPublicStepsCount || 0) >= Number(shipment.totalPublicStepsCount || 0)
  );
  const issue = hasSafeIssueStatus(statusText) && !final;

  return publicStages.map((stage, index) => {
    let state: PublicStageState = "pending";
    if (final && index <= currentIndex) state = "completed";
    else if (index < currentIndex) state = "completed";
    else if (index === currentIndex) state = issue ? "issue" : "current";
    return { ...stage, state };
  });
}

function currentStageForShipment(shipment: PublicTrackingPayload["shipment"]) {
  return publicStages[publicStageIndex(shipment)] || publicStages[0];
}

function nextStepGuidance(shipment: PublicTrackingPayload["shipment"]) {
  const statusText = normalizePublicText([
    shipment.publicStatusLabel,
    shipment.currentPublicLabel,
  ].filter(Boolean).join(" "));
  if (isFinalPublicStatus(statusText)) return publicStages[4].guidance;
  return currentStageForShipment(shipment).guidance;
}

function stageStatusLabel(state: PublicStageState) {
  if (state === "completed") return "انجام شده";
  if (state === "current") return "در حال انجام";
  if (state === "issue") return "نیازمند بررسی";
  return "در انتظار";
}

function routeText(origin?: string, destination?: string) {
  const from = cleanPublicValue(origin, "مبدأ ثبت نشده");
  const to = cleanPublicValue(destination, "مقصد ثبت نشده");
  return `از ${from} به ${to}`;
}

function PublicTrackingResult({ data }: { data: PublicTrackingPayload }) {
  const timeline = useMemo(() => timelineForShipment(data.shipment), [data.shipment]);
  const currentStage = useMemo(() => currentStageForShipment(data.shipment), [data.shipment]);
  const statusLabel = useMemo(() => currentStage.summary, [currentStage]);
  const statusDescription = useMemo(
    () => localizeDescription(data.shipment.publicStatusDescription),
    [data.shipment.publicStatusDescription]
  );
  const origin = cleanPublicValue(data.shipment.origin, "مبدأ ثبت نشده");
  const destination = cleanPublicValue(data.shipment.destination, "مقصد ثبت نشده");
  const estimatedDelivery = cleanPublicValue(data.shipment.estimatedDelivery, "");

  return (
    <div className="space-y-5" data-testid="public-tracking-result">
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm" data-testid="public-tracking-hero">
        <div className="bg-blue-50/70 px-5 py-5 md:px-7">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
            <div className="min-w-0 space-y-4">
              <Badge className="w-fit border-blue-200 bg-white text-blue-700 hover:bg-white">
                رهگیری امن مشتری
              </Badge>
              <div>
                <p className="text-xs font-black text-slate-500">شماره محموله</p>
                <h1 className="mt-1 truncate text-3xl font-black tracking-tight text-slate-950 md:text-4xl" dir="ltr">
                  {data.shipment.code}
                </h1>
              </div>
              <div className="max-w-2xl">
                <h2 className="text-xl font-black leading-9 text-slate-950 md:text-2xl" data-testid="public-current-status">
                  {statusLabel}
                </h2>
                <p className="mt-2 text-sm font-medium leading-7 text-slate-600">{statusDescription}</p>
              </div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-blue-700">
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-xs font-black">آخرین وضعیت قابل نمایش</p>
              </div>
              <Badge className="mt-3 w-fit border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-50">
                {currentStage.label}
              </Badge>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">آخرین بروزرسانی</p>
                <p className="mt-1 text-sm font-black leading-7 text-slate-950">
                  {formatPublicDate(data.shipment.lastPublicUpdate)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6" data-testid="public-route-section">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-base font-black text-slate-950">
              <RouteIcon className="h-5 w-5 text-blue-600" />
              مسیر محموله
            </p>
            <p className="mt-1 text-sm font-medium leading-7 text-slate-500" data-testid="public-route-text">
              {routeText(data.shipment.origin, data.shipment.destination)}
            </p>
          </div>
          <Badge className="w-fit border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50">
            مسیر
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-xs font-black text-slate-500">
              <MapPin className="h-4 w-4 text-blue-600" />
              مبدأ
            </p>
            <p className="mt-2 truncate text-base font-black text-slate-950" data-testid="public-route-origin">{origin}</p>
          </div>
          <div className="flex min-w-0 items-center justify-center gap-3 py-1 md:w-44">
            <span className="h-3 w-3 rounded-full bg-blue-600" />
            <span className="h-0.5 min-w-10 flex-1 rounded-full bg-blue-100 md:min-w-20" />
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
              <Truck className="h-4 w-4" />
            </span>
            <span className="h-0.5 min-w-10 flex-1 rounded-full bg-emerald-100 md:min-w-20" />
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-xs font-black text-slate-500">
              <MapPin className="h-4 w-4 text-emerald-600" />
              مقصد
            </p>
            <p className="mt-2 truncate text-base font-black text-slate-950" data-testid="public-route-destination">{destination}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4" data-testid="public-eta">
          <p className="flex items-center gap-2 text-sm font-black text-blue-900">
            <Calendar className="h-4 w-4 text-blue-700" />
            {estimatedDelivery
              ? `زمان تقریبی تحویل: ${estimatedDelivery}`
              : "زمان تقریبی تحویل هنوز ثبت نشده است."}
          </p>
          {estimatedDelivery && (
            <p className="mt-2 text-xs font-medium leading-6 text-blue-800">
              این زمان تقریبی است و ممکن است با توجه به وضعیت حمل و ترخیص تغییر کند.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6" data-testid="public-progress-timeline">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-base font-black text-slate-950">مراحل محموله</p>
            <p className="mt-1 text-sm font-medium leading-7 text-slate-500">
              مراحل زیر به صورت کلی و امن برای مشتری نمایش داده می‌شوند.
            </p>
          </div>
          <Badge className="w-fit border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
            {currentStage.label}
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {timeline.map((stage, index) => {
            const isCompleted = stage.state === "completed";
            const isCurrent = stage.state === "current";
            const isIssue = stage.state === "issue";
            const markerClassName = isCompleted
              ? "border-emerald-500 bg-emerald-500 text-white"
              : isIssue
                ? "border-amber-400 bg-amber-50 text-amber-700"
                : isCurrent
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-400";
            return (
              <div
                key={stage.id}
                className="relative rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                data-testid={`public-stage-${stage.id}`}
              >
                {index < timeline.length - 1 && (
                  <div className="absolute left-4 right-4 top-8 hidden h-0.5 translate-x-1/2 bg-slate-200 md:block" />
                )}
                <div className="relative z-10 flex items-start gap-3 md:flex-col">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${markerClassName}`}>
                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : isCurrent ? <Clock3 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black leading-6 text-slate-950">{stage.label}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{stageStatusLabel(stage.state)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm" data-testid="public-next-step-card">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-black text-blue-950">مرحله بعدی</p>
            <p className="mt-2 text-sm font-medium leading-7 text-blue-900">{nextStepGuidance(data.shipment)}</p>
          </div>
        </div>
      </section>

      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm" data-testid="public-documents-section">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-col gap-2 text-base font-black text-slate-950 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            اسناد قابل مشاهده برای مشتری
            </span>
            <Badge className="w-fit border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50">
              {data.documents.length} سند
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.documents.length ? (
            data.documents.map((document) => (
              <a
                key={document.id}
                href={document.downloadUrl}
                aria-label={`Download ${document.title}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{document.title}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                    <span>{[document.fileName, document.fileSize].filter(Boolean).join(" | ") || "سند منتشر شده"}</span>
                    {document.createdAt && <span>منتشر شده: {formatPublicDate(document.createdAt)}</span>}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
                  <Download className="h-4 w-4" />
                </div>
              </a>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center" data-testid="public-documents-empty">
              <FileText className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-600">
                هنوز سندی برای نمایش به مشتری منتشر نشده است.
              </p>
              <p className="mt-2 text-xs font-medium leading-6 text-slate-500">
                به محض آماده شدن اسناد قابل مشاهده، در این بخش نمایش داده می‌شوند.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
          </CardContent>
        </Card>
      )}
      {!loading && data && <PublicTrackingResult data={data} />}
    </PublicShell>
  );
}
