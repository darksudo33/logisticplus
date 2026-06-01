import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  BellRing,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  FileCheck2,
  FileText,
  Link2,
  LockKeyhole,
  PackageCheck,
  QrCode,
  Route,
  ShieldCheck,
  Ship,
  Truck,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { pricingPlans, formatIrr } from "@/src/lib/pricing";
import { cn } from "@/lib/utils";
import {
  PUBLIC_DEMO_PHONE_DISPLAY,
  PublicContactActions,
} from "@/src/components/PublicContactActions";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
};

const credibilityBadges = [
  "برای شرکت‌های حمل، فورواردری و ترخیص",
  "پنل فارسی برای پیگیری بار، سند و کارها",
  "لینک امن مشتری بدون ورود به پنل داخلی",
];

const proofItems = [
  { value: "پرونده مشترک", label: "هر بار با مشتری، سند، کار و تاریخچه خودش" },
  { value: "پیگیری کمتر", label: "تماس‌های تکراری «بار کجاست؟» کم می‌شود" },
  { value: "اسناد مرتب", label: "مدارک از چت‌ها و پوشه‌های پراکنده بیرون می‌آید" },
  { value: "دید مدیریتی", label: "کارهای عقب‌مانده و سندهای ناقص زودتر دیده می‌شوند" },
];

const heroSupportItems = [
  "از محموله‌های فعال شروع کنید، نه مهاجرت کل آرشیو",
  "لینک یا QR امن برای مشتری؛ اطلاعات داخلی مخفی می‌ماند",
  "مسئول هر پیگیری و مرحله بعدی پرونده مشخص می‌شود",
];

const featureCards = [
  {
    icon: Truck,
    title: "پرونده روشن برای هر محموله",
    text: "هر بار با مسیر، وضعیت، مشتری، اسناد، یادداشت‌ها، کارهای باز و تاریخچه تغییرات خودش ثبت می‌شود؛ نه در چند فایل و چند گوشی.",
  },
  {
    icon: FileText,
    title: "اسناد کنار همان بار",
    text: "بارنامه، فاکتور، مدارک ترخیص، قبض انبار و فایل‌های مشتری کنار پرونده می‌مانند تا تیم دنبال سند در واتساپ و پوشه‌های شخصی نگردد.",
  },
  {
    icon: LockKeyhole,
    title: "پیگیری امن برای مشتری",
    text: "برای هر محموله لینک یا QR بسازید تا مشتری فقط وضعیت تأییدشده را ببیند؛ بدون دسترسی به یادداشت‌ها، وظایف، فاکتورها یا فایل‌های داخلی.",
  },
  {
    icon: BellRing,
    title: "وظایف و یادآوری‌های قابل پیگیری",
    text: "پیگیری مدارک، هماهنگی ترخیص، تماس با مشتری یا هشدار دمیوراژ را به فرد مشخص بسپارید و ببینید چه کاری هنوز مانده است.",
  },
  {
    icon: BarChart3,
    title: "دید سریع برای مدیر عملیات",
    text: "مدیر می‌تواند محموله‌های فعال، اسناد ناقص، پیگیری‌های عقب‌افتاده و کارهای فوری را سریع‌تر ببیند و از تیم گزارش شفاهی نخواهد.",
  },
  {
    icon: Users,
    title: "مناسب تیم‌های فارسی‌زبان",
    text: "رابط فارسی و راست‌چین با اصطلاحاتی که برای تیم حمل، فورواردری، ترخیص و خدمات بندری آشناست؛ بدون مسیر آموزشی پیچیده.",
  },
];

const launchTrustItems = [
  {
    icon: ShieldCheck,
    title: "نمای مشتری از پنل داخلی جداست",
    text: "مشتری از لینک پیگیری فقط وضعیت و اطلاعات مجاز همان محموله را می‌بیند. یادداشت‌های داخلی، کارهای تیم، فاکتورها و اسناد خصوصی نمایش داده نمی‌شوند.",
    tone: "emerald",
  },
  {
    icon: FileCheck2,
    title: "شروع بدون مهاجرت سنگین",
    text: "برای پایلوت لازم نیست همه اطلاعات گذشته را وارد کنید. چند مشتری و محموله فعال کافی است تا تیم روی پرونده‌های واقعی خودش جریان کار را ببیند.",
    tone: "amber",
  },
  {
    icon: LockKeyhole,
    title: "بر اساس کار واقعی بازار ایران",
    text: "لجستیک پلاس از نیازهای شرکت‌های بندری، حمل و ترخیص در بوشهر شروع شده و برای تیم‌های لجستیکی فارسی‌زبان در سراسر ایران قابل استفاده است.",
    tone: "sky",
  },
];

