ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_code TEXT;

WITH ranked_customers AS (
  SELECT
    id,
    organization_id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS sequence_number
  FROM customers
  WHERE customer_code IS NULL OR BTRIM(customer_code) = ''
)
UPDATE customers c
SET customer_code = 'CUS-' || LPAD(ranked_customers.sequence_number::text, 5, '0')
FROM ranked_customers
WHERE c.id = ranked_customers.id;

ALTER TABLE customers
  ALTER COLUMN customer_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_org_customer_code_active_unique
  ON customers (organization_id, lower(customer_code))
  WHERE archived_at IS NULL;

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

INSERT INTO customer_phone_numbers (
  id,
  organization_id,
  customer_id,
  phone_number,
  phone_label,
  is_primary,
  sort_order,
  created_by_id,
  updated_by_id
)
SELECT
  'cust-phone-' || md5(c.id || ':' || COALESCE(c.phone, '')),
  c.organization_id,
  c.id,
  c.phone,
  'اصلی',
  TRUE,
  0,
  c.created_by_id,
  c.created_by_id
FROM customers c
WHERE c.phone IS NOT NULL
  AND BTRIM(c.phone) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM customer_phone_numbers existing
    WHERE existing.customer_id = c.id
      AND existing.organization_id = c.organization_id
      AND existing.archived_at IS NULL
  );
