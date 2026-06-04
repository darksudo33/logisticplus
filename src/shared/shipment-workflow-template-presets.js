import {
  IR_IMPORT_CUSTOMS_BLOCKERS,
  IR_IMPORT_CUSTOMS_PHASES,
  IR_IMPORT_CUSTOMS_STEPS,
  IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
} from "./iran-import-customs-workflow.js";

function phase(phaseKey, labelFa, labelEn) {
  return { phaseKey, id: phaseKey, labelFa, labelEn, isVisible: true };
}

function step(phaseKey, stepKey, labelFa, labelEn, options = {}) {
  return {
    phaseKey,
    phaseId: phaseKey,
    stepKey,
    code: stepKey,
    labelFa,
    labelEn,
    publicLabel: options.publicLabel || labelFa,
    isRequired: options.isRequired !== false,
    isVisible: options.isVisible !== false,
    isCustomerVisible: options.isCustomerVisible !== false,
    roleSuggestion: options.roleSuggestion || "",
    expectedDurationHours: options.expectedDurationHours ?? null,
    taskPolicy: options.taskPolicy || { mode: "suggested" },
    expectedDocuments: options.expectedDocuments || [],
    expectedFormFields: options.expectedFormFields || [],
    nextStepRules: options.nextStepRules || {},
    visibilityRule: options.visibilityRule || {},
  };
}

function withOrder(items) {
  return items.map((item, index) => ({ ...item, sortOrder: index + 1, order: index + 1 }));
}

function template({
  id,
  code,
  shipmentTypeCode,
  shipmentDirection,
  transportMode,
  titleFa,
  titleEn,
  description,
  phases,
  steps,
  blockers = IR_IMPORT_CUSTOMS_BLOCKERS,
}) {
  return {
    id,
    code,
    shipmentTypeCode,
    shipmentTypeHint: shipmentTypeCode,
    shipmentDirection,
    transportMode,
    titleFa,
    titleEn,
    description,
    version: 1,
    isSystem: true,
    isActive: true,
    phases: withOrder(phases),
    steps: withOrder(steps),
    blockers,
  };
}

const importPhases = [
  phase("order_registration", "تشکیل پرونده", "File setup"),
  phase("fx_bank", "اسناد اولیه و مالی", "Initial and financial documents"),
  phase("shipping_origin", "حمل و مبدا", "Transport and origin"),
  phase("iran_arrival", "ورود و تحویل", "Arrival and handover"),
  phase("customs_declaration", "اظهار و کوتاژ", "Declaration and cotage"),
  phase("customs_route", "ارزیابی و مجوزها", "Assessment and permits"),
  phase("payment_release", "پرداخت ها", "Payments"),
  phase("gate_exit", "خروج و پیگیری", "Exit and follow-up"),
];

const exportPhases = [
  phase("export_file", "تشکیل پرونده صادرات", "Export file setup"),
  phase("export_goods_docs", "آماده سازی کالا و اسناد", "Goods and document readiness"),
  phase("export_permits", "مجوزها و اظهار صادراتی", "Permits and export declaration"),
  phase("export_dispatch", "حمل تا مرز یا پایانه", "Dispatch to border or terminal"),
  phase("export_exit", "تشریفات خروج", "Exit formalities"),
  phase("export_delivery", "ارسال و تحویل", "Shipment and delivery"),
  phase("export_followup", "پیگیری نهایی", "Final follow-up"),
];

const publicFileLabel = "پرونده محموله تشکیل شد";
const publicTransitLabel = "محموله در حال پیگیری حمل است";
const publicCustomsLabel = "پرونده در حال پیگیری تشریفات گمرکی است";
const publicDoneLabel = "پرونده برای تحویل نهایی پیگیری شد";

