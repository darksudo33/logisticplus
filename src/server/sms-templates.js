export const DEFAULT_SMS_TEMPLATES = [
  {
    key: "meeting_reminder_24h",
    label: "Meeting reminder 24h",
    body: "یادآوری جلسه #mtg# فردا ساعت #time# برگزار می‌شود.\nلاجستیک پلاس",
  },
  {
    key: "meeting_reminder_2h",
    label: "Meeting reminder 2h",
    body: "یادآوری جلسه #mtg# تا ۲ ساعت دیگر، ساعت #time# است.\nلاجستیک پلاس",
  },
  {
    key: "demurrage_warning_72h",
    label: "Demurrage warning 72h",
    body: "هشدار: تا شروع دموراژ محموله #ship# فقط ۷۲ ساعت مانده.\nلاجستیک پلاس",
  },
  {
    key: "demurrage_warning_24h",
    label: "Demurrage warning 24h",
    body: "هشدار: تا شروع دموراژ محموله #ship# فقط ۲۴ ساعت مانده.\nلاجستیک پلاس",
  },
  {
    key: "demurrage_overdue",
    label: "Demurrage overdue",
    body: "دموراژ محموله #ship# شروع شد؛ لطفاً فوری پیگیری کنید.\nلاجستیک پلاس",
  },
  {
    key: "high_priority_task",
    label: "High-priority task",
    body: "کار مهم #task# با اولویت بالا تا #time# انجام شود.\nلاجستیک پلاس",
  },
  {
    key: "customer_shipment_update",
    label: "Customer shipment update",
    body: "به‌روزرسانی محموله #ship#: وضعیت فعلی #status# است.\nلاجستیک پلاس",
  },
];

export const DEFAULT_SMS_TEMPLATE_MAP = Object.fromEntries(
  DEFAULT_SMS_TEMPLATES.map((template) => [template.key, template])
);

export function renderSmsTemplateBody(body, replacements = {}) {
  return Object.entries(replacements).reduce(
    (message, [key, value]) => message.replaceAll(`#${key}#`, String(value ?? "")),
    String(body || "")
  );
}
