import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileText,
  LockKeyhole,
  MessageSquareText,
  PackageCheck,
  Radio,
  Route,
  ShieldCheck,
  Ship,
  Smartphone,
  Truck,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMockStore } from "../store/useMockStore";
import { PublicPhonePill } from "@/src/components/PublicContactActions";

type AuthError = Error & {
  status?: number;
  code?: string;
  retryAfter?: number;
};

const persianDigitMap: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

const toEnglishDigits = (value: string) =>
  value.replace(/[۰-۹٠-٩]/g, (digit) => persianDigitMap[digit] || digit);

const toPersianDigits = (value: number | string) =>
  String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

const sanitizePhone = (value: string) => toEnglishDigits(value).replace(/[^\d+]/g, "").slice(0, 14);

const sanitizeSmsCode = (value: string) => toEnglishDigits(value).replace(/\D/g, "").slice(0, 6);

const formatRetryTime = (seconds: number) => {
  if (seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0
    ? `${toPersianDigits(minutes)}:${toPersianDigits(String(remainingSeconds).padStart(2, "0"))}`
    : `${toPersianDigits(remainingSeconds)} ثانیه`;
};

const retryAfterFromError = (error: unknown, fallback = 60) => {
  const retryAfter = Number((error as AuthError)?.retryAfter || 0);
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : fallback;
};

const loginErrorMessage = (error: unknown) => {
  const authError = error as AuthError;
  if (authError.status === 429 || authError.code === "RATE_LIMITED") {
    return "تعداد تلاش‌های ورود زیاد شده است. کمی صبر کنید و دوباره امتحان کنید.";
  }
  if (authError.code === "PENDING_REVIEW") {
    return "حساب شرکت هنوز در انتظار بررسی است. در صورت نیاز با پشتیبانی تماس بگیرید.";
  }
  if (authError.code === "ORGANIZATION_INACTIVE" || authError.code === "USER_INACTIVE") {
    return "این حساب در حال حاضر فعال نیست. برای بررسی وضعیت با مدیر شرکت یا پشتیبانی تماس بگیرید.";
  }
  if (authError.code === "SUBSCRIPTION_INACTIVE") {
    return "اشتراک شرکت فعال نیست. برای فعال‌سازی دوباره با پشتیبانی هماهنگ کنید.";
  }
  return "ایمیل یا رمز عبور درست نیست.";
};

const smsRequestErrorMessage = (error: unknown) => {
  const authError = error as AuthError;
  if (authError.status === 429 || authError.code === "RATE_LIMITED") {
    return "درخواست کد پیامکی بیش از حد مجاز بوده است. بعد از پایان زمان انتظار دوباره تلاش کنید.";
  }
  return authError.message || "ارسال کد پیامکی ناموفق بود.";
};

const smsVerifyErrorMessage = (error: unknown) => {
  const authError = error as AuthError;
  if (authError.status === 429 || authError.code === "SMS_CODE_LOCKED" || authError.code === "RATE_LIMITED") {
    return "تعداد تلاش برای این کد زیاد شده است. کمی صبر کنید یا کد جدید بگیرید.";
  }
  return "کد پیامکی درست نیست یا منقضی شده است.";
};

const operationStats = [
  { label: "محموله فعال", value: "۲۴", icon: Ship, tone: "bg-primary/10 text-primary" },
  { label: "سند کنترل‌شده", value: "۱۱۸", icon: FileText, tone: "bg-emerald-500/10 text-emerald-700" },
  { label: "وظیفه امروز", value: "۱۲", icon: ClipboardList, tone: "bg-amber-500/10 text-amber-700" },
];

const accessHighlights = [
  "ورود امن برای تیم عملیاتی و مدیریت شرکت",
  "محموله، مشتری، سند و وظیفه در یک پنل فارسی",
  "دسترسی سریع به داشبورد بعد از ورود موفق",
];

function LogisticsMotionScene() {
  const routePoints = [
    { className: "right-[12%] top-[60%]", delay: 0 },
    { className: "right-[34%] top-[48%]", delay: 0.35 },
    { className: "right-[57%] top-[34%]", delay: 0.7 },
    { className: "right-[80%] top-[24%]", delay: 1.05 },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-primary/10">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b border-border/70 bg-card/78 px-4 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Route className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">مرکز عملیات Logistic Plus</p>
            <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">دسترسی داخلی تیم لجستیک</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-700">
          <Radio className="h-3.5 w-3.5" />
          آنلاین
        </span>
      </div>

      <div className="relative h-[320px] overflow-hidden sm:h-[380px]">
        <img
          src="/landing/logisticplus-login-transport-hero.jpg"
          alt="شبکه حمل‌ونقل لجستیک پلاس"
          decoding="async"
          fetchPriority="high"
          className="h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(247,251,255,0.08),rgba(247,251,255,0.38)_58%,rgba(247,251,255,0.78))] dark:bg-[linear-gradient(180deg,rgba(7,17,31,0.06),rgba(7,17,31,0.38)_58%,rgba(7,17,31,0.78))]" />
        <div className="absolute inset-x-4 bottom-5 rounded-xl border border-border/80 bg-card/86 p-2 shadow-sm backdrop-blur-xl sm:inset-x-6 sm:bottom-6 sm:p-3">
          <div className="grid grid-cols-3 gap-2">
            {operationStats.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-lg border border-border bg-background/80 p-2 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-muted-foreground sm:text-[11px]">{item.label}</span>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-8 sm:w-8 ${item.tone}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xl font-black leading-none text-foreground sm:mt-3 sm:text-2xl">{item.value}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 hidden sm:block">
          <div className="absolute right-[16%] top-[27%] h-px w-[68%] rotate-[-10deg] bg-primary/25" />
          {routePoints.map((point) => (
            <motion.span
              key={point.className}
              className={`absolute h-3 w-3 rounded-full border-2 border-card bg-primary shadow-[0_0_18px_rgba(37,99,235,0.55)] ${point.className}`}
              animate={{ scale: [1, 1.45, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: point.delay }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function OperationsPreviewCard() {
  return (
    <div className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[1fr_0.9fr]">
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-foreground">نمای ورود به عملیات</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">پس از ورود، تیم به فضای کاری روزانه می‌رسد.</p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
        </div>
        <div className="grid gap-2">
          {accessHighlights.map((item) => (
            <div key={item} className="flex items-start gap-2 rounded-lg bg-card px-3 py-2 text-xs font-bold leading-6 text-muted-foreground ring-1 ring-border/80">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-muted/35 p-3">
        {[
          { label: "حمل دریایی", detail: "ردیابی کانتینر", icon: Ship },
          { label: "حمل زمینی", detail: "مسیر و تحویل", icon: Truck },
          { label: "کاربران شرکت", detail: "سطح دسترسی امن", icon: Users },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-foreground">{item.label}</p>
                <p className="mt-1 truncate text-[11px] font-bold text-muted-foreground">{item.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<"password" | "sms">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsCodeSent, setSmsCodeSent] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();
  const loginWithPassword = useMockStore(state => state.loginWithPassword);
  const loginWithPhoneCode = useMockStore(state => state.loginWithPhoneCode);

  const handleLogin = async () => {
    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      await loginWithPassword(email, password, rememberMe);
      navigate("/dashboard");
    } catch {
      setError("ایمیل یا رمز عبور درست نیست.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestSmsCode = async () => {
    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/auth/phone/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error?.message || "Could not send login code.");
      }
      setSmsCodeSent(true);
      setNotice("اگر این شماره برای کاربر فعال شرکت ثبت شده باشد، کد ورود پیامک می‌شود.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "ارسال کد پیامکی ناموفق بود.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneLogin = async () => {
    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      await loginWithPhoneCode(phone, smsCode, rememberMe);
      navigate("/dashboard");
    } catch {
      setError("کد پیامکی درست نیست یا منقضی شده است.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard-theme app-shell min-h-screen bg-background text-foreground" dir="rtl">
      <header className="border-b border-border bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <PackageCheck className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-black text-foreground">لجستیک پلاس</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Logistic Plus</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <PublicPhonePill className="hidden lg:inline-flex" />
            <Button asChild variant="outline" className="hidden h-10 rounded-xl text-xs font-black sm:inline-flex">
              <Link to="/pricing">پلن‌ها</Link>
            </Button>
            <Button asChild className="h-10 rounded-xl text-xs font-black">
              <Link to="/signup">ثبت‌نام شرکت</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:py-12">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="order-2 mx-auto w-full max-w-3xl space-y-5 lg:order-none"
        >
          <LogisticsMotionScene />
          <OperationsPreviewCard />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="order-1 mx-auto w-full max-w-[440px] lg:order-none"
        >
          <div className="rounded-xl border border-border bg-card p-6 shadow-2xl md:p-8">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
                <LockKeyhole className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-black text-foreground">ورود به حساب</h1>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">برای ورود به پنل داخلی شرکت، یکی از روش‌های زیر را انتخاب کنید.</p>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/35 p-1">
                <button
                  type="button"
                  onClick={() => setLoginMode("password")}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-black transition ${loginMode === "password" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <LockKeyhole className="h-4 w-4" />
                  رمز عبور
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode("sms")}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-black transition ${loginMode === "sms" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Smartphone className="h-4 w-4" />
                  پیامک
                </button>
              </div>

              {loginMode === "password" ? (
                <>
                  <div className="space-y-2">
                    <Label>ایمیل</Label>
                    <Input
                      dir="ltr"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="email"
                      className="h-11 text-left"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>رمز عبور</Label>
                    <Input
                      dir="ltr"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="password"
                      className="h-11 text-left"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>شماره موبایل</Label>
                    <Input
                      dir="ltr"
                      inputMode="tel"
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setSmsCodeSent(false);
                        setSmsCode("");
                      }}
                      placeholder="09..."
                      className="h-11 text-left"
                    />
                  </div>
                  {smsCodeSent && (
                    <div className="space-y-2">
                      <Label>کد پیامکی</Label>
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        value={smsCode}
                        onChange={(event) => setSmsCode(event.target.value)}
                        placeholder="123456"
                        className="h-11 text-left tracking-[0.25em]"
                      />
                    </div>
                  )}
                </>
              )}

              <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                مرا به خاطر بسپار
              </label>

              {notice && <p className="text-xs font-bold leading-6 text-primary">{notice}</p>}
              {error && <p className="text-xs font-bold text-destructive">{error}</p>}

              {loginMode === "password" ? (
                <Button
                  onClick={handleLogin}
                  disabled={isLoading || !email || !password}
                  className="h-12 w-full rounded-xl text-sm font-black"
                >
                  {isLoading ? (
                    <ActionSkeleton inverted className="w-32" />
                  ) : (
                    <span className="flex items-center gap-2">
                      ورود به پنل
                      <ArrowLeft className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              ) : (
                <div className="grid gap-2">
                  <Button
                    onClick={smsCodeSent ? handlePhoneLogin : handleRequestSmsCode}
                    disabled={isLoading || !phone || (smsCodeSent && !smsCode)}
                    className="h-12 w-full rounded-xl text-sm font-black"
                  >
                    {isLoading ? (
                      <ActionSkeleton inverted className="w-36" />
                    ) : (
                      <span className="flex items-center gap-2">
                        {smsCodeSent ? "ورود با کد" : "ارسال کد پیامکی"}
                        <MessageSquareText className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                  {smsCodeSent && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleRequestSmsCode}
                      disabled={isLoading || !phone}
                      className="h-9 rounded-xl text-xs font-black"
                    >
                      {isLoading ? <ActionSkeleton className="w-24" /> : "ارسال دوباره کد"}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-7 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold">
                <Link to="/" className="text-primary hover:underline">صفحه اصلی</Link>
                <span className="text-muted-foreground/50">•</span>
                <Link to="/pricing" className="text-primary hover:underline">مشاهده پلن‌ها</Link>
                <span className="text-muted-foreground/50">•</span>
                <Link to="/signup" className="text-primary hover:underline">ثبت‌نام شرکت</Link>
                <span className="text-muted-foreground/50">•</span>
                <Link to="/contact" className="text-emerald-700 hover:underline">تماس با ما</Link>
              </div>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
