import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { createApiError } from "./db.js";

const DOCUMENT_STORAGE_DIR =
  process.env.DOCUMENT_STORAGE_DIR || path.join(process.cwd(), "storage", "documents");
const DOCUMENT_STORAGE_ROOT = path.resolve(DOCUMENT_STORAGE_DIR);
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

function formatFileSize(bytes = 0) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isPathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveStoredDocumentPath(storageKey) {
  if (!storageKey || path.isAbsolute(storageKey) || path.basename(storageKey) !== storageKey) {
    return null;
  }
  const filePath = path.resolve(DOCUMENT_STORAGE_ROOT, storageKey);
  if (!isPathInside(DOCUMENT_STORAGE_ROOT, filePath)) return null;
  return filePath;
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
  if (!isPathInside(process.cwd(), DOCUMENT_STORAGE_ROOT) && !path.isAbsolute(DOCUMENT_STORAGE_DIR)) {
    throw new Error(`DOCUMENT_STORAGE_DIR resolves outside the project: ${DOCUMENT_STORAGE_ROOT}`);
  }

  if (!isProduction()) {
    await fs.mkdir(DOCUMENT_STORAGE_ROOT, { recursive: true });
    return;
  }

  let stat;
  try {
    stat = await fs.stat(DOCUMENT_STORAGE_ROOT);
  } catch {
    throw new Error(
      `DOCUMENT_STORAGE_DIR does not exist in production: ${DOCUMENT_STORAGE_ROOT}. Mount the Liara disk before starting.`
    );
  }
  if (!stat.isDirectory()) {
    throw new Error(`DOCUMENT_STORAGE_DIR must be a directory: ${DOCUMENT_STORAGE_ROOT}`);
  }
}

export function documentStorageInfo() {
  return {
    directory: DOCUMENT_STORAGE_DIR,
    root: DOCUMENT_STORAGE_ROOT,
    maxBytes: DOCUMENT_MAX_BYTES,
  };
}

export async function verifyDocumentStorage() {
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

export async function persistDocumentFile(file) {
  const validation = validateDocumentFile(file);
  if (!validation.ok) return { error: validation };

  await ensureDocumentStorageRoot();
  const sanitizedName = sanitizeFileName(file.originalname);
  const ext = path.extname(sanitizedName);
  const id = crypto.randomUUID();
  const storageKey = `${id}${ext}`;
  const destination = path.resolve(DOCUMENT_STORAGE_ROOT, storageKey);
  if (!isPathInside(DOCUMENT_STORAGE_ROOT, destination)) {
    return { error: documentValidationError("INVALID_STORAGE_PATH", "Stored file path is invalid.", 400) };
  }
  const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
  await fs.writeFile(destination, file.buffer, { flag: "wx" });

  return {
    sanitizedName,
    storageKey,
    checksum,
    mimeType: file.mimetype || "application/octet-stream",
    fileSize: formatFileSize(file.size),
    absolutePath: destination,
  };
}

export async function cleanupPersistedDocument(persisted) {
  if (!persisted?.absolutePath) return;
  if (!isPathInside(DOCUMENT_STORAGE_ROOT, persisted.absolutePath)) return;
  await fs.unlink(persisted.absolutePath).catch(() => {});
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
      await fs.unlink(filePath);
      result.deleted.push(storageKey);
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
  const filePath = resolveStoredDocumentPath(document?.storage_key);
  if (!filePath) {
    return createApiError(res, 404, "FILE_NOT_FOUND", "Stored file was not found.");
  }
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return createApiError(res, 404, "FILE_NOT_FOUND", "Stored file was not found.");
  }
  if (!stat.isFile()) {
    return createApiError(res, 404, "FILE_NOT_FOUND", "Stored file was not found.");
  }
  const fileName = document.file_name || document.title || "document";
  const fallbackName = asciiFallbackFileName(fileName);
  res.setHeader("Content-Type", document.mime_type || "application/octet-stream");
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  createReadStream(filePath).on("error", () => res.end()).pipe(res);
}

export function uploadSingle(req, res) {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
