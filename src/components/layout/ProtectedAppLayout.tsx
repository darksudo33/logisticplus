import React, { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { format } from "date-fns-jalali";
import { Sidebar, TopBar } from "./Navbar";
import { MobileBottomNav } from "./MobileBottomNav";
import { ProtectedContentSkeleton, ProtectedShellSkeleton } from "@/src/components/SkeletonStates";
import { recordClientMetric } from "@/src/lib/clientPerformance";
import { useAppDataStore } from "@/src/store/useMockStore";

const HYDRATION_RETRY_MS = 8000;
const OFFLINE_HYDRATION_RETRY_MS = 15000;

function hasFrontendPermission(user: { permissions?: string[] } | null, anyOf: string[] = [], allOf: string[] = []) {
  if (!user) return false;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes("platform.admin")) return true;
  const hasAnyRequired = anyOf.length === 0 || anyOf.some((permission) => permissions.includes(permission));
  const hasAllRequired = allOf.every((permission) => permissions.includes(permission));
  return hasAnyRequired && hasAllRequired;
}

function canRenderProtectedRouteBeforeLegacyHydration(pathname: string) {
  if (pathname === "/dashboard" || pathname === "/tasks" || pathname === "/shipments/new-v2") return true;
  const shipmentV2DetailMatch = pathname.match(/^\/shipments\/([^/]+)(?:\/v2)?$/);
  if (!shipmentV2DetailMatch) return false;
  return !["exited", "new-v2"].includes(shipmentV2DetailMatch[1]);
}

function getPerformanceNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function BackgroundSyncNotice({ isOnline, isHydrating }: { isOnline: boolean; isHydrating: boolean }) {
  const title = !isOnline
    ? "اتصال قطع یا ضعیف است"
    : isHydrating
      ? "در حال همگام‌سازی اطلاعات تکمیلی"
      : "در انتظار تلاش مجدد برای همگام‌سازی";
  const detail = !isOnline
    ? "صفحه با داده‌های اصلی باز می‌ماند و پس از اتصال دوباره کامل می‌شود."
    : isHydrating
      ? "بخش اصلی صفحه آماده است؛ داده‌های کمکی در پس‌زمینه تکمیل می‌شوند."
      : "در اتصال ضعیف صفحه قابل استفاده می‌ماند و کمی بعد دوباره تلاش می‌شود.";

  return (
    <div className="app-page pb-0 pt-3">
      <div
        data-testid="background-sync-notice"
        role="status"
        aria-live="polite"
        className={`min-h-12 rounded-lg border px-4 py-3 text-xs font-bold shadow-sm ${
          isOnline
            ? "border-blue-100 bg-blue-50 text-blue-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>{title}</span>
          <span className="font-semibold leading-6 opacity-80">{detail}</span>
        </div>
      </div>
    </div>
  );
}

function ThemeSync() {
  const currentTheme = useAppDataStore((state) => state.currentTheme);

  useEffect(() => {
    const root = window.document.documentElement;
    if (currentTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [currentTheme]);

  return null;
}

function ComplianceSync() {
  const currentUser = useAppDataStore((state) => state.currentUser);
  const appointments = useAppDataStore((state) => state.appointments);
  const updateAppointment = useAppDataStore((state) => state.updateAppointment);
  const addNotification = useAppDataStore((state) => state.addNotification);

  useEffect(() => {
    if (!currentUser) return;

    const todayStr = format(new Date(), "yyyy/MM/dd");
    const todayApps = appointments.filter(
      (app) => app.assignedPersonId === currentUser.id && app.dateTime.startsWith(todayStr) && !app.reminderSent
    );

    todayApps.forEach((app) => {
      addNotification({
        title: "ÛŒØ§Ø¯Ø¢ÙˆØ±ÛŒ Ø¬Ù„Ø³Ù‡ Ø§Ù…Ø±ÙˆØ²",
        message: `Ø´Ù…Ø§ Ø§Ù…Ø±ÙˆØ² ÛŒÚ© Ø¬Ù„Ø³Ù‡ Ø¯Ø§Ø±ÛŒØ¯: ${app.purpose} (Ø³Ø§Ø¹Øª ${app.dateTime.split(" ")[1]})`,
        type: "URGENT",
        link: "/compliance-meetings",
      });
      updateAppointment(app.id, { reminderSent: true });
    });
  }, [currentUser, appointments, updateAppointment, addNotification]);

  return null;
}

export default function ProtectedAppLayout({
  children,
  anyOf = [],
  allOf = [],
  roles = [],
}: {
  children: React.ReactNode;
  anyOf?: string[];
  allOf?: string[];
  roles?: string[];
}) {
  const currentUser = useAppDataStore((state) => state.currentUser);
  const setCurrentUser = useAppDataStore((state) => state.setCurrentUser);
  const hasHydratedFromDatabase = useAppDataStore((state) => state.hasHydratedFromDatabase);
  const isHydratingFromDatabase = useAppDataStore((state) => state.isHydratingFromDatabase);
  const loadCurrentUserRecords = useAppDataStore((state) => state.loadCurrentUserRecords);
  const restoreCurrentUserFromSession = useAppDataStore((state) => state.restoreCurrentUserFromSession);
  const [hasCheckedSession, setHasCheckedSession] = React.useState(false);
  const [isRestoringSession, setIsRestoringSession] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [hydrationRetryTick, setHydrationRetryTick] = React.useState(0);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const hydrationRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrationRetryAvailableAtRef = useRef(0);
  const routeTimingRef = useRef({
    pathname,
    startedAt: getPerformanceNow(),
    recordedReadyFor: "",
  });

  if (routeTimingRef.current.pathname !== pathname) {
    routeTimingRef.current = {
      pathname,
      startedAt: getPerformanceNow(),
      recordedReadyFor: "",
    };
  }

  const canRenderBeforeLegacyHydration = canRenderProtectedRouteBeforeLegacyHydration(pathname);
  const shouldRenderChildren = hasHydratedFromDatabase || canRenderBeforeLegacyHydration;

  const scheduleHydrationRetry = React.useCallback((delayMs: number) => {
    if (hydrationRetryTimerRef.current) {
      clearTimeout(hydrationRetryTimerRef.current);
    }
    hydrationRetryTimerRef.current = setTimeout(() => {
      hydrationRetryTimerRef.current = null;
      setHydrationRetryTick((tick) => tick + 1);
    }, delayMs);
  }, []);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      hydrationRetryAvailableAtRef.current = 0;
      setHydrationRetryTick((tick) => tick + 1);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (hydrationRetryTimerRef.current) {
        clearTimeout(hydrationRetryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (currentUser || hasCheckedSession || isRestoringSession) return;
    setIsRestoringSession(true);
    restoreCurrentUserFromSession()
      .catch((error) => {
        const status = Number((error as { status?: number })?.status || 0);
        if (status && status !== 401 && status !== 403) {
          console.error("Could not restore authenticated session.", error);
        }
      })
      .finally(() => {
        setHasCheckedSession(true);
        setIsRestoringSession(false);
      });
  }, [currentUser, hasCheckedSession, isRestoringSession, restoreCurrentUserFromSession]);

  useEffect(() => {
    if (currentUser && !hasHydratedFromDatabase && !isHydratingFromDatabase) {
      const waitMs = hydrationRetryAvailableAtRef.current - Date.now();
      if (waitMs > 0) {
        scheduleHydrationRetry(waitMs);
        return;
      }

      loadCurrentUserRecords().catch((error) => {
        if (!(error instanceof TypeError && error.message === "Failed to fetch")) {
          console.error(error);
        }
        const status = Number((error as { status?: number })?.status || 0);
        if (status === 401 || status === 403) {
          setCurrentUser(null);
          return;
        }
        const retryDelayMs = typeof navigator !== "undefined" && !navigator.onLine ? OFFLINE_HYDRATION_RETRY_MS : HYDRATION_RETRY_MS;
        hydrationRetryAvailableAtRef.current = Date.now() + retryDelayMs;
        recordClientMetric("legacy_bootstrap.retry_scheduled", {
          retryDelayMs,
          status: status || undefined,
          error: error instanceof Error ? error.message : String(error),
        });
        scheduleHydrationRetry(retryDelayMs);
      });
    }
  }, [
    currentUser,
    hasHydratedFromDatabase,
    hydrationRetryTick,
    isHydratingFromDatabase,
    loadCurrentUserRecords,
    scheduleHydrationRetry,
    setCurrentUser,
  ]);

  useEffect(() => {
    if (!currentUser || !shouldRenderChildren) return;
    const timing = routeTimingRef.current;
    if (timing.recordedReadyFor === pathname) return;
    timing.recordedReadyFor = pathname;
    recordClientMetric("route.ready", {
      pathname,
      durationMs: Math.round(getPerformanceNow() - timing.startedAt),
      legacyHydrated: hasHydratedFromDatabase,
      renderedBeforeLegacyHydration: canRenderBeforeLegacyHydration && !hasHydratedFromDatabase,
    });
  }, [canRenderBeforeLegacyHydration, currentUser, hasHydratedFromDatabase, pathname, shouldRenderChildren]);

  if (!currentUser) {
    if (!hasCheckedSession || isRestoringSession) {
      return <ProtectedShellSkeleton />;
    }
    return <Navigate to="/login" replace />;
  }

  if (!hasFrontendPermission(currentUser, anyOf, allOf)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (roles.length > 0 && !roles.includes(currentUser.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const showBackgroundSyncNotice = canRenderBeforeLegacyHydration && !hasHydratedFromDatabase;

  return (
    <div className="dashboard-theme app-shell flex h-screen overflow-hidden bg-background text-foreground" dir="rtl">
      <ThemeSync />
      {hasHydratedFromDatabase ? <ComplianceSync /> : null}
      <Sidebar />
      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        <TopBar />
        <main ref={mainRef} className="app-main flex-1 overflow-y-auto w-full pb-16 lg:pb-0">
          {showBackgroundSyncNotice ? (
            <BackgroundSyncNotice isOnline={isOnline} isHydrating={isHydratingFromDatabase} />
          ) : null}
          {shouldRenderChildren ? children : <ProtectedContentSkeleton />}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
