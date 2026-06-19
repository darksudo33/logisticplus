/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ClientErrorBoundary } from "./components/ClientErrorBoundary";
import { ProtectedShellSkeleton, PublicRouteSkeleton } from "./components/SkeletonStates";
import { QUOTATIONS_UI_ENABLED, SHIPMENT_TEMPLATE_ADMIN_UI_ENABLED } from "./config/features";
import { installClientErrorReporting } from "./lib/errorReporting";
import { installClientPerformanceMonitoring } from "./lib/clientPerformance";
import { useAppStore } from "./store/useAppStore";
import { TooltipProvider } from "@/components/ui/tooltip";

const LazyToaster = lazy(() =>
  import("sonner").then(({ Toaster }) => ({
    default: () => <Toaster position="top-center" dir="rtl" />,
  }))
);
const ProtectedAppLayout = lazy(() => import("./components/layout/ProtectedAppLayout"));
const LoginPage = lazy(() => import("./app/LoginPage"));
const Dashboard = lazy(() => import("./app/Dashboard"));
const Shipments = lazy(() => import("./app/Shipments"));
const ExitedShipments = lazy(() => import("./app/ExitedShipments"));
const DailyStatus = lazy(() => import("./app/DailyStatus"));
const Customers = lazy(() => import("./app/Customers"));
const Tasks = lazy(() => import("./app/Tasks"));
const Chat = lazy(() => import("./app/Chat"));
const PublicTrack = lazy(() => import("./app/PublicTrack"));
const Profile = lazy(() => import("./app/Profile"));
const Settings = lazy(() => import("./app/Settings"));
const UserManagement = lazy(() => import("./app/UserManagement"));
const ShipmentFormTemplatesAdmin = SHIPMENT_TEMPLATE_ADMIN_UI_ENABLED ? lazy(() => import("./app/ShipmentFormTemplatesAdmin")) : null;
const ShipmentWorkflowTemplatesAdmin = SHIPMENT_TEMPLATE_ADMIN_UI_ENABLED ? lazy(() => import("./app/ShipmentWorkflowTemplatesAdmin")) : null;
const AdminConsoleRoute = lazy(() => import("./app/AdminConsoleRoute"));
const ShipmentDetail = lazy(() => import("./app/ShipmentDetail"));
const ShipmentCreateV2 = lazy(() => import("./app/ShipmentCreateV2"));
const ShipmentDetailV2 = lazy(() => import("./app/ShipmentDetailV2"));
const Documents = lazy(() => import("./app/Documents"));
const DocumentManagementCenter = lazy(() => import("./app/DocumentManagementCenter"));
const ShipmentEdit = lazy(() => import("./app/ShipmentEdit").then((module) => ({ default: module.ShipmentEdit })));
const ChangeLog = lazy(() => import("./app/ChangeLog"));
const Compliance = lazy(() => import("./app/Compliance"));
const ChequeManagement = lazy(() => import("./app/ChequeManagement"));
const CommercialCards = lazy(() => import("./app/CommercialCards"));
const ArchivePage = lazy(() => import("./app/Archive"));
const QuotageManagement = QUOTATIONS_UI_ENABLED ? lazy(() => import("./app/QuotageManagement")) : null;
const CustomerDetail = lazy(() => import("./app/CustomerDetail"));
const SearchPage = lazy(() => import("./app/SearchPage"));
const RatesAndTariffs = lazy(() => import("./app/RatesAndTariffs"));

const protectedRoutePrefixes = [
  "/dashboard",
  "/daily-status",
  // Reserved for the upcoming kootaj-board feature; currently redirects below.
  "/kootaj-board",
  "/shipments",
  "/changelog",
  "/customers",
  "/tasks",
  "/documents",
  "/compliance",
  "/compliance-meetings",
  "/cheques",
  "/commercial-cards",
  "/rates",
  "/search",
  "/quotage",
  "/quotations",
  "/archive",
  "/chat",
  "/profile",
  "/settings",
  "/management",
  "/admin",
  "/platform-admin",
];

const isProtectedPath = (pathname: string) =>
  protectedRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

function PublicLoginEntry() {
  const currentUser = useAppStore((state) => state.currentUser);
  return currentUser ? <Navigate to="/dashboard" replace /> : <LoginPage />;
}

