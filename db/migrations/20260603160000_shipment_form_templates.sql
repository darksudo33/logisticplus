ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS shipment_direction TEXT DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS transport_mode TEXT,
  ADD COLUMN IF NOT EXISTS shipment_type_code TEXT DEFAULT 'IMPORT_SEA_CONTAINER';

ALTER TABLE shipment_kootaj_details
  ADD COLUMN IF NOT EXISTS custom_fields_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipments_direction_check') THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_direction_check CHECK (
        shipment_direction IS NULL OR shipment_direction IN ('import', 'export', 'transit', 'domestic')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipments_transport_mode_check') THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_transport_mode_check CHECK (
        transport_mode IS NULL OR transport_mode IN ('sea', 'air', 'land', 'rail')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shipment_form_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  shipment_type_code TEXT NOT NULL,
  title_fa TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT shipment_form_templates_version_positive CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS shipment_form_template_sections (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES shipment_form_templates(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  title_fa TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_collapsed_by_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_form_template_fields (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES shipment_form_templates(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES shipment_form_template_sections(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_source TEXT NOT NULL,
  field_type TEXT NOT NULL,
  label_fa TEXT NOT NULL,
  helper_text TEXT,
  placeholder TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_important BOOLEAN NOT NULL DEFAULT FALSE,
  show_in_shipment_detail BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_daily_status BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_create_form BOOLEAN NOT NULL DEFAULT FALSE,
  validation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT shipment_form_template_fields_source_check CHECK (field_source IN ('canonical', 'custom')),
  CONSTRAINT shipment_form_template_fields_type_check CHECK (
    field_type IN ('text', 'textarea', 'number', 'date', 'select', 'commercialCard', 'readonly')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS shipment_form_templates_global_code_idx
  ON shipment_form_templates (code, shipment_type_code)
  WHERE organization_id IS NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipment_form_templates_org_code_idx
  ON shipment_form_templates (organization_id, code, shipment_type_code)
  WHERE organization_id IS NOT NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipment_form_template_sections_key_idx
  ON shipment_form_template_sections (template_id, section_key);

CREATE UNIQUE INDEX IF NOT EXISTS shipment_form_template_fields_key_idx
  ON shipment_form_template_fields (template_id, field_key);

CREATE INDEX IF NOT EXISTS shipment_form_templates_active_type_idx
  ON shipment_form_templates (shipment_type_code, is_active, organization_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipment_form_template_sections_template_idx
  ON shipment_form_template_sections (template_id, sort_order);

CREATE INDEX IF NOT EXISTS shipment_form_template_fields_template_idx
  ON shipment_form_template_fields (template_id, sort_order)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipments_org_type_idx
  ON shipments (organization_id, shipment_type_code)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipment_kootaj_details_custom_fields_gin_idx
  ON shipment_kootaj_details USING GIN (custom_fields_json);

WITH template_seed AS (
  SELECT * FROM jsonb_to_recordset($$
  [
    {
      "type":"IMPORT_LENJ","code":"default-import-lenj","title":"قالب واردات با لنج","description":"قالب پایه برای پرونده های واردات با لنج.",
      "sections":[
        {"key":"base","title":"اطلاعات پایه","fields":[["shipmentCode","canonical","readonly","کد محموله / شماره پرونده"],["customerName","canonical","readonly","مشتری"],["shipmentStatus","canonical","readonly","وضعیت محموله"],["workflowStep","canonical","readonly","مرحله فعلی"],["workflowRoute","canonical","readonly","مسیر فرایند"]]},
        {"key":"lenj-port","title":"اطلاعات لنج و بندر","fields":[["lenjName","custom","text","نام لنج",true],["portOfArrival","custom","text","بندر ورود",true],["arrivalDate","canonical","date","تاریخ ورود"],["warehouseReceiptNumber","canonical","text","شماره قبض انبار"]]},
        {"key":"goods","title":"کالا و بسته بندی","fields":[["goodsSummary","canonical","textarea","خلاصه کالا",true],["packageCount","canonical","number","تعداد بسته"],["grossWeightKg","canonical","number","وزن ناخالص"]]},
        {"key":"declaration","title":"اظهار و کوتاژ","fields":[["cotageNumber","canonical","text","شماره کوتاژ",true,true],["customsRoute","canonical","select","مسیر گمرکی",true],["customsStatus","canonical","select","وضعیت گمرکی",true],["customsOffice","canonical","text","گمرک / محل اظهار"]]},
        {"key":"permits","title":"مجوزها","fields":[["legalPermitStatus","canonical","select","وضعیت مجوزهای قانونی",true],["standardPermitStatus","canonical","select","وضعیت استاندارد"],["healthPermitStatus","canonical","select","وضعیت بهداشت"]]},
        {"key":"payments-release","title":"پرداخت ها و خروج","fields":[["customsPaymentStatus","canonical","select","وضعیت پرداخت گمرکی",true],["releaseStatus","canonical","select","وضعیت ترخیص / خروج",true],["exitDate","canonical","date","تاریخ خروج"]]},
        {"key":"internal-note","title":"یادداشت داخلی","collapsed":true,"fields":[["internalNote","canonical","textarea","یادداشت داخلی"]]}
      ]
    },
    {
      "type":"IMPORT_SEA_CONTAINER","code":"default-import-sea-container","title":"قالب واردات دریایی کانتینری","description":"قالب پایه برای واردات دریایی کانتینری.",
      "sections":[
        {"key":"base","title":"اطلاعات پایه","fields":[["shipmentCode","canonical","readonly","کد محموله / شماره پرونده"],["customerName","canonical","readonly","مشتری"],["shipmentStatus","canonical","readonly","وضعیت محموله"],["workflowStep","canonical","readonly","مرحله فعلی"],["workflowRoute","canonical","readonly","مسیر فرایند"]]},
        {"key":"sea","title":"حمل دریایی","fields":[["billOfLadingNumber","canonical","text","شماره بارنامه",true,true],["vesselName","custom","text","نام کشتی",true],["voyageNumber","custom","text","شماره سفر"],["deliveryOrderNumber","canonical","text","شماره ترخیصیه"]]},
        {"key":"containers","title":"کانتینرها","fields":[["containerSummary","canonical","textarea","خلاصه کانتینر",true],["warehouseReceiptNumber","canonical","text","شماره قبض انبار"]]},
        {"key":"origin-docs","title":"اسناد مبدا","fields":[["proformaNumber","canonical","text","شماره پروفرما"],["transportDocumentNumber","canonical","text","شماره سند حمل"],["goodsSummary","canonical","textarea","خلاصه کالا"]]},
        {"key":"declaration","title":"اظهار و کوتاژ","fields":[["cotageNumber","canonical","text","شماره کوتاژ",true,true],["customsRoute","canonical","select","مسیر گمرکی",true],["customsStatus","canonical","select","وضعیت گمرکی",true],["customsOffice","canonical","text","گمرک / محل اظهار"]]},
        {"key":"payments-release","title":"پرداخت ها و خروج","fields":[["customsPaymentStatus","canonical","select","وضعیت پرداخت گمرکی",true],["releaseStatus","canonical","select","وضعیت ترخیص / خروج",true],["exitDate","canonical","date","تاریخ خروج"]]},
        {"key":"internal-note","title":"یادداشت داخلی","collapsed":true,"fields":[["internalNote","canonical","textarea","یادداشت داخلی"]]}
      ]
    },
    {
      "type":"IMPORT_SEA_BULK","code":"default-import-sea-bulk","title":"قالب واردات دریایی فله / جنرال کارگو","description":"قالب پایه برای واردات فله و جنرال کارگو.",
      "sections":[
        {"key":"base","title":"اطلاعات پایه","fields":[["shipmentCode","canonical","readonly","کد محموله / شماره پرونده"],["customerName","canonical","readonly","مشتری"],["shipmentStatus","canonical","readonly","وضعیت محموله"],["workflowStep","canonical","readonly","مرحله فعلی"]]},
        {"key":"sea","title":"حمل دریایی","fields":[["billOfLadingNumber","canonical","text","شماره بارنامه",true,true],["vesselName","custom","text","نام کشتی",true],["voyageNumber","custom","text","شماره سفر"]]},
        {"key":"bulk-goods","title":"کالا و وزن","fields":[["goodsSummary","canonical","textarea","خلاصه کالا",true],["grossWeightKg","canonical","number","وزن ناخالص",true],["packageCount","canonical","number","تعداد بسته"],["warehouseReceiptNumber","canonical","text","شماره قبض انبار"]]},
        {"key":"declaration","title":"اظهار و کوتاژ","fields":[["cotageNumber","canonical","text","شماره کوتاژ",true,true],["customsRoute","canonical","select","مسیر گمرکی",true],["releaseStatus","canonical","select","وضعیت ترخیص / خروج",true]]}
      ]
    },
    {
      "type":"IMPORT_AIR_CARGO","code":"default-import-air-cargo","title":"قالب واردات هوایی","description":"قالب پایه برای واردات هوایی.",
      "sections":[
        {"key":"base","title":"اطلاعات پایه","fields":[["shipmentCode","canonical","readonly","کد محموله / شماره پرونده"],["customerName","canonical","readonly","مشتری"],["shipmentStatus","canonical","readonly","وضعیت محموله"],["workflowStep","canonical","readonly","مرحله فعلی"]]},
        {"key":"air","title":"حمل هوایی","fields":[["awbNumber","custom","text","شماره AWB",true,true],["flightNumber","custom","text","شماره پرواز"],["airlineName","custom","text","نام ایرلاین"],["arrivalDate","canonical","date","تاریخ ورود",true],["warehouseReceiptNumber","canonical","text","شماره قبض انبار"]]},
        {"key":"goods","title":"کالا","fields":[["goodsSummary","canonical","textarea","خلاصه کالا",true],["grossWeightKg","canonical","number","وزن ناخالص"]]},
        {"key":"declaration","title":"اظهار و ترخیص","fields":[["cotageNumber","canonical","text","شماره کوتاژ",true,true],["customsRoute","canonical","select","مسیر گمرکی",true],["customsPaymentStatus","canonical","select","وضعیت پرداخت گمرکی",true],["releaseStatus","canonical","select","وضعیت ترخیص / خروج",true],["exitDate","canonical","date","تاریخ خروج"]]}
      ]
    },
    {
      "type":"IMPORT_LAND_TRUCK","code":"default-import-land-truck","title":"قالب واردات زمینی","description":"قالب پایه برای واردات زمینی.",
      "sections":[
        {"key":"base","title":"اطلاعات پایه","fields":[["shipmentCode","canonical","readonly","کد محموله / شماره پرونده"],["customerName","canonical","readonly","مشتری"],["shipmentStatus","canonical","readonly","وضعیت محموله"],["workflowStep","canonical","readonly","مرحله فعلی"]]},
        {"key":"land","title":"حمل زمینی","fields":[["cmrNumber","custom","text","شماره CMR",true,true],["truckPlate","canonical","text","پلاک کامیون",true],["driverName","canonical","text","نام راننده",true],["borderEntryPoint","custom","text","مرز ورود"],["arrivalDate","canonical","date","تاریخ ورود"]]},
        {"key":"goods","title":"کالا","fields":[["goodsSummary","canonical","textarea","خلاصه کالا",true],["packageCount","canonical","number","تعداد بسته"],["grossWeightKg","canonical","number","وزن ناخالص"]]},
        {"key":"declaration","title":"اظهار و ترخیص","fields":[["cotageNumber","canonical","text","شماره کوتاژ",true,true],["customsRoute","canonical","select","مسیر گمرکی",true],["customsPaymentStatus","canonical","select","وضعیت پرداخت گمرکی",true],["releaseStatus","canonical","select","وضعیت ترخیص / خروج",true],["exitDate","canonical","date","تاریخ خروج"]]}
      ]
    }
  ]
  $$::jsonb) AS t(type TEXT, code TEXT, title TEXT, description TEXT, sections JSONB)
),
upsert_templates AS (
  INSERT INTO shipment_form_templates (
    id, organization_id, code, shipment_type_code, title_fa, description,
    is_system, is_active, version, created_at, updated_at
  )
  SELECT
    'sft-' || lower(replace(type, '_', '-')),
    NULL,
    code,
    type,
    title,
    description,
    TRUE,
    TRUE,
    1,
    NOW(),
    NOW()
  FROM template_seed
  ON CONFLICT (id) DO UPDATE SET
    title_fa = EXCLUDED.title_fa,
    description = EXCLUDED.description,
    is_system = TRUE,
    is_active = TRUE,
    updated_at = NOW()
  RETURNING id, shipment_type_code
),
section_seed AS (
  SELECT
    t.type,
    'sft-' || lower(replace(t.type, '_', '-')) AS template_id,
    section_item.value AS section_json,
    section_item.ordinality::int AS section_order
  FROM template_seed t
  CROSS JOIN LATERAL jsonb_array_elements(t.sections) WITH ORDINALITY AS section_item(value, ordinality)
),
upsert_sections AS (
  INSERT INTO shipment_form_template_sections (
    id, template_id, section_key, title_fa, description, sort_order,
    is_collapsed_by_default, created_at, updated_at
  )
  SELECT
    'sfts-' || lower(replace(type, '_', '-')) || '-' || regexp_replace(section_json->>'key', '[^a-zA-Z0-9]+', '-', 'g'),
    template_id,
    section_json->>'key',
    section_json->>'title',
    COALESCE(section_json->>'description', ''),
    section_order,
    COALESCE((section_json->>'collapsed')::boolean, FALSE),
    NOW(),
    NOW()
  FROM section_seed
  ON CONFLICT (id) DO UPDATE SET
    title_fa = EXCLUDED.title_fa,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_collapsed_by_default = EXCLUDED.is_collapsed_by_default,
    updated_at = NOW()
  RETURNING id, template_id, section_key
),
field_seed AS (
  SELECT
    s.type,
    s.template_id,
    'sfts-' || lower(replace(s.type, '_', '-')) || '-' || regexp_replace(s.section_json->>'key', '[^a-zA-Z0-9]+', '-', 'g') AS section_id,
    s.section_json->>'key' AS section_key,
    field_item.value AS field_json,
    field_item.ordinality::int AS field_order
  FROM section_seed s
  CROSS JOIN LATERAL jsonb_array_elements(s.section_json->'fields') WITH ORDINALITY AS field_item(value, ordinality)
)
INSERT INTO shipment_form_template_fields (
  id, template_id, section_id, field_key, field_source, field_type, label_fa,
  helper_text, placeholder, sort_order, is_visible, is_required, is_important,
  show_in_shipment_detail, show_in_daily_status, show_in_create_form,
  validation_json, options_json, created_at, updated_at
)
SELECT
  'sftf-' || lower(replace(type, '_', '-')) || '-' || regexp_replace(field_json->>0, '[^a-zA-Z0-9]+', '-', 'g'),
  template_id,
  section_id,
  field_json->>0,
  field_json->>1,
  field_json->>2,
  field_json->>3,
  '',
  '',
  field_order,
  TRUE,
  FALSE,
  COALESCE((field_json->>4)::boolean, FALSE),
  TRUE,
  TRUE,
  COALESCE((field_json->>5)::boolean, FALSE),
  '{}'::jsonb,
  '[]'::jsonb,
  NOW(),
  NOW()
FROM field_seed
ON CONFLICT (id) DO UPDATE SET
  section_id = EXCLUDED.section_id,
  field_source = EXCLUDED.field_source,
  field_type = EXCLUDED.field_type,
  label_fa = EXCLUDED.label_fa,
  sort_order = EXCLUDED.sort_order,
  is_important = EXCLUDED.is_important,
  show_in_create_form = EXCLUDED.show_in_create_form,
  updated_at = NOW();

INSERT INTO permissions (id, key, description)
VALUES ('perm-shipment-forms-manage', 'shipment_forms.manage', 'Manage shipment type form templates')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'shipment_forms.manage'
WHERE r.name = 'CEO'
ON CONFLICT (role_id, permission_id) DO NOTHING;