const presetSteps = {
  IMPORT_LENJ: [
    step("order_registration", "001", "پرونده واردات با لنج تشکیل شد", "Lenj import file opened", { publicLabel: publicFileLabel }),
    step("fx_bank", "002", "اسناد اولیه، صاحب کالا و کارت بازرگانی بررسی شد", "Initial docs and trader profile checked"),
    step("shipping_origin", "003", "اطلاعات لنج، ناخدا و بندر مبدا ثبت شد", "Lenj, captain, and origin port recorded", { publicLabel: publicTransitLabel }),
    step("iran_arrival", "004", "ورود لنج، تخلیه و قبض انبار پیگیری شد", "Lenj arrival, discharge, and warehouse receipt tracked"),
    step("customs_declaration", "005", "اظهارنامه و شماره کوتاژ ثبت شد", "Declaration and cotage registered", { publicLabel: publicCustomsLabel }),
    step("customs_route", "006", "ارزیابی بندر محلی و مجوزها پیگیری شد", "Local port assessment and permits tracked", { publicLabel: publicCustomsLabel }),
    step("payment_release", "007", "پرداخت های گمرکی و انبارداری تسویه شد", "Customs and warehouse payments settled"),
    step("gate_exit", "008", "خروج از بندر و تحویل به مقصد ثبت شد", "Port exit and delivery recorded", { publicLabel: publicDoneLabel }),
  ],
  IMPORT_SEA_CONTAINER: [
    step("order_registration", "001", "پرونده واردات کانتینری تشکیل شد", "Container import file opened", { publicLabel: publicFileLabel }),
    step("fx_bank", "002", "ثبت سفارش، پروفرما و اطلاعات مالی بررسی شد", "Order registration, proforma, and finance checked"),
    step("shipping_origin", "003", "رزرو حمل، کشتی و بارنامه کانتینری ثبت شد", "Booking, vessel, and container B/L recorded", { publicLabel: publicTransitLabel }),
    step("iran_arrival", "004", "اعلامیه ورود، ترخیصیه و قبض انبار دریافت شد", "Arrival notice, delivery order, and warehouse receipt received"),
    step("customs_declaration", "005", "اظهارنامه EPL و کوتاژ ثبت شد", "EPL declaration and cotage registered", { publicLabel: publicCustomsLabel }),
    step("customs_route", "006", "مسیر گمرکی، ارزیابی و مجوزها پیگیری شد", "Customs route, assessment, and permits tracked", { publicLabel: publicCustomsLabel }),
    step("payment_release", "007", "حقوق ورودی، ترمینال و انبارداری تسویه شد", "Duties, terminal, and storage charges settled"),
    step("gate_exit", "008", "مجوز بارگیری، خروج و تحویل نهایی ثبت شد", "Loading permit, gate exit, and delivery recorded", { publicLabel: publicDoneLabel }),
  ],
  IMPORT_SEA_BULK: [
    step("order_registration", "001", "پرونده واردات فله / جنرال کارگو تشکیل شد", "Bulk/general cargo import file opened", { publicLabel: publicFileLabel }),
    step("fx_bank", "002", "اسناد خرید، ارزش و اطلاعات مالی بررسی شد", "Purchase docs, value, and finance checked"),
    step("shipping_origin", "003", "کشتی، بارنامه و مشخصات بار فله ثبت شد", "Vessel, B/L, and bulk cargo details recorded", { publicLabel: publicTransitLabel }),
    step("iran_arrival", "004", "ورود، تخلیه، توزین و قبض انبار پیگیری شد", "Arrival, discharge, weighing, and receipt tracked"),
    step("customs_declaration", "005", "اظهار و کوتاژ برای کالای فله ثبت شد", "Bulk cargo declaration and cotage registered", { publicLabel: publicCustomsLabel }),
    step("customs_route", "006", "نمونه برداری، ارزیابی و مجوزها پیگیری شد", "Sampling, assessment, and permits tracked", { publicLabel: publicCustomsLabel }),
    step("payment_release", "007", "پرداخت های گمرکی و هزینه های بندری تسویه شد", "Customs and port charges settled"),
    step("gate_exit", "008", "مجوز خروج و تحویل کالای فله ثبت شد", "Bulk cargo exit permit and delivery recorded", { publicLabel: publicDoneLabel }),
  ],
  IMPORT_AIR_CARGO: [
    step("order_registration", "001", "پرونده واردات هوایی تشکیل شد", "Air cargo import file opened", { publicLabel: publicFileLabel }),
    step("fx_bank", "002", "اسناد اولیه و اطلاعات مالی محموله هوایی بررسی شد", "Initial and finance docs checked"),
    step("shipping_origin", "003", "AWB، پرواز و ایرلاین ثبت شد", "AWB, flight, and airline recorded", { publicLabel: publicTransitLabel }),
    step("iran_arrival", "004", "ورود فرودگاهی و تحویل انبار هوایی پیگیری شد", "Airport arrival and air warehouse handover tracked"),
    step("customs_declaration", "005", "اظهار سریع و کوتاژ هوایی ثبت شد", "Air declaration and cotage registered", { publicLabel: publicCustomsLabel }),
    step("customs_route", "006", "ارزیابی و مجوزهای ترخیص هوایی پیگیری شد", "Air clearance assessment and permits tracked", { publicLabel: publicCustomsLabel }),
    step("payment_release", "007", "پرداخت های گمرکی و انبار فرودگاه تسویه شد", "Customs and airport storage charges settled"),
    step("gate_exit", "008", "خروج از انبار هوایی و تحویل ثبت شد", "Air warehouse exit and delivery recorded", { publicLabel: publicDoneLabel }),
  ],
  IMPORT_LAND_TRUCK: [
    step("order_registration", "001", "پرونده واردات زمینی تشکیل شد", "Land import file opened", { publicLabel: publicFileLabel }),
    step("fx_bank", "002", "اسناد اولیه، ثبت سفارش و مالی بررسی شد", "Initial, order, and finance docs checked"),
    step("shipping_origin", "003", "CMR، پلاک کامیون و راننده ثبت شد", "CMR, truck plate, and driver recorded", { publicLabel: publicTransitLabel }),
    step("iran_arrival", "004", "ورود مرزی، باسکول و قبض انبار پیگیری شد", "Border entry, weighbridge, and receipt tracked"),
    step("customs_declaration", "005", "اظهار مرزی و کوتاژ ثبت شد", "Border declaration and cotage registered", { publicLabel: publicCustomsLabel }),
    step("customs_route", "006", "ارزیابی مرز و مجوزهای ترخیص پیگیری شد", "Border assessment and clearance permits tracked", { publicLabel: publicCustomsLabel }),
    step("payment_release", "007", "پرداخت های گمرکی و هزینه های مرزی تسویه شد", "Customs and border charges settled"),
    step("gate_exit", "008", "خروج کامیون و تحویل مقصد ثبت شد", "Truck exit and destination delivery recorded", { publicLabel: publicDoneLabel }),
  ],
  EXPORT_LENJ: [
    step("export_file", "001", "پرونده صادرات با لنج تشکیل شد", "Lenj export file opened", { publicLabel: publicFileLabel }),
    step("export_goods_docs", "002", "کالا، بسته بندی و اسناد صادراتی آماده شد", "Goods, packing, and export docs prepared"),
    step("export_permits", "003", "مجوزها و اظهار صادراتی ثبت شد", "Permits and export declaration registered", { publicLabel: publicCustomsLabel }),
    step("export_dispatch", "004", "حمل کالا تا بندر و تحویل به لنج پیگیری شد", "Dispatch to port and handover to lenj tracked", { publicLabel: publicTransitLabel }),
    step("export_exit", "005", "تشریفات خروج بندری تکمیل شد", "Port exit formalities completed"),
    step("export_delivery", "006", "ارسال با لنج و تحویل مقصد پیگیری شد", "Lenj shipment and destination handover tracked"),
    step("export_followup", "007", "اسناد نهایی و تسویه پرونده ثبت شد", "Final docs and case settlement recorded", { publicLabel: publicDoneLabel }),
  ],
  EXPORT_SEA_CONTAINER: [
    step("export_file", "001", "پرونده صادرات کانتینری تشکیل شد", "Container export file opened", { publicLabel: publicFileLabel }),
    step("export_goods_docs", "002", "کالا، پکینگ لیست و فاکتور صادراتی آماده شد", "Goods, packing list, and export invoice prepared"),
    step("export_permits", "003", "مجوزها و اظهار صادراتی ثبت شد", "Permits and export declaration registered", { publicLabel: publicCustomsLabel }),
    step("export_dispatch", "004", "رزرو، تحویل کانتینر و حمل تا بندر پیگیری شد", "Booking, container handover, and port dispatch tracked", { publicLabel: publicTransitLabel }),
    step("export_exit", "005", "تشریفات گمرک خروج و بارگیری کشتی تکمیل شد", "Export customs and vessel loading completed"),
    step("export_delivery", "006", "بارنامه، ارسال و تحویل مقصد پیگیری شد", "B/L, shipment, and destination handover tracked"),
    step("export_followup", "007", "اسناد نهایی و بستن پرونده انجام شد", "Final docs and case closure completed", { publicLabel: publicDoneLabel }),
  ],
  EXPORT_SEA_BULK: [
    step("export_file", "001", "پرونده صادرات فله / جنرال کارگو تشکیل شد", "Bulk/general cargo export file opened", { publicLabel: publicFileLabel }),
    step("export_goods_docs", "002", "کالا، وزن، بسته بندی و اسناد آماده شد", "Goods, weight, packing, and docs prepared"),
    step("export_permits", "003", "مجوزها، استاندارد و اظهار صادراتی پیگیری شد", "Permits, standard checks, and export declaration tracked", { publicLabel: publicCustomsLabel }),
    step("export_dispatch", "004", "حمل تا بندر و تحویل به پایانه ثبت شد", "Dispatch to port and terminal handover recorded", { publicLabel: publicTransitLabel }),
    step("export_exit", "005", "تشریفات خروج، توزین و بارگیری تکمیل شد", "Exit formalities, weighing, and loading completed"),
    step("export_delivery", "006", "ارسال دریایی و تحویل مقصد پیگیری شد", "Sea shipment and destination delivery tracked"),
    step("export_followup", "007", "اسناد نهایی و تسویه پرونده ثبت شد", "Final docs and settlement recorded", { publicLabel: publicDoneLabel }),
  ],
  EXPORT_AIR_CARGO: [
    step("export_file", "001", "پرونده صادرات هوایی تشکیل شد", "Air export file opened", { publicLabel: publicFileLabel }),
    step("export_goods_docs", "002", "کالا، پکینگ و اسناد حمل هوایی آماده شد", "Goods, packing, and air cargo docs prepared"),
    step("export_permits", "003", "مجوزها و اظهار صادرات هوایی ثبت شد", "Air export permits and declaration registered", { publicLabel: publicCustomsLabel }),
    step("export_dispatch", "004", "تحویل به فرودگاه، AWB و پرواز پیگیری شد", "Airport handover, AWB, and flight tracked", { publicLabel: publicTransitLabel }),
    step("export_exit", "005", "تشریفات خروج فرودگاهی تکمیل شد", "Airport exit formalities completed"),
    step("export_delivery", "006", "ارسال هوایی و تحویل مقصد پیگیری شد", "Air shipment and destination delivery tracked"),
    step("export_followup", "007", "اسناد نهایی و بستن پرونده انجام شد", "Final docs and case closure completed", { publicLabel: publicDoneLabel }),
  ],
  EXPORT_LAND_TRUCK: [
    step("export_file", "001", "پرونده صادرات زمینی تشکیل شد", "Land export file opened", { publicLabel: publicFileLabel }),
    step("export_goods_docs", "002", "کالا، CMR و اسناد صادراتی آماده شد", "Goods, CMR, and export docs prepared"),
    step("export_permits", "003", "مجوزها و اظهار صادراتی ثبت شد", "Permits and export declaration registered", { publicLabel: publicCustomsLabel }),
    step("export_dispatch", "004", "کامیون، راننده و حمل تا مرز ثبت شد", "Truck, driver, and border dispatch recorded", { publicLabel: publicTransitLabel }),
    step("export_exit", "005", "تشریفات خروج مرزی تکمیل شد", "Border exit formalities completed"),
    step("export_delivery", "006", "عبور مرز و تحویل مقصد پیگیری شد", "Border crossing and destination handover tracked"),
    step("export_followup", "007", "اسناد نهایی و تسویه پرونده ثبت شد", "Final docs and case settlement recorded", { publicLabel: publicDoneLabel }),
  ],
};

