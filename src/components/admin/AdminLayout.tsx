import React from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  FileWarning,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCurrentUserPermissions } from "@/src/hooks/useCurrentUserPermissions";
import { useAppDataStore } from "@/src/store/useMockStore";

export type AdminSectionKey =
  | "overview"
  | "organizations"
  | "subscriptions"
  | "billing"
  | "errors";

export type AdminNavItem = {
  key: AdminSectionKey;
  label: string;
  description: string;
  count?: number;
};

const iconBySection: Record<AdminSectionKey, React.ElementType> = {
  overview: LayoutDashboard,
  organizations: Building2,
  subscriptions: ShieldCheck,
  billing: ReceiptText,
  errors: FileWarning,
};

function AdminNavButton({
  item,
  active,
  onClick,
  compact = false,
}: {
  key?: React.Key;
  item: AdminNavItem;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = iconBySection[item.key] || LayoutDashboard;

  return (
    <button
      type="button"
      data-testid={`admin-nav-${item.key}`}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground",
        compact && "min-w-[132px] flex-1 justify-center px-3 py-2"
      )}
      aria-current={active ? "page" : undefined}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition",
          active ? "bg-primary-foreground/16 text-primary-foreground" : "bg-background text-muted-foreground group-hover:text-primary"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className={cn("min-w-0 flex-1", compact && "hidden sm:block")}>
        <span className="block truncate text-[13px] font-black">{item.label}</span>
        {!compact && <span className="mt-0.5 block truncate text-[11px] opacity-75">{item.description}</span>}
      </span>
      {item.count ? (
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", active ? "bg-primary-foreground/18" : "bg-primary/10 text-primary")}>
          {Number(item.count).toLocaleString("fa-IR")}
        </span>
      ) : null}
    </button>
  );
}

export function AdminShellSkeleton() {
  return (
    <div className="admin-theme flex h-screen overflow-hidden bg-slate-950 text-slate-50" dir="rtl">
      <aside className="hidden w-[280px] shrink-0 border-l border-white/10 bg-slate-950 p-4 lg:block">
        <Skeleton className="mb-6 h-12 w-full rounded-xl bg-white/10" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-xl bg-white/10" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-background text-foreground">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4">
          <Skeleton className="h-9 w-56 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </header>
        <main className="min-w-0 flex-1 overflow-hidden p-4">
          <div className="mx-auto max-w-7xl space-y-4">
            <Skeleton className="h-28 rounded-2xl" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </main>
      </div>
    </div>
  );
}

export function AdminForbidden() {
  return (
    <div className="admin-theme grid min-h-screen place-items-center bg-slate-950 p-4 text-slate-50" dir="rtl" data-testid="admin-forbidden">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/15 text-amber-200">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-black">دسترسی به کنسول ادمین مجاز نیست</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          این بخش مخصوص مالک پلتفرم و کاربران دارای دسترسی platform.admin است. مخفی شدن لینک‌ها جایگزین کنترل دسترسی نیست و APIهای ادمین همچنان روی سرور محافظت می‌شوند.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild className="rounded-xl">
            <Link to="/dashboard">بازگشت به داشبورد</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
            <Link to="/login">ورود با حساب دیگر</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const currentUser = useAppDataStore((state) => state.currentUser);
  const setCurrentUser = useAppDataStore((state) => state.setCurrentUser);
  const { isPlatformAdmin, loading, status } = useCurrentUserPermissions();

  React.useEffect(() => {
    if (status === 401) {
      setCurrentUser(null);
    }
  }, [setCurrentUser, status]);

  if (!currentUser || status === 401) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return <AdminShellSkeleton />;
  }

  if (!isPlatformAdmin) {
    return <AdminForbidden />;
  }

  return <>{children}</>;
}

export function AdminSidebar({
  items,
  activeSection,
  onSectionChange,
}: {
  items: AdminNavItem[];
  activeSection: AdminSectionKey;
  onSectionChange: (section: AdminSectionKey) => void;
}) {
  return (
    <aside
      data-testid="admin-sidebar"
      className="hidden h-screen w-[292px] shrink-0 flex-col border-l border-white/10 bg-slate-950 text-slate-50 shadow-2xl lg:flex"
      dir="rtl"
    >
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black">کنسول ادمین پلتفرم</p>
            <p className="truncate text-[11px] text-slate-400">Platform Admin Console</p>
          </div>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-3 py-4">
        <div className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
          مدیریت پلتفرم
        </div>
        <nav className="space-y-1.5">
          {items.map((item) => (
            <AdminNavButton
              key={item.key}
              item={item}
              active={activeSection === item.key}
              onClick={() => onSectionChange(item.key)}
            />
          ))}
        </nav>
      </ScrollArea>
      <div className="border-t border-white/10 p-4">
        <Button asChild variant="outline" className="h-10 w-full rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
          <Link to="/dashboard" data-testid="admin-back-to-app">
            <ArrowRight className="ml-2 h-4 w-4" />
            بازگشت به اپ
          </Link>
        </Button>
      </div>
    </aside>
  );
}

