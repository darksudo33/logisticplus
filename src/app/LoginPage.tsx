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
  Ship,
  Smartphone,
  Truck,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMockStore } from "../store/useMockStore";
import { PublicContactActions, PublicPhonePill } from "@/src/components/PublicContactActions";

function LoginPreview() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-2xl">
      <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Ship className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-black">لجستیک پلاس</div>
            <div className="text-[10px] font-bold text-muted-foreground">نمای داخلی عملیات</div>
          </div>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black text-emerald-700">
          آنلاین
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "وضعیت بار", value: "به‌روز", icon: Truck },
          { label: "پیگیری تیم", value: "مسئول‌دار", icon: ClipboardList },
          { label: "اسناد", value: "کنار پرونده", icon: FileText },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-border bg-background p-4">
              <Icon className="mb-3 h-5 w-5 text-primary" />
              <div className="text-2xl font-black">{item.value}</div>
              <div className="mt-1 text-xs font-bold text-muted-foreground">{item.label}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-2">
        {["پرونده محموله آماده پیگیری", "سند خصوصی در پنل داخلی ماند", "لینک امن مشتری آماده ارسال است"].map((item) => (
          <div key={item} className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2 text-xs font-bold text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {item}
          </div>
        ))}
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

      <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[1fr_440px] lg:items-center lg:py-12">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="hidden space-y-6 lg:block"
        >
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black text-primary">
              ورود به پنل داخلی Logistic Plus
            </p>
            <h2 className="text-4xl font-black leading-tight">ورود به جایی که پرونده‌های عملیاتی تیم شما مرتب می‌ماند</h2>
            <p className="mt-4 text-sm leading-8 text-muted-foreground">
              محموله‌ها، اسناد، مشتریان، وظایف و لینک‌های پیگیری مشتری در یک محیط فارسی و راست‌چین کنار هم قرار می‌گیرند؛ برای تیم‌هایی که نمی‌خواهند کارها بین فایل، تماس و چت گم شود.
            </p>
            <PublicContactActions className="mt-6 max-w-xl" signupLabel="ثبت‌نام شرکت" demoLabel="درخواست دمو" />
          </div>
          <LoginPreview />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="mx-auto w-full max-w-[440px]"
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
