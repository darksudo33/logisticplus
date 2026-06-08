-- Platform-global currency rates and tariff catalog.
-- Additive and safe: no tenant-owned operational records are modified.

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

CREATE INDEX IF NOT EXISTS currency_rate_snapshots_lookup_idx
  ON currency_rate_snapshots (currency_code, market_type, created_at DESC);

CREATE INDEX IF NOT EXISTS currency_rate_snapshots_pending_idx
  ON currency_rate_snapshots (created_at DESC)
  WHERE status = 'pending_review';

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

CREATE INDEX IF NOT EXISTS tariff_catalog_entries_active_code_idx
  ON tariff_catalog_entries (tariff_code)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS tariff_catalog_entries_active_created_idx
  ON tariff_catalog_entries (created_at DESC)
  WHERE is_active = TRUE;