const templateMeta = [
  ["IMPORT_LENJ", "swt-import-lenj-v1", "WF_IMPORT_LENJ_V1", "import", "sea", "گردش کار واردات با لنج", "Lenj import workflow"],
  ["IMPORT_SEA_CONTAINER", "swt-import-sea-container-v1", "WF_IMPORT_SEA_CONTAINER_V1", "import", "sea", "گردش کار واردات دریایی کانتینری", "Sea container import workflow"],
  ["IMPORT_SEA_BULK", "swt-import-sea-bulk-v1", "WF_IMPORT_SEA_BULK_V1", "import", "sea", "گردش کار واردات دریایی فله / جنرال کارگو", "Sea bulk import workflow"],
  ["IMPORT_AIR_CARGO", "swt-import-air-cargo-v1", "WF_IMPORT_AIR_CARGO_V1", "import", "air", "گردش کار واردات هوایی", "Air cargo import workflow"],
  ["IMPORT_LAND_TRUCK", "swt-import-land-truck-v1", "WF_IMPORT_LAND_TRUCK_V1", "import", "land", "گردش کار واردات زمینی", "Land truck import workflow"],
  ["EXPORT_LENJ", "swt-export-lenj-v1", "WF_EXPORT_LENJ_V1", "export", "sea", "گردش کار صادرات با لنج", "Lenj export workflow"],
  ["EXPORT_SEA_CONTAINER", "swt-export-sea-container-v1", "WF_EXPORT_SEA_CONTAINER_V1", "export", "sea", "گردش کار صادرات دریایی کانتینری", "Sea container export workflow"],
  ["EXPORT_SEA_BULK", "swt-export-sea-bulk-v1", "WF_EXPORT_SEA_BULK_V1", "export", "sea", "گردش کار صادرات دریایی فله / جنرال کارگو", "Sea bulk export workflow"],
  ["EXPORT_AIR_CARGO", "swt-export-air-cargo-v1", "WF_EXPORT_AIR_CARGO_V1", "export", "air", "گردش کار صادرات هوایی", "Air cargo export workflow"],
  ["EXPORT_LAND_TRUCK", "swt-export-land-truck-v1", "WF_EXPORT_LAND_TRUCK_V1", "export", "land", "گردش کار صادرات زمینی", "Land truck export workflow"],
];

