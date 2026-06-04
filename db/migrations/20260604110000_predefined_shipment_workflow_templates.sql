-- Seed predefined V1 workflow templates for each supported import/export shipment variation.
-- This migration is additive/idempotent and only changes active default mappings for future workflow starts.
-- Existing shipment workflow instances keep their stored snapshots.

WITH template_seed AS (
  SELECT *
  FROM jsonb_to_recordset($workflow_templates$
[
  {
    "id": "swt-import-lenj-v1",
    "code": "WF_IMPORT_LENJ_V1",
    "shipmentTypeCode": "IMPORT_LENJ",
    "shipmentDirection": "import",
    "transportMode": "sea",
    "titleFa": "گردش کار واردات با لنج",
    "titleEn": "Lenj import workflow",
    "description": "Predefined V1 workflow template for IMPORT_LENJ.",
    "phases": [
      {
        "key": "order_registration",
        "fa": "تشکیل پرونده",
        "en": "File setup",
        "visible": true
      },
      {
        "key": "fx_bank",
        "fa": "اسناد اولیه و مالی",
        "en": "Initial and financial documents",
        "visible": true
      },
      {
        "key": "shipping_origin",
        "fa": "حمل و مبدا",
        "en": "Transport and origin",
        "visible": true
      },
      {
        "key": "iran_arrival",
        "fa": "ورود و تحویل",
        "en": "Arrival and handover",
        "visible": true
      },
      {
        "key": "customs_declaration",
        "fa": "اظهار و کوتاژ",
        "en": "Declaration and cotage",
        "visible": true
      },
      {
        "key": "customs_route",
        "fa": "ارزیابی و مجوزها",
        "en": "Assessment and permits",
        "visible": true
      },
      {
        "key": "payment_release",
        "fa": "پرداخت ها",
        "en": "Payments",
        "visible": true
      },
      {
        "key": "gate_exit",
        "fa": "خروج و پیگیری",
        "en": "Exit and follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "order_registration",
        "key": "001",
        "fa": "پرونده واردات با لنج تشکیل شد",
        "en": "Lenj import file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "fx_bank",
        "key": "002",
        "fa": "اسناد اولیه، صاحب کالا و کارت بازرگانی بررسی شد",
        "en": "Initial docs and trader profile checked",
        "public": "اسناد اولیه، صاحب کالا و کارت بازرگانی بررسی شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "shipping_origin",
        "key": "003",
        "fa": "اطلاعات لنج، ناخدا و بندر مبدا ثبت شد",
        "en": "Lenj, captain, and origin port recorded",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "iran_arrival",
        "key": "004",
        "fa": "ورود لنج، تخلیه و قبض انبار پیگیری شد",
        "en": "Lenj arrival, discharge, and warehouse receipt tracked",
        "public": "ورود لنج، تخلیه و قبض انبار پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_declaration",
        "key": "005",
        "fa": "اظهارنامه و شماره کوتاژ ثبت شد",
        "en": "Declaration and cotage registered",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_route",
        "key": "006",
        "fa": "ارزیابی بندر محلی و مجوزها پیگیری شد",
        "en": "Local port assessment and permits tracked",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "payment_release",
        "key": "007",
        "fa": "پرداخت های گمرکی و انبارداری تسویه شد",
        "en": "Customs and warehouse payments settled",
        "public": "پرداخت های گمرکی و انبارداری تسویه شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "gate_exit",
        "key": "008",
        "fa": "خروج از بندر و تحویل به مقصد ثبت شد",
        "en": "Port exit and delivery recorded",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  },
  {
    "id": "swt-import-sea-container-v1",
    "code": "WF_IMPORT_SEA_CONTAINER_V1",
    "shipmentTypeCode": "IMPORT_SEA_CONTAINER",
    "shipmentDirection": "import",
    "transportMode": "sea",
    "titleFa": "گردش کار واردات دریایی کانتینری",
    "titleEn": "Sea container import workflow",
    "description": "Predefined V1 workflow template for IMPORT_SEA_CONTAINER.",
    "phases": [
      {
        "key": "order_registration",
        "fa": "تشکیل پرونده",
        "en": "File setup",
        "visible": true
      },
      {
        "key": "fx_bank",
        "fa": "اسناد اولیه و مالی",
        "en": "Initial and financial documents",
        "visible": true
      },
      {
        "key": "shipping_origin",
        "fa": "حمل و مبدا",
        "en": "Transport and origin",
        "visible": true
      },
      {
        "key": "iran_arrival",
        "fa": "ورود و تحویل",
        "en": "Arrival and handover",
        "visible": true
      },
      {
        "key": "customs_declaration",
        "fa": "اظهار و کوتاژ",
        "en": "Declaration and cotage",
        "visible": true
      },
      {
        "key": "customs_route",
        "fa": "ارزیابی و مجوزها",
        "en": "Assessment and permits",
        "visible": true
      },
      {
        "key": "payment_release",
        "fa": "پرداخت ها",
        "en": "Payments",
        "visible": true
      },
      {
        "key": "gate_exit",
        "fa": "خروج و پیگیری",
        "en": "Exit and follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "order_registration",
        "key": "001",
        "fa": "پرونده واردات کانتینری تشکیل شد",
        "en": "Container import file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "fx_bank",
        "key": "002",
        "fa": "ثبت سفارش، پروفرما و اطلاعات مالی بررسی شد",
        "en": "Order registration, proforma, and finance checked",
        "public": "ثبت سفارش، پروفرما و اطلاعات مالی بررسی شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "shipping_origin",
        "key": "003",
        "fa": "رزرو حمل، کشتی و بارنامه کانتینری ثبت شد",
        "en": "Booking, vessel, and container B/L recorded",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "iran_arrival",
        "key": "004",
        "fa": "اعلامیه ورود، ترخیصیه و قبض انبار دریافت شد",
        "en": "Arrival notice, delivery order, and warehouse receipt received",
        "public": "اعلامیه ورود، ترخیصیه و قبض انبار دریافت شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_declaration",
        "key": "005",
        "fa": "اظهارنامه EPL و کوتاژ ثبت شد",
        "en": "EPL declaration and cotage registered",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_route",
        "key": "006",
        "fa": "مسیر گمرکی، ارزیابی و مجوزها پیگیری شد",
        "en": "Customs route, assessment, and permits tracked",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "payment_release",
        "key": "007",
        "fa": "حقوق ورودی، ترمینال و انبارداری تسویه شد",
        "en": "Duties, terminal, and storage charges settled",
        "public": "حقوق ورودی، ترمینال و انبارداری تسویه شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "gate_exit",
        "key": "008",
        "fa": "مجوز بارگیری، خروج و تحویل نهایی ثبت شد",
        "en": "Loading permit, gate exit, and delivery recorded",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  },
  {
    "id": "swt-import-sea-bulk-v1",
    "code": "WF_IMPORT_SEA_BULK_V1",
    "shipmentTypeCode": "IMPORT_SEA_BULK",
    "shipmentDirection": "import",
    "transportMode": "sea",
    "titleFa": "گردش کار واردات دریایی فله / جنرال کارگو",
    "titleEn": "Sea bulk import workflow",
    "description": "Predefined V1 workflow template for IMPORT_SEA_BULK.",
    "phases": [
      {
        "key": "order_registration",
        "fa": "تشکیل پرونده",
        "en": "File setup",
        "visible": true
      },
      {
        "key": "fx_bank",
        "fa": "اسناد اولیه و مالی",
        "en": "Initial and financial documents",
        "visible": true
      },
      {
        "key": "shipping_origin",
        "fa": "حمل و مبدا",
        "en": "Transport and origin",
        "visible": true
      },
      {
        "key": "iran_arrival",
        "fa": "ورود و تحویل",
        "en": "Arrival and handover",
        "visible": true
      },
      {
        "key": "customs_declaration",
        "fa": "اظهار و کوتاژ",
        "en": "Declaration and cotage",
        "visible": true
      },
      {
        "key": "customs_route",
        "fa": "ارزیابی و مجوزها",
        "en": "Assessment and permits",
        "visible": true
      },
      {
        "key": "payment_release",
        "fa": "پرداخت ها",
        "en": "Payments",
        "visible": true
      },
      {
        "key": "gate_exit",
        "fa": "خروج و پیگیری",
        "en": "Exit and follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "order_registration",
        "key": "001",
        "fa": "پرونده واردات فله / جنرال کارگو تشکیل شد",
        "en": "Bulk/general cargo import file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "fx_bank",
        "key": "002",
        "fa": "اسناد خرید، ارزش و اطلاعات مالی بررسی شد",
        "en": "Purchase docs, value, and finance checked",
        "public": "اسناد خرید، ارزش و اطلاعات مالی بررسی شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "shipping_origin",
        "key": "003",
        "fa": "کشتی، بارنامه و مشخصات بار فله ثبت شد",
        "en": "Vessel, B/L, and bulk cargo details recorded",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "iran_arrival",
        "key": "004",
        "fa": "ورود، تخلیه، توزین و قبض انبار پیگیری شد",
        "en": "Arrival, discharge, weighing, and receipt tracked",
        "public": "ورود، تخلیه، توزین و قبض انبار پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_declaration",
        "key": "005",
        "fa": "اظهار و کوتاژ برای کالای فله ثبت شد",
        "en": "Bulk cargo declaration and cotage registered",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_route",
        "key": "006",
        "fa": "نمونه برداری، ارزیابی و مجوزها پیگیری شد",
        "en": "Sampling, assessment, and permits tracked",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "payment_release",
        "key": "007",
        "fa": "پرداخت های گمرکی و هزینه های بندری تسویه شد",
        "en": "Customs and port charges settled",
        "public": "پرداخت های گمرکی و هزینه های بندری تسویه شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "gate_exit",
        "key": "008",
        "fa": "مجوز خروج و تحویل کالای فله ثبت شد",
        "en": "Bulk cargo exit permit and delivery recorded",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  },
  {
    "id": "swt-import-air-cargo-v1",
    "code": "WF_IMPORT_AIR_CARGO_V1",
    "shipmentTypeCode": "IMPORT_AIR_CARGO",
    "shipmentDirection": "import",
    "transportMode": "air",
    "titleFa": "گردش کار واردات هوایی",
    "titleEn": "Air cargo import workflow",
    "description": "Predefined V1 workflow template for IMPORT_AIR_CARGO.",
    "phases": [
      {
        "key": "order_registration",
        "fa": "تشکیل پرونده",
        "en": "File setup",
        "visible": true
      },
      {
        "key": "fx_bank",
        "fa": "اسناد اولیه و مالی",
        "en": "Initial and financial documents",
        "visible": true
      },
      {
        "key": "shipping_origin",
        "fa": "حمل و مبدا",
        "en": "Transport and origin",
        "visible": true
      },
      {
        "key": "iran_arrival",
        "fa": "ورود و تحویل",
        "en": "Arrival and handover",
        "visible": true
      },
      {
        "key": "customs_declaration",
        "fa": "اظهار و کوتاژ",
        "en": "Declaration and cotage",
        "visible": true
      },
      {
        "key": "customs_route",
        "fa": "ارزیابی و مجوزها",
        "en": "Assessment and permits",
        "visible": true
      },
      {
        "key": "payment_release",
        "fa": "پرداخت ها",
        "en": "Payments",
        "visible": true
      },
      {
        "key": "gate_exit",
        "fa": "خروج و پیگیری",
        "en": "Exit and follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "order_registration",
        "key": "001",
        "fa": "پرونده واردات هوایی تشکیل شد",
        "en": "Air cargo import file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "fx_bank",
        "key": "002",
        "fa": "اسناد اولیه و اطلاعات مالی محموله هوایی بررسی شد",
        "en": "Initial and finance docs checked",
        "public": "اسناد اولیه و اطلاعات مالی محموله هوایی بررسی شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "shipping_origin",
        "key": "003",
        "fa": "AWB، پرواز و ایرلاین ثبت شد",
        "en": "AWB, flight, and airline recorded",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "iran_arrival",
        "key": "004",
        "fa": "ورود فرودگاهی و تحویل انبار هوایی پیگیری شد",
        "en": "Airport arrival and air warehouse handover tracked",
        "public": "ورود فرودگاهی و تحویل انبار هوایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_declaration",
        "key": "005",
        "fa": "اظهار سریع و کوتاژ هوایی ثبت شد",
        "en": "Air declaration and cotage registered",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_route",
        "key": "006",
        "fa": "ارزیابی و مجوزهای ترخیص هوایی پیگیری شد",
        "en": "Air clearance assessment and permits tracked",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "payment_release",
        "key": "007",
        "fa": "پرداخت های گمرکی و انبار فرودگاه تسویه شد",
        "en": "Customs and airport storage charges settled",
        "public": "پرداخت های گمرکی و انبار فرودگاه تسویه شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "gate_exit",
        "key": "008",
        "fa": "خروج از انبار هوایی و تحویل ثبت شد",
        "en": "Air warehouse exit and delivery recorded",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  },
  {
    "id": "swt-import-land-truck-v1",
    "code": "WF_IMPORT_LAND_TRUCK_V1",
    "shipmentTypeCode": "IMPORT_LAND_TRUCK",
    "shipmentDirection": "import",
    "transportMode": "land",
    "titleFa": "گردش کار واردات زمینی",
    "titleEn": "Land truck import workflow",
    "description": "Predefined V1 workflow template for IMPORT_LAND_TRUCK.",
    "phases": [
      {
        "key": "order_registration",
        "fa": "تشکیل پرونده",
        "en": "File setup",
        "visible": true
      },
      {
        "key": "fx_bank",
        "fa": "اسناد اولیه و مالی",
        "en": "Initial and financial documents",
        "visible": true
      },
      {
        "key": "shipping_origin",
        "fa": "حمل و مبدا",
        "en": "Transport and origin",
        "visible": true
      },
      {
        "key": "iran_arrival",
        "fa": "ورود و تحویل",
        "en": "Arrival and handover",
        "visible": true
      },
      {
        "key": "customs_declaration",
        "fa": "اظهار و کوتاژ",
        "en": "Declaration and cotage",
        "visible": true
      },
      {
        "key": "customs_route",
        "fa": "ارزیابی و مجوزها",
        "en": "Assessment and permits",
        "visible": true
      },
      {
        "key": "payment_release",
        "fa": "پرداخت ها",
        "en": "Payments",
        "visible": true
      },
      {
        "key": "gate_exit",
        "fa": "خروج و پیگیری",
        "en": "Exit and follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "order_registration",
        "key": "001",
        "fa": "پرونده واردات زمینی تشکیل شد",
        "en": "Land import file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "fx_bank",
        "key": "002",
        "fa": "اسناد اولیه، ثبت سفارش و مالی بررسی شد",
        "en": "Initial, order, and finance docs checked",
        "public": "اسناد اولیه، ثبت سفارش و مالی بررسی شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "shipping_origin",
        "key": "003",
        "fa": "CMR، پلاک کامیون و راننده ثبت شد",
        "en": "CMR, truck plate, and driver recorded",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "iran_arrival",
        "key": "004",
        "fa": "ورود مرزی، باسکول و قبض انبار پیگیری شد",
        "en": "Border entry, weighbridge, and receipt tracked",
        "public": "ورود مرزی، باسکول و قبض انبار پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_declaration",
        "key": "005",
        "fa": "اظهار مرزی و کوتاژ ثبت شد",
        "en": "Border declaration and cotage registered",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "customs_route",
        "key": "006",
        "fa": "ارزیابی مرز و مجوزهای ترخیص پیگیری شد",
        "en": "Border assessment and clearance permits tracked",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "payment_release",
        "key": "007",
        "fa": "پرداخت های گمرکی و هزینه های مرزی تسویه شد",
        "en": "Customs and border charges settled",
        "public": "پرداخت های گمرکی و هزینه های مرزی تسویه شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "gate_exit",
        "key": "008",
        "fa": "خروج کامیون و تحویل مقصد ثبت شد",
        "en": "Truck exit and destination delivery recorded",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  },
  {
    "id": "swt-export-lenj-v1",
    "code": "WF_EXPORT_LENJ_V1",
    "shipmentTypeCode": "EXPORT_LENJ",
    "shipmentDirection": "export",
    "transportMode": "sea",
    "titleFa": "گردش کار صادرات با لنج",
    "titleEn": "Lenj export workflow",
    "description": "Predefined V1 workflow template for EXPORT_LENJ.",
    "phases": [
      {
        "key": "export_file",
        "fa": "تشکیل پرونده صادرات",
        "en": "Export file setup",
        "visible": true
      },
      {
        "key": "export_goods_docs",
        "fa": "آماده سازی کالا و اسناد",
        "en": "Goods and document readiness",
        "visible": true
      },
      {
        "key": "export_permits",
        "fa": "مجوزها و اظهار صادراتی",
        "en": "Permits and export declaration",
        "visible": true
      },
      {
        "key": "export_dispatch",
        "fa": "حمل تا مرز یا پایانه",
        "en": "Dispatch to border or terminal",
        "visible": true
      },
      {
        "key": "export_exit",
        "fa": "تشریفات خروج",
        "en": "Exit formalities",
        "visible": true
      },
      {
        "key": "export_delivery",
        "fa": "ارسال و تحویل",
        "en": "Shipment and delivery",
        "visible": true
      },
      {
        "key": "export_followup",
        "fa": "پیگیری نهایی",
        "en": "Final follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "export_file",
        "key": "001",
        "fa": "پرونده صادرات با لنج تشکیل شد",
        "en": "Lenj export file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_goods_docs",
        "key": "002",
        "fa": "کالا، بسته بندی و اسناد صادراتی آماده شد",
        "en": "Goods, packing, and export docs prepared",
        "public": "کالا، بسته بندی و اسناد صادراتی آماده شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_permits",
        "key": "003",
        "fa": "مجوزها و اظهار صادراتی ثبت شد",
        "en": "Permits and export declaration registered",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_dispatch",
        "key": "004",
        "fa": "حمل کالا تا بندر و تحویل به لنج پیگیری شد",
        "en": "Dispatch to port and handover to lenj tracked",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_exit",
        "key": "005",
        "fa": "تشریفات خروج بندری تکمیل شد",
        "en": "Port exit formalities completed",
        "public": "تشریفات خروج بندری تکمیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_delivery",
        "key": "006",
        "fa": "ارسال با لنج و تحویل مقصد پیگیری شد",
        "en": "Lenj shipment and destination handover tracked",
        "public": "ارسال با لنج و تحویل مقصد پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_followup",
        "key": "007",
        "fa": "اسناد نهایی و تسویه پرونده ثبت شد",
        "en": "Final docs and case settlement recorded",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  },
  {
    "id": "swt-export-sea-container-v1",
    "code": "WF_EXPORT_SEA_CONTAINER_V1",
    "shipmentTypeCode": "EXPORT_SEA_CONTAINER",
    "shipmentDirection": "export",
    "transportMode": "sea",
    "titleFa": "گردش کار صادرات دریایی کانتینری",
    "titleEn": "Sea container export workflow",
    "description": "Predefined V1 workflow template for EXPORT_SEA_CONTAINER.",
    "phases": [
      {
        "key": "export_file",
        "fa": "تشکیل پرونده صادرات",
        "en": "Export file setup",
        "visible": true
      },
      {
        "key": "export_goods_docs",
        "fa": "آماده سازی کالا و اسناد",
        "en": "Goods and document readiness",
        "visible": true
      },
      {
        "key": "export_permits",
        "fa": "مجوزها و اظهار صادراتی",
        "en": "Permits and export declaration",
        "visible": true
      },
      {
        "key": "export_dispatch",
        "fa": "حمل تا مرز یا پایانه",
        "en": "Dispatch to border or terminal",
        "visible": true
      },
      {
        "key": "export_exit",
        "fa": "تشریفات خروج",
        "en": "Exit formalities",
        "visible": true
      },
      {
        "key": "export_delivery",
        "fa": "ارسال و تحویل",
        "en": "Shipment and delivery",
        "visible": true
      },
      {
        "key": "export_followup",
        "fa": "پیگیری نهایی",
        "en": "Final follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "export_file",
        "key": "001",
        "fa": "پرونده صادرات کانتینری تشکیل شد",
        "en": "Container export file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_goods_docs",
        "key": "002",
        "fa": "کالا، پکینگ لیست و فاکتور صادراتی آماده شد",
        "en": "Goods, packing list, and export invoice prepared",
        "public": "کالا، پکینگ لیست و فاکتور صادراتی آماده شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_permits",
        "key": "003",
        "fa": "مجوزها و اظهار صادراتی ثبت شد",
        "en": "Permits and export declaration registered",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_dispatch",
        "key": "004",
        "fa": "رزرو، تحویل کانتینر و حمل تا بندر پیگیری شد",
        "en": "Booking, container handover, and port dispatch tracked",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_exit",
        "key": "005",
        "fa": "تشریفات گمرک خروج و بارگیری کشتی تکمیل شد",
        "en": "Export customs and vessel loading completed",
        "public": "تشریفات گمرک خروج و بارگیری کشتی تکمیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_delivery",
        "key": "006",
        "fa": "بارنامه، ارسال و تحویل مقصد پیگیری شد",
        "en": "B/L, shipment, and destination handover tracked",
        "public": "بارنامه، ارسال و تحویل مقصد پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_followup",
        "key": "007",
        "fa": "اسناد نهایی و بستن پرونده انجام شد",
        "en": "Final docs and case closure completed",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  },
  {
    "id": "swt-export-sea-bulk-v1",
    "code": "WF_EXPORT_SEA_BULK_V1",
    "shipmentTypeCode": "EXPORT_SEA_BULK",
    "shipmentDirection": "export",
    "transportMode": "sea",
    "titleFa": "گردش کار صادرات دریایی فله / جنرال کارگو",
    "titleEn": "Sea bulk export workflow",
    "description": "Predefined V1 workflow template for EXPORT_SEA_BULK.",
    "phases": [
      {
        "key": "export_file",
        "fa": "تشکیل پرونده صادرات",
        "en": "Export file setup",
        "visible": true
      },
      {
        "key": "export_goods_docs",
        "fa": "آماده سازی کالا و اسناد",
        "en": "Goods and document readiness",
        "visible": true
      },
      {
        "key": "export_permits",
        "fa": "مجوزها و اظهار صادراتی",
        "en": "Permits and export declaration",
        "visible": true
      },
      {
        "key": "export_dispatch",
        "fa": "حمل تا مرز یا پایانه",
        "en": "Dispatch to border or terminal",
        "visible": true
      },
      {
        "key": "export_exit",
        "fa": "تشریفات خروج",
        "en": "Exit formalities",
        "visible": true
      },
      {
        "key": "export_delivery",
        "fa": "ارسال و تحویل",
        "en": "Shipment and delivery",
        "visible": true
      },
      {
        "key": "export_followup",
        "fa": "پیگیری نهایی",
        "en": "Final follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "export_file",
        "key": "001",
        "fa": "پرونده صادرات فله / جنرال کارگو تشکیل شد",
        "en": "Bulk/general cargo export file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_goods_docs",
        "key": "002",
        "fa": "کالا، وزن، بسته بندی و اسناد آماده شد",
        "en": "Goods, weight, packing, and docs prepared",
        "public": "کالا، وزن، بسته بندی و اسناد آماده شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_permits",
        "key": "003",
        "fa": "مجوزها، استاندارد و اظهار صادراتی پیگیری شد",
        "en": "Permits, standard checks, and export declaration tracked",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_dispatch",
        "key": "004",
        "fa": "حمل تا بندر و تحویل به پایانه ثبت شد",
        "en": "Dispatch to port and terminal handover recorded",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_exit",
        "key": "005",
        "fa": "تشریفات خروج، توزین و بارگیری تکمیل شد",
        "en": "Exit formalities, weighing, and loading completed",
        "public": "تشریفات خروج، توزین و بارگیری تکمیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_delivery",
        "key": "006",
        "fa": "ارسال دریایی و تحویل مقصد پیگیری شد",
        "en": "Sea shipment and destination delivery tracked",
        "public": "ارسال دریایی و تحویل مقصد پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_followup",
        "key": "007",
        "fa": "اسناد نهایی و تسویه پرونده ثبت شد",
        "en": "Final docs and settlement recorded",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  },
  {
    "id": "swt-export-air-cargo-v1",
    "code": "WF_EXPORT_AIR_CARGO_V1",
    "shipmentTypeCode": "EXPORT_AIR_CARGO",
    "shipmentDirection": "export",
    "transportMode": "air",
    "titleFa": "گردش کار صادرات هوایی",
    "titleEn": "Air cargo export workflow",
    "description": "Predefined V1 workflow template for EXPORT_AIR_CARGO.",
    "phases": [
      {
        "key": "export_file",
        "fa": "تشکیل پرونده صادرات",
        "en": "Export file setup",
        "visible": true
      },
      {
        "key": "export_goods_docs",
        "fa": "آماده سازی کالا و اسناد",
        "en": "Goods and document readiness",
        "visible": true
      },
      {
        "key": "export_permits",
        "fa": "مجوزها و اظهار صادراتی",
        "en": "Permits and export declaration",
        "visible": true
      },
      {
        "key": "export_dispatch",
        "fa": "حمل تا مرز یا پایانه",
        "en": "Dispatch to border or terminal",
        "visible": true
      },
      {
        "key": "export_exit",
        "fa": "تشریفات خروج",
        "en": "Exit formalities",
        "visible": true
      },
      {
        "key": "export_delivery",
        "fa": "ارسال و تحویل",
        "en": "Shipment and delivery",
        "visible": true
      },
      {
        "key": "export_followup",
        "fa": "پیگیری نهایی",
        "en": "Final follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "export_file",
        "key": "001",
        "fa": "پرونده صادرات هوایی تشکیل شد",
        "en": "Air export file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_goods_docs",
        "key": "002",
        "fa": "کالا، پکینگ و اسناد حمل هوایی آماده شد",
        "en": "Goods, packing, and air cargo docs prepared",
        "public": "کالا، پکینگ و اسناد حمل هوایی آماده شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_permits",
        "key": "003",
        "fa": "مجوزها و اظهار صادرات هوایی ثبت شد",
        "en": "Air export permits and declaration registered",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_dispatch",
        "key": "004",
        "fa": "تحویل به فرودگاه، AWB و پرواز پیگیری شد",
        "en": "Airport handover, AWB, and flight tracked",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_exit",
        "key": "005",
        "fa": "تشریفات خروج فرودگاهی تکمیل شد",
        "en": "Airport exit formalities completed",
        "public": "تشریفات خروج فرودگاهی تکمیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_delivery",
        "key": "006",
        "fa": "ارسال هوایی و تحویل مقصد پیگیری شد",
        "en": "Air shipment and destination delivery tracked",
        "public": "ارسال هوایی و تحویل مقصد پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_followup",
        "key": "007",
        "fa": "اسناد نهایی و بستن پرونده انجام شد",
        "en": "Final docs and case closure completed",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  },
  {
    "id": "swt-export-land-truck-v1",
    "code": "WF_EXPORT_LAND_TRUCK_V1",
    "shipmentTypeCode": "EXPORT_LAND_TRUCK",
    "shipmentDirection": "export",
    "transportMode": "land",
    "titleFa": "گردش کار صادرات زمینی",
    "titleEn": "Land truck export workflow",
    "description": "Predefined V1 workflow template for EXPORT_LAND_TRUCK.",
    "phases": [
      {
        "key": "export_file",
        "fa": "تشکیل پرونده صادرات",
        "en": "Export file setup",
        "visible": true
      },
      {
        "key": "export_goods_docs",
        "fa": "آماده سازی کالا و اسناد",
        "en": "Goods and document readiness",
        "visible": true
      },
      {
        "key": "export_permits",
        "fa": "مجوزها و اظهار صادراتی",
        "en": "Permits and export declaration",
        "visible": true
      },
      {
        "key": "export_dispatch",
        "fa": "حمل تا مرز یا پایانه",
        "en": "Dispatch to border or terminal",
        "visible": true
      },
      {
        "key": "export_exit",
        "fa": "تشریفات خروج",
        "en": "Exit formalities",
        "visible": true
      },
      {
        "key": "export_delivery",
        "fa": "ارسال و تحویل",
        "en": "Shipment and delivery",
        "visible": true
      },
      {
        "key": "export_followup",
        "fa": "پیگیری نهایی",
        "en": "Final follow-up",
        "visible": true
      }
    ],
    "steps": [
      {
        "phase": "export_file",
        "key": "001",
        "fa": "پرونده صادرات زمینی تشکیل شد",
        "en": "Land export file opened",
        "public": "پرونده محموله تشکیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_goods_docs",
        "key": "002",
        "fa": "کالا، CMR و اسناد صادراتی آماده شد",
        "en": "Goods, CMR, and export docs prepared",
        "public": "کالا، CMR و اسناد صادراتی آماده شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_permits",
        "key": "003",
        "fa": "مجوزها و اظهار صادراتی ثبت شد",
        "en": "Permits and export declaration registered",
        "public": "پرونده در حال پیگیری تشریفات گمرکی است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_dispatch",
        "key": "004",
        "fa": "کامیون، راننده و حمل تا مرز ثبت شد",
        "en": "Truck, driver, and border dispatch recorded",
        "public": "محموله در حال پیگیری حمل است",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_exit",
        "key": "005",
        "fa": "تشریفات خروج مرزی تکمیل شد",
        "en": "Border exit formalities completed",
        "public": "تشریفات خروج مرزی تکمیل شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_delivery",
        "key": "006",
        "fa": "عبور مرز و تحویل مقصد پیگیری شد",
        "en": "Border crossing and destination handover tracked",
        "public": "عبور مرز و تحویل مقصد پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      },
      {
        "phase": "export_followup",
        "key": "007",
        "fa": "اسناد نهایی و تسویه پرونده ثبت شد",
        "en": "Final docs and case settlement recorded",
        "public": "پرونده برای تحویل نهایی پیگیری شد",
        "required": true,
        "visible": true,
        "customerVisible": true,
        "role": null,
        "expectedHours": null,
        "taskPolicy": {
          "mode": "suggested"
        },
        "expectedDocuments": [],
        "expectedFormFields": [],
        "nextStepRules": {},
        "visibilityRule": {}
      }
    ]
  }
]
$workflow_templates$::jsonb) AS t(
    id TEXT,
    code TEXT,
    "shipmentTypeCode" TEXT,
    "shipmentDirection" TEXT,
    "transportMode" TEXT,
    "titleFa" TEXT,
    "titleEn" TEXT,
    description TEXT,
    phases JSONB,
    steps JSONB
  )
),
upsert_templates AS (
  INSERT INTO shipment_workflow_templates (
    id, organization_id, code, shipment_direction, transport_mode, shipment_type_hint,
    title_fa, title_en, description, is_system, is_active, version, published_at, created_at, updated_at
  )
  SELECT
    id,
    NULL,
    code,
    "shipmentDirection",
    "transportMode",
    "shipmentTypeCode",
    "titleFa",
    "titleEn",
    description,
    TRUE,
    TRUE,
    1,
    NOW(),
    NOW(),
    NOW()
  FROM template_seed
  ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    shipment_direction = EXCLUDED.shipment_direction,
    transport_mode = EXCLUDED.transport_mode,
    shipment_type_hint = EXCLUDED.shipment_type_hint,
    title_fa = EXCLUDED.title_fa,
    title_en = EXCLUDED.title_en,
    description = EXCLUDED.description,
    is_system = TRUE,
    is_active = TRUE,
    archived_at = NULL,
    updated_at = NOW()
  RETURNING id
),
phase_seed AS (
  SELECT
    seed.id AS template_id,
    phase_item.value->>'key' AS phase_key,
    phase_item.value->>'fa' AS label_fa,
    phase_item.value->>'en' AS label_en,
    phase_item.ordinality::int AS sort_order,
    COALESCE((phase_item.value->>'visible')::boolean, TRUE) AS is_visible
  FROM template_seed seed
  JOIN upsert_templates inserted_templates
    ON inserted_templates.id = seed.id
  CROSS JOIN LATERAL jsonb_array_elements(seed.phases) WITH ORDINALITY AS phase_item(value, ordinality)
),
upsert_phases AS (
  INSERT INTO shipment_workflow_template_phases (
    id, template_id, phase_key, label_fa, label_en, sort_order, is_visible, created_at, updated_at
  )
  SELECT
    template_id || '-phase-' || regexp_replace(lower(phase_key), '[^a-z0-9]+', '-', 'g'),
    template_id,
    phase_key,
    label_fa,
    label_en,
    sort_order,
    is_visible,
    NOW(),
    NOW()
  FROM phase_seed
  ON CONFLICT (template_id, phase_key) DO UPDATE SET
    label_fa = EXCLUDED.label_fa,
    label_en = EXCLUDED.label_en,
    sort_order = EXCLUDED.sort_order,
    is_visible = EXCLUDED.is_visible,
    updated_at = NOW()
  RETURNING id, template_id, phase_key
),
step_seed AS (
  SELECT
    seed.id AS template_id,
    step_item.value->>'phase' AS phase_key,
    step_item.value->>'key' AS step_key,
    step_item.value->>'fa' AS label_fa,
    step_item.value->>'en' AS label_en,
    COALESCE(step_item.value->>'public', step_item.value->>'fa') AS public_label,
    step_item.ordinality::int AS sort_order,
    COALESCE((step_item.value->>'required')::boolean, TRUE) AS is_required,
    COALESCE((step_item.value->>'visible')::boolean, TRUE) AS is_visible,
    COALESCE((step_item.value->>'customerVisible')::boolean, TRUE) AS is_customer_visible,
    NULLIF(step_item.value->>'role', '') AS role_suggestion,
    NULLIF(step_item.value->>'expectedHours', '')::int AS expected_duration_hours,
    COALESCE(step_item.value->'taskPolicy', '{"mode":"suggested"}'::jsonb) AS task_policy_json,
    COALESCE(step_item.value->'expectedDocuments', '[]'::jsonb) AS expected_documents_json,
    COALESCE(step_item.value->'expectedFormFields', '[]'::jsonb) AS expected_form_fields_json,
    COALESCE(step_item.value->'nextStepRules', '{}'::jsonb) AS next_step_rules_json,
    COALESCE(step_item.value->'visibilityRule', '{}'::jsonb) AS visibility_rule_json
  FROM template_seed seed
  CROSS JOIN LATERAL jsonb_array_elements(seed.steps) WITH ORDINALITY AS step_item(value, ordinality)
),
upsert_steps AS (
  INSERT INTO shipment_workflow_template_steps (
    id, template_id, phase_id, phase_key, step_key, label_fa, label_en, public_label,
    sort_order, is_required, is_visible, is_customer_visible, role_suggestion, expected_duration_hours,
    task_policy_json, expected_documents_json, expected_form_fields_json, next_step_rules_json,
    visibility_rule_json, created_at, updated_at
  )
  SELECT
    step_seed.template_id || '-step-' || regexp_replace(lower(step_seed.step_key), '[^a-z0-9]+', '-', 'g'),
    step_seed.template_id,
    phases.id,
    step_seed.phase_key,
    step_seed.step_key,
    step_seed.label_fa,
    step_seed.label_en,
    step_seed.public_label,
    step_seed.sort_order,
    step_seed.is_required,
    step_seed.is_visible,
    step_seed.is_customer_visible,
    step_seed.role_suggestion,
    step_seed.expected_duration_hours,
    step_seed.task_policy_json,
    step_seed.expected_documents_json,
    step_seed.expected_form_fields_json,
    step_seed.next_step_rules_json,
    step_seed.visibility_rule_json,
    NOW(),
    NOW()
  FROM step_seed
  JOIN shipment_workflow_template_phases phases
    ON phases.template_id = step_seed.template_id
   AND phases.phase_key = step_seed.phase_key
  ON CONFLICT (template_id, step_key) WHERE archived_at IS NULL DO UPDATE SET
    phase_id = EXCLUDED.phase_id,
    phase_key = EXCLUDED.phase_key,
    label_fa = EXCLUDED.label_fa,
    label_en = EXCLUDED.label_en,
    public_label = EXCLUDED.public_label,
    sort_order = EXCLUDED.sort_order,
    is_required = EXCLUDED.is_required,
    is_visible = EXCLUDED.is_visible,
    is_customer_visible = EXCLUDED.is_customer_visible,
    role_suggestion = EXCLUDED.role_suggestion,
    expected_duration_hours = EXCLUDED.expected_duration_hours,
    task_policy_json = EXCLUDED.task_policy_json,
    expected_documents_json = EXCLUDED.expected_documents_json,
    expected_form_fields_json = EXCLUDED.expected_form_fields_json,
    next_step_rules_json = EXCLUDED.next_step_rules_json,
    visibility_rule_json = EXCLUDED.visibility_rule_json,
    archived_at = NULL,
    updated_at = NOW()
  RETURNING id
)
SELECT COUNT(*) AS seeded_workflow_steps
FROM upsert_steps;

WITH mapping_seed(shipment_type_code, template_id, workflow_template_code, workflow_template_version) AS (
  VALUES
    ('IMPORT_LENJ', 'swt-import-lenj-v1', 'WF_IMPORT_LENJ_V1', 1),
    ('IMPORT_SEA_CONTAINER', 'swt-import-sea-container-v1', 'WF_IMPORT_SEA_CONTAINER_V1', 1),
    ('IMPORT_SEA_BULK', 'swt-import-sea-bulk-v1', 'WF_IMPORT_SEA_BULK_V1', 1),
    ('IMPORT_AIR_CARGO', 'swt-import-air-cargo-v1', 'WF_IMPORT_AIR_CARGO_V1', 1),
    ('IMPORT_LAND_TRUCK', 'swt-import-land-truck-v1', 'WF_IMPORT_LAND_TRUCK_V1', 1),
    ('EXPORT_LENJ', 'swt-export-lenj-v1', 'WF_EXPORT_LENJ_V1', 1),
    ('EXPORT_SEA_CONTAINER', 'swt-export-sea-container-v1', 'WF_EXPORT_SEA_CONTAINER_V1', 1),
    ('EXPORT_SEA_BULK', 'swt-export-sea-bulk-v1', 'WF_EXPORT_SEA_BULK_V1', 1),
    ('EXPORT_AIR_CARGO', 'swt-export-air-cargo-v1', 'WF_EXPORT_AIR_CARGO_V1', 1),
    ('EXPORT_LAND_TRUCK', 'swt-export-land-truck-v1', 'WF_EXPORT_LAND_TRUCK_V1', 1)
),
updated AS (
  UPDATE shipment_type_workflow_templates mapping
  SET workflow_template_id = seed.template_id,
      workflow_template_code = seed.workflow_template_code,
      workflow_template_version = seed.workflow_template_version,
      archived_at = NULL,
      updated_at = NOW()
  FROM mapping_seed seed
  WHERE mapping.organization_id IS NULL
    AND mapping.shipment_type_code = seed.shipment_type_code
    AND mapping.archived_at IS NULL
  RETURNING mapping.shipment_type_code
)
INSERT INTO shipment_type_workflow_templates (
  id, organization_id, shipment_type_code, workflow_template_id,
  workflow_template_code, workflow_template_version, created_at, updated_at
)
SELECT
  'stwt-global-' || lower(replace(seed.shipment_type_code, '_', '-')),
  NULL,
  seed.shipment_type_code,
  seed.template_id,
  seed.workflow_template_code,
  seed.workflow_template_version,
  NOW(),
  NOW()
FROM mapping_seed seed
WHERE NOT EXISTS (
  SELECT 1
  FROM shipment_type_workflow_templates mapping
  WHERE mapping.organization_id IS NULL
    AND mapping.shipment_type_code = seed.shipment_type_code
    AND mapping.archived_at IS NULL
)
ON CONFLICT (id) DO UPDATE SET
  workflow_template_id = EXCLUDED.workflow_template_id,
  workflow_template_code = EXCLUDED.workflow_template_code,
  workflow_template_version = EXCLUDED.workflow_template_version,
  archived_at = NULL,
  updated_at = NOW();
