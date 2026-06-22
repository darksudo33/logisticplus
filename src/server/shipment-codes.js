import { format, isValid, parse } from "date-fns-jalali";

export const SHIPMENT_CODE_ERRORS = {
  duplicate: "این کد محموله قبلاً ثبت شده است",
  invalidFormat: "فرمت کد محموله معتبر نیست. مثال صحیح: 14050316020",
  invalidShamsiDate: "تاریخ شمسی داخل کد محموله معتبر نیست",
  invalidSequence: "شماره ردیف کد محموله معتبر نیست",
};

function shipmentCodeError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function normalizeShipmentCode(value = "") {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return String(value || "")
    .replace(/[۰-۹٠-٩]/g, (digit) => {
      const persianIndex = persianDigits.indexOf(digit);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = arabicDigits.indexOf(digit);
      return arabicIndex >= 0 ? String(arabicIndex) : digit;
    })
    .trim();
}

export function parseShipmentCode(value = "") {
  const shipmentCode = normalizeShipmentCode(value);
  if (!/^\d{11}$/.test(shipmentCode)) {
    throw shipmentCodeError("INVALID_SHIPMENT_CODE_FORMAT", SHIPMENT_CODE_ERRORS.invalidFormat);
  }

  const year = Number(shipmentCode.slice(0, 4));
  const month = Number(shipmentCode.slice(4, 6));
  const day = Number(shipmentCode.slice(6, 8));
  const sequence = Number(shipmentCode.slice(8, 11));
  const shamsiDate = `${shipmentCode.slice(0, 4)}/${shipmentCode.slice(4, 6)}/${shipmentCode.slice(6, 8)}`;

  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw shipmentCodeError("INVALID_SHIPMENT_CODE_SEQUENCE", SHIPMENT_CODE_ERRORS.invalidSequence);
  }

  const parsedDate = parse(shamsiDate, "yyyy/MM/dd", new Date());
  if (!isValid(parsedDate) || format(parsedDate, "yyyy/MM/dd") !== shamsiDate) {
    throw shipmentCodeError("INVALID_SHIPMENT_CODE_SHAMSI_DATE", SHIPMENT_CODE_ERRORS.invalidShamsiDate);
  }

  return {
    shipmentCode,
    shamsiYear: year,
    shamsiDate,
    shamsiSequence: sequence,
    shamsiMonth: month,
    shamsiDay: day,
  };
}

export function currentTehranShamsiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = String(valueByType.year || "").padStart(4, "0");
  const month = String(valueByType.month || "").padStart(2, "0");
  const day = String(valueByType.day || "").padStart(2, "0");
  const shamsiDate = `${year}/${month}/${day}`;

  return {
    shamsiYear: Number(year),
    shamsiDate,
    compactDate: `${year}${month}${day}`,
  };
}

export async function assertShipmentCodeAvailable(queryable, {
  organizationId,
  shipmentCode,
  excludeShipmentId = null,
} = {}) {
  const values = [organizationId, shipmentCode];
  let excludeClause = "";
  if (excludeShipmentId) {
    values.push(excludeShipmentId);
    excludeClause = `AND id <> $${values.length}`;
  }
  const duplicate = await queryable.query(
    `SELECT id
     FROM shipments
     WHERE organization_id = $1
       AND shipment_code = $2
       AND archived_at IS NULL
       ${excludeClause}
     LIMIT 1`,
    values
  );
  if (duplicate.rows[0]) {
    throw shipmentCodeError("SHIPMENT_CODE_EXISTS", SHIPMENT_CODE_ERRORS.duplicate, 409);
  }
}

export async function updateShipmentCodeCounter(queryable, {
  organizationId,
  shamsiYear,
  shamsiSequence,
} = {}) {
  await queryable.query(
    `INSERT INTO shipment_code_counters (
       organization_id, shamsi_year, last_sequence, updated_at
     )
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (organization_id, shamsi_year)
     DO UPDATE SET
       last_sequence = GREATEST(shipment_code_counters.last_sequence, EXCLUDED.last_sequence),
       updated_at = NOW()`,
    [organizationId, shamsiYear, shamsiSequence]
  );
}

export async function reserveNextShipmentCode(queryable, {
  organizationId,
  now = new Date(),
} = {}) {
  const dateParts = currentTehranShamsiDate(now);
  await queryable.query(
    `INSERT INTO shipment_code_counters (
       organization_id, shamsi_year, last_sequence, updated_at
     )
     VALUES ($1, $2, 0, NOW())
     ON CONFLICT (organization_id, shamsi_year) DO NOTHING`,
    [organizationId, dateParts.shamsiYear]
  );

  await queryable.query(
    `SELECT last_sequence
     FROM shipment_code_counters
     WHERE organization_id = $1
       AND shamsi_year = $2
     FOR UPDATE`,
    [organizationId, dateParts.shamsiYear]
  );
  const active = await queryable.query(
    `SELECT COALESCE(MAX(COALESCE(
       shamsi_sequence,
       CASE WHEN shipment_code ~ '^\\d{11}$' THEN substring(shipment_code from 9 for 3)::int END
     )), 0)::int AS last_sequence
     FROM shipments
     WHERE organization_id = $1
       AND archived_at IS NULL
       AND (
         shamsi_year = $2
         OR (
           shamsi_year IS NULL
           AND shipment_code ~ '^\\d{11}$'
           AND substring(shipment_code from 1 for 4)::int = $2
         )
       )`,
    [organizationId, dateParts.shamsiYear]
  );
  const sequence = Number(active.rows[0]?.last_sequence || 0) + 1;
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw shipmentCodeError("INVALID_SHIPMENT_CODE_SEQUENCE", SHIPMENT_CODE_ERRORS.invalidSequence);
  }

  await queryable.query(
    `UPDATE shipment_code_counters
     SET last_sequence = $3,
         updated_at = NOW()
     WHERE organization_id = $1
       AND shamsi_year = $2`,
    [organizationId, dateParts.shamsiYear, sequence]
  );

  const shipmentCode = `${dateParts.compactDate}${String(sequence).padStart(3, "0")}`;
  return {
    shipmentCode,
    shamsiYear: dateParts.shamsiYear,
    shamsiDate: dateParts.shamsiDate,
    shamsiSequence: sequence,
  };
}

export async function resolveManualShipmentCode(queryable, {
  organizationId,
  shipmentCode,
  excludeShipmentId = null,
} = {}) {
  const parsed = parseShipmentCode(shipmentCode);
  await assertShipmentCodeAvailable(queryable, {
    organizationId,
    shipmentCode: parsed.shipmentCode,
    excludeShipmentId,
  });
  await updateShipmentCodeCounter(queryable, {
    organizationId,
    shamsiYear: parsed.shamsiYear,
    shamsiSequence: parsed.shamsiSequence,
  });
  return parsed;
}
