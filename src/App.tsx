/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Sidebar, TopBar } from "./components/layout/Navbar";
import { MobileBottomNav } from "./components/layout/MobileBottomNav";
import { useMockStore } from "./store/useMockStore";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { format } from "date-fns-jalali";
import { ClientErrorBoundary } from "./components/ClientErrorBoundary";
import { installClientErrorReporting } from "./lib/errorReporting";
import { ProtectedContentSkeleton, ProtectedShellSkeleton, PublicRouteSkeleton } from "./components/SkeletonStates";

// Lazy Loaded Components
import LoginPage from "./app/LoginPage";
import LandingPage from "./app/LandingPage";
import ContactPage from "./app/ContactPage";
import { PricingPage, SignupPage, SignupPendingPage } from "./app/SaasSignup";
const Dashboard = lazy(() => import("./app/Dashboard"));
const Shipments = lazy(() => import("./app/Shipments"));
const Customers = lazy(() => import("./app/Customers"));
const Tasks = lazy(() => import("./app/Tasks"));
const Chat = lazy(() => import("./app/Chat"));
const PublicTrack = lazy(() => import("./app/PublicTrack"));
const PublicTrackSearch = lazy(() => import("./app/PublicTrack").then(module => ({ default: module.PublicTrackSearch })));
const Profile = lazy(() => import("./app/Profile"));
const Settings = lazy(() => import("./app/Settings"));
const UserManagement = lazy(() => import("./app/UserManagement"));
const AdminPanel = lazy(() => import("./app/AdminPanel"));
const ShipmentDetail = lazy(() => import("./app/ShipmentDetail"));
const Documents = lazy(() => import("./app/Documents"));
const ShipmentEdit = lazy(() => import("./app/ShipmentEdit").then(module => ({ default: module.ShipmentEdit })));
const ChangeLog = lazy(() => import("./app/ChangeLog"));
const Compliance = lazy(() => import("./app/Compliance"));
const ChequeManagement = lazy(() => import("./app/ChequeManagement"));
const ArchivePage = lazy(() => import("./app/Archive"));
const QuotageManagement = lazy(() => import("./app/QuotageManagement"));
const CustomerDetail = lazy(() => import("./app/CustomerDetail"));

const protectedRoutePrefixes = [
  "/dashboard",
  "/shipments",
  "/changelog",
  "/customers",
  "/tasks",
  "/documents",
  "/compliance",
  "/cheques",
  "/quotage",
  "/archive",
  "/chat",
  "/profile",
  "/settings",
  "/management",
  "/admin",
];

const isProtectedPath = (pathname: string) =>
  protectedRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const ComplianceSync = () => {
  const currentUser = useMockStore(state => state.currentUser);
  const appointments = useMockStore(state => state.appointments);
  const updateAppointment = useMockStore(state => state.updateAppointment);
  const addNotification = useMockStore(state => state.addNotification);

  useEffect(() => {
    if (!currentUser) return;

    const todayStr = format(new Date(), "yyyy/MM/dd");

    const todayApps = appointments.filter(app =>
      app.assignedPersonId === currentUser.id &&
      app.dateTime.startsWith(todayStr) &&
      !app.reminderSent
    );

    if (todayApps.length > 0) {
      todayApps.forEach(app => {
        addNotification({
          title: "یادآوری جلسه امروز",
          message: `شما امروز یک جلسه دارید: ${app.purpose} (ساعت ${app.dateTime.split(" ")[1]})`,
          type: "URGENT",
          link: "/compliance"
        });
        updateAppointment(app.id, { reminderSent: true });
      });
    }
  }, [currentUser, appointments, updateAppointment, addNotification]);

  return null;
};

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  const currentUser = useMockStore(state => state.currentUser);
  const setCurrentUser = useMockStore(state => state.setCurrentUser);
  const hasHydratedFromDatabase = useMockStore(state => state.hasHydratedFromDatabase);
  const loadCurrentUserRecords = useMockStore(state => state.loadCurrentUserRecords);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [pathname]);

  useEffect(() => {
    if (currentUser && !hasHydratedFromDatabase) {
      loadCurrentUserRecords().catch((error) => {
        console.error(error);
        setCurrentUser(null);
      });
    }
  }, [currentUser, hasHydratedFromDatabase, loadCurrentUserRecords, setCurrentUser]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="dashboard-theme app-shell flex h-screen bg-background text-foreground overflow-hidden" dir="rtl">
      {hasHydratedFromDatabase ? <ComplianceSync /> : null}
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <TopBar />
        <main ref={mainRef} className="app-main flex-1 overflow-y-auto w-full pb-16 lg:pb-0">
          {hasHydratedFromDatabase ? children : <ProtectedContentSkeleton />}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
};

function AppRoutes() {
  const location = useLocation();
  const routeFallback = isProtectedPath(location.pathname) ? <ProtectedShellSkeleton /> : <PublicRouteSkeleton />;

  return (
    <Suspense fallback={routeFallback}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/signup/pending" element={<SignupPendingPage />} />
        <Route path="/billing/callback/zarinpal" element={<SignupPendingPage />} />
        <Route path="/track/:token" element={<PublicTrack />} />
        <Route path="/track/search" element={<PublicTrackSearch />} />

        <Route path="/dashboard" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
        <Route path="/shipments" element={<ProtectedLayout><Shipments /></ProtectedLayout>} />
        <Route path="/shipments/:id" element={<ProtectedLayout><ShipmentDetail /></ProtectedLayout>} />
        <Route path="/shipments/:id/edit" element={<ProtectedLayout><ShipmentEdit /></ProtectedLayout>} />
        <Route path="/changelog" element={<ProtectedLayout><ChangeLog /></ProtectedLayout>} />
        <Route path="/customers" element={<ProtectedLayout><Customers /></ProtectedLayout>} />
        <Route path="/customers/:id" element={<ProtectedLayout><CustomerDetail /></ProtectedLayout>} />
        <Route path="/tasks" element={<ProtectedLayout><Tasks /></ProtectedLayout>} />
        <Route path="/documents" element={<ProtectedLayout><Documents /></ProtectedLayout>} />
        <Route path="/compliance" element={<ProtectedLayout><Compliance /></ProtectedLayout>} />
        <Route path="/cheques" element={<ProtectedLayout><ChequeManagement /></ProtectedLayout>} />
        <Route path="/quotage" element={<ProtectedLayout><QuotageManagement /></ProtectedLayout>} />
        <Route path="/archive" element={<ProtectedLayout><ArchivePage /></ProtectedLayout>} />
        <Route path="/chat" element={<ProtectedLayout><Chat /></ProtectedLayout>} />
        <Route path="/profile" element={<ProtectedLayout><Profile /></ProtectedLayout>} />
        <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />
        <Route path="/management" element={<ProtectedLayout><UserManagement /></ProtectedLayout>} />
        <Route path="/admin" element={<ProtectedLayout><AdminPanel /></ProtectedLayout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  const currentTheme = useMockStore(state => state.currentTheme);

  useEffect(() => {
    const root = window.document.documentElement;
    if (currentTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [currentTheme]);

  useEffect(() => {
    installClientErrorReporting();
  }, []);

  return (
    <Router>
      <TooltipProvider>
        <Toaster position="top-center" dir="rtl" />
        <div className="h-full">
          <ClientErrorBoundary>
            <AppRoutes />
          </ClientErrorBoundary>
        </div>
      </TooltipProvider>
    </Router>
  );
}
