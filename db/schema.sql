CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar TEXT,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_review',
  owner_user_id TEXT,
  plan_id TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  approved_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price_irr NUMERIC NOT NULL DEFAULT 0,
  annual_price_irr NUMERIC NOT NULL DEFAULT 0,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'pending_payment',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  limits_override JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signup_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  plan_id TEXT REFERENCES subscription_plans(id),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  company_size TEXT,
  expected_volume TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'payment_pending',
  payment_id TEXT,
  reviewed_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  signup_request_id TEXT REFERENCES signup_requests(id) ON DELETE SET NULL,
  subscription_id TEXT REFERENCES organization_subscriptions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'zarinpal',
  status TEXT NOT NULL DEFAULT 'pending',
  amount_irr NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IRR',
  description TEXT,
  gateway_authority TEXT UNIQUE,
  gateway_ref_id TEXT,
  gateway_url TEXT,
  requested_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  manual_note TEXT,
  marked_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  marked_at TIMESTAMPTZ,
  raw_request JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_verify JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  subscription_id TEXT REFERENCES organization_subscriptions(id) ON DELETE SET NULL,
  signup_request_id TEXT REFERENCES signup_requests(id) ON DELETE SET NULL,
  payment_id TEXT REFERENCES billing_payments(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'issued',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  currency TEXT NOT NULL DEFAULT 'IRR',
  subtotal_irr NUMERIC NOT NULL DEFAULT 0,
  tax_irr NUMERIC NOT NULL DEFAULT 0,
  total_irr NUMERIC NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_amount_irr NUMERIC NOT NULL DEFAULT 0,
  total_amount_irr NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  invoice_id TEXT UNIQUE REFERENCES billing_invoices(id) ON DELETE SET NULL,
  payment_id TEXT REFERENCES billing_payments(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL UNIQUE,
  amount_irr NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IRR',
  provider TEXT NOT NULL DEFAULT 'manual',
  gateway_ref_id TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES organization_subscriptions(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_error_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  source TEXT NOT NULL DEFAULT 'client',
  message TEXT NOT NULL,
  stack TEXT,
  route TEXT,
  api_endpoint TEXT,
  http_status INTEGER,
  browser TEXT,
  user_agent TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  resolved_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_requests (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  preferred_contact_method TEXT NOT NULL DEFAULT 'phone',
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  resolved_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_templates (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_records (
  owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  item_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_user_id, collection, item_id)
);

CREATE INDEX IF NOT EXISTS user_records_owner_collection_idx
  ON user_records (owner_user_id, collection);

CREATE INDEX IF NOT EXISTS user_records_org_collection_updated_idx
  ON user_records (organization_id, collection, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_records_data_idx
  ON user_records USING GIN (data);

CREATE TABLE IF NOT EXISTS malvani_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  captain_name TEXT NOT NULL DEFAULT '',
  lenj_name TEXT NOT NULL DEFAULT '',
  lenj_registration_number TEXT NOT NULL DEFAULT '',
  lenj_type TEXT,
  home_port TEXT,
  active_status TEXT NOT NULL DEFAULT 'ACTIVE',
  note TEXT NOT NULL DEFAULT '',
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT malvani_profiles_active_status_check CHECK (active_status IN ('ACTIVE', 'INACTIVE', 'NEEDS_REVIEW'))
);

CREATE INDEX IF NOT EXISTS malvani_profiles_org_active_idx
  ON malvani_profiles (organization_id, active_status, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS malvani_profiles_org_archived_idx
  ON malvani_profiles (organization_id, archived_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS business_entity_contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL,
  phone_label TEXT,
  note TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT business_entity_contacts_entity_type_check CHECK (entity_type IN ('commercial_card', 'malvani')),
  CONSTRAINT business_entity_contacts_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS business_entity_contacts_entity_idx
  ON business_entity_contacts (organization_id, entity_type, entity_id, sort_order ASC, created_at ASC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS business_entity_contacts_org_archived_idx
  ON business_entity_contacts (organization_id, archived_at, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS business_entity_contacts_primary_idx
  ON business_entity_contacts (organization_id, entity_type, entity_id)
  WHERE is_primary IS TRUE AND archived_at IS NULL;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS customers
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS user_records ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS shipment_status_events ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS cheques ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS compliance_meetings ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS meeting_required_documents ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS quotations ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS archive_records ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS chat_threads ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS chat_messages ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS documents ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS document_versions ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS change_logs ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS customer_access_token TEXT;

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS app_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS login_sms_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  customer_code TEXT,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  referrer TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  shipment_code TEXT NOT NULL,
  shamsi_year INTEGER,
  shamsi_date TEXT,
  shamsi_sequence INTEGER,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  shipment_direction TEXT DEFAULT 'import',
  transport_mode TEXT,
  shipment_type_code TEXT DEFAULT 'IMPORT_SEA_CONTAINER',
  origin TEXT,
  destination TEXT,
  estimated_delivery_at TEXT,
  free_time_ends_at TEXT,
  assigned_manager_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  current_step_id TEXT,
  customer_access_token TEXT,
  customer_access_token_hash TEXT,
  customer_access_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  exited_archived_at TIMESTAMPTZ,
  exited_archived_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  exited_archive_reason TEXT,
  post_exit_status TEXT,
  post_exit_note TEXT,
  post_exit_follow_up_at TIMESTAMPTZ,
  post_exit_closed_at TIMESTAMPTZ,
  post_exit_closed_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipments_direction_check CHECK (
    shipment_direction IS NULL OR shipment_direction IN ('import', 'export', 'transit', 'domestic')
  ),
  CONSTRAINT shipments_transport_mode_check CHECK (
    transport_mode IS NULL OR transport_mode IN ('sea', 'air', 'land', 'rail')
  ),
  CONSTRAINT shipments_post_exit_status_check CHECK (
    post_exit_status IS NULL OR post_exit_status IN ('needs_follow_up', 'in_progress', 'settled', 'closed')
  )
);

CREATE TABLE IF NOT EXISTS shipment_code_counters (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shamsi_year INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, shamsi_year),
  CONSTRAINT shipment_code_counters_year_check CHECK (shamsi_year BETWEEN 1200 AND 1600),
  CONSTRAINT shipment_code_counters_sequence_check CHECK (last_sequence BETWEEN 0 AND 999)
);

CREATE TABLE IF NOT EXISTS shipment_status_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  public_label TEXT NOT NULL,
  public_description TEXT,
  is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_v2_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  flow_code TEXT NOT NULL,
  sections_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_v2_profiles_unique_shipment UNIQUE (organization_id, shipment_id),
  CONSTRAINT shipment_v2_profiles_flow_code_check CHECK (flow_code IN ('IMPORT_LANJ', 'IMPORT_SHIP')),
  CONSTRAINT shipment_v2_profiles_sections_object_check CHECK (jsonb_typeof(sections_json) = 'object')
);

CREATE TABLE IF NOT EXISTS shipment_kootaj_details (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  commercial_card_id TEXT,
  order_registration_number TEXT,
  order_registration_date TEXT,
  order_registration_expiry_date TEXT,
  order_registration_status TEXT,
  proforma_number TEXT,
  proforma_date TEXT,
  foreign_seller_name TEXT,
  foreign_seller_code TEXT,
  goods_id_summary TEXT,
  hs_code_summary TEXT,
  order_permit_status TEXT,
  fx_source_status TEXT,
  currency_type TEXT,
  currency_amount NUMERIC(18, 2),
  bank_name TEXT,
  bank_tracking_number TEXT,
  fx_allocation_date TEXT,
  bank_process_status TEXT,
  insurance_number TEXT,
  inspection_certificate_number TEXT,
  booking_number TEXT,
  bill_of_lading_number TEXT,
  transport_document_number TEXT,
  pre_alert_date TEXT,
  cotage_number TEXT,
  customs_status TEXT,
  customs_route TEXT,
  customs_office TEXT,
  declaration_reference TEXT,
  declaration_date TEXT,
  cotage_date TEXT,
  container_summary TEXT,
  goods_summary TEXT,
  package_count INTEGER,
  gross_weight_kg NUMERIC(18, 3),
  net_weight_kg NUMERIC(18, 3),
  arrival_notice_number TEXT,
  arrival_date TEXT,
  manifest_number TEXT,
  delivery_order_number TEXT,
  warehouse_name TEXT,
  warehouse_receipt_number TEXT,
  warehouse_receipt_date TEXT,
  evaluator_name TEXT,
  expert_name TEXT,
  document_control_status TEXT,
  physical_inspection_status TEXT,
  physical_inspection_date TEXT,
  lab_status TEXT,
  lab_result_date TEXT,
  tariff_review_status TEXT,
  valuation_status TEXT,
  legal_permit_status TEXT,
  standard_permit_status TEXT,
  health_permit_status TEXT,
  quarantine_permit_status TEXT,
  other_permit_notes TEXT,
  tax_payment_status TEXT,
  duties_amount NUMERIC(18, 2),
  tax_amount NUMERIC(18, 2),
  customs_payment_date TEXT,
  payment_reference TEXT,
  cashier_confirmation_status TEXT,
  warehouse_charges_status TEXT,
  terminal_charges_status TEXT,
  demurrage_status TEXT,
  loading_permit_number TEXT,
  loading_permit_date TEXT,
  truck_plate TEXT,
  driver_name TEXT,
  gate_pass_number TEXT,
  exit_gate_status TEXT,
  release_status TEXT,
  exit_date TEXT,
  delivery_date TEXT,
  internal_note TEXT,
  custom_fields_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_kootaj_details_unique_shipment UNIQUE (organization_id, shipment_id),
  CONSTRAINT shipment_kootaj_details_customs_route_check CHECK (customs_route IS NULL OR customs_route IN ('green', 'yellow', 'red')),
  CONSTRAINT shipment_kootaj_details_customs_status_check CHECK (
    customs_status IS NULL OR customs_status IN (
      'not_started',
      'declaration_registered',
      'in_customs_review',
      'documents_required',
      'inspection',
      'duties_pending',
      'ready_for_release',
      'released',
      'exited',
      'blocked'
    )
  ),
  CONSTRAINT shipment_kootaj_details_tax_payment_status_check CHECK (
    tax_payment_status IS NULL OR tax_payment_status IN ('not_started', 'pending', 'in_progress', 'completed', 'blocked', 'not_required', 'paid')
  ),
  CONSTRAINT shipment_kootaj_details_release_status_check CHECK (
    release_status IS NULL OR release_status IN ('not_released', 'ready', 'released', 'exited', 'blocked')
  ),
  CONSTRAINT shipment_kootaj_details_exit_date_check CHECK (
    exit_date IS NULL OR exit_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  ),
  CONSTRAINT shipment_kootaj_details_currency_amount_non_negative CHECK (currency_amount IS NULL OR currency_amount >= 0),
  CONSTRAINT shipment_kootaj_details_package_count_non_negative CHECK (package_count IS NULL OR package_count >= 0),
  CONSTRAINT shipment_kootaj_details_gross_weight_non_negative CHECK (gross_weight_kg IS NULL OR gross_weight_kg >= 0),
  CONSTRAINT shipment_kootaj_details_net_weight_non_negative CHECK (net_weight_kg IS NULL OR net_weight_kg >= 0),
  CONSTRAINT shipment_kootaj_details_duties_amount_non_negative CHECK (duties_amount IS NULL OR duties_amount >= 0),
  CONSTRAINT shipment_kootaj_details_tax_amount_non_negative CHECK (tax_amount IS NULL OR tax_amount >= 0)
);

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

CREATE INDEX IF NOT EXISTS customers_customer_code_idx
  ON customers (customer_code);

CREATE TABLE IF NOT EXISTS customer_phone_numbers (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_label TEXT,
  note TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_phone_numbers_customer_idx
  ON customer_phone_numbers (organization_id, customer_id, archived_at);

CREATE INDEX IF NOT EXISTS customer_phone_numbers_phone_idx
  ON customer_phone_numbers (organization_id, phone_number);

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
  archived_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  archived_reason TEXT,
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
  catalog_step_id TEXT REFERENCES shipment_workflow_step_catalog(id) ON DELETE SET NULL,
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
  checklist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
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

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  assigned_to_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  assigned_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_by_name TEXT,
  assigned_at TIMESTAMPTZ,
  assignment_note TEXT,
  due_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  workflow_instance_id TEXT,
  workflow_step_code TEXT,
  workflow_blocker_id TEXT,
  blocker_code TEXT,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  completed_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_workflow_instances (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  workflow_key TEXT NOT NULL,
  workflow_template_id TEXT REFERENCES shipment_workflow_templates(id) ON DELETE SET NULL,
  workflow_template_code TEXT,
  workflow_template_version INTEGER,
  workflow_definition_snapshot_json JSONB,
  status TEXT NOT NULL DEFAULT 'active',
  current_step_code TEXT,
  customs_route TEXT,
  started_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_workflow_instances_workflow_key_nonempty CHECK (length(trim(workflow_key)) > 0),
  CONSTRAINT shipment_workflow_instances_status_check CHECK (status IN ('active', 'completed', 'cancelled')),
  CONSTRAINT shipment_workflow_instances_customs_route_check CHECK (customs_route IS NULL OR customs_route IN ('green', 'yellow', 'red')),
  CONSTRAINT shipment_workflow_instances_unique_workflow UNIQUE (organization_id, shipment_id, workflow_key)
);

CREATE TABLE IF NOT EXISTS shipment_workflow_step_states (
  workflow_instance_id TEXT NOT NULL REFERENCES shipment_workflow_instances(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  step_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_exceptional BOOLEAN NOT NULL DEFAULT FALSE,
  internal_note TEXT,
  public_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workflow_instance_id, step_code),
  CONSTRAINT shipment_workflow_step_states_status_check CHECK (status IN ('pending', 'active', 'completed', 'skipped'))
);

CREATE TABLE IF NOT EXISTS shipment_workflow_blockers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_instance_id TEXT NOT NULL REFERENCES shipment_workflow_instances(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  step_code TEXT,
  blocker_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  internal_note TEXT,
  public_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_workflow_blockers_status_check CHECK (status IN ('open', 'resolved', 'cancelled')),
  CONSTRAINT shipment_workflow_blockers_code_check CHECK (blocker_code ~ '^B(0[1-9]|[12][0-9]|30)$')
);

CREATE TABLE IF NOT EXISTS shipment_workflow_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_instance_id TEXT NOT NULL REFERENCES shipment_workflow_instances(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  step_code TEXT,
  blocker_id TEXT REFERENCES shipment_workflow_blockers(id) ON DELETE SET NULL,
  blocker_code TEXT,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  internal_note TEXT,
  public_note TEXT,
  public_visible BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS tasks
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignment_note TEXT,
  ADD COLUMN IF NOT EXISTS completed_by_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_instance_id TEXT REFERENCES shipment_workflow_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_step_code TEXT,
  ADD COLUMN IF NOT EXISTS workflow_blocker_id TEXT REFERENCES shipment_workflow_blockers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocker_code TEXT;

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  workflow_instance_id TEXT REFERENCES shipment_workflow_instances(id) ON DELETE SET NULL,
  workflow_step_code TEXT,
  workflow_blocker_id TEXT REFERENCES shipment_workflow_blockers(id) ON DELETE SET NULL,
  blocker_code TEXT,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  from_assignee_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  to_assignee_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_workflow_instance_id_fkey') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_workflow_instance_id_fkey
      FOREIGN KEY (workflow_instance_id) REFERENCES shipment_workflow_instances(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_workflow_blocker_id_fkey') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_workflow_blocker_id_fkey
      FOREIGN KEY (workflow_blocker_id) REFERENCES shipment_workflow_blockers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cheques (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  bank_name TEXT NOT NULL,
  cheque_number TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IRR',
  due_date TEXT,
  location TEXT,
  receiver TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  description TEXT,
  assigned_to_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, cheque_number)
);

CREATE TABLE IF NOT EXISTS compliance_meetings (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  organization_name TEXT,
  meeting_at TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  assigned_to_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  description TEXT,
  outcome TEXT,
  next_action_items TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  related_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  related_shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_required_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id TEXT NOT NULL REFERENCES compliance_meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  file_name TEXT,
  document_id TEXT,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  quotation_number TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  origin_city TEXT,
  destination_city TEXT,
  cargo_type TEXT,
  weight NUMERIC NOT NULL DEFAULT 0,
  dimensions TEXT,
  pickup_date TEXT,
  delivery_date TEXT,
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  base_rate NUMERIC NOT NULL DEFAULT 0,
  fuel_surcharge NUMERIC NOT NULL DEFAULT 0,
  loading_fees NUMERIC NOT NULL DEFAULT 0,
  toll_fees NUMERIC NOT NULL DEFAULT 0,
  insurance_percentage NUMERIC NOT NULL DEFAULT 0,
  profit_margin NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  converted_shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, quotation_number)
);

CREATE TABLE IF NOT EXISTS archive_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  customer_name TEXT,
  shipment_id TEXT,
  archived_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_at TIMESTAMPTZ,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  name TEXT,
  description TEXT,
  role_limit TEXT,
  icon TEXT,
  legacy_channel_id TEXT,
  direct_key TEXT,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  last_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT chat_threads_type_check CHECK (type IN ('DM', 'GROUP', 'CHANNEL', 'SHIPMENT'))
);

CREATE TABLE IF NOT EXISTS chat_thread_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  added_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  removed_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  removed_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_thread_members_role_check CHECK (role IN ('owner', 'admin', 'member')),
  CONSTRAINT chat_thread_members_status_check CHECK (status IN ('active', 'removed')),
  UNIQUE (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  body TEXT NOT NULL,
  body_format TEXT NOT NULL DEFAULT 'plain_text',
  client_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chat_messages_body_length_check CHECK (char_length(body) BETWEEN 1 AND 4000),
  CONSTRAINT chat_messages_body_format_check CHECK (body_format = 'plain_text'),
  CONSTRAINT chat_messages_status_check CHECK (status IN ('sent', 'deleted'))
);

CREATE TABLE IF NOT EXISTS chat_message_read_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_message_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_message_attachments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  uploaded_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_bucket TEXT,
  storage_region TEXT,
  storage_key TEXT,
  object_key TEXT,
  local_path TEXT,
  checksum_sha256 TEXT,
  original_filename TEXT NOT NULL,
  file_name TEXT,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  attachment_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  deleted_reason TEXT,
  storage_deleted_at TIMESTAMPTZ,
  storage_delete_error TEXT,
  CONSTRAINT chat_message_attachments_type_check CHECK (attachment_type IN ('image', 'document')),
  CONSTRAINT chat_message_attachments_size_check CHECK (size_bytes >= 0)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  file_size TEXT,
  storage_key TEXT,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  object_key TEXT,
  storage_bucket TEXT,
  storage_region TEXT,
  local_path TEXT,
  checksum TEXT,
  checksum_sha256 TEXT,
  size_bytes BIGINT,
  content_type TEXT,
  storage_migrated_at TIMESTAMPTZ,
  storage_verified_at TIMESTAMPTZ,
  storage_migration_status TEXT NOT NULL DEFAULT 'local',
  storage_migration_error TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  meeting_id TEXT,
  cheque_id TEXT,
  quotation_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'internal',
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  storage_key TEXT,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  object_key TEXT,
  storage_bucket TEXT,
  storage_region TEXT,
  local_path TEXT,
  checksum_sha256 TEXT,
  size_bytes BIGINT,
  content_type TEXT,
  storage_migrated_at TIMESTAMPTZ,
  storage_verified_at TIMESTAMPTZ,
  storage_migration_status TEXT NOT NULL DEFAULT 'local',
  storage_migration_error TEXT,
  file_name TEXT,
  uploaded_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meeting_required_documents_document_id_fkey'
  ) THEN
    ALTER TABLE meeting_required_documents
      ADD CONSTRAINT meeting_required_documents_document_id_fkey
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES app_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_deliveries (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  recipient_type TEXT NOT NULL DEFAULT 'user',
  recipient_name TEXT,
  recipient_phone TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT NOT NULL DEFAULT 'smsir',
  source_type TEXT NOT NULL,
  source_id TEXT,
  event_key TEXT NOT NULL UNIQUE,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_message_id TEXT,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  skip_reason TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS sms_deliveries
  ADD COLUMN IF NOT EXISTS recipient_type TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS recipient_name TEXT;

CREATE TABLE IF NOT EXISTS change_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_id TEXT,
  ip TEXT,
  user_agent TEXT,
  before_json JSONB,
  after_json JSONB,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'audit_logs_prevent_update'
      AND tgrelid = 'audit_logs'::regclass
  ) THEN
    CREATE TRIGGER audit_logs_prevent_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_logs_mutation();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'audit_logs_prevent_delete'
      AND tgrelid = 'audit_logs'::regclass
  ) THEN
    CREATE TRIGGER audit_logs_prevent_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_logs_mutation();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions (user_id);
CREATE INDEX IF NOT EXISTS app_sessions_token_hash_idx ON app_sessions (token_hash);
CREATE INDEX IF NOT EXISTS app_sessions_active_token_hash_idx ON app_sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS user_permissions_permission_idx ON user_permissions (permission_id);
CREATE INDEX IF NOT EXISTS login_sms_challenges_phone_idx ON login_sms_challenges (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS login_sms_challenges_user_idx ON login_sms_challenges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_reset_at_idx ON rate_limit_buckets (reset_at);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations (status);
CREATE INDEX IF NOT EXISTS organizations_owner_idx ON organizations (owner_user_id);
CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members (user_id);
CREATE INDEX IF NOT EXISTS organization_subscriptions_org_idx ON organization_subscriptions (organization_id, status);
CREATE INDEX IF NOT EXISTS signup_requests_status_idx ON signup_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_payments_authority_idx ON billing_payments (gateway_authority);
CREATE INDEX IF NOT EXISTS billing_payments_org_idx ON billing_payments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_invoices_org_idx ON billing_invoices (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_invoices_status_idx ON billing_invoices (status, due_at);
CREATE INDEX IF NOT EXISTS billing_invoice_items_invoice_idx ON billing_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS billing_receipts_org_idx ON billing_receipts (organization_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS subscription_events_org_idx ON subscription_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_events_subscription_idx ON subscription_events (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_error_logs_org_idx ON app_error_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_error_logs_resolved_idx ON app_error_logs (resolved_at, created_at DESC);
CREATE INDEX IF NOT EXISTS app_error_logs_source_idx ON app_error_logs (source, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_requests_status_idx ON contact_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_templates_enabled_idx ON sms_templates (enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_users_organization_idx ON app_users (organization_id);
CREATE INDEX IF NOT EXISTS app_users_org_updated_idx ON app_users (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS customers_company_name_idx ON customers (company_name);
CREATE INDEX IF NOT EXISTS customers_organization_idx ON customers (organization_id);
CREATE INDEX IF NOT EXISTS customers_status_idx ON customers (status);
CREATE INDEX IF NOT EXISTS customers_org_updated_idx ON customers (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS customers_org_email_idx ON customers (organization_id, email);
CREATE INDEX IF NOT EXISTS customers_org_phone_idx ON customers (organization_id, phone);
CREATE INDEX IF NOT EXISTS shipments_shipment_code_idx ON shipments (shipment_code);
CREATE INDEX IF NOT EXISTS shipments_customer_id_idx ON shipments (customer_id);
CREATE INDEX IF NOT EXISTS shipments_organization_idx ON shipments (organization_id);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON shipments (status);
CREATE INDEX IF NOT EXISTS shipments_free_time_ends_at_idx ON shipments (free_time_ends_at);
CREATE INDEX IF NOT EXISTS shipments_customer_access_token_hash_idx ON shipments (customer_access_token_hash);
CREATE INDEX IF NOT EXISTS shipments_org_updated_idx ON shipments (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS shipments_org_code_idx ON shipments (organization_id, shipment_code);
CREATE UNIQUE INDEX IF NOT EXISTS shipments_org_shipment_code_unique_idx ON shipments (organization_id, shipment_code) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipments_org_shamsi_year_idx ON shipments (organization_id, shamsi_year);
CREATE INDEX IF NOT EXISTS shipments_org_shamsi_date_idx ON shipments (organization_id, shamsi_date);
CREATE INDEX IF NOT EXISTS shipments_org_customer_access_idx ON shipments (organization_id, customer_access_enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS shipments_org_type_idx ON shipments (organization_id, shipment_type_code) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipments_org_exited_archive_idx ON shipments (organization_id, exited_archived_at DESC, updated_at DESC) WHERE exited_archived_at IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipments_org_active_not_exited_idx ON shipments (organization_id, updated_at DESC) WHERE archived_at IS NULL AND exited_archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipments_org_post_exit_follow_up_idx ON shipments (organization_id, post_exit_status, post_exit_follow_up_at) WHERE exited_archived_at IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipment_v2_profiles_org_updated_idx ON shipment_v2_profiles (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS shipment_v2_profiles_org_flow_idx ON shipment_v2_profiles (organization_id, flow_code, updated_at DESC);
CREATE INDEX IF NOT EXISTS shipment_v2_profiles_sections_gin_idx ON shipment_v2_profiles USING GIN (sections_json);
CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_shipment_idx ON shipment_kootaj_details (organization_id, shipment_id);
CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_updated_idx ON shipment_kootaj_details (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_cotage_idx ON shipment_kootaj_details (organization_id, cotage_number) WHERE cotage_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_commercial_card_idx ON shipment_kootaj_details (organization_id, commercial_card_id) WHERE commercial_card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_order_registration_idx ON shipment_kootaj_details (organization_id, order_registration_number) WHERE order_registration_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_bill_of_lading_idx ON shipment_kootaj_details (organization_id, bill_of_lading_number) WHERE bill_of_lading_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_bank_tracking_idx ON shipment_kootaj_details (organization_id, bank_tracking_number) WHERE bank_tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipment_kootaj_details_custom_fields_gin_idx ON shipment_kootaj_details USING GIN (custom_fields_json);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_form_templates_global_code_idx ON shipment_form_templates (code, shipment_type_code) WHERE organization_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipment_form_templates_org_code_idx ON shipment_form_templates (organization_id, code, shipment_type_code) WHERE organization_id IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipment_form_template_sections_key_idx ON shipment_form_template_sections (template_id, section_key);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_form_template_fields_key_idx ON shipment_form_template_fields (template_id, field_key);
CREATE INDEX IF NOT EXISTS shipment_form_templates_active_type_idx ON shipment_form_templates (shipment_type_code, is_active, organization_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipment_form_template_sections_template_idx ON shipment_form_template_sections (template_id, sort_order);
CREATE INDEX IF NOT EXISTS shipment_form_template_fields_template_idx ON shipment_form_template_fields (template_id, sort_order) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_step_catalog_system_code_idx ON shipment_workflow_step_catalog (code) WHERE organization_id IS NULL AND is_system = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_step_catalog_org_code_idx ON shipment_workflow_step_catalog (organization_id, code) WHERE organization_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipment_workflow_step_catalog_lookup_idx ON shipment_workflow_step_catalog (organization_id, category, stage_key, default_order) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_templates_global_code_version_idx ON shipment_workflow_templates (code, version) WHERE organization_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_templates_org_code_version_idx ON shipment_workflow_templates (organization_id, code, version) WHERE organization_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipment_workflow_templates_active_idx ON shipment_workflow_templates (organization_id, is_active, code, version DESC) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_template_phases_key_idx ON shipment_workflow_template_phases (template_id, phase_key);
CREATE INDEX IF NOT EXISTS shipment_workflow_template_phases_template_idx ON shipment_workflow_template_phases (template_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_workflow_template_steps_key_idx ON shipment_workflow_template_steps (template_id, step_key) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipment_workflow_template_steps_template_idx ON shipment_workflow_template_steps (template_id, sort_order) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipment_workflow_template_steps_catalog_idx ON shipment_workflow_template_steps (template_id, catalog_step_id) WHERE catalog_step_id IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipment_type_workflow_templates_global_type_idx ON shipment_type_workflow_templates (shipment_type_code) WHERE organization_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipment_type_workflow_templates_org_type_idx ON shipment_type_workflow_templates (organization_id, shipment_type_code) WHERE organization_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipment_type_workflow_templates_template_idx ON shipment_type_workflow_templates (workflow_template_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipment_status_events_shipment_idx ON shipment_status_events (shipment_id);
CREATE INDEX IF NOT EXISTS shipment_status_events_public_idx ON shipment_status_events (shipment_id, is_customer_visible, created_at DESC);
CREATE INDEX IF NOT EXISTS shipment_status_events_org_created_idx ON shipment_status_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_assigned_to_id_idx ON tasks (assigned_to_id);
CREATE INDEX IF NOT EXISTS tasks_organization_idx ON tasks (organization_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_org_updated_idx ON tasks (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_org_due_idx ON tasks (organization_id, due_at);
CREATE INDEX IF NOT EXISTS shipment_workflow_instances_org_shipment_idx ON shipment_workflow_instances (organization_id, shipment_id);
CREATE INDEX IF NOT EXISTS shipment_workflow_instances_org_updated_idx ON shipment_workflow_instances (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS shipment_workflow_instances_template_idx ON shipment_workflow_instances (workflow_template_id) WHERE workflow_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipment_workflow_instances_template_code_idx ON shipment_workflow_instances (organization_id, workflow_template_code, workflow_template_version) WHERE workflow_template_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipment_workflow_step_states_org_shipment_idx ON shipment_workflow_step_states (organization_id, shipment_id);
CREATE INDEX IF NOT EXISTS shipment_workflow_step_states_instance_status_idx ON shipment_workflow_step_states (workflow_instance_id, status);
CREATE INDEX IF NOT EXISTS shipment_workflow_step_states_visible_idx ON shipment_workflow_step_states (workflow_instance_id, is_visible, step_code);
CREATE INDEX IF NOT EXISTS shipment_workflow_blockers_org_shipment_idx ON shipment_workflow_blockers (organization_id, shipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shipment_workflow_blockers_open_idx ON shipment_workflow_blockers (organization_id, shipment_id, workflow_instance_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS shipment_workflow_events_instance_created_idx ON shipment_workflow_events (workflow_instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shipment_workflow_events_org_shipment_idx ON shipment_workflow_events (organization_id, shipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_org_assigned_status_idx ON tasks (organization_id, assigned_to_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_org_assigned_by_idx ON tasks (organization_id, assigned_by_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_org_shipment_idx ON tasks (organization_id, shipment_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_workflow_step_idx ON tasks (organization_id, workflow_instance_id, workflow_step_code);
CREATE INDEX IF NOT EXISTS tasks_workflow_blocker_idx ON tasks (organization_id, workflow_blocker_id);
CREATE INDEX IF NOT EXISTS task_events_task_created_idx ON task_events (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_events_org_created_idx ON task_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cheques_due_date_idx ON cheques (due_date);
CREATE INDEX IF NOT EXISTS cheques_status_idx ON cheques (status);
CREATE INDEX IF NOT EXISTS cheques_owner_idx ON cheques (owner_user_id);
CREATE INDEX IF NOT EXISTS cheques_organization_idx ON cheques (organization_id);
CREATE INDEX IF NOT EXISTS compliance_meetings_meeting_at_idx ON compliance_meetings (meeting_at);
CREATE INDEX IF NOT EXISTS compliance_meetings_status_idx ON compliance_meetings (status);
CREATE INDEX IF NOT EXISTS compliance_meetings_assigned_to_idx ON compliance_meetings (assigned_to_id);
CREATE INDEX IF NOT EXISTS compliance_meetings_organization_idx ON compliance_meetings (organization_id);
CREATE INDEX IF NOT EXISTS meeting_required_documents_meeting_idx ON meeting_required_documents (meeting_id);
CREATE INDEX IF NOT EXISTS quotations_owner_idx ON quotations (owner_user_id);
CREATE INDEX IF NOT EXISTS quotations_organization_idx ON quotations (organization_id);
CREATE INDEX IF NOT EXISTS quotations_status_idx ON quotations (status);
CREATE INDEX IF NOT EXISTS quotations_valid_until_idx ON quotations (valid_until);
CREATE INDEX IF NOT EXISTS archive_records_entity_idx ON archive_records (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS archive_records_organization_idx ON archive_records (organization_id);
CREATE INDEX IF NOT EXISTS archive_records_archived_at_idx ON archive_records (archived_at DESC);
CREATE INDEX IF NOT EXISTS archive_records_org_archived_idx ON archive_records (organization_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS chat_thread_members_user_idx ON chat_thread_members (user_id);
CREATE INDEX IF NOT EXISTS chat_thread_members_org_user_status_idx ON chat_thread_members (organization_id, user_id, status);
CREATE INDEX IF NOT EXISTS chat_thread_members_thread_status_idx ON chat_thread_members (thread_id, status);
CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx ON chat_messages (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_org_thread_created_idx ON chat_messages (organization_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_threads_organization_idx ON chat_threads (organization_id);
CREATE INDEX IF NOT EXISTS chat_threads_org_updated_idx ON chat_threads (organization_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_org_direct_key_uidx ON chat_threads (organization_id, direct_key) WHERE direct_key IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS chat_threads_org_shipment_idx ON chat_threads (organization_id, shipment_id) WHERE shipment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_org_shipment_active_uidx ON chat_threads (organization_id, shipment_id) WHERE shipment_id IS NOT NULL AND type = 'SHIPMENT' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS chat_read_receipts_org_thread_user_idx ON chat_message_read_receipts (organization_id, thread_id, user_id);
CREATE INDEX IF NOT EXISTS chat_message_events_org_thread_created_idx ON chat_message_events (organization_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_message_attachments_org_created_idx ON chat_message_attachments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_message_attachments_message_idx ON chat_message_attachments (message_id);
CREATE INDEX IF NOT EXISTS chat_message_attachments_thread_idx ON chat_message_attachments (organization_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_message_attachments_active_idx ON chat_message_attachments (organization_id, attachment_type, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS chat_message_attachments_deleted_idx ON chat_message_attachments (organization_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_message_attachments_object_key_idx ON chat_message_attachments (object_key) WHERE object_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_shipment_id_idx ON documents (shipment_id);
CREATE INDEX IF NOT EXISTS documents_organization_idx ON documents (organization_id);
CREATE INDEX IF NOT EXISTS documents_customer_id_idx ON documents (customer_id);
CREATE INDEX IF NOT EXISTS documents_org_updated_idx ON documents (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS documents_org_title_idx ON documents (organization_id, title);
CREATE INDEX IF NOT EXISTS documents_org_file_name_idx ON documents (organization_id, file_name);
CREATE INDEX IF NOT EXISTS documents_storage_migration_status_idx ON documents (storage_migration_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS documents_object_key_idx ON documents (object_key) WHERE object_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_versions_document_created_idx ON document_versions (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_versions_storage_migration_status_idx ON document_versions (storage_migration_status, created_at DESC);
CREATE INDEX IF NOT EXISTS document_versions_object_key_idx ON document_versions (object_key) WHERE object_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_deliveries_status_idx ON sms_deliveries (status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS sms_deliveries_org_idx ON sms_deliveries (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_deliveries_source_idx ON sms_deliveries (source_type, source_id);
CREATE INDEX IF NOT EXISTS sms_deliveries_recipient_idx ON sms_deliveries (organization_id, recipient_phone, recipient_type);
CREATE INDEX IF NOT EXISTS change_logs_entity_idx ON change_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS change_logs_created_at_idx ON change_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS change_logs_organization_idx ON change_logs (organization_id);
CREATE INDEX IF NOT EXISTS audit_logs_organization_idx ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_user_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx ON audit_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS app_users_org_id_idx ON app_users (organization_id, id);
CREATE INDEX IF NOT EXISTS customers_org_id_idx ON customers (organization_id, id);
CREATE INDEX IF NOT EXISTS shipments_org_id_idx ON shipments (organization_id, id);
CREATE INDEX IF NOT EXISTS tasks_org_id_idx ON tasks (organization_id, id);
CREATE INDEX IF NOT EXISTS documents_org_id_idx ON documents (organization_id, id);
CREATE INDEX IF NOT EXISTS document_versions_org_document_idx ON document_versions (organization_id, document_id);
CREATE INDEX IF NOT EXISTS cheques_org_id_idx ON cheques (organization_id, id);
CREATE INDEX IF NOT EXISTS compliance_meetings_org_id_idx ON compliance_meetings (organization_id, id);
CREATE INDEX IF NOT EXISTS quotations_org_id_idx ON quotations (organization_id, id);
CREATE INDEX IF NOT EXISTS archive_records_org_entity_lookup_idx ON archive_records (organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS billing_payments_org_id_idx ON billing_payments (organization_id, id);
CREATE INDEX IF NOT EXISTS billing_invoices_org_id_idx ON billing_invoices (organization_id, id);
CREATE INDEX IF NOT EXISTS app_users_org_created_idx ON app_users (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_org_created_idx ON customers (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shipments_org_created_idx ON shipments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_org_created_idx ON tasks (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_org_created_idx ON documents (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cheques_org_created_idx ON cheques (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS compliance_meetings_org_created_idx ON compliance_meetings (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotations_org_created_idx ON quotations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_org_active_updated_idx ON customers (organization_id, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS shipments_org_active_updated_idx ON shipments (organization_id, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_org_active_updated_idx ON documents (organization_id, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS cheques_org_active_updated_idx ON cheques (organization_id, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS compliance_meetings_org_active_updated_idx ON compliance_meetings (organization_id, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS quotations_org_active_updated_idx ON quotations (organization_id, updated_at DESC) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shipments_customer_access_token_hash_unique_idx ON shipments (customer_access_token_hash) WHERE customer_access_token_hash IS NOT NULL;

ALTER TABLE IF EXISTS billing_payments
  DROP CONSTRAINT IF EXISTS billing_payments_signup_request_id_fkey;
ALTER TABLE IF EXISTS billing_payments
  ADD CONSTRAINT billing_payments_signup_request_id_fkey
  FOREIGN KEY (signup_request_id) REFERENCES signup_requests(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE IF EXISTS organization_subscriptions
  ADD COLUMN IF NOT EXISTS limits_override JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS billing_payments
  ADD COLUMN IF NOT EXISTS manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_note TEXT,
  ADD COLUMN IF NOT EXISTS marked_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS currency_rate_settings (
  id TEXT PRIMARY KEY DEFAULT 'brsapi_pro',
  provider TEXT NOT NULL DEFAULT 'brsapi_pro',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_publish_suspicious BOOLEAN NOT NULL DEFAULT FALSE,
  suspicious_change_percent NUMERIC NOT NULL DEFAULT 15,
  sync_interval_minutes INT NOT NULL DEFAULT 60,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  updated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT currency_rate_settings_threshold_check CHECK (suspicious_change_percent >= 0),
  CONSTRAINT currency_rate_settings_interval_check CHECK (sync_interval_minutes >= 5)
);

INSERT INTO currency_rate_settings (id, provider)
VALUES ('brsapi_pro', 'brsapi_pro')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS currency_rate_snapshots (
  id TEXT PRIMARY KEY,
  currency_code TEXT NOT NULL,
  market_type TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'brsapi_pro',
  provider_symbol TEXT,
  name_fa TEXT,
  name_en TEXT,
  price NUMERIC NOT NULL,
  buy_rate NUMERIC,
  sell_rate NUMERIC,
  unit TEXT NOT NULL DEFAULT 'IRR',
  provider_date TEXT,
  provider_time TEXT,
  provider_unix BIGINT,
  change_value NUMERIC,
  change_percent NUMERIC,
  status TEXT NOT NULL DEFAULT 'published',
  suspicious BOOLEAN NOT NULL DEFAULT FALSE,
  previous_price NUMERIC,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT currency_rate_snapshot_currency_check CHECK (currency_code IN ('USD', 'EUR', 'AED', 'CNY', 'TRY', 'INR', 'OMR', 'QAR')),
  CONSTRAINT currency_rate_snapshot_market_check CHECK (market_type IN ('FREE_MARKET', 'SANA_BUY', 'SANA_SELL', 'NIMA_BUY', 'NIMA_SELL', 'MANUAL')),
  CONSTRAINT currency_rate_snapshot_status_check CHECK (status IN ('published', 'pending_review', 'rejected'))
);

CREATE TABLE IF NOT EXISTS latest_currency_rates (
  currency_code TEXT NOT NULL,
  market_type TEXT NOT NULL,
  snapshot_id TEXT REFERENCES currency_rate_snapshots(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'brsapi_pro',
  provider_symbol TEXT,
  name_fa TEXT,
  name_en TEXT,
  price NUMERIC NOT NULL,
  buy_rate NUMERIC,
  sell_rate NUMERIC,
  unit TEXT NOT NULL DEFAULT 'IRR',
  provider_date TEXT,
  provider_time TEXT,
  provider_unix BIGINT,
  change_value NUMERIC,
  change_percent NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (currency_code, market_type),
  CONSTRAINT latest_currency_rate_currency_check CHECK (currency_code IN ('USD', 'EUR', 'AED', 'CNY', 'TRY', 'INR', 'OMR', 'QAR')),
  CONSTRAINT latest_currency_rate_market_check CHECK (market_type IN ('FREE_MARKET', 'SANA_BUY', 'SANA_SELL', 'NIMA_BUY', 'NIMA_SELL', 'MANUAL'))
);

CREATE INDEX IF NOT EXISTS currency_rate_snapshots_lookup_idx ON currency_rate_snapshots (currency_code, market_type, created_at DESC);
CREATE INDEX IF NOT EXISTS currency_rate_snapshots_pending_idx ON currency_rate_snapshots (created_at DESC) WHERE status = 'pending_review';

CREATE TABLE IF NOT EXISTS tariff_catalog_imports (
  id TEXT PRIMARY KEY,
  source_file_name TEXT NOT NULL,
  source_date TEXT,
  import_mode TEXT NOT NULL DEFAULT 'replace',
  status TEXT NOT NULL DEFAULT 'completed',
  row_count INT NOT NULL DEFAULT 0,
  active_row_count INT NOT NULL DEFAULT 0,
  validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT tariff_catalog_import_mode_check CHECK (import_mode IN ('replace', 'append')),
  CONSTRAINT tariff_catalog_import_status_check CHECK (status IN ('previewed', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS tariff_catalog_entries (
  id TEXT PRIMARY KEY,
  import_id TEXT REFERENCES tariff_catalog_imports(id) ON DELETE SET NULL,
  tariff_code TEXT NOT NULL,
  title_fa TEXT NOT NULL,
  title_en TEXT,
  category TEXT,
  chapter TEXT,
  unit TEXT,
  duty_rate TEXT,
  tax_rate TEXT,
  restrictions TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tariff_catalog_entries_active_code_idx ON tariff_catalog_entries (tariff_code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS tariff_catalog_entries_active_created_idx ON tariff_catalog_entries (created_at DESC) WHERE is_active = TRUE;
