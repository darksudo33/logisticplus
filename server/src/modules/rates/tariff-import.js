import * as XLSX from "xlsx";

const MAX_IMPORT_ROWS = 20_000;

const HEADER_ALIASES = {
  tariffCode: [
    "tariffcode",
    "code",
    "hscode",
    "hs",
    "کدتعرفه",
    "تعرفه",
    "شمارهتعرفه",
    "کدکالا",
  ],
  titleFa: [
    "titlefa",
    "persiantitle",
    "descriptionfa",
    "شرح",
    "شرحکالا",
    "عنوانفارسی",
    "شرحتعرفه",
  ],
  titleEn: ["titleen", "englishtitle", "descriptionen", "عنوانانگلیسی", "شرحانگلیسی"],
  category: ["category", "group", "دسته", "گروه", "طبقه"],
  chapter: ["chapter", "فصل", "بخش"],
  unit: ["unit", "واحد", "واحداندازهگیری"],
  dutyRate: ["dutyrate", "duty", "حقوقورودی", "حقوقگمرکی", "درصدحقوق"],
  taxRate: ["taxrate", "tax", "مالیات", "مالیاتارزشافزوده"],
  restrictions: ["restrictions", "restriction", "محدودیت", "ممنوعیت", "مجوز"],
  notes: ["notes", "note", "توضیحات", "یادداشت"],
};

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\s_\-.:/\\()[\]{}]+/g, "");
}

function normalizeText(value, max = 1000) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, max);
}

function fieldForHeader(header, fallbackIndex) {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }
  if (fallbackIndex === 0) return "tariffCode";
  if (fallbackIndex === 1) return "titleFa";
  if (fallbackIndex === 2) return "titleEn";
  return null;
}

function buildHeaderMap(headers = []) {
  const map = new Map();
  headers.forEach((header, index) => {
    const field = fieldForHeader(header, index);
    if (field && !map.has(field)) map.set(field, index);
  });
  return map;
}

function valueAt(row, index, max = 1000) {
  if (index === undefined || index === null || index < 0) return "";
  return normalizeText(row[index], max);
}

export function parseTariffCatalogWorkbook(buffer, { fileName = "tariffs" } = {}) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw Object.assign(new Error("Tariff file does not contain a worksheet."), {
      statusCode: 400,
      code: "TARIFF_IMPORT_EMPTY",
    });
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIndex = matrix.findIndex((row) => Array.isArray(row) && row.some((cell) => normalizeText(cell)));
  if (headerIndex < 0) {
    throw Object.assign(new Error("Tariff file is empty."), {
      statusCode: 400,
      code: "TARIFF_IMPORT_EMPTY",
    });
  }

  const headers = matrix[headerIndex].map((cell) => normalizeText(cell, 120));
  const headerMap = buildHeaderMap(headers);
  const errors = [];
  const rows = [];

  if (!headerMap.has("tariffCode") || !headerMap.has("titleFa")) {
    errors.push("File must include tariff code and Persian title/description columns.");
  }

  for (const row of matrix.slice(headerIndex + 1)) {
    if (!Array.isArray(row) || !row.some((cell) => normalizeText(cell))) continue;
    const item = {
      tariffCode: valueAt(row, headerMap.get("tariffCode")).replace(/\s+/g, ""),
      titleFa: valueAt(row, headerMap.get("titleFa"), 500),
      titleEn: valueAt(row, headerMap.get("titleEn"), 500),
      category: valueAt(row, headerMap.get("category"), 240),
      chapter: valueAt(row, headerMap.get("chapter"), 120),
      unit: valueAt(row, headerMap.get("unit"), 120),
      dutyRate: valueAt(row, headerMap.get("dutyRate"), 120),
      taxRate: valueAt(row, headerMap.get("taxRate"), 120),
      restrictions: valueAt(row, headerMap.get("restrictions"), 1000),
      notes: valueAt(row, headerMap.get("notes"), 1000),
    };
    if (!item.tariffCode || !item.titleFa) {
      errors.push(`Row ${rows.length + 2} is missing tariff code or Persian title.`);
      continue;
    }
    rows.push(item);
    if (rows.length > MAX_IMPORT_ROWS) {
      errors.push(`File has more than ${MAX_IMPORT_ROWS} importable rows.`);
      break;
    }
  }

  return {
    fileName,
    sheetName,
    headers,
    rows,
    errors: errors.slice(0, 25),
    valid: errors.length === 0 && rows.length > 0,
    rowCount: rows.length,
    sampleRows: rows.slice(0, 10),
  };
}
