import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { createApiError } from "./db.js";
import {
  deleteLocalObject,
  documentLocalStorageInfo,
  ensureLocalStorageRoot,
  isPathInside,
  resolveLocalStoragePath,
} from "./storage/local-storage.js";
import {
  cleanupStoredDocumentWrite,
  formatFileSize,
  readDocumentObject,
  readDocumentLocalBuffer,
  storeDocumentBuffer,
} from "./storage/document-storage-service.js";
import {
  documentStorageConfigInfo,
  resolveDocumentStorageConfig,
  validateObjectStorageConfig,
} from "./storage/storage-config.js";

const DOCUMENT_STORAGE_DIR =
  process.env.DOCUMENT_STORAGE_DIR || path.join(process.cwd(), "storage", "documents");
const DOCUMENT_STORAGE_ROOT = documentLocalStorageInfo().root;
const DOCUMENT_MAX_BYTES = Number(process.env.DOCUMENT_MAX_BYTES || 25 * 1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
});

const documentTypeAllowlist = new Map([
  [".pdf", new Set(["application/pdf"])],
  [".png", new Set(["image/png"])],
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".webp", new Set(["image/webp"])],
  [".gif", new Set(["image/gif"])],
  [".doc", new Set(["application/msword"])],
  [".docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"])],
  [".xls", new Set(["application/vnd.ms-excel"])],
  [".xlsx", new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])],
  [".csv", new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"])],
  [".txt", new Set(["text/plain"])],
  [".rtf", new Set(["application/rtf", "text/rtf", "application/x-rtf"])],
]);

const genericMimeTypes = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/binary",
  "application/unknown",
  "application/x-download",
]);

const preferredExtensionByMimeType = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["text/csv", ".csv"],
  ["application/csv", ".csv"],
  ["text/plain", ".txt"],
  ["application/rtf", ".rtf"],
  ["text/rtf", ".rtf"],
  ["application/x-rtf", ".rtf"],
]);

const blockedDocumentExtensions = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".exe",
  ".hta",
  ".jar",
  ".js",
  ".msi",
  ".ps1",
  ".sh",
  ".vbs",
]);

function sanitizeFileName(fileName = "document") {
  const parsed = path.parse(String(fileName));
  const base = (parsed.name || "document")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "document";
  const ext = parsed.ext.toLowerCase().replace(/[^.\w]/g, "");
  return `${base}${ext}`;
}

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF]/g;
const MOJIBAKE_MARKER_RE = /[\u00C2\u00C3\u00D0\u00D1\u00D8\u00D9\u00DA\u00DB\u00DE\u00DF]/g;
const C1_CONTROL_RE = /[\u0080-\u009F]/g;
const UNSAFE_FILENAME_CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
const PATH_SEPARATOR_RE = /[\\/]+/g;
const UNSAFE_DISPLAY_FILENAME_RE = /[<>:"|?*]/g;
const MAX_DISPLAY_FILENAME_LENGTH = 140;

function countMatches(value, regex) {
  return (String(value || "").match(regex) || []).length;
}

function canDecodeAsLatin1(value) {
  return Array.from(String(value || "")).every((char) => char.charCodeAt(0) <= 0xff);
}

function fileNameMojibakeScore(value = "") {
  return (
    countMatches(value, MOJIBAKE_MARKER_RE) * 4 +
    countMatches(value, C1_CONTROL_RE) * 2 -
    countMatches(value, ARABIC_SCRIPT_RE) * 5
  );
}

function maybeDecodeLatin1Utf8FileName(fileName = "") {
  let current = String(fileName || "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentScore = fileNameMojibakeScore(current);
    if (!current || currentScore <= 0 || !canDecodeAsLatin1(current)) break;
    const decoded = Buffer.from(current, "latin1").toString("utf8");
    if (!decoded || decoded.includes("\uFFFD")) break;
    const decodedScore = fileNameMojibakeScore(decoded);
    const gainedArabic = countMatches(decoded, ARABIC_SCRIPT_RE) > countMatches(current, ARABIC_SCRIPT_RE);
    if (!gainedArabic && decodedScore >= currentScore) break;
    current = decoded;
  }
  return current;
}

function safeDisplayExtension(fileName = "") {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(ext) ? ext : "";
}

function normalizeMimeType(value = "") {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

function isGenericMimeType(value = "") {
  return genericMimeTypes.has(normalizeMimeType(value));
}

function preferredMimeTypeForExtension(ext = "") {
  const allowed = documentTypeAllowlist.get(String(ext || "").toLowerCase());
  return allowed ? allowed.values().next().value || "" : "";
}

function mimeTypeIsAllowedForExtension(ext = "", mimeType = "") {
  const allowed = documentTypeAllowlist.get(String(ext || "").toLowerCase());
  return Boolean(allowed?.has(normalizeMimeType(mimeType)));
}

function detectDocumentMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer.subarray(0, 4).toString("latin1") === "%PDF") {
    return { mimeType: "application/pdf", extension: ".pdf" };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: ".png" };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }
  return null;
}

