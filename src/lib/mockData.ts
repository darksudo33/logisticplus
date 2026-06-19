import { User, Customer, Shipment, Task, Message, ActivityLog, Demurrage, ShipmentStep, ShipmentDocument, Channel, Notification, Appointment, Cheque, Quote } from "../types";
import { addDays, format } from "date-fns-jalali";

export const mockQuotes: Quote[] = [
  {
    id: "q1",
    customerName: "آرین سیستم",
    customerPhone: "021-88776655",
    originCity: "شانگهای",
    destinationCity: "بندرعباس",
    cargoType: "GENERAL",
    weight: 12,
    dimensions: "12x2.4x2.6",
    pickupDate: addDays(new Date(), 2).toISOString(),
    deliveryDate: addDays(new Date(), 30).toISOString(),
    requirements: ["بیمه", "رهگیری لحظه‌ای"],
    baseRate: 750000000,
    fuelSurcharge: 120000000,
    loadingFees: 45000000,
    tollFees: 15000000,
    insurancePercentage: 1.5,
    profitMargin: 12,
    totalPrice: 1056720000,
    validUntil: addDays(new Date(), 7).toISOString(),
    status: "PENDING",
    createdAt: new Date().toISOString()
  },
  {
    id: "q2",
    customerName: "صادرات پارس",
    customerPhone: "021-44332211",
    originCity: "دبی",
    destinationCity: "بوشهر",
    cargoType: "REFRIGERATED",
    weight: 8,
    dimensions: "6x2.4x2.6",
    pickupDate: addDays(new Date(), 1).toISOString(),
    deliveryDate: addDays(new Date(), 5).toISOString(),
    requirements: ["دمای ثابت", "تخلیه بالابر"],
    baseRate: 450000000,
    fuelSurcharge: 55000000,
    loadingFees: 30000000,
    tollFees: 8000000,
    insurancePercentage: 2,
    profitMargin: 15,
    totalPrice: 635950000,
    validUntil: addDays(new Date(), 7).toISOString(),
    status: "ACCEPTED",
    createdAt: addDays(new Date(), -2).toISOString()
  },
  {
    id: "q3",
    customerName: "فراز لجستیک",
    customerPhone: "031-11223344",
    originCity: "هامبورگ",
    destinationCity: "بندر امام",
    cargoType: "HAZARDOUS",
    weight: 15,
    dimensions: "12x2.4x2.6",
    pickupDate: addDays(new Date(), 5).toISOString(),
    deliveryDate: addDays(new Date(), 45).toISOString(),
    requirements: ["کالای خطرناک", "برچسب‌گذاری"],
    baseRate: 1200000000,
    fuelSurcharge: 180000000,
    loadingFees: 90000000,
    tollFees: 25000000,
    insurancePercentage: 3,
    profitMargin: 10,
    totalPrice: 1694350000,
    validUntil: addDays(new Date(), -1).toISOString(),
    status: "EXPIRED",
    createdAt: addDays(new Date(), -10).toISOString()
  }
];

const today = new Date();
const formatDate = (date: Date) => format(date, "yyyy/MM/dd");

export const mockNotifications: Notification[] = [
  { id: "n1", title: "تغییر وضعیت محموله", message: "محموله LS-9801 به مرحله 'در حال حمل' تغییر یافت.", type: "INFO", isRead: false, createdAt: format(today, "yyyy/MM/dd HH:mm"), link: "/shipments/s1" },
  { id: "n2", title: "وظیفه جدید", message: "وظیفه جدیدی برای شما توسط احمدرضا علمداری تعریف شد.", type: "URGENT", isRead: false, createdAt: format(today, "yyyy/MM/dd HH:mm"), link: "/tasks" },
  { id: "n3", title: "سند جدید", message: "سند جدیدی به محموله LS-9803 اضافه شد.", type: "SUCCESS", isRead: true, createdAt: format(addDays(today, -1), "yyyy/MM/dd HH:mm"), link: "/shipments/s3" },
  { id: "n4", title: "هشدار دمیج", message: "فری‌تایم محموله LS-9802 به اتمام رسیده است.", type: "WARNING", isRead: false, createdAt: format(today, "yyyy/MM/dd HH:mm"), link: "/shipments/s2" },
];

