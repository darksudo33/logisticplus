-- Reusable shipment workflow step catalog plus safe template archive/delete metadata.
-- Additive/idempotent: existing shipment workflow instances keep their stored snapshots.

CREATE TABLE IF NOT EXISTS shipment_workflow_step_catalog (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  title_fa TEXT,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'customs_import',
  stage_key TEXT,
  stage_title_fa TEXT,
  default_order INTEGER NOT NULL DEFAULT 0,
  default_required BOOLEAN NOT NULL DEFAULT TRUE,
  default_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  default_internal_only BOOLEAN NOT NULL DEFAULT FALSE,
  default_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_required_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_form_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_workflow_step_catalog_order_non_negative CHECK (default_order >= 0)
);

ALTER TABLE shipment_workflow_templates
  ADD COLUMN IF NOT EXISTS archived_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

ALTER TABLE shipment_workflow_template_steps
  ADD COLUMN IF NOT EXISTS catalog_step_id TEXT REFERENCES shipment_workflow_step_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checklist_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_step_catalog_system_code_idx
  ON shipment_workflow_step_catalog (code)
  WHERE organization_id IS NULL AND is_system = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_step_catalog_org_code_idx
  ON shipment_workflow_step_catalog (organization_id, code)
  WHERE organization_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipment_workflow_step_catalog_lookup_idx
  ON shipment_workflow_step_catalog (organization_id, category, stage_key, default_order)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipment_workflow_template_steps_catalog_idx
  ON shipment_workflow_template_steps (template_id, catalog_step_id)
  WHERE catalog_step_id IS NOT NULL AND archived_at IS NULL;

