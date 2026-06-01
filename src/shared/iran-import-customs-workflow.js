export const IR_IMPORT_CUSTOMS_WORKFLOW_KEY = "IR_IMPORT_CUSTOMS_V1";

export const IR_IMPORT_CUSTOMS_PHASES = [
  { id: "order_registration", labelFa: "ثبت سفارش", labelEn: "Order registration" },
  { id: "fx_bank", labelFa: "ارز و بانک", labelEn: "FX and bank" },
  { id: "shipping_origin", labelFa: "حمل و مبدأ", labelEn: "Shipping and origin" },
  { id: "iran_arrival", labelFa: "ورود به ایران", labelEn: "Iran arrival" },
  { id: "customs_declaration", labelFa: "اظهار گمرکی", labelEn: "Customs declaration" },
  { id: "customs_route", labelFa: "مسیر گمرکی", labelEn: "Customs route" },
  { id: "payment_release", labelFa: "پرداخت و پروانه", labelEn: "Payment and release" },
  { id: "gate_exit", labelFa: "خروج", labelEn: "Gate exit" },
];

export const IR_IMPORT_CUSTOMS_STEPS = [
  ["order_registration", "001", "پرونده واردات ایجاد شد", "Import file created"],
  ["order_registration", "002", "احراز نقش بازرگان / کارت بازرگانی بررسی شد", "Trader profile checked"],
  ["order_registration", "003", "شناسه فروشنده خارجی انتخاب / اخذ شد", "Foreign seller ID selected/requested"],
  ["order_registration", "004", "پیش‌فاکتور ثبت شد", "Proforma invoice registered"],
  ["order_registration", "005", "اطلاعات اصلی پرونده تکمیل شد", "Basic order info completed"],
  ["order_registration", "006", "اطلاعات گمرکی و حمل تکمیل شد", "Customs & transport info completed"],
  ["order_registration", "007", "اطلاعات مالی و بانکی تکمیل شد", "Financial & banking info completed"],
  ["order_registration", "008", "کالاها به پرونده اضافه شدند", "Goods added to order"],
  ["order_registration", "009", "مستندات پرونده بارگذاری شد", "Supporting docs uploaded"],
  ["order_registration", "010", "استعلام ضوابط کالایی انجام شد", "Commodity rules inquiry submitted"],
  ["order_registration", "011", "در انتظار مجوزهای ثبت سفارش", "Pre-order permits pending"],
  ["order_registration", "012", "مجوزهای ثبت سفارش تأیید شد", "Pre-order permits approved"],
  ["order_registration", "013", "درخواست ثبت سفارش ارسال شد", "Order registration requested"],
  ["order_registration", "014", "ثبت سفارش نیازمند اصلاح است", "Order registration needs correction"],
  ["order_registration", "015", "ثبت سفارش تأیید شد", "Order registration approved"],
  ["order_registration", "016", "کارمزد ثبت سفارش پرداخت شد", "Order fee paid"],
  ["order_registration", "017", "شماره ۸ رقمی ثبت سفارش صادر شد", "Order registration number issued"],
  ["fx_bank", "018", "منشأ ارز اظهار شد", "FX source declared"],
  ["fx_bank", "019", "در انتظار عملیات ارزی / بانکی", "FX/bank process pending"],
  ["fx_bank", "020", "عملیات ارزی / بانکی تکمیل شد", "FX/bank process completed"],
  ["shipping_origin", "021", "بیمه حمل صادر شد", "Insurance arranged"],
  ["shipping_origin", "022", "در انتظار گواهی بازرسی", "Inspection certificate pending"],
  ["shipping_origin", "023", "رزرو حمل انجام شد", "Cargo booked"],
  ["shipping_origin", "024", "کالا در مبدأ تحویل حمل شد", "Cargo picked up at origin"],
  ["shipping_origin", "025", "کالا از مبدأ حرکت کرد", "Cargo departed origin"],
  ["shipping_origin", "026", "سند حمل صادر شد", "Shipping document issued"],
  ["shipping_origin", "027", "کالا در مسیر است", "Cargo in transit"],
  ["shipping_origin", "028", "پیش‌آگهی اسناد حمل دریافت شد", "Pre-alert received"],
  ["iran_arrival", "029", "اعلامیه ورود صادر شد", "Arrival notice issued"],
  ["iran_arrival", "030", "کالا وارد مرز / بندر / فرودگاه شد", "Cargo arrived in Iran"],
  ["iran_arrival", "031", "مانیفست ثبت شد", "Manifest registered"],
  ["iran_arrival", "032", "ترخیصیه صادر شد", "Delivery order issued"],
  ["iran_arrival", "033", "کالا تحویل انبار گمرکی شد", "Cargo delivered to customs warehouse"],
  ["iran_arrival", "034", "قبض انبار صادر شد", "Warehouse receipt issued"],
  ["customs_declaration", "035", "اسناد ترخیص تکمیل شد", "Clearance docs prepared"],
  ["customs_declaration", "036", "پیش‌نویس اظهارنامه EPL آماده شد", "EPL declaration drafted"],
  ["customs_declaration", "037", "اظهارنامه در EPL ثبت شد", "EPL declaration submitted"],
  ["customs_declaration", "038", "شماره کوتاژ صادر شد", "Cotage number issued"],
  ["customs_declaration", "039", "مسیر گمرکی تعیین شد", "Customs route assigned"],
  ["customs_route", "040G", "مسیر سبز — بررسی سریع", "Green route processing"],
  ["customs_route", "040Y", "مسیر زرد — بررسی اسنادی", "Yellow route processing"],
  ["customs_route", "040R", "مسیر قرمز — ارزیابی فیزیکی", "Red route processing"],
  ["customs_route", "041", "کنترل اسناد در جریان است", "Document control in progress"],
  ["customs_route", "042", "ارزیابی فیزیکی زمان‌بندی شد", "Physical inspection scheduled"],
  ["customs_route", "043", "ارزیابی فیزیکی انجام شد", "Physical inspection completed"],
  ["customs_route", "044", "نمونه‌برداری / آزمایشگاه در انتظار", "Sampling/lab pending"],
  ["customs_route", "045", "نتیجه آزمایشگاه تأیید شد", "Lab result approved"],
  ["customs_route", "046", "در انتظار مجوزهای قانونی ترخیص", "Legal permits pending"],
  ["customs_route", "047", "مجوزهای قانونی ترخیص تأیید شد", "Legal permits approved"],
  ["customs_route", "048", "تعرفه بررسی شد", "Tariff reviewed"],
  ["customs_route", "049", "ارزش گمرکی بررسی شد", "Customs value reviewed"],
  ["customs_route", "050", "کارشناسی گمرک تکمیل شد", "Expert review completed"],
  ["payment_release", "051", "حقوق ورودی و عوارض محاسبه شد", "Duties/taxes calculated"],
  ["payment_release", "052", "در انتظار پرداخت گمرکی", "Customs payment pending"],
  ["payment_release", "053", "پرداخت حقوق و عوارض انجام شد", "Customs payment completed"],
  ["payment_release", "054", "تأیید صندوق / حسابداری گمرک انجام شد", "Cashier/accounting confirmed"],
  ["payment_release", "055", "پروانه سبز / پروانه گمرکی صادر شد", "Green customs permit issued"],
  ["payment_release", "056", "در انتظار تسویه انبارداری / ترمینال", "Warehouse/terminal charges pending"],
  ["payment_release", "057", "هزینه‌های انبارداری / ترمینال تسویه شد", "Warehouse/terminal charges paid"],
  ["payment_release", "058", "مجوز بارگیری صادر شد", "Loading permit issued"],
  ["gate_exit", "059", "کامیون / وسیله حمل داخلی تخصیص یافت", "Truck assigned"],
  ["gate_exit", "060", "کالا بارگیری شد", "Cargo loaded"],
  ["gate_exit", "061", "بیجک / حواله خروج انبار صادر شد", "Warehouse gate pass issued"],
  ["gate_exit", "062", "ارسال به درب خروج گمرک", "Sent to customs exit gate"],
  ["gate_exit", "063", "کنترل درب خروج در جریان است", "Exit gate control in progress"],
  ["gate_exit", "064", "خروج بلامانع شد", "Exit approved"],
  ["gate_exit", "065", "خروج از گمرک انجام شد", "Exited customs"],
  ["gate_exit", "066", "تحویل انبار مقصد شد", "Delivered to importer warehouse"],
].map(([phaseId, code, labelFa, labelEn], index) => ({
  phaseId,
  code,
  labelFa,
  labelEn,
  order: index + 1,
}));

