// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const databaseUrl =
  process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";
const documentStorageDir =
  process.env.DOCUMENT_STORAGE_DIR || path.join(rootDir, "storage", "documents");
const documentStorageRoot = path.resolve(documentStorageDir);
const publicBaseUrl = (
  process.env.APP_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
).replace(/\/+$/, "");

const SEED_KEY = "parsrah-showcase-company";
const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || "ParsRah!1405";

const DEMO_ORGANIZATION = {
  id: "org-parsrah-international",
  name: "حمل‌ونقل بین‌المللی پارس‌راه",
  slug: "parsrah-international",
  contactName: "سارا نادری",
  contactEmail: "demo@logisticplus.ir",
  contactPhone: "021-91094720",
  address: "تهران، خیابان مطهری، خیابان سنایی، پلاک ۴۲، طبقه ۳",
  city: "تهران",
};

const demoUsers = [
  {
    id: "usr-parsrah-manager",
    name: "سارا نادری",
    email: "manager.parsrah@logisticplus.ir",
    role: "MANAGER",
    phone: "09124782031",
    department: "مدیریت عملیات",
    location: "تهران",
    bio: "مدیر عملیات بین‌الملل و هماهنگی مشتریان کلیدی.",
    memberRole: "owner",
  },
  {
    id: "usr-parsrah-operations",
    name: "میلاد فلاح",
    email: "ops.parsrah@logisticplus.ir",
    role: "OPERATIONS",
    phone: "09127654018",
    department: "عملیات حمل",
    location: "تهران",
    bio: "مسئول پیگیری محموله‌های زمینی، دریایی و امور گمرکی.",
    memberRole: "member",
  },
  {
    id: "usr-parsrah-finance",
    name: "نگار شفیعی",
    email: "finance.parsrah@logisticplus.ir",
    role: "FINANCE",
    phone: "09123864075",
    department: "مالی و وصول مطالبات",
    location: "تهران",
    bio: "مسئول کنترل چک‌ها، پیش‌فاکتورها و تسویه‌های مشتریان.",
    memberRole: "member",
  },
];

const manager = demoUsers[0];
const operationsUser = demoUsers[1];
const financeUser = demoUsers[2];

const permissionKeys = [
  "dashboard.view",
  "shipments.view_all",
  "shipments.view_assigned",
  "shipments.create",
  "shipments.update",
  "shipments.archive",
  "shipment_forms.manage",
  "shipment_steps.update",
  "customers.view",
  "customers.create",
  "customers.update",
  "tasks.create",
  "tasks.assign",
  "tasks.view_all",
  "tasks.view_own",
  "documents.upload",
  "documents.view_all",
  "documents.view_related",
  "documents.archive",
  "changes.view",
  "chat.use",
  "chat.manage_groups",
  "users.manage",
  "users.promote",
  "cheques.manage",
  "compliance.manage",
  "quotations.manage",
  "archive.view",
  "customer_access.manage",
];

const companyOperationalPermissions = [
  "archive.view",
  "changes.view",
  "chat.use",
  "compliance.manage",
  "customer_access.manage",
  "customers.create",
  "customers.update",
  "customers.view",
  "documents.archive",
  "documents.upload",
  "documents.view_all",
  "documents.view_related",
  "quotations.manage",
  "shipment_steps.update",
  "shipments.archive",
  "shipments.create",
  "shipments.update",
  "shipments.view_all",
  "shipments.view_assigned",
  "tasks.assign",
  "tasks.create",
  "tasks.view_all",
  "tasks.view_own",
];

const rolePermissions = {
  MANAGER: permissionKeys.filter((key) => key !== "users.promote"),
  OPERATIONS: ["dashboard.view", ...companyOperationalPermissions],
  FINANCE: ["dashboard.view", "cheques.manage", ...companyOperationalPermissions],
};

const roleDescriptions = {
  MANAGER: "Operational management access",
  OPERATIONS: "Shipment operations access",
  FINANCE: "Finance and cheque access",
};

const defaultSteps = [
  "ثبت سفارش و بررسی اولیه",
  "دریافت و کنترل مدارک",
  "رزرو مسیر حمل",
  "بارگیری و خروج از مبدا",
  "ورود به بندر یا گمرک مقصد",
  "ترخیص و حمل داخلی",
  "تحویل نهایی به مشتری",
].map((name, order) => ({ id: `parsrah-default-step-${order}`, name, order }));

const customers = [
  {
    id: "prs-customer-aria",
    companyName: "شرکت بازرگانی آریا تجارت خاورمیانه",
    contactName: "فرهاد رستمی",
    phone: "021-88974215",
    email: "rostami@ariatrade.ir",
    address: "تهران، خیابان ولیعصر، بالاتر از میدان ونک، پلاک ۱۲۸",
    notes: "محموله‌های وارداتی قطعات صنعتی؛ هماهنگی تلفنی پیش از ارسال اسناد انجام شود.",
  },
  {
    id: "prs-customer-sepiddaneh",
    companyName: "صنایع غذایی سپیددانه",
    contactName: "الهام کاظمی",
    phone: "021-44621870",
    email: "logistics@sepiddaneh.ir",
    address: "کرج، شهرک صنعتی بهارستان، خیابان صنعتگران، قطعه ۳۴",
    notes: "برای کالاهای حساس به دما، تایید بیمه‌نامه قبل از بارگیری ضروری است.",
  },
  {
    id: "prs-customer-nikan",
    companyName: "شرکت تجهیزات پزشکی نیکان‌طب",
    contactName: "دکتر امیر ساعدی",
    phone: "021-66492031",
    email: "import@nikanteb.ir",
    address: "تهران، خیابان انقلاب، خیابان فخررازی، ساختمان پزشکان نیکان",
    notes: "اسناد وزارت بهداشت باید قبل از اظهار گمرکی کنترل شود.",
  },
  {
    id: "prs-customer-kaveh",
    companyName: "بازرگانی کاوه فولاد",
    contactName: "حسین تقوی",
    phone: "031-32654012",
    email: "shipping@kavehsteel.ir",
    address: "اصفهان، خیابان سروش، مجتمع اداری نقش جهان، طبقه ۵",
    notes: "مشتری قرارداد سالانه حمل زمینی دارد و گزارش هفتگی وضعیت می‌خواهد.",
  },
  {
    id: "prs-customer-aftab",
    companyName: "شرکت واردات و صادرات آفتاب شرق",
    contactName: "مریم بهشتی",
    phone: "051-37621284",
    email: "ops@aftabshargh.ir",
    address: "مشهد، بلوار سجاد، خیابان حامد جنوبی، پلاک ۹",
    notes: "برای محموله‌های صادراتی، پکینگ لیست نهایی از واحد فروش دریافت می‌شود.",
  },
];

const shipmentTokens = {
  "prs-shipment-001": "parsrah-pr1405001-customer-access-2026",
  "prs-shipment-002": "parsrah-pr1405002-customer-access-2026",
  "prs-shipment-003": "parsrah-pr1405003-customer-access-2026",
  "prs-shipment-004": "parsrah-pr1405004-customer-access-2026",
  "prs-shipment-005": "parsrah-pr1405005-customer-access-2026",
};

