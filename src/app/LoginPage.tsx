import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LockKeyhole, PackageCheck } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMockStore } from "../store/useMockStore";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const loginWithPassword = useMockStore((state) => state.loginWithPassword);

  const handleLogin = async () => {
    setIsLoading(true);
    setError("");

    try {
      await loginWithPassword(email, password, rememberMe);
      navigate("/dashboard");
    } catch {
      setError("ایمیل یا رمز عبور درست نیست.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard-theme app-shell login-shell relative isolate flex flex-col bg-slate-950 text-foreground" dir="rtl">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <img
          src="/landing/logisticplus-hero-port.webp"
          alt=""
          className="login-hero-port-bg absolute inset-0 h-full w-full object-cover opacity-85 blur-[2px]"
        />
        <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.32),rgba(247,251,255,0.78)_54%,rgba(219,231,245,0.88))]" />
      </div>

      <header className="relative z-10 shrink-0 border-b border-white/45 bg-card/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <PackageCheck className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-black text-foreground">لجستیک پلاس</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Logistic Plus</span>
            </span>
          </div>
          <div className="rounded-xl border border-border bg-muted/35 px-3 py-2 text-[11px] font-black text-muted-foreground">
            ورود مخصوص کاربران تایید شده
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-7xl flex-1 items-start justify-center overflow-y-auto overflow-x-hidden px-4 py-4 sm:items-center lg:py-6">
        <motion.section
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="mx-auto w-full max-w-[440px]"
        >
          <div className="rounded-xl border border-white/60 bg-card/90 p-6 shadow-2xl backdrop-blur-xl md:p-8">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
                <LockKeyhole className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-black text-foreground">ورود به حساب</h1>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                ورود فقط با ایمیل و رمز عبور فعال است.
              </p>
            </div>

            <div className="space-y-5">
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && email && password && !isLoading) {
                      void handleLogin();
                    }
                  }}
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                مرا به خاطر بسپار
              </label>

              {error && <p className="text-xs font-bold text-destructive">{error}</p>}

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
            </div>

            <div className="mt-7 border-t border-border pt-5 text-center text-xs font-bold leading-6 text-muted-foreground">
              برای دریافت دسترسی، مدیر پلتفرم باید شرکت و کاربر شما را در پنل مدیریت ایجاد کند.
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