export const mockUsers: User[] = [
  { id: "u1", name: "احمدرضا علمداری", email: "darksudo22@gmail.com", role: "CEO", isOnline: true },
  { id: "u2", name: "سارا رضایی", email: "rezaei@logisharp.ir", role: "MANAGER", isOnline: true },
  { id: "u3", name: "محمد تهرانی", email: "tehrani@logisharp.ir", role: "OPERATIONS", isOnline: false },
  { id: "u4", name: "نازنین حسینی", email: "hosseini@logisharp.ir", role: "FINANCE", isOnline: true },
  { id: "u5", name: "بابک راد", email: "rad@logisharp.ir", role: "CUSTOMER_SERVICE", isOnline: false },
];

export const mockCustomers: Customer[] = [
  { id: "c1", name: "علی کریمی", company: "آرین سیستم", phone: "021-88776655", email: "info@arian.com", address: "تهران، خیابان ولیعصر", shipmentsCount: 12, createdAt: formatDate(addDays(today, -150)) },
  { id: "c2", name: "مریم صدری", company: "صادرات پارس", phone: "021-44332211", email: "sales@pars.ir", address: "اصفهان، شهرک صنعتی", shipmentsCount: 5, createdAt: formatDate(addDays(today, -100)) },
  { id: "c3", name: "جعفر همتی", company: "فراز لجستیک", phone: "031-11223344", email: "admin@faraz.ir", address: "مشهد، بلوار سجاد", shipmentsCount: 8, createdAt: formatDate(addDays(today, -50)) },
  { id: "c4", name: "ندا ناصری", company: "دنیای دیجیتال", phone: "021-99887766", email: "info@digital.ir", address: "تبریز، خیابان آزادی", shipmentsCount: 3, createdAt: formatDate(addDays(today, -20)) },
];

export const mockShipments: Shipment[] = [
  { id: "s1", trackingNumber: "LS-9801", containerNumber: "MEDU876251", customerId: "c1", customerName: "آرین سیستم", origin: "شانگهای", destination: "بندرعباس", status: "IN_TRANSIT", createdAt: formatDate(addDays(today, -20)), estimatedDelivery: formatDate(addDays(today, 15)), freeTimeDays: 14 },
  { id: "s2", trackingNumber: "LS-9802", containerNumber: "MSKU112233", customerId: "c2", customerName: "صادرات پارس", origin: "دبی", destination: "بوشهر", status: "ARRIVED", createdAt: formatDate(addDays(today, -25)), estimatedDelivery: formatDate(addDays(today, 5)), freeTimeDays: 10 },
  { id: "s3", trackingNumber: "LS-9803", containerNumber: "CMAU445566", customerId: "c3", customerName: "فراز لجستیک", origin: "هامبورگ", destination: "بندر امام", status: "KOOTAJ_DONE", createdAt: formatDate(addDays(today, -30)), estimatedDelivery: formatDate(addDays(today, 10)), freeTimeDays: 20 },
  { id: "s4", trackingNumber: "LS-9804", containerNumber: "COSU778899", customerId: "c1", customerName: "آرین سیستم", origin: "پکن", destination: "تهران (گمرک)", status: "EXITED", createdAt: formatDate(addDays(today, -40)), estimatedDelivery: formatDate(addDays(today, -5)), freeTimeDays: 7 },
];

export const defaultSteps = [
  "ثبت سفارش در سامانه جامع تجارت",
  "دریافت مجوزهای لازم از سازمانهای مربوطه",
  "عقد قرارداد حمل‌ونقل بین‌المللی",
  "رزرو وسیله حمل",
  "بارگیری کالا در مبدأ",
  "ارسال اسناد حمل به واردکننده",
  "اظهار کالا در سامانه گمرکی",
  "ارائه و بررسی اسناد توسط کارشناس گمرک",
  "ارزیابی و بازرسی فیزیکی کالا (در صورت نیاز)",
  "پرداخت حقوق و عوارض گمرکی",
  "دریافت پروانه سبز گمرکی",
  "هماهنگی و انجام حمل داخلی",
  "خروج کالا از گمرک و تحویل در مقصد"
];