const shipments = [
  {
    id: "prs-shipment-001",
    shipmentCode: "PRR-1405-001",
    customerId: "prs-customer-aria",
    origin: "استانبول، ترکیه",
    destination: "تهران، گمرک شهریار",
    transportMode: "حمل زمینی",
    cargoType: "قطعات یدکی خطوط تولید",
    weightVolume: "۱۸ تن / ۸۲ مترمکعب",
    containerNumber: "TRU-458921",
    status: "IN_TRANSIT",
    priority: "normal",
    createdAt: "2026-05-03T08:30:00Z",
    createdAtFa: "۱۴۰۵/۰۲/۱۳",
    shippedAtFa: "۱۴۰۵/۰۲/۱۶",
    estimatedDelivery: "۱۴۰۵/۰۳/۰۵",
    internalNote: "راننده از مرز بازرگان عبور کرده و مدارک CMR در پرونده بارگذاری شده است.",
    publicLabel: "محموله در مسیر حمل زمینی به تهران است",
    publicDescription: "بار از مبدا بارگیری شده و طبق برنامه در مسیر مرز بازرگان به تهران قرار دارد.",
  },
  {
    id: "prs-shipment-002",
    shipmentCode: "PRR-1405-002",
    customerId: "prs-customer-sepiddaneh",
    origin: "بندر جبل علی، امارات",
    destination: "بندرعباس، پایانه شهید رجایی",
    transportMode: "حمل دریایی",
    cargoType: "مواد اولیه بسته‌بندی مواد غذایی",
    weightVolume: "۲ کانتینر ۴۰ فوت / ۴۶ تن",
    containerNumber: "MSKU-731284",
    status: "ARRIVED",
    priority: "high",
    createdAt: "2026-04-28T09:00:00Z",
    createdAtFa: "۱۴۰۵/۰۲/۰۸",
    shippedAtFa: "۱۴۰۵/۰۲/۱۲",
    estimatedDelivery: "۱۴۰۵/۰۳/۰۳",
    internalNote: "کانتینرها وارد بندر شده‌اند؛ مهلت فری‌تایم کوتاه است و تخلیه باید سریع پیگیری شود.",
    publicLabel: "محموله به بندر مقصد رسیده است",
    publicDescription: "کانتینرها در بندرعباس تخلیه شده و مراحل بندری در حال انجام است.",
  },
  {
    id: "prs-shipment-003",
    shipmentCode: "PRR-1405-003",
    customerId: "prs-customer-nikan",
    origin: "هامبورگ، آلمان",
    destination: "تهران، گمرک فرودگاه امام",
    transportMode: "حمل ترکیبی دریایی و زمینی",
    cargoType: "تجهیزات پزشکی تشخیصی",
    weightVolume: "۴.۵ تن / ۲۸ مترمکعب",
    containerNumber: "HLCU-552019",
    status: "CUSTOMS",
    priority: "high",
    createdAt: "2026-04-20T10:15:00Z",
    createdAtFa: "۱۴۰۵/۰۱/۳۱",
    shippedAtFa: "۱۴۰۵/۰۲/۰۶",
    estimatedDelivery: "۱۴۰۵/۰۳/۰۷",
    internalNote: "پرونده در مسیر ترخیص است؛ تاییدیه اداره تجهیزات پزشکی ضمیمه شده است.",
    publicLabel: "پرونده در مرحله بررسی گمرکی است",
    publicDescription: "اسناد ترخیص ثبت شده و وضعیت پس از تایید گمرک به‌روزرسانی می‌شود.",
  },
  {
    id: "prs-shipment-004",
    shipmentCode: "PRR-1405-004",
    customerId: "prs-customer-kaveh",
    origin: "بندرعباس",
    destination: "اصفهان، انبار کاوه فولاد",
    transportMode: "حمل داخلی پس از ترخیص",
    cargoType: "ورق فولادی آلیاژی",
    weightVolume: "۲۴ تن / یک تریلی کفی",
    containerNumber: "IRK-219740",
    status: "DELIVERED",
    priority: "normal",
    createdAt: "2026-04-02T07:45:00Z",
    createdAtFa: "۱۴۰۵/۰۱/۱۳",
    shippedAtFa: "۱۴۰۵/۰۱/۲۱",
    deliveredAtFa: "۱۴۰۵/۰۲/۰۲",
    estimatedDelivery: "۱۴۰۵/۰۲/۰۲",
    internalNote: "رسید تحویل امضا شده و نسخه نهایی فاکتور برای مالی ارسال شده است.",
    publicLabel: "محموله تحویل مشتری شده است",
    publicDescription: "بار در مقصد تحویل شده و رسید تحویل در بخش اسناد قابل دریافت است.",
  },
  {
    id: "prs-shipment-005",
    shipmentCode: "PRR-1405-005",
    customerId: "prs-customer-aftab",
    origin: "مشهد",
    destination: "عشق‌آباد، ترکمنستان",
    transportMode: "حمل زمینی صادراتی",
    cargoType: "محصولات بسته‌بندی‌شده صادراتی",
    weightVolume: "۱۲ تن / ۵۶ مترمکعب",
    containerNumber: "TRK-660512",
    status: "CLOSED",
    priority: "normal",
    createdAt: "2026-03-22T08:00:00Z",
    createdAtFa: "۱۴۰۵/۰۱/۰۲",
    shippedAtFa: "۱۴۰۵/۰۱/۰۶",
    deliveredAtFa: "۱۴۰۵/۰۱/۱۴",
    estimatedDelivery: "۱۴۰۵/۰۱/۱۴",
    internalNote: "پرونده پس از تسویه هزینه حمل و تحویل رسید نهایی بسته شد.",
    publicLabel: "پرونده حمل تکمیل و بسته شده است",
    publicDescription: "محموله در مقصد تحویل شده و پرونده عملیاتی تکمیل شده است.",
  },
  {
    id: "prs-shipment-006",
    shipmentCode: "PRR-1405-006",
    customerId: "prs-customer-nikan",
    origin: "شانگهای، چین",
    destination: "تهران، گمرک غرب",
    transportMode: "حمل دریایی",
    cargoType: "قطعات یدکی دستگاه تصویربرداری",
    weightVolume: "۶.۲ تن / کانتینر ۲۰ فوت",
    containerNumber: "CMAU-884210",
    status: "CUSTOMS",
    priority: "urgent",
    createdAt: "2026-04-12T08:50:00Z",
    createdAtFa: "۱۴۰۵/۰۱/۲۳",
    shippedAtFa: "۱۴۰۵/۰۱/۲۸",
    estimatedDelivery: "۱۴۰۵/۰۲/۲۸",
    delayReason: "نقص در تاییدیه وزارت بهداشت و نیاز به اصلاح شرح کالا در فاکتور تجاری.",
    internalNote: "پرریسک؛ اصلاحیه فاکتور و تاییدیه وزارت بهداشت باید امروز دریافت شود.",
    publicLabel: "بررسی اسناد تکمیلی در جریان است",
    publicDescription: "بخشی از مدارک تکمیلی در حال بررسی است و پس از تکمیل، روند ترخیص ادامه می‌یابد.",
  },
  {
    id: "prs-shipment-007",
    shipmentCode: "PRR-1405-007",
    customerId: "prs-customer-kaveh",
    origin: "بندر امام خمینی",
    destination: "یزد، کارخانه مشتری",
    transportMode: "حمل داخلی",
    cargoType: "مواد اولیه فولادی",
    weightVolume: "۲۲ تن / تریلی چادری",
    containerNumber: "IRK-774018",
    status: "ARRIVED",
    priority: "urgent",
    createdAt: "2026-05-01T06:30:00Z",
    createdAtFa: "۱۴۰۵/۰۲/۱۱",
    shippedAtFa: "۱۴۰۵/۰۲/۱۴",
    estimatedDelivery: "۱۴۰۵/۰۲/۲۹",
    delayReason: "تاخیر حمل‌کننده در تخصیص ناوگان جایگزین و نیاز به هماهنگی مجدد بارگیری.",
    internalNote: "پرریسک؛ راننده جایگزین تایید شده ولی بارگیری نهایی در انتظار مجوز ورود است.",
    publicLabel: "هماهنگی حمل داخلی در حال انجام است",
    publicDescription: "تیم عملیات در حال هماهنگی ناوگان نهایی برای ادامه حمل به مقصد است.",
  },
  {
    id: "prs-shipment-008",
    shipmentCode: "PRR-1405-008",
    customerId: "prs-customer-aria",
    origin: "میلان، ایتالیا",
    destination: "تهران، گمرک شهریار",
    transportMode: "حمل زمینی بین‌المللی",
    cargoType: "ماشین‌آلات سبک بسته‌بندی",
    weightVolume: "۹ تن / ۴۱ مترمکعب",
    containerNumber: "EU-398120",
    status: "PENDING",
    priority: "medium",
    createdAt: "2026-05-15T11:20:00Z",
    createdAtFa: "۱۴۰۵/۰۲/۲۵",
    estimatedDelivery: "۱۴۰۵/۰۳/۱۸",
    internalNote: "در انتظار نسخه نهایی پکینگ لیست و تاییدیه ارزش کالا از مشتری.",
    publicLabel: "در انتظار تکمیل مدارک حمل",
    publicDescription: "پرونده تشکیل شده و پس از دریافت مدارک نهایی، رزرو حمل انجام می‌شود.",
  },
  {
    id: "prs-shipment-009",
    shipmentCode: "PRR-1405-009",
    customerId: "prs-customer-sepiddaneh",
    origin: "بندر مرسین، ترکیه",
    destination: "کرج، کارخانه سپیددانه",
    transportMode: "حمل دریایی و زمینی",
    cargoType: "خط بسته‌بندی مواد غذایی",
    weightVolume: "۱ کانتینر ۴۰ فوت / ۱۹ تن",
    containerNumber: "TCLU-120984",
    status: "CLEARED",
    priority: "normal",
    createdAt: "2026-05-06T08:10:00Z",
    createdAtFa: "۱۴۰۵/۰۲/۱۶",
    shippedAtFa: "۱۴۰۵/۰۲/۲۰",
    estimatedDelivery: "۱۴۰۵/۰۳/۰۴",
    internalNote: "پروانه سبز صادر شده و بار آماده خروج از گمرک است.",
    publicLabel: "محموله ترخیص شده و آماده خروج است",
    publicDescription: "تشریفات گمرکی تکمیل شده و هماهنگی حمل داخلی در جریان است.",
  },
  {
    id: "prs-shipment-010",
    shipmentCode: "PRR-1405-010",
    customerId: "prs-customer-aftab",
    origin: "تهران",
    destination: "دبی، امارات",
    transportMode: "حمل دریایی صادراتی",
    cargoType: "کالای مصرفی بسته‌بندی‌شده",
    weightVolume: "۷ تن / ۳۲ مترمکعب",
    containerNumber: "IRX-502771",
    status: "BOOKED",
    priority: "medium",
    createdAt: "2026-05-18T09:30:00Z",
    createdAtFa: "۱۴۰۵/۰۲/۲۸",
    estimatedDelivery: "۱۴۰۵/۰۳/۲۰",
    internalNote: "رزرو کانتینر انجام شده و منتظر تایید نهایی مشتری برای تاریخ بارگیری هستیم.",
    publicLabel: "مسیر حمل رزرو شده است",
    publicDescription: "رزرو اولیه انجام شده و زمان بارگیری پس از تایید نهایی اعلام می‌شود.",
  },
];