export function AdminTopBar({
  items,
  activeSection,
  onSectionChange,
}: {
  items: AdminNavItem[];
  activeSection: AdminSectionKey;
  onSectionChange: (section: AdminSectionKey) => void;
}) {
  const currentUser = useAppDataStore((state) => state.currentUser);
  const setCurrentUser = useAppDataStore((state) => state.setCurrentUser);
  const navigate = useNavigate();
  const activeItem = items.find((item) => item.key === activeSection) || items[0];

  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST" }).catch((error) => {
      console.error("Logout failed:", error);
    });
    setCurrentUser(null);
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 px-3 py-3 backdrop-blur-xl md:px-5" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet>
            <SheetTrigger
              render={(triggerProps) => (
                <Button {...triggerProps} data-testid="admin-mobile-menu-trigger" variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              )}
            />
            <SheetContent side="right" className="w-[310px] bg-slate-950 p-0 text-slate-50" dir="rtl">
              <SheetHeader className="border-b border-white/10 p-4">
                <SheetTitle className="text-right text-slate-50">کنسول ادمین</SheetTitle>
              </SheetHeader>
              <nav className="space-y-1.5 p-3">
                {items.map((item) => (
                  <AdminNavButton
                    key={item.key}
                    item={item}
                    active={activeSection === item.key}
                    onClick={() => onSectionChange(item.key)}
                  />
                ))}
              </nav>
              <div className="mt-auto border-t border-white/10 p-4">
                <Button asChild variant="outline" className="h-10 w-full rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                  <Link to="/dashboard">بازگشت به اپ</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary lg:hidden">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black md:text-base">{activeItem?.label || "کنسول ادمین"}</p>
            <p className="truncate text-[11px] text-muted-foreground md:text-xs">
              {activeItem?.description || "Platform Admin Console"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" className="hidden rounded-xl text-xs font-bold sm:inline-flex">
            <a href="/api/health" target="_blank" rel="noreferrer">
              <HeartPulse className="ml-2 h-4 w-4" />
              Health
            </a>
          </Button>
          <Button asChild variant="outline" className="hidden rounded-xl text-xs font-bold md:inline-flex">
            <a href="/api/db/health" target="_blank" rel="noreferrer">
              <Activity className="ml-2 h-4 w-4" />
              DB
            </a>
          </Button>
          <Button asChild variant="outline" className="rounded-xl text-xs font-bold">
            <Link to="/dashboard">
              <ArrowRight className="ml-2 h-4 w-4" />
              اپ
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl text-muted-foreground hover:text-destructive" onClick={handleLogout} aria-label="خروج">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-2 hidden text-[11px] text-muted-foreground sm:block">
        {currentUser?.name} · {currentUser?.email}
      </div>
    </header>
  );
}

export function AdminMobileNav({
  items,
  activeSection,
  onSectionChange,
}: {
  items: AdminNavItem[];
  activeSection: AdminSectionKey;
  onSectionChange: (section: AdminSectionKey) => void;
}) {
  return (
    <nav
      data-testid="admin-mobile-nav"
      className="border-t border-border bg-card/95 p-2 backdrop-blur-xl lg:hidden"
      dir="rtl"
      aria-label="ناوبری کنسول ادمین"
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <AdminNavButton
            key={item.key}
            item={item}
            active={activeSection === item.key}
            onClick={() => onSectionChange(item.key)}
            compact
          />
        ))}
      </div>
    </nav>
  );
}

export function AdminLayout({
  items,
  activeSection,
  onSectionChange,
  children,
}: {
  items: AdminNavItem[];
  activeSection: AdminSectionKey;
  onSectionChange: (section: AdminSectionKey) => void;
  children: React.ReactNode;
}) {
  return (
    <div data-testid="admin-shell" className="admin-theme flex h-screen overflow-hidden bg-slate-950 text-slate-50" dir="rtl">
      <AdminSidebar items={items} activeSection={activeSection} onSectionChange={onSectionChange} />
      <div className="flex min-w-0 flex-1 flex-col bg-background text-foreground">
        <AdminTopBar items={items} activeSection={activeSection} onSectionChange={onSectionChange} />
        <main data-testid="admin-main" className="min-w-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.08),transparent_34rem)] pb-3">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 md:py-6 lg:px-8">
            {children}
          </div>
        </main>
        <AdminMobileNav items={items} activeSection={activeSection} onSectionChange={onSectionChange} />
      </div>
    </div>
  );
}
