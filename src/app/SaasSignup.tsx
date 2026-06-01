import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  PackageCheck,
  PhoneCall,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionSkeleton, Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  defaultPricingPlanId,
  extraUsagePricing,
  formatIrr,
  getPricingPlan,
  pricingPlans,
} from "@/src/lib/pricing";
import { PublicContactActions, PublicPhonePill } from "@/src/components/PublicContactActions";

type Plan = {
  id: string;
  name: string;
  description: string;
  monthlyPriceIrr: number;
  annualPriceIrr: number;
  limits: Record<string, number>;
  features: Record<string, boolean>;
};

function PublicShell({ children }: { children: React.ReactNode }) {
  const headerNavItems = [
    { label: "خانه", target: "/", kind: "route" },
    { label: "پلن‌ها", target: "/pricing", kind: "route" },
    { label: "تماس با ما", target: "/contact", kind: "route" },
  ] as const;

  const navItemClass =
    "rounded-xl px-3 py-2 text-xs font-black text-muted-foreground transition hover:bg-primary/10 hover:text-primary";

  return (
    <div className="dashboard-theme app-shell min-h-screen overflow-x-hidden bg-background text-foreground" dir="rtl">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/85 shadow-sm shadow-primary/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
                <PackageCheck className="h-5 w-5" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-sm font-black text-foreground">لجستیک پلاس</span>
                <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Logistic Plus</span>
              </span>
            </Link>
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
              <PublicPhonePill className="hidden lg:inline-flex" />
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
      <div className="pt-[105px] md:pt-16">{children}</div>
    </div>
  );
}

function LimitList({ planId }: { planId: string }) {
  const plan = getPricingPlan(planId);
  return (
    <div className="space-y-2 text-xs font-bold text-muted-foreground">
      {plan.summaryFeatures.map((feature) => (
        <div key={feature} className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {feature}
        </div>
      ))}
    </div>
  );
}