const activeTaskSpecs = [
  {
    id: "prs-task-001",
    shipmentId: "prs-shipment-001",
    customerId: "prs-customer-aria",
    title: "پیگیری زمان ورود کامیون به تهران",
    description: "با راننده و نماینده مرز بازرگان هماهنگ شود و زمان تقریبی ورود در پرونده ثبت شود.",
    priority: "MEDIUM",
    dueDate: "۱۴۰۵/۰۳/۰۲",
    deadline: "۱۶:۰۰",
    assignedTo: operationsUser,
  },
  {
    id: "prs-task-002",
    shipmentId: "prs-shipment-002",
    customerId: "prs-customer-sepiddaneh",
    title: "هماهنگی خروج کانتینر از بندرعباس",
    description: "برای جلوگیری از دموراژ، وضعیت ترخیص و تخصیص کامیون پیگیری شود.",
    priority: "HIGH",
    dueDate: "۱۴۰۵/۰۳/۰۱",
    deadline: "۱۲:۰۰",
    assignedTo: operationsUser,
  },
  {
    id: "prs-task-003",
    shipmentId: "prs-shipment-003",
    customerId: "prs-customer-nikan",
    title: "کنترل پاسخ گمرک برای تجهیزات پزشکی",
    description: "نتیجه بررسی کارشناس گمرک و تاییدیه اداره تجهیزات پزشکی ثبت شود.",
    priority: "HIGH",
    dueDate: "۱۴۰۵/۰۳/۰۴",
    deadline: "۱۵:۳۰",
    assignedTo: operationsUser,
  },
  {
    id: "prs-task-004",
    shipmentId: "prs-shipment-006",
    customerId: "prs-customer-nikan",
    title: "دریافت اصلاحیه فاکتور و تاییدیه وزارت بهداشت",
    description: "علت تاخیر نقص مدارک است؛ اصلاحیه فاکتور و تاییدیه نهایی باید از مشتری دریافت شود.",
    priority: "URGENT",
    dueDate: "۱۴۰۵/۰۳/۰۱",
    deadline: "۱۱:۰۰",
    assignedTo: operationsUser,
  },
  {
    id: "prs-task-005",
    shipmentId: "prs-shipment-007",
    customerId: "prs-customer-kaveh",
    title: "تایید ناوگان جایگزین برای حمل داخلی",
    description: "با حمل‌کننده جایگزین تماس گرفته و ساعت قطعی بارگیری را به مشتری اعلام کنید.",
    priority: "URGENT",
    dueDate: "۱۴۰۵/۰۳/۰۱",
    deadline: "۱۰:۳۰",
    assignedTo: operationsUser,
  },
  {
    id: "prs-task-006",
    shipmentId: "prs-shipment-008",
    customerId: "prs-customer-aria",
    title: "دریافت پکینگ لیست نهایی",
    description: "نسخه نهایی پکینگ لیست و تایید ارزش کالا از واحد بازرگانی مشتری دریافت شود.",
    priority: "MEDIUM",
    dueDate: "۱۴۰۵/۰۳/۰۳",
    deadline: "۱۳:۰۰",
    assignedTo: operationsUser,
  },
  {
    id: "prs-task-007",
    shipmentId: "prs-shipment-010",
    customerId: "prs-customer-aftab",
    title: "دریافت تایید نهایی تاریخ بارگیری",
    description: "تاریخ بارگیری صادراتی با مشتری نهایی و به کشتیرانی اعلام شود.",
    priority: "MEDIUM",
    dueDate: "۱۴۰۵/۰۳/۰۲",
    deadline: "۱۴:۰۰",
    assignedTo: operationsUser,
  },
  {
    id: "prs-task-008",
    shipmentId: "prs-shipment-004",
    customerId: "prs-customer-kaveh",
    title: "ارسال نسخه نهایی فاکتور به مالی",
    description: "فاکتور حمل داخلی و رسید تحویل برای ثبت مالی کنترل و ارسال شود.",
    priority: "LOW",
    dueDate: "۱۴۰۵/۰۲/۰۵",
    deadline: "۱۷:۰۰",
    assignedTo: financeUser,
    status: "DONE",
  },
];

const documents = [
  {
    id: "prs-doc-001",
    shipmentId: "prs-shipment-001",
    customerId: "prs-customer-aria",
    title: "بارنامه زمینی محموله PRR-1405-001",
    fileName: "بارنامه-زمینی-پارس‌راه-۱۴۰۵-۰۰۱.txt",
    type: "BILL_OF_LADING",
    visibility: "customer_visible",
    storageKey: "parsrah-doc-001-bill-of-lading.txt",
    uploadedBy: operationsUser,
    content: "بارنامه زمینی محموله PRR-1405-001\nمبدا: استانبول\nمقصد: تهران\nگیرنده: آریا تجارت خاورمیانه\n",
  },
  {
    id: "prs-doc-002",
    shipmentId: "prs-shipment-008",
    customerId: "prs-customer-aria",
    title: "پکینگ لیست ماشین‌آلات بسته‌بندی",
    fileName: "پکینگ-لیست-ماشین‌آلات-بسته‌بندی.txt",
    type: "PACKING_LIST",
    visibility: "internal",
    storageKey: "parsrah-doc-002-packing-list.txt",
    uploadedBy: operationsUser,
    content: "پکینگ لیست اولیه ماشین‌آلات بسته‌بندی\nاین نسخه برای کنترل داخلی عملیات ثبت شده است.\n",
  },
  {
    id: "prs-doc-003",
    shipmentId: "prs-shipment-006",
    customerId: "prs-customer-nikan",
    title: "فاکتور تجاری تجهیزات پزشکی",
    fileName: "فاکتور-تجاری-تجهیزات-پزشکی.txt",
    type: "INVOICE",
    visibility: "customer_visible",
    storageKey: "parsrah-doc-003-commercial-invoice.txt",
    uploadedBy: operationsUser,
    content: "فاکتور تجاری تجهیزات پزشکی\nمشتری: نیکان‌طب\nوضعیت: نیازمند اصلاح شرح کالا\n",
  },
  {
    id: "prs-doc-004",
    shipmentId: "prs-shipment-009",
    customerId: "prs-customer-sepiddaneh",
    title: "مجوز گمرکی محموله سپیددانه",
    fileName: "مجوز-گمرکی-سپیددانه.txt",
    type: "CUSTOMS_PERMIT",
    visibility: "customer_visible",
    storageKey: "parsrah-doc-004-customs-permit.txt",
    uploadedBy: operationsUser,
    content: "مجوز گمرکی محموله PRR-1405-009\nوضعیت: ترخیص شده و آماده خروج از گمرک\n",
  },
  {
    id: "prs-doc-005",
    shipmentId: "prs-shipment-004",
    customerId: "prs-customer-kaveh",
    title: "رسید تحویل محموله کاوه فولاد",
    fileName: "رسید-تحویل-کاوه-فولاد.txt",
    type: "OTHER",
    visibility: "customer_visible",
    storageKey: "parsrah-doc-005-delivery-receipt.txt",
    uploadedBy: operationsUser,
    content: "رسید تحویل محموله PRR-1405-004\nتحویل در انبار اصفهان تایید شد.\n",
  },
  {
    id: "prs-doc-006",
    shipmentId: "prs-shipment-002",
    customerId: "prs-customer-sepiddaneh",
    title: "بیمه‌نامه حمل دریایی سپیددانه",
    fileName: "بیمه‌نامه-حمل-دریایی-سپیددانه.txt",
    type: "INSURANCE",
    visibility: "customer_visible",
    storageKey: "parsrah-doc-006-insurance.txt",
    uploadedBy: operationsUser,
    content: "بیمه‌نامه حمل دریایی\nبیمه‌گذار: صنایع غذایی سپیددانه\nپوشش: خسارت عمومی و آسیب حمل\n",
  },
  {
    id: "prs-doc-007",
    shipmentId: "prs-shipment-003",
    customerId: "prs-customer-nikan",
    title: "نامه ترخیص تجهیزات پزشکی",
    fileName: "نامه-ترخیص-تجهیزات-پزشکی.txt",
    type: "CUSTOMS_PERMIT",
    visibility: "internal",
    storageKey: "parsrah-doc-007-clearance-letter.txt",
    uploadedBy: operationsUser,
    content: "نامه ترخیص داخلی تجهیزات پزشکی\nاین فایل فقط برای تیم عملیات و انطباق قابل استفاده است.\n",
  },
  {
    id: "prs-doc-008",
    shipmentId: "prs-shipment-010",
    customerId: "prs-customer-aftab",
    title: "قرارداد حمل صادراتی آفتاب شرق",
    fileName: "قرارداد-حمل-صادراتی-آفتاب-شرق.txt",
    type: "OTHER",
    visibility: "internal",
    storageKey: "parsrah-doc-008-transport-contract.txt",
    uploadedBy: manager,
    content: "قرارداد حمل صادراتی آفتاب شرق\nشرایط تجاری و نرخ‌ها فقط برای استفاده داخلی ثبت شده است.\n",
  },
  {
    id: "prs-doc-009-archived",
    shipmentId: "prs-shipment-005",
    customerId: "prs-customer-aftab",
    title: "نسخه قدیمی برنامه بارگیری آفتاب شرق",
    fileName: "برنامه-قدیمی-بارگیری-آفتاب-شرق.txt",
    type: "OTHER",
    visibility: "internal",
    storageKey: "parsrah-doc-009-archived-loading-plan.txt",
    uploadedBy: operationsUser,
    archivedAt: "2026-05-05T07:30:00Z",
    content: "نسخه قدیمی برنامه بارگیری که پس از اصلاح زمان‌بندی بایگانی شد.\n",
  },
];

