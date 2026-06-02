import React, { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { format } from "date-fns-jalali";
import { Sidebar, TopBar } from "./Navbar";
import { MobileBottomNav } from "./MobileBottomNav";
import { ProtectedContentSkeleton, ProtectedShellSkeleton } from "@/src/components/SkeletonStates";
import { useAppDataStore } from "@/src/store/useMockStore";

function hasFrontendPermission(user: { permissions?: string[] } | null, anyOf: string[] = []) {
  if (!user || anyOf.length === 0) return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes("platform.admin")) return true;
  return anyOf.some((permission) => permissions.includes(permission));
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
}: {
  children: React.ReactNode;
  anyOf?: string[];
}) {
  const currentUser = useAppDataStore((state) => state.currentUser);
  const setCurrentUser = useAppDataStore((state) => state.setCurrentUser);
  const hasHydratedFromDatabase = useAppDataStore((state) => state.hasHydratedFromDatabase);
  const isHydratingFromDatabase = useAppDataStore((state) => state.isHydratingFromDatabase);
  const loadCurrentUserRecords = useAppDataStore((state) => state.loadCurrentUserRecords);
  const restoreCurrentUserFromSession = useAppDataStore((state) => state.restoreCurrentUserFromSession);
  const [hasCheckedSession, setHasCheckedSession] = React.useState(false);
  const [isRestoringSession, setIsRestoringSession] = React.useState(false);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [pathname]);

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
      loadCurrentUserRecords().catch((error) => {
        if (!(error instanceof TypeError && error.message === "Failed to fetch")) {
          console.error(error);
        }
        const status = Number((error as { status?: number })?.status || 0);
        if (status === 401 || status === 403) {
          setCurrentUser(null);
        }
      });
    }
  }, [currentUser, hasHydratedFromDatabase, isHydratingFromDatabase, loadCurrentUserRecords, setCurrentUser]);

  if (!currentUser) {
    if (!hasCheckedSession || isRestoringSession) {
      return <ProtectedShellSkeleton />;
    }
    return <Navigate to="/login" replace />;
  }

  if (!hasFrontendPermission(currentUser, anyOf)) {
    return <Navigate to="/dashboard" replace />;
  }

  const canRenderBeforeLegacyHydration = pathname === "/dashboard" || pathname === "/tasks";
  const shouldRenderChildren = hasHydratedFromDatabase || canRenderBeforeLegacyHydration;

  return (
    <div className="dashboard-theme app-shell flex h-screen overflow-hidden bg-background text-foreground" dir="rtl">
      <ThemeSync />
      {hasHydratedFromDatabase ? <ComplianceSync /> : null}
      <Sidebar />
      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        <TopBar />
        <main ref={mainRef} className="app-main flex-1 overflow-y-auto w-full pb-16 lg:pb-0">
          {shouldRenderChildren ? children : <ProtectedContentSkeleton />}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
