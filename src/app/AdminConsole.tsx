import React from "react";
import AdminPanel, { type AdminTabKey } from "./AdminPanel";
import { AdminLayout, type AdminNavItem } from "@/src/components/admin/AdminLayout";

const adminSections: AdminNavItem[] = [
  {
    key: "overview",
    label: "نمای کلی",
    description: "متریک‌ها، سلامت پلتفرم و وضعیت فوری",
  },
  {
    key: "organizations",
    label: "شرکت‌ها",
    description: "ایجاد دستی، وضعیت و نمای شرکت‌ها",
  },
  {
    key: "requests",
    label: "ثبت‌نام‌ها",
    description: "بررسی درخواست‌های SaaS و پرداخت‌ها",
  },
  {
    key: "contacts",
    label: "درخواست تماس",
    description: "پیگیری فرم‌های ورودی سایت",
  },
  {
    key: "subscriptions",
    label: "اشتراک‌ها",
    description: "پلن، محدودیت‌ها، کاربران و وضعیت سازمان",
  },
  {
    key: "billing",
    label: "مالی",
    description: "پرداخت‌ها، فاکتورها و رسیدها",
  },
  {
    key: "sms",
    label: "SMS",
    description: "تحویل، تحلیل، قالب‌ها و worker محافظت‌شده",
  },
  {
    key: "errors",
    label: "خطاها",
    description: "لاگ خطاها و وضعیت حل‌شدن",
  },
];

export default function AdminConsole() {
  const [activeSection, setActiveSection] = React.useState<AdminTabKey>("overview");

  return (
    <AdminLayout
      items={adminSections}
      activeSection={activeSection}
      onSectionChange={(section) => setActiveSection(section)}
    >
      <AdminPanel activeTab={activeSection} onTabChange={setActiveSection} embedded />
    </AdminLayout>
  );
}