const quotations = [
  {
    id: "prs-quote-001",
    quotationNumber: "PQR-1405-001",
    customerId: "prs-customer-aria",
    customerName: "شرکت بازرگانی آریا تجارت خاورمیانه",
    customerPhone: "021-88974215",
    originCity: "استانبول",
    destinationCity: "تهران",
    cargoType: "GENERAL",
    weight: 18,
    dimensions: "تریلی چادری / ۸۲ مترمکعب",
    pickupDate: "2026-05-31T08:00:00Z",
    deliveryDate: "2026-06-08T08:00:00Z",
    requirements: ["حمل زمینی", "بیمه کامل", "رهگیری روزانه"],
    baseRate: 1180000000,
    fuelSurcharge: 85000000,
    loadingFees: 42000000,
    tollFees: 26000000,
    insurancePercentage: 1.2,
    profitMargin: 12,
    totalPrice: 1494000000,
    validUntil: "2026-05-28T20:29:59Z",
    status: "PENDING",
    notes: "پیش‌فاکتور حمل زمینی برای ماشین‌آلات سبک؛ اعتبار تا پایان روز اعلام‌شده است.",
    persianStatus: "ارسال‌شده",
  },
  {
    id: "prs-quote-002",
    quotationNumber: "PQR-1405-002",
    customerId: "prs-customer-sepiddaneh",
    customerName: "صنایع غذایی سپیددانه",
    customerPhone: "021-44621870",
    originCity: "جبل علی",
    destinationCity: "بندرعباس",
    cargoType: "GENERAL",
    weight: 46,
    dimensions: "۲ کانتینر ۴۰ فوت",
    pickupDate: "2026-06-02T08:00:00Z",
    deliveryDate: "2026-06-23T08:00:00Z",
    requirements: ["حمل دریایی", "بیمه‌نامه حمل", "اعلامیه ورود"],
    baseRate: 2240000000,
    fuelSurcharge: 180000000,
    loadingFees: 65000000,
    tollFees: 0,
    insurancePercentage: 1.5,
    profitMargin: 10,
    totalPrice: 2815000000,
    validUntil: "2026-05-30T20:29:59Z",
    status: "ACCEPTED",
    notes: "پیش‌فاکتور حمل دریایی تایید شده و آماده تبدیل به پرونده حمل است.",
    persianStatus: "تاییدشده",
  },
  {
    id: "prs-quote-003",
    quotationNumber: "PQR-1405-003",
    customerId: "prs-customer-nikan",
    customerName: "شرکت تجهیزات پزشکی نیکان‌طب",
    customerPhone: "021-66492031",
    originCity: "تهران",
    destinationCity: "تهران",
    cargoType: "GENERAL",
    weight: 5,
    dimensions: "خدمات ترخیص و انبارداری",
    pickupDate: "2026-05-26T08:00:00Z",
    deliveryDate: "2026-06-05T08:00:00Z",
    requirements: ["ترخیص", "انبارداری کوتاه‌مدت", "کنترل مدارک وزارت بهداشت"],
    baseRate: 390000000,
    fuelSurcharge: 0,
    loadingFees: 28000000,
    tollFees: 0,
    insurancePercentage: 0,
    profitMargin: 15,
    totalPrice: 480700000,
    validUntil: "2026-05-27T20:29:59Z",
    status: "PENDING",
    notes: "شامل کنترل اسناد، اظهار، پیگیری مجوز و سه روز انبارداری پس از صدور قبض انبار.",
    persianStatus: "در انتظار تایید",
  },
  {
    id: "prs-quote-004-archived",
    quotationNumber: "PQR-1404-018",
    customerId: "prs-customer-aftab",
    customerName: "شرکت واردات و صادرات آفتاب شرق",
    customerPhone: "051-37621284",
    originCity: "تهران",
    destinationCity: "دبی",
    cargoType: "GENERAL",
    weight: 6,
    dimensions: "۳۲ مترمکعب",
    pickupDate: "2026-03-11T08:00:00Z",
    deliveryDate: "2026-03-28T08:00:00Z",
    requirements: ["حمل صادراتی"],
    baseRate: 820000000,
    fuelSurcharge: 60000000,
    loadingFees: 22000000,
    tollFees: 0,
    insurancePercentage: 1,
    profitMargin: 10,
    totalPrice: 994200000,
    validUntil: "2026-03-16T20:29:59Z",
    status: "EXPIRED",
    notes: "نسخه قدیمی نرخ حمل صادراتی پس از تغییر مسیر بایگانی شد.",
    persianStatus: "منقضی‌شده",
    archivedAt: "2026-04-15T10:20:00Z",
  },
];

const cheques = [
  {
    id: "prs-cheque-001",
    bankName: "بانک ملت",
    chequeNumber: "۷۳۲۸۴۱/۴۵",
    amount: 1850000000,
    dueDate: "۱۴۰۵/۰۳/۱۲",
    location: "تهران",
    receiver: "حمل‌ونقل بین‌المللی پارس‌راه",
    status: "ACTIVE",
    customerId: "prs-customer-aria",
    description: "بابت بخشی از هزینه حمل زمینی و بیمه محموله PRR-1405-001.",
  },
  {
    id: "prs-cheque-002",
    bankName: "بانک سامان",
    chequeNumber: "۵۸۹۲۱۰/۱۹",
    amount: 2760000000,
    dueDate: "۱۴۰۵/۰۳/۲۰",
    location: "کرج",
    receiver: "حمل‌ونقل بین‌المللی پارس‌راه",
    status: "ACTIVE",
    customerId: "prs-customer-sepiddaneh",
    description: "در انتظار وصول برای حمل دریایی دو کانتینر مواد اولیه.",
  },
  {
    id: "prs-cheque-003",
    bankName: "بانک تجارت",
    chequeNumber: "۹۲۱۷۵۴/۰۳",
    amount: 940000000,
    dueDate: "۱۴۰۵/۰۲/۲۶",
    location: "اصفهان",
    receiver: "حمل‌ونقل بین‌المللی پارس‌راه",
    status: "CLEARED",
    customerId: "prs-customer-kaveh",
    description: "وصول‌شده بابت حمل داخلی و تحویل نهایی کاوه فولاد.",
  },
  {
    id: "prs-cheque-004",
    bankName: "بانک پاسارگاد",
    chequeNumber: "۶۴۰۲۸۳/۸۸",
    amount: 1280000000,
    dueDate: "۱۴۰۵/۰۳/۰۳",
    location: "مشهد",
    receiver: "حمل‌ونقل بین‌المللی پارس‌راه",
    status: "ACTIVE",
    customerId: "prs-customer-aftab",
    description: "نزدیک سررسید؛ تماس یادآوری با واحد مالی آفتاب شرق انجام شود.",
  },
];

const meetings = [
  {
    id: "prs-meeting-001",
    title: "جلسه بررسی مدارک واردات",
    dateTime: "۱۴۰۵/۰۳/۰۴ ۱۰:۰۰",
    customerId: "prs-customer-nikan",
    shipmentId: "prs-shipment-006",
    status: "SCHEDULED",
    assignedTo: operationsUser,
    location: "اتاق جلسات تهران",
    description: "بررسی اصلاحیه فاکتور، پکینگ لیست و مدارک وزارت بهداشت قبل از ادامه ترخیص.",
    outcome: "",
    nextActionItems: "ارسال نسخه اصلاح‌شده فاکتور تا پیش از جلسه.",
    requiredDocuments: [
      { id: "prs-meeting-doc-001", name: "فاکتور تجاری اصلاح‌شده", required: true, completed: false },
      { id: "prs-meeting-doc-002", name: "تاییدیه اداره تجهیزات پزشکی", required: true, completed: false },
    ],
  },
  {
    id: "prs-meeting-002",
    title: "جلسه پیگیری مجوز گمرکی",
    dateTime: "۱۴۰۵/۰۳/۰۵ ۱۴:۳۰",
    customerId: "prs-customer-sepiddaneh",
    shipmentId: "prs-shipment-009",
    status: "IN_PROGRESS",
    assignedTo: operationsUser,
    location: "تماس آنلاین با کارگزار بندرعباس",
    description: "هماهنگی خروج بار از گمرک و کنترل هزینه‌های بندری قبل از حمل داخلی.",
    outcome: "پروانه صادر شده و در انتظار تخصیص کامیون است.",
    nextActionItems: "ارسال تصویر پروانه و برنامه خروج برای مشتری.",
    requiredDocuments: [
      { id: "prs-meeting-doc-003", name: "پروانه سبز گمرکی", required: true, completed: true, fileName: "مجوز-گمرکی-سپیددانه.txt" },
      { id: "prs-meeting-doc-004", name: "قبض انبار بندری", required: true, completed: true },
    ],
  },
  {
    id: "prs-meeting-003",
    title: "جلسه بررسی ریسک تأخیر محموله",
    dateTime: "۱۴۰۵/۰۳/۰۲ ۱۱:۳۰",
    customerId: "prs-customer-kaveh",
    shipmentId: "prs-shipment-007",
    status: "SCHEDULED",
    assignedTo: manager,
    location: "دفتر مرکزی پارس‌راه",
    description: "تحلیل ریسک تاخیر ناوگان، برنامه جایگزین و نحوه اطلاع‌رسانی به مشتری.",
    outcome: "",
    nextActionItems: "گزارش وضعیت حمل‌کننده و گزینه‌های ناوگان جایگزین آماده شود.",
    requiredDocuments: [
      { id: "prs-meeting-doc-005", name: "گزارش حمل‌کننده", required: true, completed: false },
      { id: "prs-meeting-doc-006", name: "برنامه جایگزین حمل داخلی", required: true, completed: false },
    ],
  },
];

function roleId(role: string) {
  return `role-${role.toLowerCase().replace(/_/g, "-")}`;
}

function permissionId(permission: string) {
  return `perm-${permission.replace(/[^a-z0-9]+/gi, "-")}`;
}

function asJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function hashCustomerAccessToken(token: string) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function checksum(content: Buffer | string) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function byteSizeLabel(content: Buffer | string) {
  const size = Buffer.byteLength(String(content || ""), "utf8");
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function isPathInside(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function storagePathForKey(storageKey: string) {
  if (!storageKey || path.basename(storageKey) !== storageKey || path.isAbsolute(storageKey)) {
    throw new Error(`Unsafe document storage key: ${storageKey}`);
  }
  const filePath = path.resolve(documentStorageRoot, storageKey);
  if (!isPathInside(documentStorageRoot, filePath)) {
    throw new Error(`Document path escaped storage root: ${storageKey}`);
  }
  return filePath;
}

function publicTrackUrl(token: string) {
  return `${publicBaseUrl}/track/${encodeURIComponent(token)}`;
}

function apiPublicTrackPath(token: string) {
  return `/api/public/track/${encodeURIComponent(token)}`;
}

function getCustomer(customerId: string) {
  const customer = customers.find((item) => item.id === customerId);
  if (!customer) throw new Error(`Missing customer ${customerId}`);
  return customer;
}

function shipmentIndex(shipmentId: string) {
  return Number(shipmentId.match(/(\d+)$/)?.[1] || 0);
}

function stepStateForShipment(shipment: any, order: number) {
  const profiles = {
    IN_TRANSIT: { completeThrough: 3, current: 4 },
    ARRIVED: { completeThrough: 4, current: 5 },
    CUSTOMS: { completeThrough: 4, current: 5 },
    CLEARED: { completeThrough: 5, current: 6 },
    DELIVERED: { completeThrough: 6, current: -1 },
    CLOSED: { completeThrough: 6, current: -1 },
    BOOKED: { completeThrough: 2, current: 3 },
    PENDING: { completeThrough: 0, current: 1 },
  };
  const profile = profiles[shipment.status] || profiles.PENDING;
  if (order <= profile.completeThrough) return "COMPLETED";
  if (order === profile.current) return "IN_PROGRESS";
  return "PENDING";
}

function buildShipmentSteps(shipment: any) {
  const index = shipmentIndex(shipment.id);
  return defaultSteps.map((step) => ({
    id: `prs-step-${String(index).padStart(3, "0")}-${step.order}`,
    shipmentId: shipment.id,
    name: step.name,
    order: step.order,
    status: stepStateForShipment(shipment, step.order),
    completedAt: stepStateForShipment(shipment, step.order) === "COMPLETED"
      ? shipment.deliveredAtFa || shipment.shippedAtFa || shipment.createdAtFa
      : undefined,
    notes: step.order === 1 && shipment.delayReason ? shipment.delayReason : undefined,
  }));
}

function buildStatusEvents(shipment: any) {
  const index = shipmentIndex(shipment.id);
  const visibleEvents = [
    {
      id: `prs-status-${String(index).padStart(3, "0")}-001`,
      label: "پرونده حمل ثبت شد",
      description: `پرونده ${shipment.shipmentCode} برای ${getCustomer(shipment.customerId).companyName} ایجاد شد.`,
      visible: true,
      at: shipment.createdAt,
    },
    {
      id: `prs-status-${String(index).padStart(3, "0")}-002`,
      label: shipment.shippedAtFa ? "حمل محموله آغاز شد" : "مدارک اولیه در حال بررسی است",
      description: shipment.shippedAtFa
        ? `حمل از ${shipment.origin} به مقصد ${shipment.destination} آغاز شده است.`
        : "تیم عملیات در حال کنترل مدارک اولیه و آماده‌سازی برنامه حمل است.",
      visible: true,
      at: "2026-05-10T07:00:00Z",
    },
    {
      id: `prs-status-${String(index).padStart(3, "0")}-003`,
      label: shipment.publicLabel,
      description: shipment.publicDescription,
      visible: true,
      at: "2026-05-21T09:30:00Z",
    },
  ];

  if (shipment.delayReason) {
    visibleEvents.splice(2, 0, {
      id: `prs-status-${String(index).padStart(3, "0")}-risk`,
      label: "یادداشت ریسک داخلی",
      description: shipment.delayReason,
      visible: false,
      at: "2026-05-20T12:00:00Z",
    });
  }

  return visibleEvents;
}

const shipmentSteps = shipments.flatMap(buildShipmentSteps);
const shipmentStatusEvents = shipments.flatMap(buildStatusEvents);

const tasks = activeTaskSpecs.map((task) => ({
  ...task,
  status: task.status || "TODO",
  createdAt: task.status === "DONE" ? "2026-05-06T09:20:00Z" : "2026-05-21T07:45:00Z",
  completedAt: task.status === "DONE" ? "2026-05-07T13:00:00Z" : null,
}));

const notifications = [
  {
    id: "prs-notification-001",
    userId: manager.id,
    title: "پیگیری محموله پرریسک",
    body: "محموله PRR-1405-006 به دلیل نقص مدارک نیازمند پیگیری فوری است.",
    type: "URGENT",
    link: "/shipments/prs-shipment-006",
  },
  {
    id: "prs-notification-002",
    userId: operationsUser.id,
    title: "وظیفه جدید عملیات",
    body: "تایید ناوگان جایگزین برای محموله کاوه فولاد امروز باید انجام شود.",
    type: "WARNING",
    link: "/tasks",
  },
  {
    id: "prs-notification-003",
    userId: financeUser.id,
    title: "چک نزدیک سررسید",
    body: "چک آفتاب شرق در تاریخ ۱۴۰۵/۰۳/۰۳ نیازمند پیگیری وصول است.",
    type: "INFO",
    link: "/cheques",
  },
];

function toUiUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isOnline: false,
    phone: user.phone,
    location: user.location,
    bio: user.bio,
    department: user.department,
    status: "active",
    twoFactorEnabled: false,
    notificationPreferences: {},
    organizationId: DEMO_ORGANIZATION.id,
    organizationName: DEMO_ORGANIZATION.name,
    organizationStatus: "active",
    organizationPlanId: "enterprise",
  };
}

function toUiCustomer(customer: any) {
  return {
    id: customer.id,
    name: customer.contactName,
    company: customer.companyName,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    notes: customer.notes,
    status: "active",
    isArchived: false,
    shipmentsCount: shipments.filter((shipment) => shipment.customerId === customer.id).length,
    createdAt: "۱۴۰۵/۰۲/۰۱",
  };
}

function toUiShipment(shipment: any) {
  return {
    id: shipment.id,
    trackingNumber: shipment.shipmentCode,
    containerNumber: shipment.containerNumber,
    customerId: shipment.customerId,
    customerName: getCustomer(shipment.customerId).companyName,
    origin: shipment.origin,
    destination: shipment.destination,
    status: shipment.status,
    createdAt: shipment.createdAtFa,
    estimatedDelivery: shipment.estimatedDelivery,
    actualDelivery: shipment.deliveredAtFa,
    freeTimeDays: shipment.priority === "urgent" ? 2 : 7,
    isArchived: false,
  };
}

function toUiTask(task: any) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    assignedToUserId: task.assignedTo.id,
    assignedToName: task.assignedTo.name,
    assignedByName: manager.name,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    deadline: task.deadline,
    shipmentId: task.shipmentId,
    createdAt: task.createdAt,
  };
}

function toUiDocument(document: any) {
  return {
    id: document.id,
    shipmentId: document.shipmentId,
    customerId: document.customerId,
    name: document.title,
    type: document.type,
    fileSize: byteSizeLabel(document.content),
    uploadedBy: document.uploadedBy.name,
    createdAt: document.archivedAt ? "۱۴۰۵/۰۲/۱۵" : "۱۴۰۵/۰۲/۲۹",
    url: `/api/documents/${encodeURIComponent(document.id)}/download`,
    visibility: document.visibility,
    isArchived: Boolean(document.archivedAt),
    version: 1,
  };
}

function toUiCheque(cheque: any) {
  return {
    id: cheque.id,
    bankName: cheque.bankName,
    chequeNumber: cheque.chequeNumber,
    amount: cheque.amount,
    dueDate: cheque.dueDate,
    location: cheque.location,
    receiver: cheque.receiver,
    status: cheque.status,
    description: cheque.description,
    createdAt: "۱۴۰۵/۰۲/۲۲",
  };
}

function toUiMeeting(meeting: any) {
  return {
    id: meeting.id,
    dateTime: meeting.dateTime,
    departmentName: getCustomer(meeting.customerId).companyName,
    purpose: meeting.title,
    requiredDocuments: meeting.requiredDocuments,
    assignedPersonId: meeting.assignedTo.id,
    assignedPersonName: meeting.assignedTo.name,
    status: meeting.status,
    outcome: meeting.outcome,
    nextActionItems: meeting.nextActionItems,
    reminderSent: false,
    createdAt: "۱۴۰۵/۰۲/۳۰",
    isArchived: false,
  };
}

function toUiQuote(quote: any) {
  return {
    id: quote.id,
    customerId: quote.customerId,
    customerName: quote.customerName,
    customerPhone: quote.customerPhone,
    originCity: quote.originCity,
    destinationCity: quote.destinationCity,
    cargoType: quote.cargoType,
    weight: quote.weight,
    dimensions: quote.dimensions,
    pickupDate: quote.pickupDate,
    deliveryDate: quote.deliveryDate,
    requirements: quote.requirements,
    baseRate: quote.baseRate,
    fuelSurcharge: quote.fuelSurcharge,
    loadingFees: quote.loadingFees,
    tollFees: quote.tollFees,
    insurancePercentage: quote.insurancePercentage,
    profitMargin: quote.profitMargin,
    totalPrice: quote.totalPrice,
    validUntil: quote.validUntil,
    status: quote.status,
    notes: quote.notes,
    createdAt: quote.archivedAt ? "2026-03-09T08:00:00Z" : "2026-05-19T08:00:00Z",
    isArchived: Boolean(quote.archivedAt),
  };
}