export const IR_IMPORT_CUSTOMS_BLOCKERS = [
  ["B01", "کسری مدارک", "Missing document"],
  ["B02", "مغایرت اطلاعات", "Data mismatch"],
  ["B03", "ایراد در کد تعرفه", "HS code issue"],
  ["B04", "ایراد در شناسه کالا", "Goods ID issue"],
  ["B05", "ایراد در شناسه فروشنده خارجی", "Seller ID issue"],
  ["B06", "رد مجوز", "Permit rejected"],
  ["B07", "تأخیر در صدور مجوز", "Permit pending too long"],
  ["B08", "رد ثبت سفارش", "Order registration rejected"],
  ["B09", "انقضای ثبت سفارش", "Order registration expired"],
  ["B10", "نیاز به ویرایش ثبت سفارش", "Order amendment required"],
  ["B11", "عدم اظهار منشأ ارز", "FX source missing"],
  ["B12", "توقف عملیات ارزی / بانکی", "Bank/FX blocked"],
  ["B13", "اصل اسناد دریافت نشده", "Original docs not received"],
  ["B14", "مغایرت مانیفست", "Manifest mismatch"],
  ["B15", "مغایرت قبض انبار", "Warehouse receipt mismatch"],
  ["B16", "ترخیصیه صادر نشده", "Delivery order missing"],
  ["B17", "اختلاف ارزش گمرکی", "Valuation dispute"],
  ["B18", "اختلاف تعرفه", "Tariff dispute"],
  ["B19", "مغایرت در ارزیابی فیزیکی", "Physical inspection discrepancy"],
  ["B20", "عدم تأیید آزمایشگاه", "Lab failed"],
  ["B21", "توقف استاندارد / بهداشت / قرنطینه", "Standard/health/quarantine hold"],
  ["B22", "خطا در پرداخت گمرکی", "Payment failed"],
  ["B23", "عدم تسویه انبارداری", "Warehouse charges unpaid"],
  ["B24", "دموراژ / دیتنشن پرداخت نشده", "Demurrage/detention pending"],
  ["B25", "عدم صدور مجوز بارگیری", "Loading not allowed"],
  ["B26", "برگشت از درب خروج", "Gate exit rejected"],
  ["B27", "توقف گمرکی", "Customs hold"],
  ["B28", "پرونده تحت بررسی است", "Case under review"],
  ["B29", "ریسک متروکه شدن کالا", "Goods abandoned risk"],
  ["B30", "ریسک ضبط / توقیف قانونی", "Legal seizure/confiscation risk"],
].map(([code, labelFa, labelEn]) => ({ code, labelFa, labelEn }));