const moduleShowcase = [
  {
    label: "محموله‌ها",
    title: "پرونده عملیاتی هر بار",
    text: "وضعیت فعلی، مسیر، مشتری، اسناد، یادداشت‌ها و مرحله بعدی در یک پرونده مشخص دیده می‌شود.",
    stats: ["وضعیت فعلی روشن", "مرحله بعدی مشخص", "سابقه تغییرات محفوظ"],
    icon: Ship,
  },
  {
    label: "اسناد",
    title: "مدارک بدون گم‌شدن",
    text: "بارنامه، فاکتور، مدارک ترخیص و فایل‌های مشتری به محموله درست وصل می‌شوند.",
    stats: ["بارنامه کنار پرونده", "مدرک ناقص قابل مشاهده", "فایل عمومی جدا از خصوصی"],
    icon: FileCheck2,
  },
  {
    label: "مشتریان",
    title: "سوابق مشتری در کنار عملیات",
    text: "اطلاعات تماس، محموله‌های در جریان، درخواست‌های باز و لینک‌های پیگیری مشتری در دسترس تیم می‌ماند.",
    stats: ["پرونده‌های باز مشتری", "پیگیری‌های پاسخ‌داده‌نشده", "لینک‌های ارسال‌شده"],
    icon: Users,
  },
  {
    label: "وظایف",
    title: "مسئولیت‌ها از حافظه افراد خارج می‌شود",
    text: "هر پیگیری با مسئول، مهلت، اولویت و ارتباط با محموله یا مشتری ثبت می‌شود.",
    stats: ["مسئول مشخص", "مهلت پیگیری", "کارهای فوری جدا"],
    icon: ClipboardList,
  },
  {
    label: "رهگیری",
    title: "لینک پیگیری امن",
    text: "مشتری وضعیت مجاز، مسیر کلی و فایل‌های عمومی را می‌بیند؛ اطلاعات داخلی شرکت نمایش داده نمی‌شود.",
    stats: ["نمای امن مشتری", "QR قابل ارسال", "اطلاعات داخلی مخفی"],
    icon: QrCode,
  },
  {
    label: "پیامک",
    title: "اطلاع‌رسانی و هشدارهای مهم",
    text: "در صورت فعال بودن پیامک، وضعیت برای مشتری ارسال می‌شود و تیم هشدارهای مهم مثل دمیوراژ یا کار فوری را می‌بیند.",
    stats: ["اطلاع‌رسانی وضعیت", "هشدار دمیوراژ", "رد ارسال‌ها"],
    icon: BellRing,
  },
];

const workflowSteps = [
  "پرونده محموله را بسازید",
  "مشتری، مسیر و اسناد را وصل کنید",
  "کارها را به افراد بسپارید",
  "لینک پیگیری را برای مشتری بفرستید",
];

const workflowDescriptions = [
  "اطلاعات اصلی بار، مسیر، وضعیت و نکات داخلی در همان پرونده ثبت می‌شود.",
  "بارنامه، فاکتور، مدارک ترخیص و فایل‌های مشتری کنار پرونده درست قرار می‌گیرند.",
  "هر پیگیری مسئول، مهلت و اولویت دارد؛ دیگر معلوم نیست «چه کسی باید دنبال کند؟» نمی‌ماند.",
  "مشتری فقط وضعیت مجاز را از لینک یا QR می‌بیند و اطلاعات داخلی شرکت محفوظ می‌ماند.",
];

const targetCustomers = [
  "شرکت‌های حمل‌ونقل و ترابری",
  "فورواردرها و حمل بین‌الملل",
  "شرکت‌های ترخیص و خدمات بندری",
  "نمایندگی‌های کشتیرانی و خدمات بندر",
  "تیم‌های لجستیک واردات و صادرات",
  "مدیرانی که گزارش عملیاتی دقیق‌تر می‌خواهند",
];

const landingImages = {
  hero: "/landing/logisticplus-hero-port.webp",
  documents: "/landing/logisticplus-documents-control.webp",
  operations: "/landing/logisticplus-dashboard-operations.webp",
  tracking: "/landing/logisticplus-tracking-mobile.webp",
} as const;