function toUiNotification(notification: any) {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.body,
    type: notification.type,
    isRead: false,
    createdAt: "۱۴۰۵/۰۳/۰۱ ۰۹:۰۰",
    link: notification.link,
  };
}

function buildRecordsForUser(user: any) {
  return {
    users: demoUsers.map(toUiUser),
    customers: customers.map(toUiCustomer),
    shipments: shipments.map(toUiShipment),
    tasks: tasks
      .filter((task) => user.role === "MANAGER" || task.assignedTo.id === user.id)
      .map(toUiTask),
    messages: [],
    activityLogs: [
      {
        id: "prs-activity-001",
        userName: operationsUser.name,
        action: "به‌روزرسانی وضعیت محموله",
        entityType: "SHIPMENT",
        entityId: "prs-shipment-006",
        details: "ریسک نقص مدارک برای محموله نیکان‌طب ثبت شد.",
        createdAt: "۱۴۰۵/۰۳/۰۱ ۰۹:۱۵",
        shipmentId: "prs-shipment-006",
      },
    ],
    demurrageRecords: [],
    shipmentSteps,
    documents: documents.map(toUiDocument),
    commercialCards: [],
    channels: [],
    appointments: meetings.map(toUiMeeting),
    cheques: cheques.map(toUiCheque),
    quotes: quotations.map(toUiQuote),
    deletedItems: [],
    defaultSteps,
  };
}

async function ensureProductionGuard() {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      "Refusing to seed the showcase company in production without DEMO_SEED_ALLOW_PRODUCTION=true."
    );
  }
}

async function ensureStorageRoot() {
  await fs.mkdir(documentStorageRoot, { recursive: true });
}

async function removeStorageKeys(storageKeys: string[]) {
  const uniqueKeys = [...new Set(storageKeys.filter(Boolean))];
  for (const storageKey of uniqueKeys) {
    try {
      const filePath = storagePathForKey(storageKey);
      await fs.unlink(filePath).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    } catch (error) {
      if (error.message?.startsWith("Unsafe document storage key")) continue;
      throw error;
    }
  }
}

async function writeDocumentFiles() {
  await ensureStorageRoot();
  for (const document of documents) {
    const filePath = storagePathForKey(document.storageKey);
    await fs.writeFile(filePath, document.content, "utf8");
  }
}

async function assertExistingRowsAreSeedOwned(client: any) {
  const orgResult = await client.query(
    `SELECT id, name, slug, contact_email, legacy_data
     FROM organizations
     WHERE id = $1 OR slug = $2 OR lower(contact_email) = lower($3)`,
    [DEMO_ORGANIZATION.id, DEMO_ORGANIZATION.slug, DEMO_ORGANIZATION.contactEmail]
  );
  for (const row of orgResult.rows) {
    if (row.legacy_data?.seedKey !== SEED_KEY) {
      throw new Error(
        `Refusing to overwrite organization ${row.id || row.slug}; it was not created by ${SEED_KEY}.`
      );
    }
  }

  const expectedByEmail = new Map(demoUsers.map((user) => [user.email.toLowerCase(), user]));
  const userResult = await client.query(
    `SELECT id, email, organization_id
     FROM app_users
     WHERE lower(email) = ANY($1::text[]) OR id = ANY($2::text[])`,
    [demoUsers.map((user) => user.email.toLowerCase()), demoUsers.map((user) => user.id)]
  );
  for (const row of userResult.rows) {
    const expected = expectedByEmail.get(String(row.email || "").toLowerCase());
    const idMatches = demoUsers.some((user) => user.id === row.id);
    const orgMatches = !row.organization_id || row.organization_id === DEMO_ORGANIZATION.id;
    if ((!expected && !idMatches) || !orgMatches) {
      throw new Error(`Refusing to overwrite app user ${row.email || row.id}; it is outside the showcase tenant.`);
    }
  }
}

async function collectExistingStorageKeys(client: any) {
  const result = await client.query(
    `SELECT DISTINCT storage_key
     FROM (
       SELECT storage_key
       FROM documents
       WHERE organization_id = $1
       UNION ALL
       SELECT v.storage_key
       FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       WHERE d.organization_id = $1
     ) keys
     WHERE storage_key IS NOT NULL AND storage_key <> ''`,
    [DEMO_ORGANIZATION.id]
  );
  return result.rows.map((row) => row.storage_key);
}