export const mockTasks: Task[] = [
  { id: "t1", title: "بررسی اسناد گمرکی LS-9803", description: "مدارک ترخیص هنوز تکمیل نشده است. نیاز به اسناد حمل اصلی داریم.", assignedToUserId: "u3", assignedToName: "محمد تهرانی", assignedByName: "احمدرضا علمداری", status: "TODO", priority: "HIGH", dueDate: formatDate(addDays(today, 1)), deadline: "14:30", shipmentId: "s3", createdAt: formatDate(addDays(today, -5)) },
  { id: "t2", title: "هماهنگی با راننده برای LS-9804", description: "کالای ترخیص شده نیاز به ارسال فوری دارد. ۲ دستگاه تریلی لازم است.", assignedToUserId: "u3", assignedToName: "محمد تهرانی", assignedByName: "سارا رضایی", status: "IN_PROGRESS", priority: "URGENT", dueDate: formatDate(addDays(today, 2)), deadline: "10:00", shipmentId: "s4", createdAt: formatDate(addDays(today, -4)) },
  { id: "t3", title: "تایید فاکتور انبارداری", description: "فاکتورهای مربوط به ماه فروردین بررسی شود. مطابقت با لیست ورود کالا انجام شود.", assignedToUserId: "u4", assignedToName: "نازنین حسینی", assignedByName: "احمدرضا علمداری", status: "DONE", priority: "MEDIUM", dueDate: formatDate(today), deadline: "17:00", createdAt: formatDate(addDays(today, -10)) },
  { id: "t4", title: "استعلام نرخ جدید کانتینر", description: "قیمت‌های حمل از تیانجین به بندرعباس برای هفته آینده دریافت شود.", assignedToUserId: "u2", assignedToName: "سارا رضایی", assignedByName: "احمدرضا علمداری", status: "TODO", priority: "MEDIUM", dueDate: formatDate(addDays(today, 5)), deadline: "12:00", createdAt: formatDate(addDays(today, -1)) },
  { id: "t5", title: "بروزرسانی پروفایل مشتری آرین", description: "شماره تماس‌های جدید در سیستم ثبت شود.", assignedToUserId: "u5", assignedToName: "بابک راد", assignedByName: "سارا رضایی", status: "TODO", priority: "LOW", dueDate: formatDate(addDays(today, 10)), deadline: "16:00", createdAt: formatDate(addDays(today, -1)) },
  { id: "t6", title: "پیگیری بیمه‌نامه LS-9801", description: "بیمه‌نامه الحاقی برای تغییرات اعلامی صادر شود.", assignedToUserId: "u4", assignedToName: "نازنین حسینی", assignedByName: "محمد تهرانی", status: "IN_PROGRESS", priority: "HIGH", dueDate: formatDate(addDays(today, 3)), deadline: "13:30", shipmentId: "s1", createdAt: formatDate(addDays(today, -2)) },
  { id: "t7", title: "جلسه با ترخیص‌کار (بندرعباس)", description: "بررسی مشکلات اخیر در خروج کالا از درب خروج.", assignedToUserId: "u3", assignedToName: "محمد تهرانی", assignedByName: "احمدرضا علمداری", status: "TODO", priority: "HIGH", dueDate: formatDate(addDays(today, 6)), deadline: "09:00", createdAt: formatDate(addDays(today, -3)) },
  { id: "t8", title: "ارسال یادآوری دمیج به مشتری سدر", description: "دوره فری‌تایم محموله LS-9802 رو به اتمام است.", assignedToUserId: "u5", assignedToName: "بابک راد", assignedByName: "سارا رضایی", status: "DONE", priority: "URGENT", dueDate: formatDate(addDays(today, -1)), deadline: "11:00", shipmentId: "s2", createdAt: formatDate(addDays(today, -7)) },
  { id: "t9", title: "تهیه گزارش عملکرد ماهانه", description: "گزارش تعداد کانتینرهای حمل شده و ترخیصی در فروردین ماه.", assignedToUserId: "u2", assignedToName: "سارا رضایی", assignedByName: "احمدرضا علمداری", status: "IN_PROGRESS", priority: "MEDIUM", dueDate: formatDate(addDays(today, 7)), deadline: "15:45", createdAt: formatDate(addDays(today, -4)) },
  { id: "t10", title: "بررسی تداخل وزن LS-9803", description: "وزن اعلامی مانیفست با توزین باسکول مغایرت دارد.", assignedToUserId: "u3", assignedToName: "محمد تهرانی", assignedByName: "محمد تهرانی", status: "TODO", priority: "URGENT", dueDate: formatDate(addDays(today, 4)), deadline: "10:30", shipmentId: "s3", createdAt: formatDate(addDays(today, -2)) },
  { id: "t11", title: "واریزی حق‌العمل ترخیص", description: "تسویه حساب نهایی محموله ترخیص شده.", assignedToUserId: "u4", assignedToName: "نازنین حسینی", assignedByName: "سارا رضایی", status: "TODO", priority: "MEDIUM", dueDate: formatDate(addDays(today, 8)), deadline: "12:00", createdAt: formatDate(addDays(today, -3)) },
  { id: "t12", title: "هماهنگی تست استاندارد", description: "نمونه‌برداری برای آزمایشگاه استاندارد انجام شود.", assignedToUserId: "u3", assignedToName: "محمد تهرانی", assignedByName: "احمدرضا علمداری", status: "DONE", priority: "HIGH", dueDate: formatDate(addDays(today, -2)), deadline: "14:00", shipmentId: "s3", createdAt: formatDate(addDays(today, -8)) },
];

