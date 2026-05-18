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

CREATE INDEX IF NOT EXISTS user_records_data_idx
  ON user_records USING GIN (data);

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

CREATE TABLE IF NOT EXISTS app_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
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
  shipment_code TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  due_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  name TEXT,
  description TEXT,
  role_limit TEXT,
  icon TEXT,
  legacy_channel_id TEXT,
  created_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_thread_members (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  checksum TEXT,
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
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  storage_key TEXT,
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

CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions (user_id);
CREATE INDEX IF NOT EXISTS app_sessions_token_hash_idx ON app_sessions (token_hash);
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
CREATE INDEX IF NOT EXISTS customers_company_name_idx ON customers (company_name);
CREATE INDEX IF NOT EXISTS customers_organization_idx ON customers (organization_id);
CREATE INDEX IF NOT EXISTS customers_status_idx ON customers (status);
CREATE INDEX IF NOT EXISTS shipments_shipment_code_idx ON shipments (shipment_code);
CREATE INDEX IF NOT EXISTS shipments_customer_id_idx ON shipments (customer_id);
CREATE INDEX IF NOT EXISTS shipments_organization_idx ON shipments (organization_id);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON shipments (status);
CREATE INDEX IF NOT EXISTS shipments_free_time_ends_at_idx ON shipments (free_time_ends_at);
CREATE INDEX IF NOT EXISTS shipments_customer_access_token_hash_idx ON shipments (customer_access_token_hash);
CREATE INDEX IF NOT EXISTS shipment_status_events_shipment_idx ON shipment_status_events (shipment_id);
CREATE INDEX IF NOT EXISTS shipment_status_events_public_idx ON shipment_status_events (shipment_id, is_customer_visible, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_assigned_to_id_idx ON tasks (assigned_to_id);
CREATE INDEX IF NOT EXISTS tasks_organization_idx ON tasks (organization_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
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
CREATE INDEX IF NOT EXISTS chat_thread_members_user_idx ON chat_thread_members (user_id);
CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx ON chat_messages (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_threads_organization_idx ON chat_threads (organization_id);
CREATE INDEX IF NOT EXISTS documents_shipment_id_idx ON documents (shipment_id);
CREATE INDEX IF NOT EXISTS documents_organization_idx ON documents (organization_id);
CREATE INDEX IF NOT EXISTS documents_customer_id_idx ON documents (customer_id);
CREATE INDEX IF NOT EXISTS sms_deliveries_status_idx ON sms_deliveries (status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS sms_deliveries_org_idx ON sms_deliveries (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_deliveries_source_idx ON sms_deliveries (source_type, source_id);
CREATE INDEX IF NOT EXISTS sms_deliveries_recipient_idx ON sms_deliveries (organization_id, recipient_phone, recipient_type);
CREATE INDEX IF NOT EXISTS change_logs_entity_idx ON change_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS change_logs_created_at_idx ON change_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS change_logs_organization_idx ON change_logs (organization_id);

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