WITH catalog_seed(code, stage_key, stage_title_fa, title_fa, default_order) AS (
  VALUES
    ('IR_IMPORT_CUSTOMS_001','intake','ثبت اولیه پرونده','ثبت اولیه پرونده',1),
    ('IR_IMPORT_CUSTOMS_002','intake','ثبت اولیه پرونده','ثبت اطلاعات مشتری',2),
    ('IR_IMPORT_CUSTOMS_003','intake','ثبت اولیه پرونده','ثبت اطلاعات فروشنده خارجی',3),
    ('IR_IMPORT_CUSTOMS_004','intake','ثبت اولیه پرونده','ثبت نوع عملیات واردات',4),
    ('IR_IMPORT_CUSTOMS_005','intake','ثبت اولیه پرونده','ثبت کشور مبدأ',5),
    ('IR_IMPORT_CUSTOMS_006','intake','ثبت اولیه پرونده','ثبت گمرک مقصد',6),
    ('IR_IMPORT_CUSTOMS_007','intake','ثبت اولیه پرونده','ثبت شرح اولیه کالا',7),
    ('IR_IMPORT_CUSTOMS_008','intake','ثبت اولیه پرونده','ثبت ارزش تقریبی کالا',8),
    ('IR_IMPORT_CUSTOMS_009','documents','دریافت و بررسی اسناد','دریافت پیش‌فاکتور',9),
    ('IR_IMPORT_CUSTOMS_010','documents','دریافت و بررسی اسناد','بررسی پیش‌فاکتور',10),
    ('IR_IMPORT_CUSTOMS_011','documents','دریافت و بررسی اسناد','دریافت فاکتور نهایی',11),
    ('IR_IMPORT_CUSTOMS_012','documents','دریافت و بررسی اسناد','بررسی فاکتور نهایی',12),
    ('IR_IMPORT_CUSTOMS_013','documents','دریافت و بررسی اسناد','دریافت پکینگ لیست',13),
    ('IR_IMPORT_CUSTOMS_014','documents','دریافت و بررسی اسناد','بررسی پکینگ لیست',14),
    ('IR_IMPORT_CUSTOMS_015','documents','دریافت و بررسی اسناد','دریافت بارنامه',15),
    ('IR_IMPORT_CUSTOMS_016','documents','دریافت و بررسی اسناد','بررسی بارنامه',16),
    ('IR_IMPORT_CUSTOMS_017','documents','دریافت و بررسی اسناد','دریافت گواهی مبدا',17),
    ('IR_IMPORT_CUSTOMS_018','documents','دریافت و بررسی اسناد','بررسی گواهی مبدا',18),
    ('IR_IMPORT_CUSTOMS_019','documents','دریافت و بررسی اسناد','دریافت بیمه‌نامه',19),
    ('IR_IMPORT_CUSTOMS_020','documents','دریافت و بررسی اسناد','بررسی بیمه‌نامه',20),
    ('IR_IMPORT_CUSTOMS_021','permits','ثبت سفارش و مجوزها','بررسی کارت بازرگانی',21),
    ('IR_IMPORT_CUSTOMS_022','permits','ثبت سفارش و مجوزها','بررسی اعتبار کارت بازرگانی',22),
    ('IR_IMPORT_CUSTOMS_023','permits','ثبت سفارش و مجوزها','بررسی مالکیت/نمایندگی کارت',23),
    ('IR_IMPORT_CUSTOMS_024','permits','ثبت سفارش و مجوزها','بررسی مجوز ثبت سفارش',24),
    ('IR_IMPORT_CUSTOMS_025','permits','ثبت سفارش و مجوزها','ثبت اطلاعات ثبت سفارش',25),
    ('IR_IMPORT_CUSTOMS_026','permits','ثبت سفارش و مجوزها','پیگیری تایید ثبت سفارش',26),
    ('IR_IMPORT_CUSTOMS_027','permits','ثبت سفارش و مجوزها','بررسی نیاز به مجوز استاندارد',27),
    ('IR_IMPORT_CUSTOMS_028','permits','ثبت سفارش و مجوزها','بررسی نیاز به مجوز بهداشت',28),
    ('IR_IMPORT_CUSTOMS_029','permits','ثبت سفارش و مجوزها','بررسی نیاز به مجوز قرنطینه',29),
    ('IR_IMPORT_CUSTOMS_030','permits','ثبت سفارش و مجوزها','بررسی نیاز به مجوز انرژی اتمی',30),
    ('IR_IMPORT_CUSTOMS_031','permits','ثبت سفارش و مجوزها','بررسی نیاز به مجوز صمت',31),
    ('IR_IMPORT_CUSTOMS_032','permits','ثبت سفارش و مجوزها','بررسی سایر مجوزهای قانونی',32),
    ('IR_IMPORT_CUSTOMS_033','declaration','اظهار گمرکی','آماده‌سازی اظهارنامه',33),
    ('IR_IMPORT_CUSTOMS_034','declaration','اظهار گمرکی','ثبت اظهارنامه در سامانه گمرک',34),
    ('IR_IMPORT_CUSTOMS_035','declaration','اظهار گمرکی','کنترل اطلاعات اظهارنامه',35),
    ('IR_IMPORT_CUSTOMS_036','declaration','اظهار گمرکی','ثبت کوتاج',36),
    ('IR_IMPORT_CUSTOMS_037','declaration','اظهار گمرکی','دریافت شماره کوتاج',37),
    ('IR_IMPORT_CUSTOMS_038','declaration','اظهار گمرکی','بررسی ارزش اظهاری',38),
    ('IR_IMPORT_CUSTOMS_039','declaration','اظهار گمرکی','بررسی تعرفه/HS Code',39),
    ('IR_IMPORT_CUSTOMS_040','declaration','اظهار گمرکی','بررسی وزن و تعداد',40),
    ('IR_IMPORT_CUSTOMS_041','declaration','اظهار گمرکی','بررسی مشخصات کالا',41),
    ('IR_IMPORT_CUSTOMS_042','declaration','اظهار گمرکی','بررسی اسناد ضمیمه اظهارنامه',42),
    ('IR_IMPORT_CUSTOMS_043','routing','تعیین مسیر گمرکی','تعیین مسیر گمرکی',43),
    ('IR_IMPORT_CUSTOMS_044','routing','تعیین مسیر گمرکی','مسیر سبز',44),
    ('IR_IMPORT_CUSTOMS_045','routing','تعیین مسیر گمرکی','مسیر زرد',45),
    ('IR_IMPORT_CUSTOMS_046','routing','تعیین مسیر گمرکی','مسیر قرمز',46),
    ('IR_IMPORT_CUSTOMS_047','inspection','ارزیابی و بازرسی','ارجاع به کارشناس',47),
    ('IR_IMPORT_CUSTOMS_048','inspection','ارزیابی و بازرسی','بررسی کارشناس گمرک',48),
    ('IR_IMPORT_CUSTOMS_049','inspection','ارزیابی و بازرسی','ارزیابی فیزیکی کالا',49),
    ('IR_IMPORT_CUSTOMS_050','inspection','ارزیابی و بازرسی','نمونه‌برداری کالا',50),
    ('IR_IMPORT_CUSTOMS_051','inspection','ارزیابی و بازرسی','اصلاح اظهارنامه در صورت نیاز',51),
    ('IR_IMPORT_CUSTOMS_052','inspection','ارزیابی و بازرسی','رفع اختلاف ارزش/تعرفه',52),
    ('IR_IMPORT_CUSTOMS_053','payments','پرداخت‌ها و عوارض','محاسبه حقوق و عوارض',53),
    ('IR_IMPORT_CUSTOMS_054','payments','پرداخت‌ها و عوارض','پرداخت حقوق ورودی',54),
    ('IR_IMPORT_CUSTOMS_055','payments','پرداخت‌ها و عوارض','پرداخت هزینه‌های انبارداری',55),
    ('IR_IMPORT_CUSTOMS_056','payments','پرداخت‌ها و عوارض','پرداخت هزینه‌های بندری/دموراژ',56),
    ('IR_IMPORT_CUSTOMS_057','payments','پرداخت‌ها و عوارض','دریافت تاییدیه پرداخت‌ها',57),
    ('IR_IMPORT_CUSTOMS_058','release','صدور پروانه و ترخیص','صدور پروانه سبز گمرکی',58),
    ('IR_IMPORT_CUSTOMS_059','release','صدور پروانه و ترخیص','دریافت مجوز بارگیری',59),
    ('IR_IMPORT_CUSTOMS_060','exit','خروج و تحویل کالا','هماهنگی حمل داخلی',60),
    ('IR_IMPORT_CUSTOMS_061','exit','خروج و تحویل کالا','خروج کالا از گمرک',61),
    ('IR_IMPORT_CUSTOMS_062','exit','خروج و تحویل کالا','ثبت تاریخ خروج',62),
    ('IR_IMPORT_CUSTOMS_063','exit','خروج و تحویل کالا','تحویل کالا به مشتری',63),
    ('IR_IMPORT_CUSTOMS_064','closure','بستن پرونده','بستن پرونده و آرشیو اسناد',64)
)
INSERT INTO shipment_workflow_step_catalog (
  id, organization_id, code, title, title_fa, description, category, stage_key, stage_title_fa,
  default_order, default_required, default_customer_visible, default_internal_only,
  default_checklist, default_required_documents, default_form_fields, metadata, is_system,
  created_at, updated_at
)
SELECT
  'swsc-ir-import-customs-' || right(code, 3),
  NULL,
  code,
  'Import customs step ' || right(code, 3),
  title_fa,
  '',
  'customs_import',
  stage_key,
  stage_title_fa,
  default_order,
  TRUE,
  TRUE,
  FALSE,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('source', 'legacy_customs_steps_v1', 'number', right(code, 3)),
  TRUE,
  NOW(),
  NOW()