async function cleanupDemoTenant(client: any) {
  const userIds = demoUsers.map((user) => user.id);
  const userEmails = demoUsers.map((user) => user.email.toLowerCase());

  await client.query("DELETE FROM app_sessions WHERE user_id = ANY($1::text[])", [userIds]);
  await client.query("DELETE FROM login_sms_challenges WHERE user_id = ANY($1::text[])", [userIds]);
  await client.query(
    "DELETE FROM rate_limit_buckets WHERE lower(key) LIKE '%parsrah%' OR lower(key) = ANY($1::text[])",
    [userEmails]
  );
  await client.query(
    `DELETE FROM billing_invoice_items
     WHERE invoice_id IN (SELECT id FROM billing_invoices WHERE organization_id = $1)`,
    [DEMO_ORGANIZATION.id]
  );
  await client.query("DELETE FROM billing_receipts WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query("DELETE FROM billing_invoices WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query("DELETE FROM billing_payments WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query("DELETE FROM subscription_events WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query(
    "DELETE FROM sms_deliveries WHERE organization_id = $1 OR user_id = ANY($2::text[])",
    [DEMO_ORGANIZATION.id, userIds]
  );
  await client.query(
    "DELETE FROM notifications WHERE organization_id = $1 OR user_id = ANY($2::text[])",
    [DEMO_ORGANIZATION.id, userIds]
  );
  await client.query(
    "DELETE FROM change_logs WHERE organization_id = $1 OR actor_user_id = ANY($2::text[])",
    [DEMO_ORGANIZATION.id, userIds]
  );
  await client.query(
    `DELETE FROM document_versions
     WHERE organization_id = $1
        OR document_id IN (SELECT id FROM documents WHERE organization_id = $1)`,
    [DEMO_ORGANIZATION.id]
  );
  await client.query("DELETE FROM documents WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query(
    `DELETE FROM meeting_required_documents
     WHERE organization_id = $1
        OR meeting_id IN (SELECT id FROM compliance_meetings WHERE organization_id = $1)`,
    [DEMO_ORGANIZATION.id]
  );
  await client.query("DELETE FROM archive_records WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query("DELETE FROM compliance_meetings WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query("DELETE FROM cheques WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query("DELETE FROM tasks WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query(
    `DELETE FROM shipment_status_events
     WHERE organization_id = $1
        OR shipment_id IN (SELECT id FROM shipments WHERE organization_id = $1)`,
    [DEMO_ORGANIZATION.id]
  );
  await client.query("DELETE FROM quotations WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query("DELETE FROM shipments WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query("DELETE FROM customers WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query(
    `DELETE FROM chat_messages
     WHERE organization_id = $1
        OR thread_id IN (SELECT id FROM chat_threads WHERE organization_id = $1)`,
    [DEMO_ORGANIZATION.id]
  );
  await client.query(
    "DELETE FROM chat_thread_members WHERE thread_id IN (SELECT id FROM chat_threads WHERE organization_id = $1)",
    [DEMO_ORGANIZATION.id]
  );
  await client.query("DELETE FROM chat_threads WHERE organization_id = $1", [DEMO_ORGANIZATION.id]);
  await client.query(
    "DELETE FROM user_records WHERE organization_id = $1 OR owner_user_id = ANY($2::text[])",
    [DEMO_ORGANIZATION.id, userIds]
  );
  await client.query(
    "DELETE FROM organization_members WHERE organization_id = $1 OR user_id = ANY($2::text[])",
    [DEMO_ORGANIZATION.id, userIds]
  );
  await client.query(
    "DELETE FROM signup_requests WHERE organization_id = $1 OR owner_user_id = ANY($2::text[])",
    [DEMO_ORGANIZATION.id, userIds]
  );
  await client.query("DELETE FROM organization_subscriptions WHERE organization_id = $1", [
    DEMO_ORGANIZATION.id,
  ]);
  await client.query(
    `DELETE FROM app_users
     WHERE organization_id = $1
        OR id = ANY($2::text[])
        OR lower(email) = ANY($3::text[])`,
    [DEMO_ORGANIZATION.id, userIds, userEmails]
  );
  await client.query("DELETE FROM organizations WHERE id = $1 OR slug = $2", [
    DEMO_ORGANIZATION.id,
    DEMO_ORGANIZATION.slug,
  ]);
}

async function ensureRolesAndPlans(client: any) {
  await client.query(
    `INSERT INTO subscription_plans (
       id, name, description, monthly_price_irr, annual_price_irr, limits, features, sort_order, updated_at
     )
     VALUES (
       'enterprise',
       'سازمانی',
       'دسترسی کامل برای تیم‌های عملیاتی لجستیک',
       99000000,
       990000000,
       '{"users":30,"monthlyShipments":0,"storageMb":51200}'::jsonb,
       '{"chat":true,"cheques":true,"compliance":true,"quotations":true,"archive":true,"smsNotifications":true}'::jsonb,
       3,
       NOW()
     )
     ON CONFLICT (id) DO NOTHING`
  );

  for (const key of permissionKeys) {
    await client.query(
      `INSERT INTO permissions (id, key, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [permissionId(key), key, key]
    );
  }

  for (const [role, permissions] of Object.entries(rolePermissions)) {
    await client.query(
      `INSERT INTO roles (id, name, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [roleId(role), role, roleDescriptions[role] || role]
    );

    for (const permission of permissions) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [roleId(role), permissionId(permission)]
      );
    }
  }
}

async function seedOrganizationAndUsers(client: any, passwordHash: string) {
  await client.query(
    `INSERT INTO organizations (
       id, name, slug, status, owner_user_id, plan_id, contact_name, contact_email,
       contact_phone, notes, approved_at, legacy_data, updated_at
     )
     VALUES ($1, $2, $3, 'active', $4, 'enterprise', $5, $6, $7, $8, NOW(), $9::jsonb, NOW())`,
    [
      DEMO_ORGANIZATION.id,
      DEMO_ORGANIZATION.name,
      DEMO_ORGANIZATION.slug,
      manager.id,
      DEMO_ORGANIZATION.contactName,
      DEMO_ORGANIZATION.contactEmail,
      DEMO_ORGANIZATION.contactPhone,
      "شرکت نمایشی مستقل برای ارائه جریان کامل محصول به مشتریان.",
      asJson({
        seedKey: SEED_KEY,
        city: DEMO_ORGANIZATION.city,
        address: DEMO_ORGANIZATION.address,
        activity: "حمل‌ونقل بین‌المللی، ترخیص، ارسال زمینی و دریایی",
      }),
    ]
  );

  await client.query(
    `INSERT INTO organization_subscriptions (
       id, organization_id, plan_id, status, billing_cycle, current_period_start,
       current_period_end, activated_at, updated_at
     )
     VALUES ($1, $2, 'enterprise', 'active', 'annual', NOW(), NOW() + INTERVAL '1 year', NOW(), NOW())`,
    [`sub-${DEMO_ORGANIZATION.id}`, DEMO_ORGANIZATION.id]
  );

  for (const user of demoUsers) {
    await client.query(
      `INSERT INTO app_users (
         id, organization_id, name, email, password_hash, role, is_online, department,
         status, phone, location, bio, notification_preferences, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, 'active', $8, $9, $10, '{}'::jsonb, NOW())`,
      [
        user.id,
        DEMO_ORGANIZATION.id,
        user.name,
        user.email,
        passwordHash,
        user.role,
        user.department,
        user.phone,
        user.location,
        user.bio,
      ]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES ($1, $2, $3, 'active')`,
      [DEMO_ORGANIZATION.id, user.id, user.memberRole]
    );
  }
}

async function seedCustomers(client: any) {
  for (const customer of customers) {
    await client.query(
      `INSERT INTO customers (
         id, organization_id, owner_user_id, company_name, contact_name, email,
         phone, address, notes, status, legacy_data, created_by_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10::jsonb, $3, NOW(), NOW())`,
      [
        customer.id,
        DEMO_ORGANIZATION.id,
        manager.id,
        customer.companyName,
        customer.contactName,
        customer.email,
        customer.phone,
        customer.address,
        customer.notes,
        asJson({ seedKey: SEED_KEY, ...toUiCustomer(customer) }),
      ]
    );
  }
}

async function seedShipments(client: any) {
  for (const shipment of shipments) {
    const customer = getCustomer(shipment.customerId);
    const token = shipmentTokens[shipment.id] || null;
    await client.query(
      `INSERT INTO shipments (
         id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
         priority, origin, destination, estimated_delivery_at, free_time_ends_at,
         assigned_manager_id, current_step_id, customer_access_token, customer_access_token_hash,
         customer_access_enabled, legacy_data, created_by_id, completed_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $3, $19, $20, NOW())`,
      [
        shipment.id,
        DEMO_ORGANIZATION.id,
        manager.id,
        shipment.shipmentCode,
        shipment.customerId,
        customer.companyName,
        shipment.status,
        shipment.priority === "urgent" ? "high" : shipment.priority,
        shipment.origin,
        shipment.destination,
        shipment.estimatedDelivery,
        shipment.status === "ARRIVED" ? "۱۴۰۵/۰۳/۰۳" : null,
        operationsUser.id,
        shipmentSteps.find((step) => step.shipmentId === shipment.id && step.status === "IN_PROGRESS")?.id || null,
        token,
        token ? hashCustomerAccessToken(token) : null,
        Boolean(token),
        asJson({
          seedKey: SEED_KEY,
          trackingNumber: shipment.shipmentCode,
          containerNumber: shipment.containerNumber,
          customerId: shipment.customerId,
          customerName: customer.companyName,
          transportMode: shipment.transportMode,
          cargoType: shipment.cargoType,
          weightVolume: shipment.weightVolume,
          createdAt: shipment.createdAtFa,
          shippedAt: shipment.shippedAtFa || null,
          deliveredAt: shipment.deliveredAtFa || null,
          notes: shipment.internalNote,
          internalNote: shipment.internalNote,
          delayReason: shipment.delayReason || null,
          publicStatusLabel: shipment.publicLabel,
          publicStatusDescription: shipment.publicDescription,
          freeTimeDays: shipment.priority === "urgent" ? 2 : 7,
        }),
        shipment.deliveredAtFa ? new Date("2026-05-10T12:00:00Z") : null,
        new Date(shipment.createdAt),
      ]
    );
  }
}

async function seedShipmentCompatibilityAndStatus(client: any) {
  for (const event of shipmentStatusEvents) {
    await client.query(
      `INSERT INTO shipment_status_events (
         id, organization_id, shipment_id, public_label, public_description,
         is_customer_visible, created_by_id, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.id,
        DEMO_ORGANIZATION.id,
        event.id.match(/prs-status-(\d+)/)
          ? `prs-shipment-${event.id.match(/prs-status-(\d+)/)[1]}`
          : null,
        event.label,
        event.description,
        event.visible,
        event.visible ? operationsUser.id : manager.id,
        new Date(event.at),
      ]
    );
  }
}

async function seedTasks(client: any) {
  for (const task of tasks) {
    await client.query(
      `INSERT INTO tasks (
         id, organization_id, owner_user_id, title, description, status, priority,
         assigned_to_id, assigned_to_name, assigned_by_id, assigned_by_name, due_at,
         source_type, source_id, shipment_id, customer_id, legacy_data, completed_at,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SHIPMENT', $13, $13, $14, $15::jsonb, $16, $17, NOW())`,
      [
        task.id,
        DEMO_ORGANIZATION.id,
        manager.id,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.assignedTo.id,
        task.assignedTo.name,
        manager.id,
        manager.name,
        task.dueDate,
        task.shipmentId,
        task.customerId,
        asJson({ seedKey: SEED_KEY, ...toUiTask(task), sourceType: "SHIPMENT", sourceId: task.shipmentId }),
        task.completedAt ? new Date(task.completedAt) : null,
        new Date(task.createdAt),
      ]
    );
  }
}

async function seedDocuments(client: any) {
  for (const document of documents) {
    const contentBuffer = Buffer.from(document.content, "utf8");
    await client.query(
      `INSERT INTO documents (
         id, organization_id, owner_user_id, title, file_name, mime_type, file_size,
         storage_key, checksum, version, uploaded_by_id, uploaded_by_name,
         shipment_id, customer_id, visibility, legacy_data, archived_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'text/plain', $6, $7, $8, 1, $9, $10, $11, $12, $13, $14::jsonb, $15, NOW(), NOW())`,
      [
        document.id,
        DEMO_ORGANIZATION.id,
        manager.id,
        document.title,
        document.fileName,
        byteSizeLabel(document.content),
        document.storageKey,
        checksum(contentBuffer),
        document.uploadedBy.id,
        document.uploadedBy.name,
        document.shipmentId,
        document.customerId,
        document.visibility,
        asJson({ seedKey: SEED_KEY, ...toUiDocument(document), type: document.type }),
        document.archivedAt ? new Date(document.archivedAt) : null,
      ]
    );
    await client.query(
      `INSERT INTO document_versions (
         id, organization_id, document_id, version, storage_key, file_name, uploaded_by_id, created_at
       )
       VALUES ($1, $2, $3, 1, $4, $5, $6, NOW())`,
      [
        `${document.id}-v1`,
        DEMO_ORGANIZATION.id,
        document.id,
        document.storageKey,
        document.fileName,
        document.uploadedBy.id,
      ]
    );
  }
}

async function seedQuotations(client: any) {
  for (const quote of quotations) {
    await client.query(
      `INSERT INTO quotations (
         id, organization_id, owner_user_id, quotation_number, customer_id, customer_name,
         customer_phone, origin_city, destination_city, cargo_type, weight, dimensions,
         pickup_date, delivery_date, requirements, base_rate, fuel_surcharge, loading_fees,
         toll_fees, insurance_percentage, profit_margin, total_price, valid_until,
         status, notes, legacy_data, archived_at, created_by_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15::jsonb, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
               $26::jsonb, $27, $3, NOW(), NOW())`,
      [
        quote.id,
        DEMO_ORGANIZATION.id,
        manager.id,
        quote.quotationNumber,
        quote.customerId,
        quote.customerName,
        quote.customerPhone,
        quote.originCity,
        quote.destinationCity,
        quote.cargoType,
        quote.weight,
        quote.dimensions,
        quote.pickupDate,
        quote.deliveryDate,
        asJson(quote.requirements),
        quote.baseRate,
        quote.fuelSurcharge,
        quote.loadingFees,
        quote.tollFees,
        quote.insurancePercentage,
        quote.profitMargin,
        quote.totalPrice,
        quote.validUntil,
        quote.status,
        quote.notes,
        asJson({ seedKey: SEED_KEY, ...toUiQuote(quote), persianStatus: quote.persianStatus }),
        quote.archivedAt ? new Date(quote.archivedAt) : null,
      ]
    );
  }
}

async function seedCheques(client: any) {
  for (const cheque of cheques) {
    await client.query(
      `INSERT INTO cheques (
         id, organization_id, owner_user_id, bank_name, cheque_number, amount, currency,
         due_date, location, receiver, status, description, assigned_to_id, customer_id,
         legacy_data, created_by_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'IRR', $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, NOW(), NOW())`,
      [
        cheque.id,
        DEMO_ORGANIZATION.id,
        manager.id,
        cheque.bankName,
        cheque.chequeNumber,
        cheque.amount,
        cheque.dueDate,
        cheque.location,
        cheque.receiver,
        cheque.status,
        cheque.description,
        financeUser.id,
        cheque.customerId,
        asJson({ seedKey: SEED_KEY, ...toUiCheque(cheque) }),
        financeUser.id,
      ]
    );
  }
}

async function seedMeetings(client: any) {
  for (const meeting of meetings) {
    await client.query(
      `INSERT INTO compliance_meetings (
         id, organization_id, owner_user_id, title, organization_name, meeting_at,
         location, status, assigned_to_id, assigned_to_name, description, outcome,
         next_action_items, reminder_sent, related_customer_id, related_shipment_id,
         legacy_data, created_by_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE, $14, $15, $16::jsonb, $17, NOW(), NOW())`,
      [
        meeting.id,
        DEMO_ORGANIZATION.id,
        manager.id,
        meeting.title,
        getCustomer(meeting.customerId).companyName,
        meeting.dateTime,
        meeting.location,
        meeting.status,
        meeting.assignedTo.id,
        meeting.assignedTo.name,
        meeting.description,
        meeting.outcome,
        meeting.nextActionItems,
        meeting.customerId,
        meeting.shipmentId,
        asJson({ seedKey: SEED_KEY, ...toUiMeeting(meeting) }),
        manager.id,
      ]
    );

    for (const document of meeting.requiredDocuments) {
      await client.query(
        `INSERT INTO meeting_required_documents (
           id, organization_id, meeting_id, name, required, completed, file_name,
           legacy_data, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())`,
        [
          document.id,
          DEMO_ORGANIZATION.id,
          meeting.id,
          document.name,
          document.required !== false,
          Boolean(document.completed),
          document.fileName || null,
          asJson({ seedKey: SEED_KEY, ...document }),
        ]
      );
    }
  }
}

async function seedArchiveRecords(client: any) {
  const archivedDocument = documents.find((document) => document.archivedAt);
  const archivedQuote = quotations.find((quote) => quote.archivedAt);
  const archiveRecords = [
    {
      id: "prs-archive-document-001",
      entityType: "DOCUMENT",
      entityId: archivedDocument.id,
      title: archivedDocument.title,
      summary: "نسخه قدیمی برنامه بارگیری پس از اصلاح زمان‌بندی بایگانی شد.",
      customerName: getCustomer(archivedDocument.customerId).companyName,
      shipmentId: archivedDocument.shipmentId,
      archivedAt: archivedDocument.archivedAt,
    },
    {
      id: "prs-archive-quotation-001",
      entityType: "QUOTE",
      entityId: archivedQuote.id,
      title: archivedQuote.quotationNumber,
      summary: "پیش‌فاکتور منقضی‌شده پس از تغییر مسیر حمل بایگانی شد.",
      customerName: archivedQuote.customerName,
      shipmentId: null,
      archivedAt: archivedQuote.archivedAt,
    },
  ];

  for (const record of archiveRecords) {
    await client.query(
      `INSERT INTO archive_records (
         id, organization_id, owner_user_id, entity_type, entity_id, title,
         summary, customer_name, shipment_id, archived_by_id, archived_at, legacy_data
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $3, $10, $11::jsonb)`,
      [
        record.id,
        DEMO_ORGANIZATION.id,
        manager.id,
        record.entityType,
        record.entityId,
        record.title,
        record.summary,
        record.customerName,
        record.shipmentId,
        new Date(record.archivedAt),
        asJson({ seedKey: SEED_KEY }),
      ]
    );
  }
}

async function seedNotifications(client: any) {
  for (const notification of notifications) {
    await client.query(
      `INSERT INTO notifications (
         id, organization_id, user_id, title, body, type, source_type, source_id,
         legacy_data, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'route', $7, $8::jsonb, NOW())`,
      [
        notification.id,
        DEMO_ORGANIZATION.id,
        notification.userId,
        notification.title,
        notification.body,
        notification.type,
        notification.link,
        asJson({ seedKey: SEED_KEY, link: notification.link }),
      ]
    );
  }
}

async function seedCompatibilityRecords(client: any) {
  for (const user of demoUsers) {
    const recordsByCollection = buildRecordsForUser(user);
    const userNotifications = notifications
      .filter((notification) => notification.userId === user.id)
      .map(toUiNotification);
    recordsByCollection.notifications = userNotifications;

    for (const [collection, records] of Object.entries(recordsByCollection)) {
      const rows = Array.isArray(records) ? records : [];
      for (const [index, record] of rows.entries()) {
        const itemId = record.id || `${collection}-${index}`;
        await client.query(
          `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
          [user.id, DEMO_ORGANIZATION.id, collection, itemId, asJson(record)]
        );
      }
    }
  }
}

async function assertNoPlatformAdminAccess(client: any) {
  const result = await client.query(
    `SELECT u.id, u.email, p.key
     FROM app_users u
     LEFT JOIN roles r ON lower(r.name) = lower(u.role)
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN user_permissions up ON up.user_id = u.id
     LEFT JOIN permissions p ON p.id IN (rp.permission_id, up.permission_id)
     WHERE u.id = ANY($1::text[])`,
    [demoUsers.map((user) => user.id)]
  );
  for (const row of result.rows) {
    if (
      row.key === "platform.admin" ||
      row.id === "u1" ||
      String(row.email || "").toLowerCase() === "darksudo22@gmail.com"
    ) {
      throw new Error(`Unsafe platform admin access detected for ${row.email || row.id}.`);
    }
  }
}

async function seed() {
  await ensureProductionGuard();
  await ensureStorageRoot();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  let oldStorageKeys: string[] = [];

  try {
    await client.query("BEGIN");
    await assertExistingRowsAreSeedOwned(client);
    oldStorageKeys = await collectExistingStorageKeys(client);
    await cleanupDemoTenant(client);
    await ensureRolesAndPlans(client);
    await seedOrganizationAndUsers(client, passwordHash);
    await seedCustomers(client);
    await seedShipments(client);
    await seedShipmentCompatibilityAndStatus(client);
    await seedTasks(client);
    await writeDocumentFiles();
    await seedDocuments(client);
    await seedQuotations(client);
    await seedCheques(client);
    await seedMeetings(client);
    await seedArchiveRecords(client);
    await seedNotifications(client);
    await seedCompatibilityRecords(client);
    await assertNoPlatformAdminAccess(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }

  const currentStorageKeys = documents.map((document) => document.storageKey);
  await removeStorageKeys(oldStorageKeys.filter((key) => !currentStorageKeys.includes(key)));

  const trackingLinks = Object.entries(shipmentTokens).map(([shipmentId, token]) => {
    const shipment = shipments.find((item) => item.id === shipmentId);
    return {
      shipmentCode: shipment?.shipmentCode || shipmentId,
      url: publicTrackUrl(token),
      apiPath: apiPublicTrackPath(token),
    };
  });

  console.log("");
  console.log("Seeded showcase company: حمل‌ونقل بین‌المللی پارس‌راه");
  console.log(`Organization id: ${DEMO_ORGANIZATION.id}`);
  console.log("");
  console.log("Run command:");
  console.log("  npm run db:seed:demo");
  console.log("");
  console.log("Primary login:");
  console.log(`  Email: ${manager.email}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("");
  console.log("Additional normal users:");
  for (const user of demoUsers.slice(1)) {
    console.log(`  ${user.name} (${user.role}): ${user.email} / ${DEMO_PASSWORD}`);
  }
  console.log("");
  console.log("Created records:");
  console.log(`  Customers: ${customers.length}`);
  console.log(`  Shipments: ${shipments.length}`);
  console.log(`  Shipment status events: ${shipmentStatusEvents.length}`);
  console.log(`  Tasks: ${tasks.length}`);
  console.log(`  Documents: ${documents.length} (${documents.filter((document) => document.visibility === "customer_visible").length} customer-visible)`);
  console.log(`  Quotations: ${quotations.filter((quote) => !quote.archivedAt).length} active + ${quotations.filter((quote) => quote.archivedAt).length} archived`);
  console.log(`  Cheques: ${cheques.length}`);
  console.log(`  Compliance meetings: ${meetings.length}`);
  console.log(`  Public tracking links: ${trackingLinks.length}`);
  console.log("");
  console.log("Sample public tracking links:");
  for (const link of trackingLinks) {
    console.log(`  ${link.shipmentCode}: ${link.url}`);
  }
  console.log("");
  console.log("Isolation check:");
  console.log("  All tenant-owned rows use organization_id=org-parsrah-international.");
  console.log("  Demo users are not u1, do not use the platform owner email, and do not have platform.admin.");
  console.log("  Admin smoke check: login as the primary user, then GET /api/admin/overview should return 403.");
}

seed().catch((error) => {
  console.error("Showcase company seed failed:", error);
  process.exit(1);
});
