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
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_FILE_MAX_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
});

const chatAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_FILE_MAX_BYTES, files: 1 },
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

const chatImageAllowlist = new Map([
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".png", new Set(["image/png"])],
  [".webp", new Set(["image/webp"])],
]);

const chatFileAllowlist = new Map([
  [".pdf", new Set(["application/pdf"])],
  [".docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"])],
  [".xlsx", new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])],
  [".txt", new Set(["text/plain"])],
  [".csv", new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"])],
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

function isProduction() {
  return process.env.NODE_ENV === "production";
}

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

function chatAttachmentValidationError(code, message, statusCode = 415) {
  return { ok: false, code, message, field: "file", statusCode };
}

function validateDocumentFile(file) {
  if (!file) {
    return documentValidationError("FILE_REQUIRED", "File is required.", 400);
  }
  if (Number(file.size || 0) <= 0 || !file.buffer?.length) {
    return documentValidationError("EMPTY_FILE", "File must not be empty.", 400);
  }
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  const allowedMimes = documentTypeAllowlist.get(ext);
  if (blockedDocumentExtensions.has(ext) || !allowedMimes) {
    return documentValidationError(
      "UNSUPPORTED_FILE_TYPE",
      "This file type is not allowed for document upload."
    );
  }
  if (!allowedMimes.has(mime)) {
    return documentValidationError(
      "UNSUPPORTED_FILE_TYPE",
      "The uploaded file extension does not match its content type."
    );
  }
  return { ok: true };
}

function validateChatAttachmentFile(file, displayFileName = file?.originalname || "") {
  if (!file) {
    return chatAttachmentValidationError("FILE_REQUIRED", "File is required.", 400);
  }
  if (Number(file.size || 0) <= 0 || !file.buffer?.length) {
    return chatAttachmentValidationError("EMPTY_FILE", "File must not be empty.", 400);
  }
  const ext = path.extname(displayFileName || file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  const imageMimes = chatImageAllowlist.get(ext);
  const fileMimes = chatFileAllowlist.get(ext);
  const attachmentType = imageMimes ? "image" : fileMimes ? "document" : "";
  const allowedMimes = imageMimes || fileMimes;

  if (blockedDocumentExtensions.has(ext) || !allowedMimes) {
    return chatAttachmentValidationError(
      "UNSUPPORTED_FILE_TYPE",
      "فرمت فایل مجاز نیست"
    );
  }
  if (!allowedMimes.has(mime)) {
    return chatAttachmentValidationError(
      "UNSUPPORTED_FILE_TYPE",
      "فرمت فایل مجاز نیست"
    );
  }
  if (attachmentType === "image" && Number(file.size || 0) > CHAT_IMAGE_MAX_BYTES) {
    return chatAttachmentValidationError(
      "FILE_TOO_LARGE",
      "حجم فایل بیش از حد مجاز است",
      413
    );
  }
  if (Number(file.size || 0) > CHAT_FILE_MAX_BYTES) {
    return chatAttachmentValidationError(
      "FILE_TOO_LARGE",
      "حجم فایل بیش از حد مجاز است",
      413
    );
  }
  return { ok: true, attachmentType };
}

function resolveStoredDocumentPath(storageKey) {
  return resolveLocalStoragePath(storageKey);
}

function asciiFallbackFileName(fileName = "document") {
  const parsed = path.parse(String(fileName || "document"));
  const ext = parsed.ext.toLowerCase().replace(/[^.\w]/g, "");
  const base = (parsed.name || "document")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\;]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 72) || "document";
  return `${base}${ext || ""}`;
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
  const validation = validateDocumentFile(file);
  if (!validation.ok) return { error: validation };

  await ensureDocumentStorageRoot();
  const sanitizedName = sanitizeFileName(file.originalname);
  let stored;
  try {
    stored = await storeDocumentBuffer({
      buffer: file.buffer,
      fileName: sanitizedName,
      contentType: file.mimetype || "application/octet-stream",
      organizationId: options.organizationId,
    });
  } catch {
    return { error: documentValidationError("STORAGE_WRITE_FAILED", "Document storage write failed.", 500) };
  }

  return {
    sanitizedName,
    storageKey: stored.storageKey,
    objectKey: stored.objectKey,
    storageProvider: stored.storageProvider,
    storageBucket: stored.objectBucket,
    storageRegion: stored.objectRegion,
    localPath: stored.localPath,
    checksum: stored.checksum,
    checksumSha256: stored.checksumSha256,
    mimeType: file.mimetype || "application/octet-stream",
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

export async function persistChatAttachmentFile(file, options = {}) {
  const displayFileName = normalizeUploadedDisplayFileName(file?.originalname, "attachment");
  const validation = validateChatAttachmentFile(file, displayFileName);
  if (!validation.ok) return { error: validation };

  await ensureDocumentStorageRoot();
  const sanitizedName = displayFileName;
  let stored;
  try {
    stored = await storeDocumentBuffer({
      buffer: file.buffer,
      fileName: sanitizedName,
      contentType: file.mimetype || "application/octet-stream",
      organizationId: options.organizationId,
      namespace: "chat-attachments",
    });
  } catch {
    return { error: chatAttachmentValidationError("STORAGE_WRITE_FAILED", "Chat attachment storage write failed.", 500) };
  }

  return {
    sanitizedName,
    originalFileName: displayFileName,
    storageKey: stored.storageKey,
    objectKey: stored.objectKey,
    storageProvider: stored.storageProvider,
    storageBucket: stored.objectBucket,
    storageRegion: stored.objectRegion,
    localPath: stored.localPath,
    checksum: stored.checksum,
    checksumSha256: stored.checksumSha256,
    mimeType: file.mimetype || "application/octet-stream",
    contentType: stored.contentType,
    fileSize: formatFileSize(file.size),
    sizeBytes: stored.sizeBytes,
    attachmentType: validation.attachmentType,
    storageMigratedAt: stored.storageMigratedAt,
    storageVerifiedAt: stored.storageVerifiedAt,
    storageMigrationStatus: stored.storageMigrationStatus,
    storageMigrationError: stored.storageMigrationError,
    objectWrite: stored.objectWrite,
  };
}

export async function cleanupPersistedDocument(persisted) {
  await cleanupStoredDocumentWrite(persisted);
}

export async function deleteStoredChatAttachmentFiles(attachment) {
  await cleanupStoredDocumentWrite({
    storageKey: attachment?.storage_key,
    objectKey: attachment?.object_key,
  });
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
  const fileName = document.file_name || document.title || "document";
  const fallbackName = asciiFallbackFileName(fileName);
  res.setHeader("Content-Type", stored.contentType || document.mime_type || "application/octet-stream");
  if (stored.contentLength !== null && stored.contentLength !== undefined) {
    res.setHeader("Content-Length", String(stored.contentLength));
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  stored.stream.on("error", () => res.end()).pipe(res);
}

export async function sendStoredChatAttachment(res, attachment, { disposition = "attachment" } = {}) {
  const stored = await readDocumentObject({
    ...attachment,
    mime_type: attachment?.content_type,
    storage_verified_at: attachment?.storage_verified_at || attachment?.created_at,
    storage_migration_status:
      attachment?.storage_migration_status || (attachment?.object_key ? "verified" : "local"),
  });
  if (!stored?.stream) {
    return createApiError(res, 404, "FILE_NOT_FOUND", "Stored file was not found.");
  }
  const fileName = normalizeUploadedDisplayFileName(attachment.original_filename || attachment.file_name || "attachment", "attachment");
  const fallbackName = asciiFallbackFileName(fileName);
  res.setHeader("Content-Type", stored.contentType || attachment.content_type || "application/octet-stream");
  if (stored.contentLength !== null && stored.contentLength !== undefined) {
    res.setHeader("Content-Length", String(stored.contentLength));
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
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

export function uploadChatAttachmentSingle(req, res) {
  return new Promise((resolve, reject) => {
    chatAttachmentUpload.single("file")(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