function AppRoutes() {
  const location = useLocation();
  const routeFallback = isProtectedPath(location.pathname) ? <ProtectedShellSkeleton /> : <PublicRouteSkeleton />;

  return (
    <Suspense fallback={routeFallback}>
      <Routes>
        <Route path="/" element={<PublicLoginEntry />} />
        <Route path="/login" element={<PublicLoginEntry />} />
        <Route path="/contact" element={<Navigate to="/login" replace />} />
        <Route path="/signup" element={<Navigate to="/login" replace />} />
        <Route path="/signup/pending" element={<Navigate to="/login" replace />} />
        <Route path="/track/search" element={<Navigate to="/login" replace />} />
        <Route path="/track/:token" element={<PublicTrack />} />

        <Route path="/dashboard" element={<ProtectedAppLayout><Dashboard /></ProtectedAppLayout>} />
        <Route path="/daily-status" element={<ProtectedAppLayout anyOf={["shipments.view_all"]}><DailyStatus /></ProtectedAppLayout>} />
        <Route path="/kootaj-board" element={<Navigate to="/daily-status" replace />} />
        <Route path="/shipments" element={<ProtectedAppLayout anyOf={["shipments.view_all"]}><Shipments /></ProtectedAppLayout>} />
        <Route path="/shipments/new-v2" element={<ProtectedAppLayout anyOf={["shipments.create"]}><ShipmentCreateV2 /></ProtectedAppLayout>} />
        <Route path="/shipments/exited" element={<ProtectedAppLayout anyOf={["shipments.view_all"]}><ExitedShipments /></ProtectedAppLayout>} />
        <Route path="/shipments/:id/legacy" element={<ProtectedAppLayout anyOf={["shipments.view_all"]}><ShipmentDetail /></ProtectedAppLayout>} />
        <Route path="/shipments/:id/v2" element={<ProtectedAppLayout anyOf={["shipments.view_all"]}><ShipmentDetailV2 /></ProtectedAppLayout>} />
        <Route path="/shipments/:id" element={<ProtectedAppLayout anyOf={["shipments.view_all"]}><ShipmentDetailV2 /></ProtectedAppLayout>} />
        <Route path="/shipments/:id/edit" element={<ProtectedAppLayout anyOf={["shipments.view_all"]}><ShipmentEdit /></ProtectedAppLayout>} />
        <Route path="/changelog" element={<ProtectedAppLayout anyOf={["changes.view"]}><ChangeLog /></ProtectedAppLayout>} />
        <Route path="/customers" element={<ProtectedAppLayout anyOf={["customers.view"]} roles={["CEO"]}><Customers /></ProtectedAppLayout>} />
        <Route path="/customers/:id" element={<ProtectedAppLayout anyOf={["customers.view"]} roles={["CEO"]}><CustomerDetail /></ProtectedAppLayout>} />
        <Route path="/tasks" element={<ProtectedAppLayout anyOf={["tasks.view_own", "tasks.view_all"]}><Tasks /></ProtectedAppLayout>} />
        <Route path="/documents" element={<ProtectedAppLayout anyOf={["documents.view_all"]}><Documents /></ProtectedAppLayout>} />
        <Route path="/documents/management-center" element={<ProtectedAppLayout allOf={["documents.view_all", "shipments.view_all"]}><DocumentManagementCenter /></ProtectedAppLayout>} />
        <Route path="/compliance" element={<Navigate to="/compliance-meetings" replace />} />
        <Route path="/compliance-meetings" element={<ProtectedAppLayout anyOf={["compliance.manage"]}><Compliance /></ProtectedAppLayout>} />
        <Route path="/cheques" element={<ProtectedAppLayout anyOf={["cheques.manage"]}><ChequeManagement /></ProtectedAppLayout>} />
        <Route path="/commercial-cards" element={<ProtectedAppLayout><CommercialCards /></ProtectedAppLayout>} />
        <Route path="/rates" element={<ProtectedAppLayout><RatesAndTariffs /></ProtectedAppLayout>} />
        <Route path="/search" element={<ProtectedAppLayout><SearchPage /></ProtectedAppLayout>} />
        <Route path="/quotage" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/quotations"
          element={
            QUOTATIONS_UI_ENABLED && QuotageManagement ? (
              <ProtectedAppLayout anyOf={["quotations.manage"]}><QuotageManagement /></ProtectedAppLayout>
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route path="/archive" element={<ProtectedAppLayout anyOf={["archive.view"]}><ArchivePage /></ProtectedAppLayout>} />
        <Route path="/chat" element={<ProtectedAppLayout anyOf={["chat.use"]}><Chat /></ProtectedAppLayout>} />
        <Route path="/profile" element={<ProtectedAppLayout><Profile /></ProtectedAppLayout>} />
        <Route path="/settings" element={<ProtectedAppLayout><Settings /></ProtectedAppLayout>} />
        <Route path="/management" element={<ProtectedAppLayout anyOf={["users.manage"]}><UserManagement /></ProtectedAppLayout>} />
        <Route
          path="/admin/shipment-form-templates"
          element={
            SHIPMENT_TEMPLATE_ADMIN_UI_ENABLED && ShipmentFormTemplatesAdmin ? (
              <ProtectedAppLayout anyOf={["shipment_forms.manage"]}><ShipmentFormTemplatesAdmin /></ProtectedAppLayout>
            ) : (
              <Navigate to="/shipments" replace />
            )
          }
        />
        <Route
          path="/admin/workflow-templates"
          element={
            SHIPMENT_TEMPLATE_ADMIN_UI_ENABLED && ShipmentWorkflowTemplatesAdmin ? (
              <ProtectedAppLayout anyOf={["shipment_workflows.manage"]}><ShipmentWorkflowTemplatesAdmin /></ProtectedAppLayout>
            ) : (
              <Navigate to="/shipments" replace />
            )
          }
        />
        <Route path="/admin" element={<Navigate to="/platform-admin" replace />} />
        <Route path="/platform-admin" element={<AdminConsoleRoute />} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  useEffect(() => {
    installClientErrorReporting();
    installClientPerformanceMonitoring();
  }, []);

  return (
    <Router>
      <TooltipProvider>
        <Suspense fallback={null}>
          <LazyToaster />
        </Suspense>
        <div className="h-full">
          <ClientErrorBoundary>
            <AppRoutes />
          </ClientErrorBoundary>
        </div>
      </TooltipProvider>
    </Router>
  );
}
