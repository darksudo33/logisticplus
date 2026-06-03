WITH template_seed(type, code, title, description) AS (
  VALUES
    ('EXPORT_LENJ', 'default-export-lenj', 'قالب صادرات با لنج', 'قالب پایه برای پرونده های صادرات با لنج.'),
    ('EXPORT_SEA_CONTAINER', 'default-export-sea-container', 'قالب صادرات دریایی کانتینری', 'قالب پایه برای صادرات دریایی کانتینری.'),
    ('EXPORT_SEA_BULK', 'default-export-sea-bulk', 'قالب صادرات دریایی فله / جنرال کارگو', 'قالب پایه برای صادرات فله و جنرال کارگو.'),
    ('EXPORT_AIR_CARGO', 'default-export-air-cargo', 'قالب صادرات هوایی', 'قالب پایه برای صادرات هوایی.'),
    ('EXPORT_LAND_TRUCK', 'default-export-land-truck', 'قالب صادرات زمینی', 'قالب پایه برای صادرات زمینی.')
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
    code = EXCLUDED.code,
    shipment_type_code = EXCLUDED.shipment_type_code,
    title_fa = EXCLUDED.title_fa,
    description = EXCLUDED.description,
    is_system = TRUE,
    is_active = TRUE,
    archived_at = NULL,
    updated_at = NOW()
  RETURNING id, shipment_type_code
),
section_seed(type, section_key, title, sort_order, collapsed) AS (
  VALUES
    ('EXPORT_LENJ', 'base', 'اطلاعات پایه', 1, FALSE),
    ('EXPORT_LENJ', 'lenj-port', 'لنج و بندر خروج', 2, FALSE),
    ('EXPORT_LENJ', 'export-docs', 'اسناد صادراتی', 3, FALSE),
    ('EXPORT_LENJ', 'internal-note', 'یادداشت داخلی', 4, TRUE),
    ('EXPORT_SEA_CONTAINER', 'base', 'اطلاعات پایه', 1, FALSE),
    ('EXPORT_SEA_CONTAINER', 'sea', 'حمل دریایی', 2, FALSE),
    ('EXPORT_SEA_CONTAINER', 'goods', 'کالا و کانتینر', 3, FALSE),
    ('EXPORT_SEA_CONTAINER', 'export-release', 'خروج و تحویل', 4, FALSE),
    ('EXPORT_SEA_CONTAINER', 'internal-note', 'یادداشت داخلی', 5, TRUE),
    ('EXPORT_SEA_BULK', 'base', 'اطلاعات پایه', 1, FALSE),
    ('EXPORT_SEA_BULK', 'sea', 'حمل دریایی', 2, FALSE),
    ('EXPORT_SEA_BULK', 'bulk-goods', 'کالا و وزن', 3, FALSE),
    ('EXPORT_SEA_BULK', 'export-release', 'خروج و تحویل', 4, FALSE),
    ('EXPORT_AIR_CARGO', 'base', 'اطلاعات پایه', 1, FALSE),
    ('EXPORT_AIR_CARGO', 'air', 'حمل هوایی', 2, FALSE),
    ('EXPORT_AIR_CARGO', 'goods', 'کالا', 3, FALSE),
    ('EXPORT_AIR_CARGO', 'export-release', 'خروج و تحویل', 4, FALSE),
    ('EXPORT_LAND_TRUCK', 'base', 'اطلاعات پایه', 1, FALSE),
    ('EXPORT_LAND_TRUCK', 'land', 'حمل زمینی', 2, FALSE),
    ('EXPORT_LAND_TRUCK', 'goods', 'کالا', 3, FALSE),
    ('EXPORT_LAND_TRUCK', 'export-release', 'خروج و تحویل', 4, FALSE)
),
upsert_sections AS (
  INSERT INTO shipment_form_template_sections (
    id, template_id, section_key, title_fa, description, sort_order,
    is_collapsed_by_default, created_at, updated_at
  )
  SELECT
    'sfts-' || lower(replace(type, '_', '-')) || '-' || regexp_replace(section_key, '[^a-zA-Z0-9]+', '-', 'g'),
    'sft-' || lower(replace(type, '_', '-')),
    section_key,
    title,
    '',
    sort_order,
    collapsed,
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
field_seed(type, section_key, field_key, field_source, field_type, label_fa, sort_order, important, create_form) AS (
  VALUES
    ('EXPORT_LENJ', 'base', 'shipmentCode', 'canonical', 'readonly', 'کد محموله / شماره پرونده', 1, FALSE, FALSE),
    ('EXPORT_LENJ', 'base', 'customerName', 'canonical', 'readonly', 'مشتری', 2, FALSE, FALSE),
    ('EXPORT_LENJ', 'base', 'shipmentStatus', 'canonical', 'readonly', 'وضعیت محموله', 3, FALSE, FALSE),
    ('EXPORT_LENJ', 'base', 'workflowStep', 'canonical', 'readonly', 'مرحله فعلی', 4, FALSE, FALSE),
    ('EXPORT_LENJ', 'lenj-port', 'lenjName', 'custom', 'text', 'نام لنج', 1, TRUE, FALSE),
    ('EXPORT_LENJ', 'lenj-port', 'portOfDeparture', 'custom', 'text', 'بندر خروج', 2, TRUE, FALSE),
    ('EXPORT_LENJ', 'lenj-port', 'goodsSummary', 'canonical', 'textarea', 'خلاصه کالا', 3, TRUE, FALSE),
    ('EXPORT_LENJ', 'export-docs', 'bookingNumber', 'canonical', 'text', 'شماره رزرو حمل', 1, FALSE, FALSE),
    ('EXPORT_LENJ', 'export-docs', 'transportDocumentNumber', 'canonical', 'text', 'شماره سند حمل', 2, FALSE, FALSE),
    ('EXPORT_LENJ', 'export-docs', 'customsStatus', 'canonical', 'select', 'وضعیت گمرکی', 3, TRUE, FALSE),
    ('EXPORT_LENJ', 'export-docs', 'releaseStatus', 'canonical', 'select', 'وضعیت ترخیص / خروج', 4, TRUE, FALSE),
    ('EXPORT_LENJ', 'internal-note', 'internalNote', 'canonical', 'textarea', 'یادداشت داخلی', 1, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'base', 'shipmentCode', 'canonical', 'readonly', 'کد محموله / شماره پرونده', 1, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'base', 'customerName', 'canonical', 'readonly', 'مشتری', 2, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'base', 'shipmentStatus', 'canonical', 'readonly', 'وضعیت محموله', 3, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'base', 'workflowStep', 'canonical', 'readonly', 'مرحله فعلی', 4, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'sea', 'bookingNumber', 'canonical', 'text', 'شماره رزرو حمل', 1, TRUE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'sea', 'billOfLadingNumber', 'canonical', 'text', 'شماره بارنامه', 2, TRUE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'sea', 'vesselName', 'custom', 'text', 'نام کشتی', 3, TRUE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'sea', 'voyageNumber', 'custom', 'text', 'شماره سفر', 4, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'goods', 'goodsSummary', 'canonical', 'textarea', 'خلاصه کالا', 1, TRUE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'goods', 'containerSummary', 'canonical', 'textarea', 'خلاصه کانتینر', 2, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'goods', 'packageCount', 'canonical', 'number', 'تعداد بسته', 3, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'goods', 'grossWeightKg', 'canonical', 'number', 'وزن ناخالص', 4, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'export-release', 'customsStatus', 'canonical', 'select', 'وضعیت گمرکی', 1, TRUE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'export-release', 'releaseStatus', 'canonical', 'select', 'وضعیت ترخیص / خروج', 2, TRUE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'export-release', 'exitDate', 'canonical', 'date', 'تاریخ خروج', 3, FALSE, FALSE),
    ('EXPORT_SEA_CONTAINER', 'internal-note', 'internalNote', 'canonical', 'textarea', 'یادداشت داخلی', 1, FALSE, FALSE),
    ('EXPORT_SEA_BULK', 'base', 'shipmentCode', 'canonical', 'readonly', 'کد محموله / شماره پرونده', 1, FALSE, FALSE),
    ('EXPORT_SEA_BULK', 'base', 'customerName', 'canonical', 'readonly', 'مشتری', 2, FALSE, FALSE),
    ('EXPORT_SEA_BULK', 'base', 'shipmentStatus', 'canonical', 'readonly', 'وضعیت محموله', 3, FALSE, FALSE),
    ('EXPORT_SEA_BULK', 'sea', 'bookingNumber', 'canonical', 'text', 'شماره رزرو حمل', 1, TRUE, FALSE),
    ('EXPORT_SEA_BULK', 'sea', 'billOfLadingNumber', 'canonical', 'text', 'شماره بارنامه', 2, TRUE, FALSE),
    ('EXPORT_SEA_BULK', 'sea', 'vesselName', 'custom', 'text', 'نام کشتی', 3, TRUE, FALSE),
    ('EXPORT_SEA_BULK', 'bulk-goods', 'goodsSummary', 'canonical', 'textarea', 'خلاصه کالا', 1, TRUE, FALSE),
    ('EXPORT_SEA_BULK', 'bulk-goods', 'grossWeightKg', 'canonical', 'number', 'وزن ناخالص', 2, TRUE, FALSE),
    ('EXPORT_SEA_BULK', 'bulk-goods', 'packageCount', 'canonical', 'number', 'تعداد بسته', 3, FALSE, FALSE),
    ('EXPORT_SEA_BULK', 'export-release', 'customsStatus', 'canonical', 'select', 'وضعیت گمرکی', 1, TRUE, FALSE),
    ('EXPORT_SEA_BULK', 'export-release', 'releaseStatus', 'canonical', 'select', 'وضعیت ترخیص / خروج', 2, TRUE, FALSE),
    ('EXPORT_SEA_BULK', 'export-release', 'exitDate', 'canonical', 'date', 'تاریخ خروج', 3, FALSE, FALSE),
    ('EXPORT_AIR_CARGO', 'base', 'shipmentCode', 'canonical', 'readonly', 'کد محموله / شماره پرونده', 1, FALSE, FALSE),
    ('EXPORT_AIR_CARGO', 'base', 'customerName', 'canonical', 'readonly', 'مشتری', 2, FALSE, FALSE),
    ('EXPORT_AIR_CARGO', 'base', 'shipmentStatus', 'canonical', 'readonly', 'وضعیت محموله', 3, FALSE, FALSE),
    ('EXPORT_AIR_CARGO', 'air', 'awbNumber', 'custom', 'text', 'شماره AWB', 1, TRUE, FALSE),
    ('EXPORT_AIR_CARGO', 'air', 'flightNumber', 'custom', 'text', 'شماره پرواز', 2, FALSE, FALSE),
    ('EXPORT_AIR_CARGO', 'air', 'airlineName', 'custom', 'text', 'نام ایرلاین', 3, FALSE, FALSE),
    ('EXPORT_AIR_CARGO', 'goods', 'goodsSummary', 'canonical', 'textarea', 'خلاصه کالا', 1, TRUE, FALSE),
    ('EXPORT_AIR_CARGO', 'goods', 'grossWeightKg', 'canonical', 'number', 'وزن ناخالص', 2, FALSE, FALSE),
    ('EXPORT_AIR_CARGO', 'export-release', 'customsStatus', 'canonical', 'select', 'وضعیت گمرکی', 1, TRUE, FALSE),
    ('EXPORT_AIR_CARGO', 'export-release', 'releaseStatus', 'canonical', 'select', 'وضعیت ترخیص / خروج', 2, TRUE, FALSE),
    ('EXPORT_AIR_CARGO', 'export-release', 'exitDate', 'canonical', 'date', 'تاریخ خروج', 3, FALSE, FALSE),
    ('EXPORT_LAND_TRUCK', 'base', 'shipmentCode', 'canonical', 'readonly', 'کد محموله / شماره پرونده', 1, FALSE, FALSE),
    ('EXPORT_LAND_TRUCK', 'base', 'customerName', 'canonical', 'readonly', 'مشتری', 2, FALSE, FALSE),
    ('EXPORT_LAND_TRUCK', 'base', 'shipmentStatus', 'canonical', 'readonly', 'وضعیت محموله', 3, FALSE, FALSE),
    ('EXPORT_LAND_TRUCK', 'land', 'cmrNumber', 'custom', 'text', 'شماره CMR', 1, TRUE, FALSE),
    ('EXPORT_LAND_TRUCK', 'land', 'truckPlate', 'canonical', 'text', 'پلاک کامیون', 2, TRUE, FALSE),
    ('EXPORT_LAND_TRUCK', 'land', 'driverName', 'canonical', 'text', 'نام راننده', 3, TRUE, FALSE),
    ('EXPORT_LAND_TRUCK', 'land', 'borderExitPoint', 'custom', 'text', 'مرز خروج', 4, FALSE, FALSE),
    ('EXPORT_LAND_TRUCK', 'goods', 'goodsSummary', 'canonical', 'textarea', 'خلاصه کالا', 1, TRUE, FALSE),
    ('EXPORT_LAND_TRUCK', 'goods', 'packageCount', 'canonical', 'number', 'تعداد بسته', 2, FALSE, FALSE),
    ('EXPORT_LAND_TRUCK', 'goods', 'grossWeightKg', 'canonical', 'number', 'وزن ناخالص', 3, FALSE, FALSE),
    ('EXPORT_LAND_TRUCK', 'export-release', 'customsStatus', 'canonical', 'select', 'وضعیت گمرکی', 1, TRUE, FALSE),
    ('EXPORT_LAND_TRUCK', 'export-release', 'releaseStatus', 'canonical', 'select', 'وضعیت ترخیص / خروج', 2, TRUE, FALSE),
    ('EXPORT_LAND_TRUCK', 'export-release', 'exitDate', 'canonical', 'date', 'تاریخ خروج', 3, FALSE, FALSE)
)
INSERT INTO shipment_form_template_fields (
  id, template_id, section_id, field_key, field_source, field_type, label_fa,
  helper_text, placeholder, sort_order, is_visible, is_required, is_important,
  show_in_shipment_detail, show_in_daily_status, show_in_create_form,
  validation_json, options_json, created_at, updated_at
)
SELECT
  'sftf-' || lower(replace(type, '_', '-')) || '-' || regexp_replace(field_key, '[^a-zA-Z0-9]+', '-', 'g'),
  'sft-' || lower(replace(type, '_', '-')),
  'sfts-' || lower(replace(type, '_', '-')) || '-' || regexp_replace(section_key, '[^a-zA-Z0-9]+', '-', 'g'),
  field_key,
  field_source,
  field_type,
  label_fa,
  '',
  '',
  sort_order,
  TRUE,
  FALSE,
  important,
  TRUE,
  TRUE,
  create_form,
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
  is_visible = EXCLUDED.is_visible,
  is_important = EXCLUDED.is_important,
  show_in_shipment_detail = EXCLUDED.show_in_shipment_detail,
  show_in_daily_status = EXCLUDED.show_in_daily_status,
  show_in_create_form = EXCLUDED.show_in_create_form,
  archived_at = NULL,
  updated_at = NOW();
