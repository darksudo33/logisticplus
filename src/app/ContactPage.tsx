import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  PackageCheck,
  Phone,
  PhoneCall,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  PUBLIC_DEMO_PHONE_DISPLAY,
  PUBLIC_DEMO_PHONE_HREF,
  PublicPhonePill,
} from "@/src/components/PublicContactActions";

type PreferredContactMethod = "phone" | "email" | "either";

type ContactFormState = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  preferredContactMethod: PreferredContactMethod;
  message: string;
};

const initialForm: ContactFormState = {
  companyName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  preferredContactMethod: "phone",
  message: "",
};

const navItems = [
  { label: "خانه", to: "/" },
  { label: "پلن‌ها", to: "/pricing" },
  { label: "تماس با ما", to: "/contact" },
  { label: "ورود", to: "/login" },
];

const preferenceOptions: { value: PreferredContactMethod; label: string }[] = [
  { value: "phone", label: "تماس تلفنی" },
  { value: "email", label: "ایمیل" },
  { value: "either", label: "هر دو" },
];

async function submitContactRequest(form: ContactFormState) {
  const response = await fetch("/api/contact-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error?.message || "درخواست دمو ثبت نشد.");
  }
  return payload.data;
}

export default function ContactPage() {
  const [form, setForm] = React.useState<ContactFormState>(initialForm);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const updateForm = (updates: Partial<ContactFormState>) => {
    setSubmitted(false);
    setForm((current) => ({ ...current, ...updates }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.companyName.trim() || !form.contactName.trim()) {
      toast.error("نام شرکت و نام فرد هماهنگ‌کننده را وارد کنید.");
      return;
    }
    if (!form.contactPhone.trim() && !form.contactEmail.trim()) {
      toast.error("حداقل شماره تماس یا ایمیل را وارد کنید.");
      return;
    }

    setSubmitting(true);
    try {
      await submitContactRequest(form);
      toast.success("درخواست دمو یا تماس ثبت شد.");
      setSubmitted(true);
      setForm(initialForm);
    } catch (error: any) {
      toast.error(error.message || "ثبت درخواست دمو انجام نشد.");
    } finally {
      setSubmitting(false);
    }
  };

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
            <nav aria-label="ناوبری اصلی" className="hidden items-center rounded-xl border border-border/80 bg-card/80 p-1 shadow-sm md:flex">
              {navItems.map((item) => (
                <Link key={item.to} to={item.to} className="rounded-lg px-3 py-2 text-xs font-black text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <PublicPhonePill className="hidden lg:inline-flex" />
              <Button asChild className="h-10 rounded-xl px-3 text-xs font-black shadow-lg shadow-primary/15 sm:px-4">
                <Link to="/signup">ثبت‌نام <ArrowLeft className="mr-1.5 h-4 w-4 sm:mr-2" /></Link>
              </Button>
            </div>
          </div>
          <nav aria-label="ناوبری موبایل" className="-mx-1 flex gap-1 overflow-x-auto border-t border-border/60 px-1 py-2 md:hidden">
            {navItems.map((item) => (
              <Link key={item.to} to={item.to} className="shrink-0 rounded-xl px-3 py-2 text-[11px] font-black text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="pt-[105px] md:pt-16">
        <section className="border-b border-border bg-background px-4 py-10 md:py-14">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="mb-3 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black text-primary">
                هماهنگی دمو Logistic Plus / لجستیک پلاس
              </p>
              <h1 className="text-3xl font-black leading-tight md:text-5xl">دمو را روی چند پرونده واقعی شرکتتان ببینید</h1>
              <p className="mt-4 max-w-2xl text-sm leading-8 text-muted-foreground">
                اگر می‌خواهید ببینید محموله، سند، وظیفه و لینک پیگیری مشتری چطور در یک پنل فارسی کنار هم قرار می‌گیرد، تماس بگیرید یا فرم را بفرستید. بهترین دمو با چند محموله فعال و گلوگاه‌های واقعی تیم شما شروع می‌شود.
              </p>
              <div className="mt-6 grid gap-3 sm:max-w-xl sm:grid-cols-2">
                <Button asChild className="h-12 rounded-xl text-sm font-black">
                  <a href={PUBLIC_DEMO_PHONE_HREF}>
                    <PhoneCall className="ml-2 h-4 w-4" />
                    تماس مستقیم
                    <span className="mr-2 text-xs font-black tabular-nums" dir="ltr">{PUBLIC_DEMO_PHONE_DISPLAY}</span>
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-xl border-primary/30 text-sm font-black text-primary hover:bg-primary/10">
                  <a href="#contact-form">ثبت درخواست دمو</a>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { title: "دموی عملیاتی", text: "پرونده محموله، سند، کارها و لینک مشتری را ببینید", icon: ShieldCheck },
                { title: "انتخاب پلن", text: "بر اساس کاربر، حجم محموله و فضای اسناد تصمیم بگیرید", icon: Building2 },
                { title: "شروع پایلوت", text: "با محموله‌های فعال شروع کنید، نه مهاجرت کل آرشیو", icon: Clock3 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} className="rounded-xl border-border bg-card shadow-sm">
                    <CardContent className="p-5">
                      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h2 className="text-base font-black">{item.title}</h2>
                      <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.text}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="contact-form" className="scroll-mt-28 px-4 py-10 md:py-14">
          <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[360px_1fr]">
            <aside className="space-y-4">
              <Card className="rounded-xl border-emerald-500/20 bg-emerald-500/5 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-black text-emerald-800">
                    <PhoneCall className="h-5 w-5" />
                    تماس مستقیم برای هماهنگی دمو
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>برای هماهنگی سریع‌تر دمو یا پرسیدن درباره پلن‌ها، با شماره زیر تماس بگیرید.</p>
                  <Button asChild variant="outline" className="h-11 w-full rounded-xl border-emerald-500/30 font-black text-emerald-700 hover:bg-emerald-500/10">
                    <a href={PUBLIC_DEMO_PHONE_HREF}>
                      <Phone className="ml-2 h-4 w-4" />
                      <span dir="ltr" className="font-black tabular-nums">{PUBLIC_DEMO_PHONE_DISPLAY}</span>
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-border shadow-sm">
                <CardContent className="space-y-3 p-5 text-xs font-bold leading-6 text-muted-foreground">
                  {[
                    "فرم برای هماهنگی دمو و پیگیری فروش ثبت می‌شود.",
                    "ارسال فرم به معنی پرداخت یا ساخت حساب نیست.",
                    "اگر پلن مناسب را نمی‌دانید، حجم تقریبی عملیات را در توضیحات بنویسید.",
                  ].map((item) => (
                    <div key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </aside>

            <Card className="rounded-xl border-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-black">
                  <MessageSquareText className="h-5 w-5 text-primary" />
                  فرم درخواست دمو یا تماس
                </CardTitle>
                <p className="text-xs leading-6 text-muted-foreground">نام شرکت، راه ارتباطی و مسئله اصلی عملیات را بنویسید تا تماس بعدی دقیق‌تر باشد.</p>
              </CardHeader>
              <CardContent>
                {submitted && (
                  <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700">
                    درخواست شما ثبت شد و برای هماهنگی دمو پیگیری می‌شود.
                  </div>
                )}

                <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">نام شرکت</Label>
                    <Input id="companyName" value={form.companyName} onChange={(event) => updateForm({ companyName: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactName">نام مخاطب</Label>
                    <Input id="contactName" value={form.contactName} onChange={(event) => updateForm({ contactName: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">شماره تماس</Label>
                    <Input id="contactPhone" dir="ltr" inputMode="tel" value={form.contactPhone} onChange={(event) => updateForm({ contactPhone: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">ایمیل</Label>
                    <Input id="contactEmail" dir="ltr" type="email" value={form.contactEmail} onChange={(event) => updateForm({ contactEmail: event.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>روش ترجیحی تماس</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {preferenceOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateForm({ preferredContactMethod: option.value })}
                          className={cn(
                            "h-10 rounded-xl border px-3 text-xs font-black transition",
                            form.preferredContactMethod === option.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-muted/60"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="message">توضیحات</Label>
                    <textarea
                      id="message"
                      value={form.message}
                      onChange={(event) => updateForm({ message: event.target.value })}
                      className="min-h-28 w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-primary/10"
                      placeholder="مثلاً: ماهانه حدود ۱۰۰ محموله داریم، اسناد بین واتساپ و پوشه‌ها پخش می‌شود، دنبال لینک پیگیری مشتری هستیم."
                    />
                  </div>
                  <Button type="submit" disabled={submitting} className="h-12 rounded-xl text-sm font-black md:col-span-2">
                    {submitting ? (
                      <ActionSkeleton inverted className="w-40" />
                    ) : (
                      <>
                        <Send className="ml-2 h-4 w-4" />
                        ثبت درخواست دمو
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-y border-border bg-card/45 px-4 py-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">اول دمو، بعد تصمیم درباره پلن</h2>
              <p className="mt-2 text-sm text-muted-foreground">اگر قیمت‌ها را می‌خواهید ببینید، صفحه پلن‌ها آماده است. اگر عجله دارید، ثبت‌نام شرکت را شروع کنید.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" className="h-11 rounded-xl font-black">
                <Link to="/pricing">مشاهده پلن‌ها</Link>
              </Button>
              <Button asChild className="h-11 rounded-xl font-black">
                <Link to="/signup">شروع ثبت‌نام</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <PackageCheck className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-black text-foreground">لجستیک پلاس</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Logistic Plus</span>
            </span>
          </Link>
          <nav className="flex flex-wrap gap-4 text-xs font-bold text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground">پلن‌ها</Link>
            <Link to="/signup" className="hover:text-foreground">ثبت‌نام</Link>
            <Link to="/login" className="hover:text-foreground">ورود</Link>
            <Link to="/track/search" className="hover:text-foreground">رهگیری</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