export const mockChannels: Channel[] = [
  { id: "ch-general", name: "گفتگوی عمومی", description: "گفتگوی آزاد برای تمام پرسنل شرکت", icon: "Users" },
  { id: "ch-ops", name: "تیم عملیات", description: "هماهنگی محموله‌ها و ترخیص کاران", roleLimit: "OPERATIONS", icon: "Truck" },
  { id: "ch-finance", name: "امور مالی", description: "هماهنگی فاکتورها و پرداخت‌ها", roleLimit: "FINANCE", icon: "CreditCard" },
  { id: "ch-mgmt", name: "مدیریت ارشد", description: "تصمیم‌گیری‌های کلان و استراتژیک", roleLimit: "CEO", icon: "Shield" },
];

export const mockMessages: Message[] = [
  { id: "m1", senderId: "u1", senderName: "احمدرضا علمداری", receiverId: "u2", receiverName: "سارا رضایی", content: "سلام، وضعیت محموله شانگهای چیه؟", read: true, createdAt: format(addDays(today, -3), "yyyy/MM/dd 10:00") },
  { id: "m2", senderId: "u2", senderName: "سارا رضایی", receiverId: "u1", receiverName: "احمدرضا علمداری", content: "در حال حاضر در مرحله حمل دریایی هست و مشکلی نداره.", read: true, createdAt: format(addDays(today, -3), "yyyy/MM/dd 10:05") },
  { id: "m-g1", senderId: "u1", senderName: "احمدرضا علمداری", groupId: "ch-general", isGroup: true, content: "سلام به همگی، جلسه هفتگی ساعت ۳ برگزار میشه.", read: true, createdAt: format(today, "yyyy/MM/dd 09:00") },
  { id: "m-g2", senderId: "u3", senderName: "محمد تهرانی", groupId: "ch-ops", isGroup: true, content: "بارنامه LS-9801 تایید شد، آماده ترخیص هستیم.", read: true, createdAt: format(today, "yyyy/MM/dd 10:30") },
];

export const mockActivityLogs: ActivityLog[] = [
  { id: "l1", userName: "سارا رضایی", action: "تغییر وضعیت", entityType: "Shipment", entityId: "s1", details: "تغییر وضعیت به در حال حمل", createdAt: format(addDays(today, -5), "yyyy/MM/dd 09:30"), shipmentId: "s1" },
  { id: "l2", userName: "محمد تهرانی", action: "ایجاد وظیفه", entityType: "Task", entityId: "t2", details: "وظیفه هماهنگی با راننده ایجاد شد", createdAt: format(addDays(today, -5), "yyyy/MM/dd 11:15") },
];

export const mockDemurrage: Demurrage[] = [
  { id: "d1", shipmentId: "s1", freeTimeDays: 14, freeTimeEnd: formatDate(addDays(today, 10)), dailyCharge: 500000, totalCharge: 0, status: "ACTIVE" },
  { id: "d2", shipmentId: "s2", freeTimeDays: 10, freeTimeEnd: formatDate(addDays(today, 5)), dailyCharge: 800000, totalCharge: 4000000, status: "ACTIVE" },
];