export function PricingPage() {
  const [syncingPlans, setSyncingPlans] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/plans")
      .then((response) => response.json())
      .then((payload) => {
        const apiPlans = (payload.data || []) as Plan[];
        if (apiPlans.length === 0) {
          toast.error("پلن‌های پایگاه داده هنوز آماده نیستند.");
        }
      })
      .catch(() => toast.error("امکان دریافت پلن‌ها وجود ندارد"))
      .finally(() => setSyncingPlans(false));
  }, []);

  return (
    <PublicShell>
      <main>
        <section className="border-b border-border px-4 py-12 md:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="mb-3 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black text-primary">
                پلن‌ها و ثبت‌نام Logistic Plus / لجستیک پلاس
              </p>
              <h1 className="text-3xl font-black leading-tight md:text-5xl">پلنی را انتخاب کنید که با حجم عملیات شما می‌خواند</h1>
              <p className="mt-4 text-sm leading-8 text-muted-foreground">
                پلن‌ها بر اساس تعداد کاربر، تعداد محموله ماهانه و فضای نگهداری اسناد تعریف شده‌اند. اگر هنوز مطمئن نیستید، قبل از پرداخت دمو بگیرید و چند پرونده فعال خودتان را بررسی کنید.
              </p>
              <PublicContactActions className="mt-6 max-w-xl" signupLabel="شروع ثبت‌نام" demoLabel="درخواست دمو" />
            </div>
          </div>
        </section>

        <section className="px-4 py-10 md:py-14">
          <div className="mx-auto max-w-7xl">
            {syncingPlans && <Skeleton data-testid="plans-sync-skeleton" className="mb-4 h-5 w-72 max-w-full" />}
            <div className="grid gap-4 lg:grid-cols-3">
              {pricingPlans.map((plan) => (
                <Card key={plan.id} className={cn("relative rounded-xl border-border shadow-sm", plan.recommended && "border-primary shadow-2xl")}>
                  {plan.badge && (
                    <span className="absolute left-5 top-5 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black text-primary">
                      {plan.badge}
                    </span>
                  )}
                  <CardHeader className="space-y-3">
                    <CardTitle className="text-2xl font-black">{plan.name}</CardTitle>
                    <p className="text-xs font-bold text-muted-foreground">{plan.audience}</p>
                    <p className="text-sm leading-7 text-muted-foreground">{plan.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <div className="text-3xl font-black">{formatIrr(plan.monthlyPriceIrr)}</div>
                      <div className="mt-1 text-[11px] font-bold text-muted-foreground">ماهانه؛ مصرف اضافه و شرایط اختصاصی جداگانه محاسبه می‌شود</div>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/35 p-4">
                      <div className="mb-3 text-xs font-black text-foreground">ظرفیت پلن</div>
                      <LimitList planId={plan.id} />
                    </div>

                    <div>
                      <div className="mb-3 text-xs font-black text-foreground">در این پلن فعال است</div>
                      <div className="space-y-2">
                        {plan.includedFeatures.map((feature) => (
                          <div key={feature} className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
                            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {plan.disabledFeatures.length > 0 && (
                      <div>
                        <div className="mb-3 text-xs font-black text-foreground">در این پلن فعال نیست</div>
                        <div className="space-y-2">
                          {plan.disabledFeatures.map((feature) => (
                            <div key={feature} className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
                              <XCircle className="mt-1 h-4 w-4 shrink-0 text-destructive" />
                              <span>{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button asChild className={cn("h-11 rounded-xl font-black", !plan.recommended && "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
                        <Link to={`/signup?plan=${encodeURIComponent(plan.id)}`}>انتخاب و ثبت‌نام</Link>
                      </Button>
                      <Button asChild variant="outline" className="h-11 rounded-xl border-emerald-500/25 font-black text-emerald-700 hover:bg-emerald-500/10">
                        <Link to="/contact">مشاوره قبل از پرداخت</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/45 px-4 py-10 md:py-14">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 max-w-2xl">
              <h2 className="text-2xl font-black text-foreground">اگر حجم عملیات بیشتر شد چه؟</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">برای رشد تدریجی تیم، افزایش تعداد محموله یا فضای اسناد، مصرف اضافه به‌صورت شفاف جداگانه محاسبه می‌شود.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {extraUsagePricing.map((item) => (
                <div key={item} className="rounded-xl border border-border bg-background p-4 text-sm font-black leading-7 text-foreground shadow-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">قبل از پرداخت می‌خواهید پنل را ببینید؟</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                اگر هنوز بین پلن‌ها مردد هستید، دمو بگیرید. اگر تصمیم گرفته‌اید، ثبت‌نام شرکت را کامل کنید و وارد مسیر پرداخت شوید.
              </p>
            </div>
            <PublicContactActions className="w-full md:w-[430px]" signupLabel="شروع ثبت‌نام" demoLabel="درخواست دمو" />
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

export function SignupPage() {
  const [params] = useSearchParams();
  const initialPlan = getPricingPlan(params.get("plan"));
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [plansLoading, setPlansLoading] = React.useState(true);
  const [form, setForm] = React.useState({
    planId: initialPlan?.id || defaultPricingPlanId,
    billingCycle: "monthly",
    companyName: "",
    ownerName: "",
    ownerEmail: "",
    contactPhone: "",
    companySize: "",
    expectedVolume: "",
    password: "",
    notes: "",
  });

  React.useEffect(() => {
    fetch("/api/plans")
      .then((response) => response.json())
      .then((payload) => setPlans(payload.data || []))
      .catch(() => toast.error("امکان دریافت پلن‌ها وجود ندارد"))
      .finally(() => setPlansLoading(false));
  }, []);

  const selectedPlan = getPricingPlan(form.planId);
  const selectedApiPlan = plans.find((plan) => plan.id === form.planId);

  const submit = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "ثبت‌نام انجام نشد");
      const paymentResponse = await fetch(`/api/billing/payments/${payload.data.paymentId}/start`, { method: "POST" });
      const paymentPayload = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentPayload.ok) throw new Error(paymentPayload?.error?.message || "درگاه پرداخت آماده نشد");
      window.location.href = paymentPayload.data.gatewayUrl;
    } catch (error: any) {
      toast.error(error.message || "ثبت‌نام با خطا روبرو شد");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicShell>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[1fr_380px] lg:py-10">
        <section className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <p className="mb-3 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black text-primary">
              ثبت‌نام شرکت در لجستیک پلاس
            </p>
            <h1 className="text-2xl font-black leading-tight md:text-4xl">ثبت‌نام را با اطلاعات اصلی شرکت شروع کنید</h1>
            <p className="mt-3 text-sm leading-8 text-muted-foreground">
              نام شرکت، مدیر حساب، راه ارتباطی و حجم تقریبی عملیات را وارد کنید. بعد از پرداخت، حساب برای بررسی و فعال‌سازی ارسال می‌شود.
            </p>
            <PublicContactActions className="mt-5 max-w-xl" signupLabel="ادامه فرم ثبت‌نام" demoLabel="درخواست دمو" signupTo="/signup#signup-form" />
          </div>

          <Card id="signup-form" className="scroll-mt-28 rounded-xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-black">
                <UserRound className="h-5 w-5 text-primary" />
                فرم ثبت‌نام
              </CardTitle>
              <p className="text-xs leading-6 text-muted-foreground">اطلاعات دقیق‌تر باعث می‌شود بررسی حساب و هماهنگی اولیه سریع‌تر انجام شود.</p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>نام شرکت</Label>
                <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>نام مدیر حساب</Label>
                <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>ایمیل مدیر</Label>
                <Input dir="ltr" type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>شماره تماس</Label>
                <Input dir="ltr" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>اندازه شرکت</Label>
                <Input value={form.companySize} onChange={(e) => setForm({ ...form, companySize: e.target.value })} placeholder="مثلا ۱۰ تا ۳۰ نفر" />
              </div>
              <div className="space-y-2">
                <Label>حجم تقریبی محموله‌ها</Label>
                <Input value={form.expectedVolume} onChange={(e) => setForm({ ...form, expectedVolume: e.target.value })} placeholder="مثلاً ۱۰۰ محموله در ماه" />
              </div>
              <div className="space-y-2">
                <Label>رمز عبور</Label>
                <Input dir="ltr" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>پلن</Label>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  value={form.planId}
                  onChange={(e) => setForm({ ...form, planId: e.target.value })}
                >
                  {pricingPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select>
                {plansLoading && <Skeleton data-testid="plans-select-skeleton" className="mt-2 h-3 w-40" />}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>توضیحات</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="مثلاً نیاز به رهگیری مشتری، مدیریت اسناد یا چند کاربر عملیاتی" />
              </div>
              <Button onClick={submit} disabled={loading} className="h-12 rounded-xl font-black md:col-span-2">
                {loading ? <ActionSkeleton inverted className="w-44" /> : "پرداخت و ارسال برای بررسی"}
              </Button>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="h-fit overflow-hidden rounded-xl border-emerald-500/20 bg-emerald-500/5 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-black text-emerald-800">
                <PhoneCall className="h-5 w-5" />
                دمو قبل از پرداخت
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="leading-7 text-muted-foreground">
                اگر قبل از پرداخت می‌خواهید پرونده محموله، اسناد، وظایف و لینک پیگیری مشتری را ببینید، درخواست دمو ثبت کنید.
              </p>
              <Button asChild variant="outline" className="h-11 w-full rounded-xl border-emerald-500/30 font-black text-emerald-700 hover:bg-emerald-500/10">
                <Link to="/contact">درخواست دمو</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="h-fit rounded-xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-black">
                <CreditCard className="h-5 w-5 text-primary" />
                خلاصه پرداخت
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-xl border border-border bg-muted/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-black">{selectedPlan?.name || "پلن انتخابی"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selectedPlan?.audience || selectedApiPlan?.description}</div>
                  </div>
                  {selectedPlan?.badge && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black text-primary">{selectedPlan.badge}</span>}
                </div>
              </div>
              <LimitList planId={form.planId} />
              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="text-muted-foreground">مبلغ ماهانه</span>
                <span className="font-black">{formatIrr(selectedPlan?.monthlyPriceIrr || selectedApiPlan?.monthlyPriceIrr || 0)}</span>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-6 text-amber-700">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                پرداخت به معنی فعال‌سازی فوری نیست؛ حساب پس از بررسی مدیر سیستم فعال می‌شود.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-black">
                <FileText className="h-5 w-5 text-primary" />
                مسیر بعدی
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs font-bold text-muted-foreground">
              {["ثبت اطلاعات شرکت", "پرداخت از درگاه", "بررسی و تأیید مدیر سیستم", "ورود به پنل لجستیک پلاس"].map((step, index) => (
                <div key={step} className="flex items-center gap-2 rounded-lg bg-muted/35 px-3 py-2">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary text-[10px] text-primary-foreground">
                    {Number(index + 1).toLocaleString("fa-IR")}
                  </span>
                  {step}
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </main>
    </PublicShell>
  );
}

export function SignupPendingPage() {
  const [params] = useSearchParams();
  const payment = params.get("payment");
  const isPaid = payment === "paid";
  const isFailed = payment === "failed";
  const isMissing = payment === "missing" || payment === "unknown";
  const statusCopy = isPaid
    ? {
        title: "پرداخت ثبت شد؛ در انتظار تأیید",
        message: "پرداخت شما با موفقیت ثبت شد. حساب شرکت پس از بررسی مدیر سیستم فعال می‌شود و سپس امکان ورود با ایمیل و رمز عبور فراهم خواهد شد.",
        tone: "bg-emerald-500/10 text-emerald-600",
        primary: "بازگشت به ورود",
        primaryTo: "/login",
        secondary: "تماس با ما",
        secondaryTo: "/contact",
      }
    : isFailed
      ? {
          title: "پرداخت ناموفق یا لغوشده",
          message: "ثبت‌نام شما هنوز فعال نشده است. می‌توانید با همان ایمیل دوباره ثبت‌نام را انجام دهید و یک پرداخت جدید بسازید.",
          tone: "bg-rose-500/10 text-rose-600",
          primary: "تلاش دوباره",
          primaryTo: "/signup",
          secondary: "تماس با پشتیبانی",
          secondaryTo: "/contact",
        }
      : isMissing
        ? {
            title: "نتیجه پرداخت قابل بررسی نیست",
            message: "شناسه پرداخت از درگاه دریافت نشد یا با درخواست ثبت‌نام شما تطبیق نداشت. اگر مبلغی از حساب شما کسر شده است با پشتیبانی تماس بگیرید.",
            tone: "bg-amber-500/10 text-amber-600",
            primary: "تماس با پشتیبانی",
            primaryTo: "/contact",
            secondary: "تلاش دوباره",
            secondaryTo: "/signup",
          }
        : {
            title: "درخواست شما ثبت شد",
            message: "اگر پرداخت را کامل کرده‌اید، پس از تأیید مدیر سیستم امکان ورود فراهم می‌شود. در غیر این صورت می‌توانید ثبت‌نام را دوباره انجام دهید.",
            tone: "bg-amber-500/10 text-amber-600",
            primary: "بازگشت به ورود",
            primaryTo: "/login",
            secondary: "تماس با ما",
            secondaryTo: "/contact",
          };

  return (
    <PublicShell>
      <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center px-4 py-10">
        <Card className="w-full rounded-xl border-border text-center shadow-sm">
          <CardContent className="space-y-5 p-8">
            <div className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-2xl", statusCopy.tone)}>
              {isPaid ? <ShieldCheck className="h-8 w-8" /> : <Clock className="h-8 w-8" />}
            </div>
            <h1 className="text-2xl font-black">{statusCopy.title}</h1>
            <p className="text-sm leading-7 text-muted-foreground">{statusCopy.message}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild className="h-11 rounded-xl font-black">
                <Link to={statusCopy.primaryTo}>{statusCopy.primary}</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-emerald-500/25 font-black text-emerald-700 hover:bg-emerald-500/10">
                <Link to={statusCopy.secondaryTo}>{statusCopy.secondary}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </PublicShell>
  );
}
