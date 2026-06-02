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

function documentValidationError(code, message, statusCode = 415) {
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

export function uploadSingle(req, res) {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