FROM catalog_seed
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  title = EXCLUDED.title,
  title_fa = EXCLUDED.title_fa,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  stage_key = EXCLUDED.stage_key,
  stage_title_fa = EXCLUDED.stage_title_fa,
  default_order = EXCLUDED.default_order,
  default_required = EXCLUDED.default_required,
  default_customer_visible = EXCLUDED.default_customer_visible,
  default_internal_only = EXCLUDED.default_internal_only,
  default_checklist = EXCLUDED.default_checklist,
  default_required_documents = EXCLUDED.default_required_documents,
  default_form_fields = EXCLUDED.default_form_fields,
  metadata = EXCLUDED.metadata,
  is_system = TRUE,
  archived_at = NULL,
  archived_by_id = NULL,
  updated_at = NOW();

WITH phase_seed(phase_key, label_fa, label_en, sort_order) AS (
  VALUES
    ('intake','ثبت اولیه پرونده','Case intake',1),
    ('documents','دریافت و بررسی اسناد','Documents',2),
    ('permits','ثبت سفارش و مجوزها','Permits',3),
    ('declaration','اظهار گمرکی','Customs declaration',4),
    ('routing','تعیین مسیر گمرکی','Customs route',5),
    ('inspection','ارزیابی و بازرسی','Inspection',6),
    ('payments','پرداخت‌ها و عوارض','Payments',7),
    ('release','صدور پروانه و ترخیص','Release',8),
    ('exit','خروج و تحویل کالا','Exit and delivery',9),
    ('closure','بستن پرونده','Closure',10)
),
upsert_template AS (
  INSERT INTO shipment_workflow_templates (
    id, organization_id, code, shipment_direction, transport_mode, shipment_type_hint,
    title_fa, title_en, description, is_system, is_active, version,
    published_at, created_at, updated_at
  )
  VALUES (
    'swt-ir-import-customs-v1',
    NULL,
    'IR_IMPORT_CUSTOMS_V1',
    'import',
    'sea',
    'IMPORT_SEA_CONTAINER',
    'فرآیند واردات و ترخیص ایران',
    'Iran import customs progression',
    'Controlled V1 shipment progress template for Iran import customs workflows, built from the reusable customs step catalog.',
    TRUE,
    TRUE,
    1,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    title_fa = EXCLUDED.title_fa,
    title_en = EXCLUDED.title_en,
    description = EXCLUDED.description,
    transport_mode = EXCLUDED.transport_mode,
    shipment_type_hint = EXCLUDED.shipment_type_hint,
    is_system = TRUE,
    is_active = TRUE,
    archived_at = NULL,
    archived_by_id = NULL,
    archived_reason = NULL,
    updated_at = NOW()
  RETURNING id
),
upsert_phases AS (
  INSERT INTO shipment_workflow_template_phases (
    id, template_id, phase_key, label_fa, label_en, sort_order, is_visible, created_at, updated_at
  )
  SELECT
    'swtp-ir-import-customs-v1-' || phase_key,
    'swt-ir-import-customs-v1',
    phase_key,
    label_fa,
    label_en,
    sort_order,
    TRUE,
    NOW(),
    NOW()
  FROM phase_seed
  ON CONFLICT (template_id, phase_key) DO UPDATE SET
    label_fa = EXCLUDED.label_fa,
    label_en = EXCLUDED.label_en,
    sort_order = EXCLUDED.sort_order,
    is_visible = TRUE,
    updated_at = NOW()
  RETURNING id, phase_key
),
catalog_steps AS (
  SELECT catalog.*
  FROM shipment_workflow_step_catalog catalog
  WHERE catalog.organization_id IS NULL
    AND catalog.is_system = TRUE
    AND catalog.category = 'customs_import'
    AND catalog.archived_at IS NULL
)
INSERT INTO shipment_workflow_template_steps (
  id, template_id, phase_id, phase_key, step_key, catalog_step_id, label_fa, label_en, public_label,
  sort_order, is_required, is_visible, is_customer_visible, role_suggestion,
  expected_duration_hours, task_policy_json, checklist_json, expected_documents_json,
  expected_form_fields_json, next_step_rules_json, visibility_rule_json, created_at, updated_at
)
SELECT
  'swts-ir-import-customs-v1-' || right(catalog_steps.code, 3),
  'swt-ir-import-customs-v1',
  phases.id,
  catalog_steps.stage_key,
  right(catalog_steps.code, 3),
  catalog_steps.id,
  catalog_steps.title_fa,
  catalog_steps.title,
  catalog_steps.title_fa,
  catalog_steps.default_order,
  catalog_steps.default_required,
  TRUE,
  catalog_steps.default_customer_visible,
  NULL,
  NULL,
  '{"mode":"suggested"}'::jsonb,
  catalog_steps.default_checklist,
  catalog_steps.default_required_documents,
  catalog_steps.default_form_fields,
  '{}'::jsonb,
  CASE WHEN catalog_steps.stage_key = 'routing' THEN '{"type":"iran_customs_route_v1"}'::jsonb ELSE '{}'::jsonb END,
  NOW(),
  NOW()
FROM catalog_steps
JOIN shipment_workflow_template_phases phases
  ON phases.template_id = 'swt-ir-import-customs-v1'
 AND phases.phase_key = catalog_steps.stage_key
ON CONFLICT (template_id, step_key) WHERE archived_at IS NULL DO UPDATE SET
  phase_id = EXCLUDED.phase_id,
  phase_key = EXCLUDED.phase_key,
  catalog_step_id = EXCLUDED.catalog_step_id,
  label_fa = EXCLUDED.label_fa,
  label_en = EXCLUDED.label_en,
  public_label = EXCLUDED.public_label,
  sort_order = EXCLUDED.sort_order,
  is_required = EXCLUDED.is_required,
  is_visible = EXCLUDED.is_visible,
  is_customer_visible = EXCLUDED.is_customer_visible,
  task_policy_json = EXCLUDED.task_policy_json,
  checklist_json = EXCLUDED.checklist_json,
  expected_documents_json = EXCLUDED.expected_documents_json,
  expected_form_fields_json = EXCLUDED.expected_form_fields_json,
  next_step_rules_json = EXCLUDED.next_step_rules_json,
  visibility_rule_json = EXCLUDED.visibility_rule_json,
  archived_at = NULL,
  updated_at = NOW();

UPDATE shipment_workflow_template_steps
SET archived_at = COALESCE(archived_at, NOW()),
    is_visible = FALSE,
    is_customer_visible = FALSE,
    updated_at = NOW()
WHERE template_id = 'swt-ir-import-customs-v1'
  AND archived_at IS NULL
  AND step_key NOT IN (
    '001','002','003','004','005','006','007','008','009','010','011','012','013','014','015','016',
    '017','018','019','020','021','022','023','024','025','026','027','028','029','030','031','032',
    '033','034','035','036','037','038','039','040','041','042','043','044','045','046','047','048',
    '049','050','051','052','053','054','055','056','057','058','059','060','061','062','063','064'
  );

UPDATE shipment_workflow_template_phases
SET is_visible = FALSE,
    updated_at = NOW()
WHERE template_id = 'swt-ir-import-customs-v1'
  AND phase_key NOT IN ('intake','documents','permits','declaration','routing','inspection','payments','release','exit','closure');
