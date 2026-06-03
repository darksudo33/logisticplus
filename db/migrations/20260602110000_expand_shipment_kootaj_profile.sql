-- Expand the shipment-scoped Iran import/customs data profile.
-- Additive only: no source-module fields are duplicated here.

ALTER TABLE shipment_kootaj_details
  ADD COLUMN IF NOT EXISTS order_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS order_registration_date TEXT,
  ADD COLUMN IF NOT EXISTS order_registration_expiry_date TEXT,
  ADD COLUMN IF NOT EXISTS order_registration_status TEXT,
  ADD COLUMN IF NOT EXISTS proforma_number TEXT,
  ADD COLUMN IF NOT EXISTS proforma_date TEXT,
  ADD COLUMN IF NOT EXISTS foreign_seller_name TEXT,
  ADD COLUMN IF NOT EXISTS foreign_seller_code TEXT,
  ADD COLUMN IF NOT EXISTS goods_id_summary TEXT,
  ADD COLUMN IF NOT EXISTS hs_code_summary TEXT,
  ADD COLUMN IF NOT EXISTS order_permit_status TEXT,
  ADD COLUMN IF NOT EXISTS fx_source_status TEXT,
  ADD COLUMN IF NOT EXISTS currency_type TEXT,
  ADD COLUMN IF NOT EXISTS currency_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS fx_allocation_date TEXT,
  ADD COLUMN IF NOT EXISTS bank_process_status TEXT,
  ADD COLUMN IF NOT EXISTS insurance_number TEXT,
  ADD COLUMN IF NOT EXISTS inspection_certificate_number TEXT,
  ADD COLUMN IF NOT EXISTS booking_number TEXT,
  ADD COLUMN IF NOT EXISTS bill_of_lading_number TEXT,
  ADD COLUMN IF NOT EXISTS transport_document_number TEXT,
  ADD COLUMN IF NOT EXISTS pre_alert_date TEXT,
  ADD COLUMN IF NOT EXISTS package_count INTEGER,
  ADD COLUMN IF NOT EXISTS gross_weight_kg NUMERIC(18, 3),
  ADD COLUMN IF NOT EXISTS net_weight_kg NUMERIC(18, 3),
  ADD COLUMN IF NOT EXISTS arrival_notice_number TEXT,
  ADD COLUMN IF NOT EXISTS arrival_date TEXT,
  ADD COLUMN IF NOT EXISTS manifest_number TEXT,
  ADD COLUMN IF NOT EXISTS delivery_order_number TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_name TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_receipt_number TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_receipt_date TEXT,
  ADD COLUMN IF NOT EXISTS declaration_date TEXT,
  ADD COLUMN IF NOT EXISTS cotage_date TEXT,
  ADD COLUMN IF NOT EXISTS evaluator_name TEXT,
  ADD COLUMN IF NOT EXISTS expert_name TEXT,
  ADD COLUMN IF NOT EXISTS document_control_status TEXT,
  ADD COLUMN IF NOT EXISTS physical_inspection_status TEXT,
  ADD COLUMN IF NOT EXISTS physical_inspection_date TEXT,
  ADD COLUMN IF NOT EXISTS lab_status TEXT,
  ADD COLUMN IF NOT EXISTS lab_result_date TEXT,
  ADD COLUMN IF NOT EXISTS tariff_review_status TEXT,
  ADD COLUMN IF NOT EXISTS valuation_status TEXT,
  ADD COLUMN IF NOT EXISTS legal_permit_status TEXT,
  ADD COLUMN IF NOT EXISTS standard_permit_status TEXT,
  ADD COLUMN IF NOT EXISTS health_permit_status TEXT,
  ADD COLUMN IF NOT EXISTS quarantine_permit_status TEXT,
  ADD COLUMN IF NOT EXISTS other_permit_notes TEXT,
  ADD COLUMN IF NOT EXISTS duties_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS customs_payment_date TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS cashier_confirmation_status TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_charges_status TEXT,
  ADD COLUMN IF NOT EXISTS terminal_charges_status TEXT,
  ADD COLUMN IF NOT EXISTS demurrage_status TEXT,
  ADD COLUMN IF NOT EXISTS loading_permit_number TEXT,
  ADD COLUMN IF NOT EXISTS loading_permit_date TEXT,
  ADD COLUMN IF NOT EXISTS truck_plate TEXT,
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS gate_pass_number TEXT,
  ADD COLUMN IF NOT EXISTS exit_gate_status TEXT,
  ADD COLUMN IF NOT EXISTS delivery_date TEXT;

CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_order_registration_idx
  ON shipment_kootaj_details (organization_id, order_registration_number)
  WHERE order_registration_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_bill_of_lading_idx
  ON shipment_kootaj_details (organization_id, bill_of_lading_number)
  WHERE bill_of_lading_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS shipment_kootaj_details_org_bank_tracking_idx
  ON shipment_kootaj_details (organization_id, bank_tracking_number)
  WHERE bank_tracking_number IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_kootaj_details_tax_payment_status_check') THEN
    ALTER TABLE shipment_kootaj_details DROP CONSTRAINT shipment_kootaj_details_tax_payment_status_check;
  END IF;
  ALTER TABLE shipment_kootaj_details
    ADD CONSTRAINT shipment_kootaj_details_tax_payment_status_check CHECK (
      tax_payment_status IS NULL OR tax_payment_status IN ('not_started', 'pending', 'in_progress', 'completed', 'blocked', 'not_required', 'paid')
    );
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_kootaj_details_currency_amount_non_negative') THEN
    ALTER TABLE shipment_kootaj_details
      ADD CONSTRAINT shipment_kootaj_details_currency_amount_non_negative CHECK (currency_amount IS NULL OR currency_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_kootaj_details_package_count_non_negative') THEN
    ALTER TABLE shipment_kootaj_details
      ADD CONSTRAINT shipment_kootaj_details_package_count_non_negative CHECK (package_count IS NULL OR package_count >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_kootaj_details_gross_weight_non_negative') THEN
    ALTER TABLE shipment_kootaj_details
      ADD CONSTRAINT shipment_kootaj_details_gross_weight_non_negative CHECK (gross_weight_kg IS NULL OR gross_weight_kg >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_kootaj_details_net_weight_non_negative') THEN
    ALTER TABLE shipment_kootaj_details
      ADD CONSTRAINT shipment_kootaj_details_net_weight_non_negative CHECK (net_weight_kg IS NULL OR net_weight_kg >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_kootaj_details_duties_amount_non_negative') THEN
    ALTER TABLE shipment_kootaj_details
      ADD CONSTRAINT shipment_kootaj_details_duties_amount_non_negative CHECK (duties_amount IS NULL OR duties_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shipment_kootaj_details_tax_amount_non_negative') THEN
    ALTER TABLE shipment_kootaj_details
      ADD CONSTRAINT shipment_kootaj_details_tax_amount_non_negative CHECK (tax_amount IS NULL OR tax_amount >= 0);
  END IF;
END $$;
