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

const fullAccessFeatures = {
  chat: true,
  cheques: true,
  compliance: true,
  quotations: true,
  archive: true,
  smsNotifications: true,
};

export const pricingPlans: PricingPlan[] = [
  {
    id: "starter",
    name: "اقتصادی",
    audience: "برای تیم‌های کوچک که می‌خواهند عملیات لجستیک را منظم شروع کنند",
    description: "همه ابزارهای عملیاتی لجستیک پلاس بدون اتصال پیامک، مناسب تیم کوچک و حجم سبک محموله ماهانه.",
    monthlyPriceIrr: 34900000,
    annualPriceIrr: 349000000,
    limits: {
      users: 3,
      monthlyShipments: 5,
      storageMb: 2048,
      storageGb: 2,
    },
    backendFeatures: {
      ...fullAccessFeatures,
      smsNotifications: false,
    },
    summaryFeatures: [
      "تا ۳ کاربر",
      "تا ۵ محموله در ماه",
      "۲ گیگابایت فضای اسناد",
    ],
    includedFeatures: [
      "داشبورد، محموله‌ها، مشتریان، وظایف، اسناد، لینک رهگیری، آرشیو، چک‌ها، جلسات اداری، استعلام قیمت و گردش‌کار داخلی",
      "صفحه رهگیری امن مشتری و کنترل نمایش اسناد",
      "مدیریت نقش‌ها و اعضای تیم تا سقف کاربر پلن",
    ],
    disabledFeatures: [
      "اتصال پیامک و خودکارسازی هشدارهای پیامکی",
    ],
  },
  {
    id: "business",
    name: "حرفه‌ای",
    badge: "پیشنهاد ما",
    audience: "برای تیم‌های در حال رشد که گردش‌کار پیامکی نیاز دارند",
    description: "دسترسی کامل به لجستیک پلاس با اتصال پیامک، ظرفیت کاربر بیشتر و سقف بالاتر برای محموله و اسناد.",
    monthlyPriceIrr: 59000000,
    annualPriceIrr: 590000000,
    limits: {
      users: 10,
      monthlyShipments: 20,
      storageMb: 5120,
      storageGb: 5,
    },
    backendFeatures: fullAccessFeatures,
    summaryFeatures: [
      "تا ۱۰ کاربر",
      "تا ۲۰ محموله در ماه",
      "۵ گیگابایت فضای اسناد",
      "اتصال پیامک فعال",
    ],
    includedFeatures: [
      "دسترسی کامل به همه بخش‌ها و گردش‌کارهای عملیاتی لجستیک پلاس",
      "اتصال پیامک برای هشدارها و وضعیت‌های عملیاتی",
      "صفحه رهگیری امن مشتری و کنترل نمایش اسناد",
      "مدیریت نقش‌ها و اعضای تیم تا سقف کاربر پلن",
    ],
    disabledFeatures: [],
    recommended: true,
  },
  {
    id: "enterprise",
    name: "سازمانی",
    audience: "برای تیم‌های پرتردد با نیاز جدی‌تر به فضای اسناد",
    description: "دسترسی کامل به لجستیک پلاس با اتصال پیامک، ظرفیت تیم بزرگ‌تر، محموله ماهانه نامحدود و فضای اسناد بیشتر.",
    monthlyPriceIrr: 99000000,
    annualPriceIrr: 990000000,
    limits: {
      users: 30,
      monthlyShipments: 0,
      storageMb: 51200,
      storageGb: 50,
    },
    backendFeatures: fullAccessFeatures,
    summaryFeatures: [
      "تا ۳۰ کاربر",
      "محموله ماهانه نامحدود",
      "۵۰ گیگابایت فضای اسناد",
      "اتصال پیامک فعال",
    ],
    includedFeatures: [
      "دسترسی کامل به همه بخش‌ها و گردش‌کارهای عملیاتی لجستیک پلاس",
      "اتصال پیامک برای هشدارها و وضعیت‌های عملیاتی",
      "محموله ماهانه نامحدود",
      "صفحه رهگیری امن مشتری و کنترل نمایش اسناد",
      "مدیریت نقش‌ها و اعضای تیم تا سقف کاربر پلن",
    ],
    disabledFeatures: [],
  },
];

export const extraUsagePricing = [
  "هر کاربر اضافه: ۴٬۰۰۰٬۰۰۰ ریال در ماه",
  "هر ۱۰ ظرفیت محموله اضافه: ۵٬۰۰۰٬۰۰۰ ریال در ماه",
  "هر ۱ گیگابایت فضای اسناد اضافه: ۱٬۸۰۰٬۰۰۰ ریال در ماه",
];

export const defaultPricingPlanId: PricingPlanId = "business";

export function formatIrr(value: number) {
  return `${Number(value || 0).toLocaleString("fa-IR")} ریال`;
}

export function getPricingPlan(planId?: string | null) {
  return pricingPlans.find((plan) => plan.id === planId) || pricingPlans.find((plan) => plan.id === defaultPricingPlanId) || pricingPlans[0];
}
