WITH target_template AS (
  SELECT id
  FROM shipment_form_templates
  WHERE organization_id IS NULL
    AND shipment_type_code = 'IMPORT_SEA_CONTAINER'
    AND code = 'default-import-sea-container'
    AND archived_at IS NULL
  LIMIT 1
),
section_seed(section_key, title_fa, sort_order, collapsed) AS (
  VALUES
    ('base', 'اطلاعات پایه', 1, FALSE),
    ('order-registration', 'ثبت سفارش', 2, FALSE),
    ('fx-bank', 'ارز و بانک', 3, FALSE),
    ('sea', 'حمل دریایی', 4, FALSE),
    ('containers', 'کانتینرها', 5, FALSE),
    ('origin-docs', 'اسناد مبدا', 6, FALSE),
    ('declaration', 'اظهار و کوتاژ', 7, FALSE),
    ('payments-release', 'پرداخت ها و خروج', 8, FALSE),
    ('commercial-card', 'کارت بازرگانی', 9, FALSE),
    ('internal-note', 'یادداشت داخلی', 10, TRUE)
),
upsert_sections AS (
  INSERT INTO shipment_form_template_sections (
    id, template_id, section_key, title_fa, description, sort_order,
    is_collapsed_by_default, created_at, updated_at
  )
  SELECT
    'sfts-import-sea-container-' || regexp_replace(section_key, '[^a-zA-Z0-9]+', '-', 'g'),
    target_template.id,
    section_key,
    title_fa,
    '',
    sort_order,
    collapsed,
    NOW(),
    NOW()
  FROM section_seed
  CROSS JOIN target_template
  ON CONFLICT (id) DO UPDATE SET
    title_fa = EXCLUDED.title_fa,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_collapsed_by_default = EXCLUDED.is_collapsed_by_default,
    updated_at = NOW()
  RETURNING id, template_id, section_key
),
field_seed(section_key, field_key, field_source, field_type, label_fa, sort_order, important) AS (
  VALUES
    ('order-registration', 'orderRegistrationNumber', 'canonical', 'text', 'شماره ثبت سفارش', 1, TRUE),
    ('order-registration', 'orderRegistrationDate', 'canonical', 'date', 'تاریخ ثبت سفارش', 2, FALSE),
    ('order-registration', 'orderRegistrationStatus', 'canonical', 'select', 'وضعیت ثبت سفارش', 3, FALSE),
    ('fx-bank', 'bankTrackingNumber', 'canonical', 'text', 'شماره پیگیری بانکی', 1, TRUE),
    ('fx-bank', 'bankName', 'canonical', 'text', 'بانک عامل', 2, FALSE),
    ('fx-bank', 'bankProcessStatus', 'canonical', 'select', 'وضعیت عملیات بانکی', 3, FALSE),
    ('payments-release', 'paymentReference', 'canonical', 'text', 'شماره پیگیری پرداخت', 2, FALSE),
    ('payments-release', 'truckPlate', 'canonical', 'text', 'پلاک کامیون', 4, FALSE),
    ('payments-release', 'driverName', 'canonical', 'text', 'نام راننده', 5, FALSE),
    ('commercial-card', 'commercialCardId', 'canonical', 'commercialCard', 'کارت بازرگانی', 1, TRUE),
    ('commercial-card', 'commercialCardDisplay', 'canonical', 'readonly', 'نمایش کارت انتخاب شده', 2, FALSE)
)
INSERT INTO shipment_form_template_fields (
  id, template_id, section_id, field_key, field_source, field_type, label_fa,
  helper_text, placeholder, sort_order, is_visible, is_required, is_important,
  show_in_shipment_detail, show_in_daily_status, show_in_create_form,
  validation_json, options_json, created_at, updated_at
)
SELECT
  'sftf-import-sea-container-' || regexp_replace(field_key, '[^a-zA-Z0-9]+', '-', 'g'),
  upsert_sections.template_id,
  upsert_sections.id,
  field_seed.field_key,
  field_seed.field_source,
  field_seed.field_type,
  field_seed.label_fa,
  '',
  '',
  field_seed.sort_order,
  TRUE,
  FALSE,
  field_seed.important,
  TRUE,
  TRUE,
  FALSE,
  '{}'::jsonb,
  '[]'::jsonb,
  NOW(),
  NOW()
FROM field_seed
JOIN upsert_sections ON upsert_sections.section_key = field_seed.section_key
ON CONFLICT (id) DO UPDATE SET
  section_id = EXCLUDED.section_id,
  field_source = EXCLUDED.field_source,
  field_type = EXCLUDED.field_type,
  label_fa = EXCLUDED.label_fa,
  sort_order = EXCLUDED.sort_order,
  is_visible = TRUE,
  is_important = EXCLUDED.is_important,
  show_in_shipment_detail = TRUE,
  show_in_daily_status = TRUE,
  show_in_create_form = FALSE,
  archived_at = NULL,
  updated_at = NOW();
