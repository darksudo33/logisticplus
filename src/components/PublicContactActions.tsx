import { CalendarCheck2, PhoneCall } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PUBLIC_DEMO_PHONE_DISPLAY = "۰۹۳۶۵۶۸۳۶۹۴";
export const PUBLIC_DEMO_PHONE_TEL = "+989365683694";
export const PUBLIC_DEMO_PHONE_HREF = `tel:${PUBLIC_DEMO_PHONE_TEL}`;

type PublicContactActionsProps = {
  className?: string;
  signupClassName?: string;
  demoClassName?: string;
  signupLabel?: string;
  demoLabel?: string;
  signupTo?: string;
};

export function PublicContactActions({
  className,
  signupClassName,
  demoClassName,
  signupLabel = "شروع ثبت‌نام",
  demoLabel = "تماس با ما",
  signupTo = "/signup",
}: PublicContactActionsProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <Button asChild className={cn("h-12 rounded-xl px-5 text-sm font-black", signupClassName)}>
        <Link to={signupTo}>
          <CalendarCheck2 className="ml-2 h-4 w-4" />
          {signupLabel}
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        className={cn("h-12 rounded-xl border-primary/30 bg-background px-5 text-sm font-black text-primary hover:bg-primary/10", demoClassName)}
      >
        <Link to="/contact" dir="rtl">
          <PhoneCall className="ml-2 h-4 w-4" />
          {demoLabel}
        </Link>
      </Button>
    </div>
  );
}

export function PublicPhonePill({ className }: { className?: string }) {
  return (
    <a
      href={PUBLIC_DEMO_PHONE_HREF}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-black text-emerald-700 transition hover:bg-emerald-500/15",
        className
      )}
      aria-label={`تماس مستقیم با شماره ${PUBLIC_DEMO_PHONE_DISPLAY}`}
    >
      <PhoneCall className="h-3.5 w-3.5" />
      <span>تماس مستقیم</span>
      <span className="font-black tabular-nums" dir="ltr">{PUBLIC_DEMO_PHONE_DISPLAY}</span>
    </a>
  );
}