function documentFileTypeFromUpload(file, displayFileName = file?.originalname || "") {
  const ext = safeDisplayExtension(displayFileName || file?.originalname || "");
  const providedMime = normalizeMimeType(file?.mimetype);
  const allowedMimes = ext ? documentTypeAllowlist.get(ext) : null;
  const magic = detectDocumentMagicBytes(file?.buffer);

  if (blockedDocumentExtensions.has(ext)) {
    return documentValidationError(
      "UNSUPPORTED_FILE_TYPE",
      "This file type is not allowed for document upload."
    );
  }

  if (magic) {
    return {
      ok: true,
      mimeType: magic.mimeType,
      extension: ext && mimeTypeIsAllowedForExtension(ext, magic.mimeType) ? ext : magic.extension,
      detectedByMagic: true,
      magicExtension: magic.extension,
    };
  }

  if (!allowedMimes) {
    return documentValidationError(
      "UNSUPPORTED_FILE_TYPE",
      "This file type is not allowed for document upload."
    );
  }

  if (!providedMime || isGenericMimeType(providedMime)) {
    return {
      ok: true,
      mimeType: preferredMimeTypeForExtension(ext) || "application/octet-stream",
      extension: ext,
      detectedByMagic: false,
      magicExtension: "",
    };
  }

  if (!allowedMimes.has(providedMime)) {
    return documentValidationError(
      "UNSUPPORTED_FILE_TYPE",
      "The uploaded file extension does not match its content type."
    );
  }

  return {
    ok: true,
    mimeType: providedMime,
    extension: ext,
    detectedByMagic: false,
    magicExtension: "",
  };
}

function ensureDisplayFileExtension(fileName = "document", fileType = {}) {
  const cleaned = normalizeUploadedDisplayFileName(fileName, "document");
  const currentExt = safeDisplayExtension(cleaned);
  const desiredExt =
    fileType.magicExtension ||
    fileType.extension ||
    preferredExtensionByMimeType.get(normalizeMimeType(fileType.mimeType)) ||
    "";
  if (!desiredExt) return cleaned;

  const base = currentExt ? cleaned.slice(0, -currentExt.length) : cleaned;
  const currentMime = preferredMimeTypeForExtension(currentExt);
  const shouldReplaceExt =
    currentExt &&
    fileType.detectedByMagic &&
    normalizeMimeType(currentMime) !== normalizeMimeType(fileType.mimeType);

  if (!currentExt || shouldReplaceExt) {
    return normalizeUploadedDisplayFileName(`${base}${desiredExt}`, "document");
  }
  return cleaned;
}

function limitCodePoints(value, maxLength) {
  const chars = Array.from(String(value || ""));
  return chars.length > maxLength ? chars.slice(0, maxLength).join("") : String(value || "");
}

export function normalizeUploadedDisplayFileName(fileName = "", fallbackName = "attachment") {
  const fallback = String(fallbackName || "attachment").replace(PATH_SEPARATOR_RE, " ").trim() || "attachment";
  const decoded = maybeDecodeLatin1Utf8FileName(fileName || fallback);
  let cleaned = String(decoded || fallback)
    .normalize("NFC")
    .replace(UNSAFE_FILENAME_CONTROL_RE, "")
    .replace(PATH_SEPARATOR_RE, " ")
    .replace(UNSAFE_DISPLAY_FILENAME_RE, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned === "." || cleaned === "..") cleaned = fallback;

  const ext = safeDisplayExtension(cleaned);
  let base = ext ? cleaned.slice(0, -ext.length) : cleaned;
  base = base
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) base = path.parse(fallback).name || "attachment";

  const maxBaseLength = Math.max(1, MAX_DISPLAY_FILENAME_LENGTH - ext.length);
  return `${limitCodePoints(base, maxBaseLength).trim() || "attachment"}${ext}`;
}

function documentValidationError(code, message, statusCode = 415) {
  return { ok: false, code, message, field: "file", statusCode };
}

function validateDocumentFile(file, displayFileName = file?.originalname || "") {
  if (!file) {
    return documentValidationError("FILE_REQUIRED", "File is required.", 400);
  }
  if (Number(file.size || 0) <= 0 || !file.buffer?.length) {
    return documentValidationError("EMPTY_FILE", "File must not be empty.", 400);
  }
  return documentFileTypeFromUpload(file, displayFileName);
}

