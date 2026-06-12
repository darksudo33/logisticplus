-- Versioned shipment workflow templates and immutable per-instance snapshots.
-- This is additive and preserves existing workflow step states, blockers, events, tasks, and documents.

CREATE TABLE IF NOT EXISTS shipment_workflow_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  shipment_direction TEXT,
  transport_mode TEXT,
  shipment_type_hint TEXT,
  title_fa TEXT NOT NULL,
  title_en TEXT,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  published_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT shipment_workflow_templates_version_positive CHECK (version >= 1),
  CONSTRAINT shipment_workflow_templates_direction_check CHECK (
    shipment_direction IS NULL OR shipment_direction IN ('import', 'export', 'transit', 'domestic')
  ),
  CONSTRAINT shipment_workflow_templates_transport_mode_check CHECK (
    transport_mode IS NULL OR transport_mode IN ('sea', 'air', 'land', 'rail')
  )
);

CREATE TABLE IF NOT EXISTS shipment_workflow_template_phases (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES shipment_workflow_templates(id) ON DELETE CASCADE,
  phase_key TEXT NOT NULL,
  label_fa TEXT NOT NULL,
  label_en TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_workflow_template_steps (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES shipment_workflow_templates(id) ON DELETE CASCADE,
  phase_id TEXT NOT NULL REFERENCES shipment_workflow_template_phases(id) ON DELETE CASCADE,
  phase_key TEXT NOT NULL,
  step_key TEXT NOT NULL,
  label_fa TEXT NOT NULL,
  label_en TEXT,
  public_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  role_suggestion TEXT,
  expected_duration_hours INTEGER,
  task_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_documents_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_form_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_step_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT shipment_workflow_template_steps_duration_non_negative CHECK (
    expected_duration_hours IS NULL OR expected_duration_hours >= 0
  )
);

CREATE TABLE IF NOT EXISTS shipment_type_workflow_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_type_code TEXT NOT NULL,
  workflow_template_id TEXT NOT NULL REFERENCES shipment_workflow_templates(id) ON DELETE RESTRICT,
  workflow_template_code TEXT NOT NULL,
  workflow_template_version INTEGER NOT NULL,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT shipment_type_workflow_templates_version_positive CHECK (workflow_template_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_templates_global_code_version_idx
  ON shipment_workflow_templates (code, version)
  WHERE organization_id IS NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_templates_org_code_version_idx
  ON shipment_workflow_templates (organization_id, code, version)
  WHERE organization_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipment_workflow_templates_active_idx
  ON shipment_workflow_templates (organization_id, is_active, code, version DESC)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_template_phases_key_idx
  ON shipment_workflow_template_phases (template_id, phase_key);

CREATE INDEX IF NOT EXISTS shipment_workflow_template_phases_template_idx
  ON shipment_workflow_template_phases (template_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_template_steps_key_idx
  ON shipment_workflow_template_steps (template_id, step_key)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipment_workflow_template_steps_template_idx
  ON shipment_workflow_template_steps (template_id, sort_order)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipment_type_workflow_templates_global_type_idx
  ON shipment_type_workflow_templates (shipment_type_code)
  WHERE organization_id IS NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shipment_type_workflow_templates_org_type_idx
  ON shipment_type_workflow_templates (organization_id, shipment_type_code)
  WHERE organization_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS shipment_type_workflow_templates_template_idx
  ON shipment_type_workflow_templates (workflow_template_id)
  WHERE archived_at IS NULL;

ALTER TABLE shipment_workflow_instances
  ADD COLUMN IF NOT EXISTS workflow_template_id TEXT REFERENCES shipment_workflow_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_template_code TEXT,
  ADD COLUMN IF NOT EXISTS workflow_template_version INTEGER,
  ADD COLUMN IF NOT EXISTS workflow_definition_snapshot_json JSONB;

CREATE INDEX IF NOT EXISTS shipment_workflow_instances_template_idx
  ON shipment_workflow_instances (workflow_template_id)
  WHERE workflow_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shipment_workflow_instances_template_code_idx
  ON shipment_workflow_instances (organization_id, workflow_template_code, workflow_template_version)
  WHERE workflow_template_code IS NOT NULL;

WITH upsert_template AS (
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
    NULL,
    'IMPORT_SEA_CONTAINER',
    'فرآیند واردات و ترخیص ایران',
    'Iran import customs progression',
    'Controlled V1 shipment progress template for Iran import customs workflows.',
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
    is_system = TRUE,
    is_active = TRUE,
    published_at = COALESCE(shipment_workflow_templates.published_at, EXCLUDED.published_at),
    updated_at = NOW()
  RETURNING id
),
phase_seed(phase_key, label_fa, label_en, sort_order, is_visible) AS (
  VALUES
    ('order_registration','ثبت سفارش','Order registration',1,TRUE),
    ('fx_bank','ارز و بانک','FX and bank',2,TRUE),
    ('shipping_origin','حمل و مبدأ','Shipping and origin',3,TRUE),
    ('iran_arrival','ورود به ایران','Iran arrival',4,TRUE),
    ('customs_declaration','اظهار گمرکی','Customs declaration',5,TRUE),
    ('customs_route','مسیر گمرکی','Customs route',6,TRUE),
    ('payment_release','پرداخت و پروانه','Payment and release',7,TRUE),
    ('gate_exit','خروج','Gate exit',8,TRUE)
),
upsert_phases AS (
  INSERT INTO shipment_workflow_template_phases (
    id, template_id, phase_key, label_fa, label_en, sort_order, is_visible, created_at, updated_at
  )
  SELECT
    'swtp-ir-import-customs-v1-' || regexp_replace(phase_key, '[^a-zA-Z0-9]+', '-', 'g'),
    'swt-ir-import-customs-v1',
    phase_key,
    label_fa,
    label_en,
    sort_order,
    is_visible,
    NOW(),
    NOW()
  FROM phase_seed
  ON CONFLICT (id) DO UPDATE SET
    label_fa = EXCLUDED.label_fa,
    label_en = EXCLUDED.label_en,
    sort_order = EXCLUDED.sort_order,
    is_visible = EXCLUDED.is_visible,
    updated_at = NOW()
  RETURNING id, phase_key
),
step_seed(step_key, phase_key, label_fa, label_en, sort_order) AS (
  VALUES
    ('001','order_registration','پرونده واردات ایجاد شد','Import file created',1),
    ('002','order_registration','احراز نقش بازرگان / کارت بازرگانی بررسی شد','Trader profile checked',2),
    ('003','order_registration','شناسه فروشنده خارجی انتخاب / اخذ شد','Foreign seller ID selected/requested',3),
    ('004','order_registration','پیش‌فاکتور ثبت شد','Proforma invoice registered',4),
    ('005','order_registration','اطلاعات اصلی پرونده تکمیل شد','Basic order info completed',5),
    ('006','order_registration','اطلاعات گمرکی و حمل تکمیل شد','Customs & transport info completed',6),
    ('007','order_registration','اطلاعات مالی و بانکی تکمیل شد','Financial & banking info completed',7),
    ('008','order_registration','کالاها به پرونده اضافه شدند','Goods added to order',8),
    ('009','order_registration','مستندات پرونده بارگذاری شد','Supporting docs uploaded',9),
    ('010','order_registration','استعلام ضوابط کالایی انجام شد','Commodity rules inquiry submitted',10),
    ('011','order_registration','در انتظار مجوزهای ثبت سفارش','Pre-order permits pending',11),
    ('012','order_registration','مجوزهای ثبت سفارش تأیید شد','Pre-order permits approved',12),
    ('013','order_registration','درخواست ثبت سفارش ارسال شد','Order registration requested',13),
    ('014','order_registration','ثبت سفارش نیازمند اصلاح است','Order registration needs correction',14),
    ('015','order_registration','ثبت سفارش تأیید شد','Order registration approved',15),
    ('016','order_registration','کارمزد ثبت سفارش پرداخت شد','Order fee paid',16),
    ('017','order_registration','شماره ۸ رقمی ثبت سفارش صادر شد','Order registration number issued',17),
    ('018','fx_bank','منشأ ارز اظهار شد','FX source declared',18),
    ('019','fx_bank','در انتظار عملیات ارزی / بانکی','FX/bank process pending',19),
    ('020','fx_bank','عملیات ارزی / بانکی تکمیل شد','FX/bank process completed',20),
    ('021','shipping_origin','بیمه حمل صادر شد','Insurance arranged',21),
    ('022','shipping_origin','در انتظار گواهی بازرسی','Inspection certificate pending',22),
    ('023','shipping_origin','رزرو حمل انجام شد','Cargo booked',23),
    ('024','shipping_origin','کالا در مبدأ تحویل حمل شد','Cargo picked up at origin',24),
    ('025','shipping_origin','کالا از مبدأ حرکت کرد','Cargo departed origin',25),
    ('026','shipping_origin','سند حمل صادر شد','Shipping document issued',26),
    ('027','shipping_origin','کالا در مسیر است','Cargo in transit',27),
    ('028','shipping_origin','پیش‌آگهی اسناد حمل دریافت شد','Pre-alert received',28),
    ('029','iran_arrival','اعلامیه ورود صادر شد','Arrival notice issued',29),
    ('030','iran_arrival','کالا وارد مرز / بندر / فرودگاه شد','Cargo arrived in Iran',30),
    ('031','iran_arrival','مانیفست ثبت شد','Manifest registered',31),
    ('032','iran_arrival','ترخیصیه صادر شد','Delivery order issued',32),
    ('033','iran_arrival','کالا تحویل انبار گمرکی شد','Cargo delivered to customs warehouse',33),
    ('034','iran_arrival','قبض انبار صادر شد','Warehouse receipt issued',34),
    ('035','customs_declaration','اسناد ترخیص تکمیل شد','Clearance docs prepared',35),
    ('036','customs_declaration','پیش‌نویس اظهارنامه EPL آماده شد','EPL declaration drafted',36),
    ('037','customs_declaration','اظهارنامه در EPL ثبت شد','EPL declaration submitted',37),
    ('038','customs_declaration','شماره کوتاژ صادر شد','Cotage number issued',38),
    ('039','customs_declaration','مسیر گمرکی تعیین شد','Customs route assigned',39),
    ('040G','customs_route','مسیر سبز — بررسی سریع','Green route processing',40),
    ('040Y','customs_route','مسیر زرد — بررسی اسنادی','Yellow route processing',41),
    ('040R','customs_route','مسیر قرمز — ارزیابی فیزیکی','Red route processing',42),
    ('041','customs_route','کنترل اسناد در جریان است','Document control in progress',43),
    ('042','customs_route','ارزیابی فیزیکی زمان‌بندی شد','Physical inspection scheduled',44),
    ('043','customs_route','ارزیابی فیزیکی انجام شد','Physical inspection completed',45),
    ('044','customs_route','نمونه‌برداری / آزمایشگاه در انتظار','Sampling/lab pending',46),
    ('045','customs_route','نتیجه آزمایشگاه تأیید شد','Lab result approved',47),
    ('046','customs_route','در انتظار مجوزهای قانونی ترخیص','Legal permits pending',48),
    ('047','customs_route','مجوزهای قانونی ترخیص تأیید شد','Legal permits approved',49),
    ('048','customs_route','تعرفه بررسی شد','Tariff reviewed',50),
    ('049','customs_route','ارزش گمرکی بررسی شد','Customs value reviewed',51),
    ('050','customs_route','کارشناسی گمرک تکمیل شد','Expert review completed',52),
    ('051','payment_release','حقوق ورودی و عوارض محاسبه شد','Duties/taxes calculated',53),
    ('052','payment_release','در انتظار پرداخت گمرکی','Customs payment pending',54),
    ('053','payment_release','پرداخت حقوق و عوارض انجام شد','Customs payment completed',55),
    ('054','payment_release','تأیید صندوق / حسابداری گمرک انجام شد','Cashier/accounting confirmed',56),
    ('055','payment_release','پروانه سبز / پروانه گمرکی صادر شد','Green customs permit issued',57),
    ('056','payment_release','در انتظار تسویه انبارداری / ترمینال','Warehouse/terminal charges pending',58),
    ('057','payment_release','هزینه‌های انبارداری / ترمینال تسویه شد','Warehouse/terminal charges paid',59),
    ('058','payment_release','مجوز بارگیری صادر شد','Loading permit issued',60),
    ('059','gate_exit','کامیون / وسیله حمل داخلی تخصیص یافت','Truck assigned',61),
    ('060','gate_exit','کالا بارگیری شد','Cargo loaded',62),
    ('061','gate_exit','بیجک / حواله خروج انبار صادر شد','Warehouse gate pass issued',63),
    ('062','gate_exit','ارسال به درب خروج گمرک','Sent to customs exit gate',64),
    ('063','gate_exit','کنترل درب خروج در جریان است','Exit gate control in progress',65),
    ('064','gate_exit','خروج بلامانع شد','Exit approved',66),
    ('065','gate_exit','خروج از گمرک انجام شد','Exited customs',67),
    ('066','gate_exit','تحویل انبار مقصد شد','Delivered to importer warehouse',68)
),
upsert_steps AS (
  INSERT INTO shipment_workflow_template_steps (
    id, template_id, phase_id, phase_key, step_key, label_fa, label_en, public_label,
    sort_order, is_required, is_visible, is_customer_visible, role_suggestion,
    expected_duration_hours, task_policy_json, expected_documents_json,
    expected_form_fields_json, next_step_rules_json, visibility_rule_json,
    created_at, updated_at
  )
  SELECT
    'swts-ir-import-customs-v1-' || lower(regexp_replace(step_key, '[^a-zA-Z0-9]+', '-', 'g')),
    'swt-ir-import-customs-v1',
    phases.id,
    seed.phase_key,
    seed.step_key,
    seed.label_fa,
    seed.label_en,
    CASE WHEN seed.phase_key = 'customs_route' THEN 'پرونده در حال بررسی گمرکی است' ELSE seed.label_fa END,
    seed.sort_order,
    TRUE,
    TRUE,
    TRUE,
    NULL,
    NULL,
    '{"mode":"suggested"}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb,
    CASE WHEN seed.phase_key = 'customs_route' THEN '{"type":"iran_customs_route_v1"}'::jsonb ELSE '{}'::jsonb END,
    NOW(),
    NOW()
  FROM step_seed seed
  JOIN shipment_workflow_template_phases phases
    ON phases.template_id = 'swt-ir-import-customs-v1'
   AND phases.phase_key = seed.phase_key
  ON CONFLICT (id) DO UPDATE SET
    phase_id = EXCLUDED.phase_id,
    phase_key = EXCLUDED.phase_key,
    label_fa = EXCLUDED.label_fa,
    label_en = EXCLUDED.label_en,
    public_label = EXCLUDED.public_label,
    sort_order = EXCLUDED.sort_order,
    is_required = EXCLUDED.is_required,
    is_visible = EXCLUDED.is_visible,
    is_customer_visible = EXCLUDED.is_customer_visible,
    visibility_rule_json = EXCLUDED.visibility_rule_json,
    updated_at = NOW()
  RETURNING id
),
mapping_seed(shipment_type_code) AS (
  VALUES
    ('IMPORT_LENJ'),
    ('IMPORT_SEA_CONTAINER'),
    ('IMPORT_SEA_BULK'),
    ('IMPORT_AIR_CARGO'),
    ('IMPORT_LAND_TRUCK')
)
INSERT INTO shipment_type_workflow_templates (
  id, organization_id, shipment_type_code, workflow_template_id,
  workflow_template_code, workflow_template_version, created_at, updated_at
)
SELECT
  'stwt-global-' || lower(replace(shipment_type_code, '_', '-')),
  NULL,
  shipment_type_code,
  'swt-ir-import-customs-v1',
  'IR_IMPORT_CUSTOMS_V1',
  1,
  NOW(),
  NOW()
FROM mapping_seed
ON CONFLICT (id) DO UPDATE SET
  workflow_template_id = EXCLUDED.workflow_template_id,
  workflow_template_code = EXCLUDED.workflow_template_code,
  workflow_template_version = EXCLUDED.workflow_template_version,
  archived_at = NULL,
  updated_at = NOW();

WITH template_definition AS (
  SELECT
    templates.id,
    jsonb_build_object(
      'key', templates.code,
      'code', templates.code,
      'version', templates.version,
      'titleFa', templates.title_fa,
      'titleEn', templates.title_en,
      'routeVisibilityRule', 'iran_customs_route_v1',
      'phases', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', phases.phase_key,
          'phaseKey', phases.phase_key,
          'labelFa', phases.label_fa,
          'labelEn', phases.label_en,
          'order', phases.sort_order,
          'isVisible', phases.is_visible
        ) ORDER BY phases.sort_order), '[]'::jsonb)
        FROM shipment_workflow_template_phases phases
        WHERE phases.template_id = templates.id
      ),
      'steps', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'phaseId', steps.phase_key,
          'phaseKey', steps.phase_key,
          'code', steps.step_key,
          'stepKey', steps.step_key,
          'labelFa', steps.label_fa,
          'labelEn', steps.label_en,
          'publicLabel', steps.public_label,
          'order', steps.sort_order,
          'isRequired', steps.is_required,
          'isVisible', steps.is_visible,
          'isCustomerVisible', steps.is_customer_visible,
          'roleSuggestion', steps.role_suggestion,
          'expectedDurationHours', steps.expected_duration_hours,
          'taskPolicy', steps.task_policy_json,
          'expectedDocuments', steps.expected_documents_json,
          'expectedFormFields', steps.expected_form_fields_json,
          'nextStepRules', steps.next_step_rules_json,
          'visibilityRule', steps.visibility_rule_json
        ) ORDER BY steps.sort_order), '[]'::jsonb)
        FROM shipment_workflow_template_steps steps
        WHERE steps.template_id = templates.id
          AND steps.archived_at IS NULL
      ),
      'blockers', '[{"code":"B01","labelFa":"کسری مدارک","labelEn":"Missing document"},{"code":"B02","labelFa":"مغایرت اطلاعات","labelEn":"Data mismatch"},{"code":"B03","labelFa":"ایراد در کد تعرفه","labelEn":"HS code issue"},{"code":"B04","labelFa":"ایراد در شناسه کالا","labelEn":"Goods ID issue"},{"code":"B05","labelFa":"ایراد در شناسه فروشنده خارجی","labelEn":"Seller ID issue"},{"code":"B06","labelFa":"رد مجوز","labelEn":"Permit rejected"},{"code":"B07","labelFa":"تأخیر در صدور مجوز","labelEn":"Permit pending too long"},{"code":"B08","labelFa":"رد ثبت سفارش","labelEn":"Order registration rejected"},{"code":"B09","labelFa":"انقضای ثبت سفارش","labelEn":"Order registration expired"},{"code":"B10","labelFa":"نیاز به ویرایش ثبت سفارش","labelEn":"Order amendment required"},{"code":"B11","labelFa":"عدم اظهار منشأ ارز","labelEn":"FX source missing"},{"code":"B12","labelFa":"توقف عملیات ارزی / بانکی","labelEn":"Bank/FX blocked"},{"code":"B13","labelFa":"اصل اسناد دریافت نشده","labelEn":"Original docs not received"},{"code":"B14","labelFa":"مغایرت مانیفست","labelEn":"Manifest mismatch"},{"code":"B15","labelFa":"مغایرت قبض انبار","labelEn":"Warehouse receipt mismatch"},{"code":"B16","labelFa":"ترخیصیه صادر نشده","labelEn":"Delivery order missing"},{"code":"B17","labelFa":"اختلاف ارزش گمرکی","labelEn":"Valuation dispute"},{"code":"B18","labelFa":"اختلاف تعرفه","labelEn":"Tariff dispute"},{"code":"B19","labelFa":"مغایرت در ارزیابی فیزیکی","labelEn":"Physical inspection discrepancy"},{"code":"B20","labelFa":"عدم تأیید آزمایشگاه","labelEn":"Lab failed"},{"code":"B21","labelFa":"توقف استاندارد / بهداشت / قرنطینه","labelEn":"Standard/health/quarantine hold"},{"code":"B22","labelFa":"خطا در پرداخت گمرکی","labelEn":"Payment failed"},{"code":"B23","labelFa":"عدم تسویه انبارداری","labelEn":"Warehouse charges unpaid"},{"code":"B24","labelFa":"دموراژ / دیتنشن پرداخت نشده","labelEn":"Demurrage/detention pending"},{"code":"B25","labelFa":"عدم صدور مجوز بارگیری","labelEn":"Loading not allowed"},{"code":"B26","labelFa":"برگشت از درب خروج","labelEn":"Gate exit rejected"},{"code":"B27","labelFa":"توقف گمرکی","labelEn":"Customs hold"},{"code":"B28","labelFa":"پرونده تحت بررسی است","labelEn":"Case under review"},{"code":"B29","labelFa":"ریسک متروکه شدن کالا","labelEn":"Goods abandoned risk"},{"code":"B30","labelFa":"ریسک ضبط / توقیف قانونی","labelEn":"Legal seizure/confiscation risk"}]'::jsonb
    ) AS snapshot
  FROM shipment_workflow_templates templates
  WHERE templates.id = 'swt-ir-import-customs-v1'
)
UPDATE shipment_workflow_instances instances
SET workflow_template_id = template_definition.id,
    workflow_template_code = 'IR_IMPORT_CUSTOMS_V1',
    workflow_template_version = 1,
    workflow_definition_snapshot_json = COALESCE(instances.workflow_definition_snapshot_json, template_definition.snapshot),
    updated_at = NOW()
FROM template_definition
WHERE instances.workflow_key = 'IR_IMPORT_CUSTOMS_V1'
  AND (
    instances.workflow_template_id IS NULL
    OR instances.workflow_template_code IS NULL
    OR instances.workflow_template_version IS NULL
    OR instances.workflow_definition_snapshot_json IS NULL
  );

INSERT INTO permissions (id, key, description)
VALUES ('perm-shipment-workflows-manage', 'shipment_workflows.manage', 'Manage shipment workflow templates')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.key = 'shipment_workflows.manage'
WHERE roles.name = 'CEO'
ON CONFLICT (role_id, permission_id) DO NOTHING;