const faqItems = [
  {
    question: "آیا برای شروع باید همه اطلاعات قبلی را وارد کنیم؟",
    answer: "خیر. پیشنهاد ما این است که با چند مشتری و محموله فعال شروع کنید. وقتی تیم مسیر کار را دید، اگر لازم بود آرشیو قبلی را مرحله‌به‌مرحله اضافه می‌کنید.",
  },
  {
    question: "آیا مشتریان وارد پنل داخلی ما می‌شوند؟",
    answer: "خیر. مشتری فقط صفحه پیگیری همان محموله را می‌بیند. یادداشت‌ها، وظایف، فاکتورها، اسناد خصوصی و اطلاعات داخلی شرکت در پنل شما می‌ماند.",
  },
  {
    question: "اگر تیم ما الان با اکسل و واتساپ کار می‌کند چه؟",
    answer: "می‌توانید همان جریان فعلی را آرام‌تر و قابل پیگیری‌تر کنید. هدف این نیست که کار تیم ناگهان عوض شود؛ هدف این است که پرونده، سند و پیگیری از حالت پراکنده خارج شود.",
  },
  {
    question: "آیا برای شرکت‌های کوچک هم مناسب است؟",
    answer: "بله. حتی اگر تیم کوچک باشد، وقتی چند نفر درباره یک بار، سند و مشتری تصمیم می‌گیرند، داشتن یک پرونده مشترک جلوی فراموشی و دوباره‌کاری را می‌گیرد.",
  },
  {
    question: "آیا امکان آموزش و راه‌اندازی اولیه وجود دارد؟",
    answer: "بله. در شروع، ثبت مشتری، محموله، سند، وظیفه و لینک پیگیری را روی چند پرونده واقعی خودتان مرور می‌کنیم تا تیم سریع‌تر وارد کار شود.",
  },
  {
    question: "آیا فقط برای بوشهر است؟",
    answer: "خیر. شناخت اولیه محصول از فضای لجستیک و بندر بوشهر آمده، اما لجستیک پلاس برای شرکت‌های حمل، ترخیص، فورواردری و خدمات بندری در سراسر ایران قابل استفاده است.",
  },
];

function SectionHeading({ eyebrow, title, text, tone = "default" }: { eyebrow: string; title: string; text?: string; tone?: "default" | "inverse" }) {
  const inverse = tone === "inverse";

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.45 }}
      className="mx-auto mb-8 max-w-3xl text-center"
    >
      <p className={cn("mb-3 text-xs font-black", inverse ? "text-blue-100" : "text-primary")}>{eyebrow}</p>
      <h2 className={cn("text-2xl font-black leading-tight md:text-4xl", inverse ? "text-white" : "text-foreground")}>{title}</h2>
      {text && <p className={cn("mt-3 text-sm leading-8", inverse ? "text-blue-50/80" : "text-muted-foreground")}>{text}</p>}
    </motion.div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
        <PackageCheck className="h-5 w-5" />
      </span>
      <span className={cn("flex flex-col leading-none", compact && "hidden xs:flex")}>
        <span className="text-sm font-black text-foreground">لجستیک پلاس</span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">لجستیک پلاس</span>
      </span>
    </Link>
  );
}

function AnimatedRouteLine() {
  const routeStops = [
    { label: "ثبت", right: "0%" },
    { label: "اسناد", right: "50%" },
    { label: "پیگیری", right: "100%" },
  ];

  return (
    <div className="relative h-16 overflow-hidden rounded-xl border border-border bg-background/80">
      <div className="absolute inset-x-6 top-1/2 h-px bg-border" />
      <div className="absolute inset-x-6 top-1/2 h-0">
        {routeStops.map((stop) => (
          <span
            key={stop.label}
            className="absolute top-0 h-3 w-3 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card"
            style={{ right: stop.right }}
          />
        ))}
        <motion.span
          className="absolute top-0 h-3 w-3 translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_18px_rgba(37,99,235,0.55)]"
          animate={{
            right: ["0%", "0%", "50%", "100%"],
            opacity: [0, 1, 1, 0],
            scale: [0.78, 1, 1, 0.78],
          }}
          transition={{
            duration: 3.8,
            times: [0, 0.14, 0.62, 1],
            repeat: Infinity,
            repeatDelay: 1.7,
            ease: "easeInOut",
          }}
        />
      </div>
      <div className="absolute inset-x-4 bottom-3 flex justify-between text-[10px] font-bold text-muted-foreground">
        {routeStops.map((stop) => (
          <span key={stop.label}>{stop.label}</span>
        ))}
      </div>
    </div>
  );
}