const STEP_BY_CODE = new Map(IR_IMPORT_CUSTOMS_STEPS.map((step) => [step.code, step]));
const PHASE_BY_ID = new Map(IR_IMPORT_CUSTOMS_PHASES.map((phase) => [phase.id, phase]));
const BLOCKER_BY_CODE = new Map(IR_IMPORT_CUSTOMS_BLOCKERS.map((blocker) => [blocker.code, blocker]));
const ROUTE_STEP_CODES = new Set(["040G", "040Y", "040R"]);
const RED_DEFAULT_CODES = new Set(["040R", "041", "042", "043", "046", "047", "048", "049", "050"]);
const YELLOW_DEFAULT_CODES = new Set(["040Y", "041", "046", "047", "048", "049", "050"]);
const GREEN_DEFAULT_CODES = new Set(["040G", "046", "047", "048", "049", "050"]);
const ROUTE_ONLY_CODES = new Set(["040G", "040Y", "040R", "041", "042", "043", "044", "045"]);

export const IR_IMPORT_CUSTOMS_V1 = {
  key: IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
  labelFa: "فرآیند واردات و ترخیص ایران",
  labelEn: "Iran import customs progression",
  phases: IR_IMPORT_CUSTOMS_PHASES,
  steps: IR_IMPORT_CUSTOMS_STEPS,
  blockers: IR_IMPORT_CUSTOMS_BLOCKERS,
};

export function getIranImportStep(code) {
  return STEP_BY_CODE.get(String(code || "")) || null;
}

export function getIranImportPhase(id) {
  return PHASE_BY_ID.get(String(id || "")) || null;
}

export function getIranImportBlocker(code) {
  return BLOCKER_BY_CODE.get(String(code || "")) || null;
}

export function isValidIranImportRoute(route) {
  return ["green", "yellow", "red"].includes(String(route || ""));
}

export function isValidIranImportStepCode(code) {
  return STEP_BY_CODE.has(String(code || ""));
}

export function isValidIranImportBlockerCode(code) {
  return BLOCKER_BY_CODE.has(String(code || ""));
}

export function isRouteDecisionStep(code) {
  return String(code || "") === "039";
}

export function isRouteBranchStep(code) {
  return ROUTE_STEP_CODES.has(String(code || ""));
}

export function isVisibleForCustomsRoute(stepCode, customsRoute) {
  const code = String(stepCode || "");
  const route = String(customsRoute || "");
  if (!ROUTE_ONLY_CODES.has(code)) return true;
  if (!route) return !ROUTE_STEP_CODES.has(code) && !["042", "043", "044", "045"].includes(code);
  if (route === "green") return GREEN_DEFAULT_CODES.has(code);
  if (route === "yellow") return YELLOW_DEFAULT_CODES.has(code);
  if (route === "red") return RED_DEFAULT_CODES.has(code);
  return true;
}

export function routeLabel(customsRoute) {
  const labels = {
    green: { labelFa: "مسیر سبز", labelEn: "Green route" },
    yellow: { labelFa: "مسیر زرد", labelEn: "Yellow route" },
    red: { labelFa: "مسیر قرمز", labelEn: "Red route" },
  };
  return labels[String(customsRoute || "")] || null;
}

export function publicLabelForStep(stepCode) {
  const step = getIranImportStep(stepCode);
  if (!step) return "وضعیت محموله به‌روزرسانی شد";
  if (step.phaseId === "customs_route") return "پرونده در حال بررسی گمرکی است";
  return step.labelFa;
}

export function publicPhaseForStep(stepCode) {
  const step = getIranImportStep(stepCode);
  const phase = step ? getIranImportPhase(step.phaseId) : null;
  return phase?.labelFa || "پیگیری محموله";
}

export function safePublicBlockerMessage(publicNote) {
  return String(publicNote || "").trim() || "تکمیل مدارک یا مجوزها در حال پیگیری است";
}
