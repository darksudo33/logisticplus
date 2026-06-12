import AdminConsole from "./AdminConsole";
import { AdminProtectedLayout } from "@/src/components/admin/AdminLayout";

export default function AdminConsoleRoute() {
  return (
    <AdminProtectedLayout>
      <AdminConsole />
    </AdminProtectedLayout>
  );
}