export const LEGACY_IR_IMPORT_CUSTOMS_WORKFLOW_TEMPLATE = template({
  id: "swt-ir-import-customs-v1",
  code: IR_IMPORT_CUSTOMS_WORKFLOW_KEY,
  shipmentTypeCode: "IMPORT_SEA_CONTAINER",
  shipmentDirection: "import",
  transportMode: "sea",
  titleFa: "فرآیند واردات و ترخیص ایران",
  titleEn: "Iran import customs progression",
  description: "Controlled legacy V1 shipment progress template for Iran import customs workflows.",
  phases: IR_IMPORT_CUSTOMS_PHASES.map((item) => phase(item.id, item.labelFa, item.labelEn)),
  steps: IR_IMPORT_CUSTOMS_STEPS.map((item) => step(
    item.phaseId,
    item.code,
    item.labelFa,
    item.labelEn,
    {
      publicLabel: item.phaseId === "customs_route" ? "پرونده در حال بررسی گمرکی است" : item.labelFa,
      visibilityRule: item.phaseId === "customs_route" ? { type: "iran_customs_route_v1" } : {},
    }
  )),
});

export const PREDEFINED_SHIPMENT_WORKFLOW_TEMPLATES = templateMeta.map(([
  shipmentTypeCode,
  id,
  code,
  shipmentDirection,
  transportMode,
  titleFa,
  titleEn,
]) => template({
  id,
  code,
  shipmentTypeCode,
  shipmentDirection,
  transportMode,
  titleFa,
  titleEn,
  description: `Predefined V1 workflow template for ${shipmentTypeCode}.`,
  phases: shipmentDirection === "import" ? importPhases : exportPhases,
  steps: presetSteps[shipmentTypeCode],
}));

export const SEEDED_SHIPMENT_WORKFLOW_TEMPLATES = [
  LEGACY_IR_IMPORT_CUSTOMS_WORKFLOW_TEMPLATE,
  ...PREDEFINED_SHIPMENT_WORKFLOW_TEMPLATES,
];

export const PREDEFINED_SHIPMENT_TYPE_WORKFLOW_MAPPINGS = PREDEFINED_SHIPMENT_WORKFLOW_TEMPLATES.map((item) => ({
  shipmentTypeCode: item.shipmentTypeCode,
  templateId: item.id,
  workflowTemplateCode: item.code,
  workflowTemplateVersion: item.version,
}));

export const PREDEFINED_WORKFLOW_TEMPLATE_BY_SHIPMENT_TYPE = new Map(
  PREDEFINED_SHIPMENT_WORKFLOW_TEMPLATES.map((item) => [item.shipmentTypeCode, item])
);
