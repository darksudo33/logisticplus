WITH target_templates AS (
  SELECT
    id,
    lower(replace(shipment_type_code, '_', '-')) AS type_slug
  FROM shipment_form_templates
  WHERE organization_id IS NULL
    AND archived_at IS NULL
),
base_sections AS (
  SELECT
    sections.id AS section_id,
    sections.template_id,
    target_templates.type_slug
  FROM shipment_form_template_sections sections
  JOIN target_templates ON target_templates.id = sections.template_id
  WHERE sections.section_key = 'base'
),
field_seed(field_key, label_fa, sort_order) AS (
  VALUES
    ('documentCount', 'اسناد قابل مشاهده/کل', 6),
    ('taskCount', 'وظایف باز', 7),
    ('profileUpdatedAt', 'آخرین بروزرسانی پروفایل', 8)
)
INSERT INTO shipment_form_template_fields (
  id, template_id, section_id, field_key, field_source, field_type, label_fa,
  helper_text, placeholder, sort_order, is_visible, is_required, is_important,
  show_in_shipment_detail, show_in_daily_status, show_in_create_form,
  validation_json, options_json, created_at, updated_at
)
SELECT
  'sftf-' || base_sections.type_slug || '-' || regexp_replace(field_seed.field_key, '[^a-zA-Z0-9]+', '-', 'g'),
  base_sections.template_id,
  base_sections.section_id,
  field_seed.field_key,
  'canonical',
  'readonly',
  field_seed.label_fa,
  '',
  '',
  field_seed.sort_order,
  TRUE,
  FALSE,
  FALSE,
  TRUE,
  TRUE,
  FALSE,
  '{}'::jsonb,
  '[]'::jsonb,
  NOW(),
  NOW()
FROM base_sections
CROSS JOIN field_seed
ON CONFLICT (id) DO UPDATE SET
  section_id = EXCLUDED.section_id,
  field_source = 'canonical',
  field_type = 'readonly',
  label_fa = EXCLUDED.label_fa,
  sort_order = EXCLUDED.sort_order,
  is_visible = TRUE,
  show_in_shipment_detail = TRUE,
  show_in_daily_status = TRUE,
  show_in_create_form = FALSE,
  archived_at = NULL,
  updated_at = NOW();
