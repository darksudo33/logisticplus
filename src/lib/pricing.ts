export type PricingPlanId = "starter" | "business" | "enterprise";

export type PricingPlan = {
  id: PricingPlanId;
  name: string;
  badge?: string;
  audience: string;
  description: string;
  monthlyPriceIrr: number;
  annualPriceIrr: number;
  limits: {
    users: number;
    monthlyShipments: number;
    storageMb: number;
    storageGb: number;
  };
  backendFeatures: Record<string, boolean>;
  summaryFeatures: string[];
  includedFeatures: string[];
  disabledFeatures: string[];
  recommended?: boolean;
};

export const pricingPlans: PricingPlan[] = [
  {
    id: "starter",
    name: "اقتصادی",
    audience: "برای شروع منظم با تیم کوچک",
    description: "برای شرکت‌هایی که می‌خواهند محموله‌های فعال، مشتریان، اسناد پایه و پیگیری‌های روزانه را از فایل و چت جدا کنند.",
    monthlyPriceIrr: 19900000,
    annualPriceIrr: 199000000,
    limits: {
      users: 3,
      monthlyShipments: 50,
      storageMb: 2048,
      storageGb: 2,
    },
    backendFeatures: {
      chat: false,
      cheques: false,
      compliance: false,
      quotations: false,
      archive: true,
      smsNotifications: false,
    },
    summaryFeatures: [
      "تا ۳ کاربر",
      "تا ۵۰ محموله در ماه",
      "۲ گیگابایت فضا",
    ],
    includedFeatures: [
      "داشبورد وضعیت کارهای روز",
      "ثبت و پیگیری محموله‌ها تا سقف پلن",
      "پرونده مشتریان و اطلاعات تماس",
      "وظایف و پیگیری‌های داخلی تیم",
      "بارگذاری اسناد پایه هر محموله",
      "صفحه رهگیری امن برای مشتری",
      "لینک و QR پیگیری محموله",
      "تاریخچه پایه تغییرات مهم",
      "پیامک هشدارها به‌عنوان افزونه پرداختی",
    ],
    disabledFeatures: [
      "مدیریت کوتیشن / استعلام نرخ",
      "مدیریت چک‌ها",
      "جلسات کامپلاینس",
      "خروجی ماهانه",
      "سطح دسترسی و نقش‌های پیشرفته",
    ],
  },
  {
    id: "business",
    name: "حرفه‌ای",
    badge: "پیشنهاد ما",
    audience: "برای تیم‌هایی با چند کاربر عملیاتی",
    description: "برای شرکت‌هایی که چند نفر همزمان روی بار، سند، مشتری، چک و استعلام نرخ کار می‌کنند و دید مدیریتی دقیق‌تری می‌خواهند.",
    monthlyPriceIrr: 49900000,
    annualPriceIrr: 499000000,
    limits: {
      users: 10,
      monthlyShipments: 250,
      storageMb: 10240,
      storageGb: 10,
    },
    backendFeatures: {
      chat: false,
      cheques: true,
      compliance: true,
      quotations: true,
      archive: true,
      smsNotifications: false,
    },
    summaryFeatures: [
      "تا ۱۰ کاربر",
      "تا ۲۵۰ محموله در ماه",
      "۱۰ گیگابایت فضا",
    ],
    includedFeatures: [
      "همه امکانات پلن اقتصادی",
      "مدیریت کوتیشن / استعلام نرخ",
      "مدیریت چک‌های مرتبط با عملیات",
      "جلسات کامپلاینس محدود",
      "تا ۱۰ جلسه کامپلاینس در ماه",
      "مدیریت نقش‌ها و کاربران داخلی",
      "خروجی ماهانه: ماهی یک‌بار",
      "گزارش‌های کاربردی‌تر برای مدیر عملیات",
      "پشتیبانی اولویت‌دار",
      "پیامک هشدارها به‌عنوان افزونه پرداختی",
    ],
    disabledFeatures: [],
    recommended: true,
  },
  {
    id: "enterprise",
    name: "سازمانی",
    audience: "برای عملیات پرتردد و چندنفره",
    description: "برای شرکت‌هایی که حجم بالای محموله، سند، پیگیری مشتری و کار داخلی دارند و می‌خواهند کنترل مدیریتی کامل‌تری داشته باشند.",
    monthlyPriceIrr: 99000000,
    annualPriceIrr: 990000000,
    limits: {
      users: 30,
      monthlyShipments: 1000,
      storageMb: 51200,
      storageGb: 50,
    },
    backendFeatures: {
      chat: false,
      cheques: true,
      compliance: true,
      quotations: true,
      archive: true,
      smsNotifications: true,
    },
    summaryFeatures: [
      "تا ۳۰ کاربر",
      "تا ۱,۰۰۰ محموله در ماه",
      "۵۰ گیگابایت فضا",
    ],
    includedFeatures: [
      "همه امکانات پلن حرفه‌ای",
      "مدیریت کامل کوتیشن و استعلام نرخ",
      "مدیریت کامل چک‌های عملیاتی",
      "مدیریت کامل جلسات و مدارک کامپلاینس",
      "خروجی ماهانه: ماهی ۴ بار",
      "کنترل کامل نقش‌ها و سطح دسترسی کاربران",
      "گزارش تغییرات کامل",
      "پشتیبانی ویژه",
      "آموزش اولیه تیم",
      "بررسی ماهانه استفاده از سیستم",
      "پیامک هشدار جلسات، دمیوراژ و وظایف فوری",
    ],
    disabledFeatures: [],
  },
];

export const extraUsagePricing = [
  "هر کاربر اضافه: ۳,۹۰۰,۰۰۰ ریال / ماه",
  "هر ۱۰۰ محموله اضافه: ۷,۹۰۰,۰۰۰ ریال / ماه",
  "هر ۵ گیگابایت فضای اضافه: ۴,۹۰۰,۰۰۰ ریال / ماه",
  "خروجی گزارش اضافه: ۱,۹۰۰,۰۰۰ ریال / هر خروجی",
  "پیامک هشدارها برای پلن‌های پایین‌تر: افزونه توافقی با صورتحساب دستی",
];

export const defaultPricingPlanId: PricingPlanId = "business";

export function formatIrr(value: number) {
  return `${Number(value || 0).toLocaleString("fa-IR")} ریال`;
}

export function getPricingPlan(planId?: string | null) {
  return pricingPlans.find((plan) => plan.id === planId) || pricingPlans.find((plan) => plan.id === defaultPricingPlanId) || pricingPlans[0];
}