function ProductPreviewHeroCard() {
  const statusRows = [
    ["LP-1403-218", "جبل‌علی به بوشهر", "در حال ترخیص", "پیگیری قبض انبار"],
    ["LP-1403-219", "شانگهای به بندر امام", "در مسیر دریایی", "آماده‌سازی مدارک"],
    ["LP-1403-220", "استانبول به تهران", "منتظر مدارک مشتری", "درخواست فاکتور"],
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.65, delay: 0.15 }}
      className="relative mx-auto w-full max-w-3xl lg:mx-0"
      aria-label="نمای نمونه پرونده‌های عملیاتی لجستیک پلاس"
    >
      <div className="absolute -inset-2 rounded-2xl bg-primary/5 blur-xl" />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
        <div className="relative h-56 overflow-hidden sm:h-64">
          <img
            data-testid="landing-local-image"
            src={landingImages.hero}
            alt="کانتینرها و عملیات بندری مرتبط با شرکت‌های حمل و ترخیص"
            className="h-full w-full object-cover"
            decoding="async"
            width={1672}
            height={941}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.70),rgba(15,23,42,0.10))]" />
          <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3 text-white">
            <div>
              <p className="text-[11px] font-black text-emerald-200">حمل، بندر، ترخیص</p>
              <h3 className="mt-1 text-xl font-black">پرونده هر بار جلوی چشم تیم</h3>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-border bg-muted/35 px-3 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Ship className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs font-black sm:text-sm">میز پیگیری عملیات</div>
              <div className="text-[10px] font-bold text-muted-foreground">لجستیک پلاس</div>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-700 sm:text-xs">
            <Link2 className="h-3.5 w-3.5" />
            لینک مشتری آماده
          </div>
        </div>

        <div className="grid gap-3 p-3 sm:p-5 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: "وضعیت بار", value: "به‌روز", icon: Truck },
                { label: "پیگیری تیم", value: "مسئول‌دار", icon: ClipboardList },
                { label: "سند ناقص", value: "مشخص", icon: FileText },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + index * 0.08 }}
                    className="min-w-0 rounded-xl border border-border bg-background p-3 sm:p-4"
                  >
                    <Icon className="mb-2 h-4 w-4 text-primary sm:h-5 sm:w-5" />
                    <div className="text-xl font-black text-foreground sm:text-2xl">{item.value}</div>
                    <div className="mt-1 text-[10px] font-bold leading-5 text-muted-foreground sm:text-xs">{item.label}</div>
                  </motion.div>
                );
              })}
            </div>

            <AnimatedRouteLine />

            <div className="rounded-xl border border-border bg-background p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-black sm:text-sm">پرونده‌های نیازمند پیگیری</span>
                <Route className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-2.5">
                {statusRows.map(([code, route, status, nextAction], index) => (
                  <motion.div
                    key={code}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45 + index * 0.08 }}
                    className="rounded-lg bg-card p-3 ring-1 ring-border/80"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                      <span className="font-black text-foreground" dir="ltr">{code}</span>
                      <span className="truncate font-bold text-muted-foreground">{status}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-muted-foreground sm:text-[11px]">
                      <span className="truncate">{route}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 font-black text-primary">{nextAction}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="rounded-xl border border-border bg-background p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-black">کنترل سند و دسترسی</span>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-2 text-xs">
                {["بارنامه به پرونده وصل شد", "فاکتور در پنل داخلی ماند", "لینک مشتری فقط وضعیت را نشان داد"].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 font-bold text-muted-foreground ring-1 ring-border/80">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {item}
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="rounded-xl border border-primary/20 bg-primary/5 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-primary">صفحه امن مشتری</div>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">مشتری پاسخ «بار کجاست؟» را می‌بیند، نه اطلاعات داخلی شرکت را.</p>
                </div>
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-card text-primary ring-1 ring-border">
                  <QrCode className="h-7 w-7" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
              className="hidden rounded-xl border border-border bg-background p-4 sm:block"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-black">
                <BarChart3 className="h-4 w-4 text-primary" />
                اولویت پیگیری‌ها
              </div>
              <div className="flex h-20 items-end gap-1.5">
                {[44, 68, 52, 82, 60, 74, 92, 66, 78, 88].map((height, index) => (
                  <motion.span
                    key={`${height}-${index}`}
                    className="flex-1 rounded-t bg-primary/70"
                    initial={{ height: 8 }}
                    animate={{ height }}
                    transition={{ delay: 0.7 + index * 0.03, duration: 0.55 }}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HeroPlanStrip() {
  return (
    <section className="px-4 py-14 md:py-18">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="پلن‌ها"
          title="بعد از دمو، پلن مناسب حجم عملیاتتان را انتخاب کنید"
          text="قیمت‌ها و ظرفیت‌ها شفاف‌اند؛ انتخاب پلن بر اساس تعداد کاربر، تعداد محموله ماهانه و فضای نگهداری اسناد انجام می‌شود."
        />
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-2xl shadow-primary/10 backdrop-blur md:grid-cols-3"
        >
          {pricingPlans.map((plan) => (
            <motion.div
              key={plan.id}
              variants={fadeUp}
              transition={{ duration: 0.35 }}
              className={cn(
                "relative overflow-hidden rounded-xl border p-4 transition hover:-translate-y-1 hover:shadow-lg",
                plan.recommended ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25" : "border-border bg-background"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={cn("text-base font-black", plan.recommended ? "text-primary-foreground" : "text-foreground")}>{plan.name}</div>
                  <div className={cn("mt-1 text-[11px] font-bold leading-5", plan.recommended ? "text-primary-foreground/75" : "text-muted-foreground")}>{plan.audience}</div>
                </div>
                {plan.recommended && (
                  <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[10px] font-black text-primary-foreground">
                    پیشنهاد ما
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-end gap-1">
                <span className={cn("text-xl font-black", plan.recommended ? "text-primary-foreground" : "text-foreground")}>{formatIrr(plan.monthlyPriceIrr)}</span>
                <span className={cn("pb-0.5 text-[11px] font-bold", plan.recommended ? "text-primary-foreground/70" : "text-muted-foreground")}>/ ماه</span>
              </div>
              <div className={cn("mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold", plan.recommended ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {plan.summaryFeatures.map((feature) => (
                  <span key={feature} className={cn("rounded-full px-2 py-1", plan.recommended ? "bg-primary-foreground/12" : "bg-muted")}>{feature}</span>
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link
                  to={`/signup?plan=${encodeURIComponent(plan.id)}`}
                  className={cn(
                    "inline-flex h-9 items-center justify-center gap-1 rounded-lg border px-3 text-xs font-black",
                    plan.recommended ? "border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground" : "border-primary/25 bg-primary/10 text-primary"
                  )}
                >
                  انتخاب این پلن
                  <ChevronLeft className="h-4 w-4" />
                </Link>
                <Link
                  to="/contact"
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-black",
                    plan.recommended ? "border-primary-foreground/25 text-primary-foreground" : "border-emerald-500/25 text-emerald-700"
                  )}
                >
                  مشاوره پلن
                </Link>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function MiniModulePreview({ item, index }: { item: (typeof moduleShowcase)[number]; index: number }) {
  const Icon = item.icon;
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.42, delay: Math.min(index * 0.04, 0.18) }}
      className="group rounded-xl border border-white/20 bg-white/[0.13] p-5 shadow-2xl shadow-blue-950/20 backdrop-blur-xl transition hover:-translate-y-1 hover:border-white/35 hover:bg-white/[0.18]"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-lg border border-white/15 bg-white/15 px-3 py-1 text-xs font-black text-blue-50">{item.label}</div>
          <h3 className="mt-3 text-lg font-black text-white">{item.title}</h3>
          <p className="mt-2 text-sm leading-7 text-blue-50/80">{item.text}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/15 text-blue-50 transition group-hover:bg-white group-hover:text-primary">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {item.stats.map((stat) => (
          <div key={stat} className="rounded-lg border border-white/15 bg-blue-950/20 px-3 py-2 text-xs font-bold text-blue-50/90 shadow-sm shadow-blue-950/10">
            {stat}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function LandingImagePanel({
  src,
  alt,
  className,
  aspectClassName = "aspect-[4/3]",
}: {
  src: string;
  alt: string;
  className?: string;
  aspectClassName?: string;
}) {
  return (
    <motion.figure
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.42 }}
      className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}
    >
      <div className={cn("relative w-full overflow-hidden", aspectClassName)}>
        <img
          data-testid="landing-local-image"
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.02),rgba(15,23,42,0.20))]" />
      </div>
    </motion.figure>
  );
}

export default function LandingPage() {
  const headerNavItems = [
    { label: "خانه", target: "/", kind: "route" },
    { label: "پلن‌ها", target: "/pricing", kind: "route" },
    { label: "تماس با ما", target: "/contact", kind: "route" },
  ] as const;

  const navItemClass =
    "rounded-xl px-3 py-2 text-xs font-black text-muted-foreground transition hover:bg-primary/10 hover:text-primary";

  return (
    <div className="dashboard-theme app-shell min-h-screen overflow-x-hidden bg-background text-foreground" dir="rtl">
      <header id="home" className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/85 shadow-sm shadow-primary/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-16 items-center justify-between gap-3">
            <BrandMark />
            <nav aria-label="ناوبری اصلی" className="hidden items-center rounded-2xl border border-border/80 bg-card/80 p-1 shadow-sm md:flex">
              {headerNavItems.map((item) =>
                item.kind === "route" ? (
                  <Link key={item.label} to={item.target} className={navItemClass}>
                    {item.label}
                  </Link>
                ) : (
                  <a key={item.label} href={item.target} className={navItemClass}>
                    {item.label}
                  </a>
                )
              )}
            </nav>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="hidden h-10 rounded-xl px-4 text-xs font-black sm:inline-flex">
                <Link to="/login">ورود</Link>
              </Button>
              <Button asChild className="h-10 rounded-xl px-3 text-xs font-black shadow-lg shadow-primary/15 sm:px-4">
                <Link to="/signup">ثبت‌نام <ArrowLeft className="mr-1.5 h-4 w-4 sm:mr-2" /></Link>
              </Button>
            </div>
          </div>
          <nav aria-label="ناوبری موبایل" className="-mx-1 flex gap-1 overflow-x-auto border-t border-border/60 px-1 py-2 md:hidden">
            {headerNavItems.map((item) =>
              item.kind === "route" ? (
                <Link key={item.label} to={item.target} className="shrink-0 rounded-xl px-3 py-2 text-[11px] font-black text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
                  {item.label}
                </Link>
              ) : (
                <a key={item.label} href={item.target} className="shrink-0 rounded-xl px-3 py-2 text-[11px] font-black text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
                  {item.label}
                </a>
              )
            )}
            <Link to="/login" className="shrink-0 rounded-xl px-3 py-2 text-[11px] font-black text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
              ورود
            </Link>
          </nav>
        </div>
      </header>

      <main className="pt-[105px] md:pt-16">
        <section className="relative overflow-hidden border-b border-border bg-background px-4 pb-16 pt-8 sm:pt-12 md:pb-20 md:pt-16">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.045)_1px,transparent_1px)] bg-[size:36px_36px]" />
          <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(37,99,235,0.10),transparent)]" />
          <div className="relative mx-auto grid max-w-7xl gap-7 lg:grid-cols-[0.84fr_1.16fr] lg:items-center">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="text-center lg:text-right"
            >
              <motion.div variants={fadeUp} className="mb-5 flex flex-wrap justify-center gap-2 lg:justify-start">
                {credibilityBadges.map((badge) => (
                  <span key={badge} className="rounded-full border border-border bg-card/90 px-3 py-1.5 text-[11px] font-black text-muted-foreground shadow-sm">
                    {badge}
                  </span>
                ))}
              </motion.div>
              <motion.p variants={fadeUp} className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-black text-primary lg:mx-0">
                <PackageCheck className="h-3.5 w-3.5" />
                لجستیک پلاس
              </motion.p>
              <motion.h1 variants={fadeUp} className="text-3xl font-black leading-tight text-foreground sm:text-4xl md:text-5xl lg:text-[3.55rem]">
                پنل عملیات لجستیک برای وقتی که پیگیری بار از کنترل خارج می‌شود
              </motion.h1>
              <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-2xl text-sm leading-8 text-muted-foreground sm:text-base lg:mx-0">
                لجستیک پلاس به شرکت‌های حمل، فورواردری، ترخیص و خدمات بندری کمک می‌کند محموله، مشتری، سند، وظیفه و لینک پیگیری را در یک فضای فارسی نگه دارند؛ تا پاسخ «بار کجاست؟» از تماس‌های تکراری، فایل‌های اکسل و چت‌های پراکنده بیرون بیاید.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-7 sm:mx-auto sm:max-w-xl lg:mx-0" data-testid="landing-hero-cta">
                <PublicContactActions signupLabel="شروع پایلوت" demoLabel="درخواست دمو" />
              </motion.div>
              <motion.div variants={fadeUp} className="mt-6 grid gap-2 rounded-2xl border border-border bg-card/70 p-3 text-right shadow-sm backdrop-blur sm:max-w-xl">
                {heroSupportItems.map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-xl bg-background px-3 py-2 text-xs font-bold leading-6 text-muted-foreground sm:text-sm">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <ProductPreviewHeroCard />
          </div>
        </section>

        <section className="border-y border-border bg-card/55 px-4 py-6">
          <div className="mx-auto grid max-w-7xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {proofItems.map((item, index) => (
              <motion.div
                key={item.label}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.35, delay: index * 0.04 }}
                className="rounded-xl border border-border bg-background px-4 py-4 text-center shadow-sm"
              >
                <div className="text-lg font-black text-primary">{item.value}</div>
                <div className="mt-1 text-sm font-black text-foreground">{item.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="px-4 py-12 md:py-14">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="قبل از شروع"
              title="دمو را روی همان مسئله‌ای ببینید که امروز وقت تیم را می‌گیرد"
              text="چند پرونده فعال کافی است: یک بار در مسیر، یک سند ناقص، یک مشتری پیگیر و چند کار عقب‌افتاده. از همان‌جا معلوم می‌شود لجستیک پلاس چطور وارد روال شما می‌شود."
            />
            <div className="grid gap-6">
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                className="grid gap-4 md:grid-cols-3"
              >
              {launchTrustItems.map((item) => {
                const Icon = item.icon;
                const toneClass =
                  item.tone === "emerald"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                    : item.tone === "amber"
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-700"
                      : "border-sky-500/20 bg-sky-500/10 text-sky-700";
                return (
                  <motion.div key={item.title} variants={fadeUp} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <div className={cn("mb-4 grid h-12 w-12 place-items-center rounded-xl border", toneClass)}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-black text-foreground">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.text}</p>
                  </motion.div>
                );
              })}
              </motion.div>
              <LandingImagePanel
                src={landingImages.documents}
                alt="اسناد حمل و ترخیص که کنار پرونده محموله نگهداری می‌شوند"
                aspectClassName="aspect-[16/6]"
              />
            </div>
          </div>
        </section>

        <section id="features" className="px-4 py-14 md:py-18">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="برای عملیات روزانه"
              title="شش بخش برای اینکه پرونده بار بین آدم‌ها و فایل‌ها پخش نشود"
              text="هر بخش به یک درد مشخص جواب می‌دهد: وضعیت نامعلوم، سند گمشده، تماس مشتری، مسئولیت مبهم، پیگیری عقب‌افتاده و نبود دید مدیریتی."
            />
            <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
              <LandingImagePanel
                src={landingImages.operations}
                alt="پیگیری عملیات حمل، ترخیص، اسناد و کارهای باز در یک پنل"
              />
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                className="grid gap-4 md:grid-cols-2"
              >
              {featureCards.map((card) => {
                const Icon = card.icon;
                return (
                  <motion.div key={card.title} variants={fadeUp} className="group rounded-xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10">
                    <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-black text-foreground">{card.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{card.text}</p>
                  </motion.div>
                );
              })}
              </motion.div>
            </div>
          </div>
        </section>

        <motion.section
          className="relative isolate overflow-hidden border-y border-blue-200/20 px-4 py-14 md:py-18"
          style={{
            backgroundImage: "linear-gradient(115deg, #0f172a 0%, #155e75 28%, #2563eb 52%, #047857 78%, #1f2937 100%)",
            backgroundSize: "240% 240%",
          }}
          animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:42px_42px] opacity-30" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.18),transparent_44%,rgba(15,23,42,0.20))]" />
          <div className="relative mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="داخل پنل چه می‌بینید"
              title="بخش‌هایی که برای جواب دادن، پیگیری کردن و تصمیم گرفتن لازم دارید"
              text="نمایی فشرده از چیزهایی که معمولاً بین اکسل، واتساپ، پوشه اسناد و حافظه افراد پخش می‌شود."
              tone="inverse"
            />
            <div className="mb-5 flex snap-x gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible">
              {moduleShowcase.map((item) => (
                <span key={item.label} className="shrink-0 snap-start rounded-full border border-white/20 bg-white/[0.12] px-4 py-2 text-xs font-black text-blue-50 shadow-sm shadow-blue-950/10 backdrop-blur transition hover:bg-white/20">
                  {item.label}
                </span>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {moduleShowcase.map((item, index) => (
                <React.Fragment key={item.label}>
                  <MiniModulePreview item={item} index={index} />
                </React.Fragment>
              ))}
            </div>
          </div>
        </motion.section>

        <section className="border-y border-border bg-card/45 px-4 py-14 md:py-18">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="جریان کاری"
              title="یک جریان ساده از پرونده داخلی تا پاسخ امن به مشتری"
            />
            <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
              <LandingImagePanel
                src={landingImages.tracking}
                alt="مشاهده وضعیت تأییدشده محموله توسط مشتری با لینک امن"
                aspectClassName="aspect-[3/4]"
                className="max-w-sm justify-self-center lg:order-2"
              />
              <div className="grid gap-4 sm:grid-cols-2">
              {workflowSteps.map((step, index) => (
                <motion.div
                  key={step}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-70px" }}
                  transition={{ duration: 0.35, delay: index * 0.05 }}
                  className="rounded-xl border border-border bg-background p-5 shadow-sm"
                >
                  <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">
                    {Number(index + 1).toLocaleString("fa-IR")}
                  </div>
                  <h3 className="text-base font-black text-foreground">{step}</h3>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    {workflowDescriptions[index]}
                  </p>
                </motion.div>
              ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 md:py-18">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="مخاطب محصول" title="برای چه تیم‌هایی بیشترین ارزش را دارد؟" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {targetCustomers.map((item, index) => (
                <motion.div
                  key={item}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-70px" }}
                  transition={{ duration: 0.35, delay: index * 0.04 }}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <Building2 className="mb-4 h-6 w-6 text-primary" />
                  <h3 className="text-base font-black text-foreground">{item}</h3>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <HeroPlanStrip />

        <section className="border-y border-border bg-card/45 px-4 py-14 md:py-18">
          <div className="mx-auto max-w-4xl">
            <SectionHeading eyebrow="سوالات متداول" title="نگرانی‌هایی که بهتر است قبل از دمو روشن شوند" />
            <div className="space-y-3">
              {faqItems.map((item, index) => (
                <motion.div
                  key={item.question}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-70px" }}
                  transition={{ duration: 0.35, delay: index * 0.03 }}
                  className="rounded-xl border border-border bg-background p-5 shadow-sm"
                >
                  <h3 className="text-base font-black text-foreground">{item.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.answer}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="scroll-mt-28 bg-primary px-4 py-14 text-primary-foreground md:py-16">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black leading-tight md:text-4xl">دمو را با چند پرونده واقعی خودتان شروع کنید</h2>
              <p className="mt-3 text-sm leading-7 text-primary-foreground/80">
                چند محموله فعال، چند سند و چند پیگیری باز کافی است تا ببینید لجستیک پلاس چطور از تماس‌های تکراری و پیگیری ذهنی کم می‌کند. برای هماهنگی دمو با شماره <span dir="ltr">{PUBLIC_DEMO_PHONE_DISPLAY}</span> تماس بگیرید.
              </p>
            </div>
            <PublicContactActions
              className="w-full md:w-auto md:min-w-[430px]"
              signupClassName="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              demoClassName="border-primary-foreground/35 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
              signupLabel="شروع پایلوت"
              demoLabel="هماهنگی دمو"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <BrandMark />
          <nav className="flex flex-wrap gap-4 text-xs font-bold text-muted-foreground">
            <a href="#features" className="hover:text-foreground">قابلیت‌ها</a>
            <Link to="/pricing" className="hover:text-foreground">پلن‌ها</Link>
            <Link to="/login" className="hover:text-foreground">ورود</Link>
            <Link to="/signup" className="hover:text-foreground">ثبت‌نام</Link>
            <Link to="/contact" className="hover:text-foreground">تماس با ما</Link>
          </nav>
          <a
            referrerPolicy="origin"
            target="_blank"
            rel="noreferrer"
            href="https://trustseal.enamad.ir/?id=730645&Code=l3RrNPs0Bc3aYXQzEWHGutPMQ9itBoj5"
            className="inline-flex w-fit items-center rounded-xl border border-border bg-background p-2 transition hover:border-primary/40"
            aria-label="نماد اعتماد الکترونیکی لجستیک پلاس"
          >
            <img
              referrerPolicy="origin"
              src="https://trustseal.enamad.ir/logo.aspx?id=730645&Code=l3RrNPs0Bc3aYXQzEWHGutPMQ9itBoj5"
              alt="نماد اعتماد الکترونیکی"
              style={{ cursor: "pointer" }}
              className="h-16 w-auto"
              {...{ code: "l3RrNPs0Bc3aYXQzEWHGutPMQ9itBoj5" }}
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