export const mockDocuments: ShipmentDocument[] = [
  { id: "doc1", shipmentId: "s1", name: "پیش‌فاکتور (Proforma Invoice)", type: "INVOICE", fileSize: "1.2 MB", uploadedBy: "سارا رضایی", createdAt: formatDate(addDays(today, -20)), url: "#" },
  { id: "doc2", shipmentId: "s1", name: "بارنامه دریایی", type: "BILL_OF_LADING", fileSize: "2.5 MB", uploadedBy: "محمد تهرانی", createdAt: formatDate(addDays(today, -15)), url: "#" },
  { id: "doc3", shipmentId: "s2", name: "لیست عدل‌بندی", type: "PACKING_LIST", fileSize: "850 KB", uploadedBy: "سارا رضایی", createdAt: formatDate(addDays(today, -12)), url: "#" },
  { id: "doc4", shipmentId: "s3", name: "گواهی مبدا", type: "OTHER", fileSize: "1.1 MB", uploadedBy: "نازنین حسینی", createdAt: formatDate(addDays(today, -10)), url: "#" },
  { id: "doc5", name: "قرارداد کلی شرکت - ۱۴۰۳", type: "OTHER", fileSize: "5.4 MB", uploadedBy: "احمدرضا علمداری", createdAt: formatDate(addDays(today, -60)), url: "#" },
];

export const mockAppointments: Appointment[] = [
  {
    id: "ap1",
    dateTime: format(addDays(today, 2), "yyyy/MM/dd 09:00"),
    departmentName: "لجستیک و حمل و نقل",
    purpose: "بررسی قراردادهای جدید حمل دریایی با کشتیرانی دریای خزر",
    requiredDocuments: [
      { id: "ad1", name: "کپی قرارداد سال گذشته", required: true, completed: true },
      { id: "ad2", name: "لیست نرخ‌های پیشنهادی", required: true, completed: false },
      { id: "ad3", name: "معرفی‌نامه نماینده", required: false, completed: true },
    ],
    assignedPersonId: "u2",
    assignedPersonName: "سارا رضایی",
    status: "SCHEDULED",
    reminderSent: false,
    createdAt: formatDate(addDays(today, -5))
  },
  {
    id: "ap2",
    dateTime: format(addDays(today, 5), "yyyy/MM/dd 11:30"),
    departmentName: "گمرک و مالیات",
    purpose: "رسیدگی به پرونده تداخل وزن محموله LS-9803",
    requiredDocuments: [
      { id: "ad4", name: "بارنامه اصلی", required: true, completed: true },
      { id: "ad5", name: "فیش واریزی کارورزی", required: true, completed: true },
    ],
    assignedPersonId: "u3",
    assignedPersonName: "محمد تهرانی",
    status: "IN_PROGRESS",
    reminderSent: false,
    createdAt: formatDate(addDays(today, -4))
  }
];

export const mockCheques: Cheque[] = [
  {
    id: "chq1",
    bankName: "بانک ملت",
    chequeNumber: "12345/6789",
    amount: 150000000,
    dueDate: formatDate(addDays(today, 30)),
    location: "شرکت هوپاد",
    receiver: "شرکت بازرگانی آریا",
    status: "ACTIVE",
    description: "بابت تسویه فاکتور شماره ۹۸۰",
    createdAt: formatDate(addDays(today, -10))
  },
  {
    id: "chq2",
    bankName: "بانک صادرات",
    chequeNumber: "98765/4321",
    amount: 75000000,
    dueDate: formatDate(addDays(today, 15)),
    location: "اسپاد",
    receiver: "سازمان بنادر",
    status: "ACTIVE",
    description: "ضمانت ترخیص محموله LS-9802",
    createdAt: formatDate(addDays(today, -15))
  },
  {
    id: "chq3",
    bankName: "بانک ملی",
    chequeNumber: "11122/3344",
    amount: 320000000,
    dueDate: formatDate(addDays(today, -10)),
    location: "بایگانی",
    receiver: "کشتیرانی جمهوری اسلامی",
    status: "CLEARED",
    description: "تسویه قرارداد حمل زمینی",
    createdAt: formatDate(addDays(today, -40))
  }
];