function resolveStoredDocumentPath(storageKey) {
  return resolveLocalStoragePath(storageKey);
}

function asciiFallbackFileName(fileName = "document") {
  const parsed = path.parse(String(fileName || "document"));
  const ext = parsed.ext.toLowerCase().replace(/[^.\w]/g, "");
  const cleanAscii = (value = "") =>
    String(value || "")
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/["\\;]/g, "")
      .replace(/[<>:|?*]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const rawBase = parsed.name || "document";
  const parts = rawBase.split(/\s+-\s+/);
  const prefix = cleanAscii(parts[0]);
  const remainder = cleanAscii(parts.slice(1).join(" - "));
  let base = "";
  if (parts.length > 1 && prefix && !remainder) {
    base = `${prefix} - document`;
  } else {
    base = cleanAscii(rawBase);
  }
  base = base.slice(0, 72).trim() || "document";
  return `${base}${ext || ""}`;
}

function encodeRfc5987Value(value = "") {
  return encodeURIComponent(String(value || "")).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function normalizeFilenameForComparison(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function shipmentIdentifierForDownload(document = {}) {
  const legacy = document.legacy_data || {};
  return String(
    document.shipment_code ||
      document.shipment_tracking_number ||
      legacy.shipmentCode ||
      legacy.trackingNumber ||
      document.tracking_number ||
      document.shipment_id ||
      ""
  ).trim();
}

function documentDownloadType({ fileName, storedContentType, document, firstBytes }) {
  const magic = detectDocumentMagicBytes(firstBytes);
  if (magic) {
    return {
      mimeType: magic.mimeType,
      extension: magic.extension,
      detectedByMagic: true,
      magicExtension: magic.extension,
    };
  }

  const ext = safeDisplayExtension(fileName);
  const extMime = preferredMimeTypeForExtension(ext);
  const candidates = [
    storedContentType,
    document?.content_type,
    document?.mime_type,
  ].map(normalizeMimeType).filter((mimeType) => !isGenericMimeType(mimeType));
  const matchingCandidate = candidates.find((mimeType) => ext && mimeTypeIsAllowedForExtension(ext, mimeType));
  if (matchingCandidate) {
    return { mimeType: matchingCandidate, extension: ext, detectedByMagic: false, magicExtension: "" };
  }
  const knownCandidate = candidates.find((mimeType) => preferredExtensionByMimeType.has(mimeType));
  if (knownCandidate) {
    return {
      mimeType: knownCandidate,
      extension: preferredExtensionByMimeType.get(knownCandidate) || "",
      detectedByMagic: false,
      magicExtension: "",
    };
  }
  if (extMime) {
    return { mimeType: extMime, extension: ext, detectedByMagic: false, magicExtension: "" };
  }
  return { mimeType: "application/octet-stream", extension: "", detectedByMagic: false, magicExtension: "" };
}

async function readDocumentFirstBytes(document, maxBytes = 16) {
  if (!document?.storage_key) return null;
  try {
    const buffer = await readDocumentLocalBuffer(document);
    return Buffer.isBuffer(buffer) ? buffer.subarray(0, maxBytes) : null;
  } catch {
    return null;
  }
}

function buildDocumentDownloadFileName(document, fileType) {
  const legacy = document?.legacy_data || {};
  const rawFileName = document?.file_name || legacy.fileName || legacy.name || document?.title || "document";
  const fileName = ensureDisplayFileExtension(rawFileName, fileType);
  const rawShipmentIdentifier = shipmentIdentifierForDownload(document);
  if (!rawShipmentIdentifier) return fileName;
  const shipmentIdentifier = normalizeUploadedDisplayFileName(rawShipmentIdentifier, "shipment");

  const fileNameKey = normalizeFilenameForComparison(fileName);
  const shipmentKey = normalizeFilenameForComparison(shipmentIdentifier);
  if (shipmentKey && fileNameKey.includes(shipmentKey)) return fileName;

  return normalizeUploadedDisplayFileName(`${shipmentIdentifier} - ${fileName}`, fileName);
}

async function ensureDocumentStorageRoot() {
  await ensureLocalStorageRoot();
}

export function documentStorageInfo() {
  return {
    directory: DOCUMENT_STORAGE_DIR,
    root: DOCUMENT_STORAGE_ROOT,
    maxBytes: DOCUMENT_MAX_BYTES,
    objectStorage: documentStorageConfigInfo(),
  };
}

export async function verifyDocumentStorage() {
  const config = resolveDocumentStorageConfig();
  const objectErrors = validateObjectStorageConfig(config);
  if (objectErrors.length) {
    throw new Error(objectErrors.join(" "));
  }

  if (config.mode === "object") {
    return;
  }

  await ensureDocumentStorageRoot();

  const probeName = `.storage-probe-${process.pid}-${Date.now()}-${crypto.randomUUID()}.tmp`;
  const probePath = path.resolve(DOCUMENT_STORAGE_ROOT, probeName);
  if (!isPathInside(DOCUMENT_STORAGE_ROOT, probePath)) {
    throw new Error("Document storage probe path escaped DOCUMENT_STORAGE_DIR.");
  }

  const content = `logisticplus-storage-probe:${Date.now()}`;
  try {
    await fs.writeFile(probePath, content, { flag: "wx" });
    const readBack = await fs.readFile(probePath, "utf8");
    if (readBack !== content) {
      throw new Error("Document storage probe readback mismatch.");
    }
  } finally {
    await fs.unlink(probePath).catch(() => {});
  }
}

export async function persistDocumentFile(file, options = {}) {
  const displayFileName = normalizeUploadedDisplayFileName(file?.originalname, "document");
  const validation = validateDocumentFile(file, displayFileName);
  if (!validation.ok) return { error: validation };

  await ensureDocumentStorageRoot();
  const downloadFileName = ensureDisplayFileExtension(displayFileName, validation);
  const sanitizedName = sanitizeFileName(downloadFileName);
  let stored;
  try {
    stored = await storeDocumentBuffer({
      buffer: file.buffer,
      fileName: sanitizedName,
      contentType: validation.mimeType || "application/octet-stream",
      organizationId: options.organizationId,
    });
  } catch {
    return { error: documentValidationError("STORAGE_WRITE_FAILED", "Document storage write failed.", 500) };
  }

  return {
    sanitizedName: downloadFileName,
    storageFileName: sanitizedName,
    originalFileName: downloadFileName,
    storageKey: stored.storageKey,
    objectKey: stored.objectKey,
    storageProvider: stored.storageProvider,
    storageBucket: stored.objectBucket,
    storageRegion: stored.objectRegion,
    localPath: stored.localPath,
    checksum: stored.checksum,
    checksumSha256: stored.checksumSha256,
    mimeType: validation.mimeType || "application/octet-stream",
    contentType: stored.contentType,
    fileSize: formatFileSize(file.size),
    sizeBytes: stored.sizeBytes,
    storageMigratedAt: stored.storageMigratedAt,
    storageVerifiedAt: stored.storageVerifiedAt,
    storageMigrationStatus: stored.storageMigrationStatus,
    storageMigrationError: stored.storageMigrationError,
    objectWrite: stored.objectWrite,
    absolutePath: stored.storageKey ? resolveStoredDocumentPath(stored.storageKey) : null,
  };
}

export async function cleanupPersistedDocument(persisted) {
  await cleanupStoredDocumentWrite(persisted);
}

export async function deleteStoredDocumentFiles(storageKeys = []) {
  const uniqueKeys = [...new Set(storageKeys.filter(Boolean))];
  const result = { deleted: [], missing: [], skipped: [] };

  for (const storageKey of uniqueKeys) {
    const filePath = resolveStoredDocumentPath(storageKey);
    if (!filePath) {
      result.skipped.push(storageKey);
      continue;
    }
    try {
      const deleted = await deleteLocalObject(storageKey);
      if (deleted?.deleted) result.deleted.push(storageKey);
      else if (deleted?.reason === "missing") result.missing.push(storageKey);
      else result.skipped.push(storageKey);
    } catch (error) {
      if (error?.code === "ENOENT") {
        result.missing.push(storageKey);
      } else {
        throw error;
      }
    }
  }

  return result;
}

export async function sendStoredDocument(res, document) {
  const stored = await readDocumentObject(document);
  if (!stored?.stream) {
    return createApiError(res, 404, "FILE_NOT_FOUND", "Stored file was not found.");
  }
  const firstBytes = await readDocumentFirstBytes(document);
  const fileType = documentDownloadType({
    fileName: document.file_name || document.title || "document",
    storedContentType: stored.contentType,
    document,
    firstBytes,
  });
  const fileName = buildDocumentDownloadFileName(document, fileType);
  const fallbackName = asciiFallbackFileName(fileName);
  res.setHeader("Content-Type", fileType.mimeType || "application/octet-stream");
  if (stored.contentLength !== null && stored.contentLength !== undefined) {
    res.setHeader("Content-Length", String(stored.contentLength));
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeRfc5987Value(fileName)}`
  );
  stored.stream.on("error", () => res.end()).pipe(res);
}

export function uploadSingle(req, res) {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
