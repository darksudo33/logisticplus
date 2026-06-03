import crypto from "node:crypto";
import path from "node:path";
import { createObjectStorageProvider } from "./object-storage.js";
import {
  deleteLocalObject,
  getLocalObjectStream,
  headLocalObject,
  putLocalObject,
  readLocalObjectBuffer,
} from "./local-storage.js";
import { resolveDocumentStorageConfig } from "./storage-config.js";

const SAFE_ERROR_MAX = 240;

export function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function formatFileSize(bytes = 0) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function safeErrorMessage(error) {
  return String(error?.code || error?.message || "object_storage_failed")
    .replace(/(access[_-]?key|secret|signature|credential|token|authorization)[^,\s]*/gi, "[redacted]")
    .slice(0, SAFE_ERROR_MAX);
}

function sanitizeTenantSegment(value) {
  return String(value || "unknown-org")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "unknown-org";
}

function extensionFromName(fileName = "") {
  return path.extname(String(fileName || "")).toLowerCase().replace(/[^.\w]/g, "");
}

export function generateLocalStorageKey(fileName = "") {
  return `${crypto.randomUUID()}${extensionFromName(fileName)}`;
}

export function generateDocumentObjectKey({ organizationId, fileName = "", id = crypto.randomUUID(), namespace = "documents" } = {}) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeNamespace = sanitizeTenantSegment(namespace || "documents");
  return `${safeNamespace}/${sanitizeTenantSegment(organizationId)}/${year}/${month}/${id}${extensionFromName(fileName)}`;
}

function isObjectVerified(document = {}) {
  return Boolean(
    document.object_key &&
    (document.storage_verified_at || document.storage_migration_status === "verified")
  );
}

function migrationStatusForLocalOnly(config, objectError) {
  if (config.mode === "local") return "local";
  return objectError ? "object_failed_local_available" : "local";
}

export async function storeDocumentBuffer({
  buffer,
  fileName,
  contentType,
  organizationId,
  namespace = "documents",
  config = resolveDocumentStorageConfig(),
}) {
  const checksum = sha256Hex(buffer);
  const sizeBytes = Number(buffer.length || 0);
  const now = new Date();
  const localWriteEnabled = config.mode === "local" || config.mode === "dual";
  const objectWriteEnabled = config.mode === "dual" || config.mode === "object";
  const objectRequired = config.mode === "object" || config.dualWriteRequired;
  let localResult = null;
  let objectResult = null;
  let objectHead = null;
  let objectError = null;
  let objectKey = null;

  if (localWriteEnabled) {
    const localKey = generateLocalStorageKey(fileName);
    localResult = await putLocalObject({ key: localKey, body: buffer });
  }

  if (objectWriteEnabled) {
    try {
      const objectProvider = createObjectStorageProvider(config);
      if (!objectProvider) throw new Error("Object storage is not enabled.");
      objectKey = generateDocumentObjectKey({ organizationId, fileName, namespace });
      objectResult = await objectProvider.putObject({
        key: objectKey,
        body: buffer,
        contentType,
        metadata: {
          checksumSha256: checksum,
          organizationId: sanitizeTenantSegment(organizationId),
        },
      });
      objectHead = await objectProvider.headObject({ key: objectKey });
      if (!objectHead || Number(objectHead.contentLength || objectHead.size || 0) !== sizeBytes) {
        throw new Error("Object storage size verification failed.");
      }
    } catch (error) {
      objectError = error;
      if (objectRequired) {
        if (localResult?.key) await deleteLocalObject(localResult.key).catch(() => {});
        throw error;
      }
    }
  }

  const objectVerified = Boolean(objectResult && objectHead && !objectError);
  const status = objectVerified
    ? "verified"
    : migrationStatusForLocalOnly(config, objectError);

  return {
    storageProvider: objectVerified ? objectResult.provider : "local",
    storageKey: localResult?.key || null,
    objectKey: objectResult?.key || objectKey || null,
    objectBucket: objectResult?.bucket || null,
    objectRegion: objectResult?.region || null,
    localPath: localResult?.key || null,
    checksum,
    checksumSha256: checksum,
    fileSize: formatFileSize(sizeBytes),
    sizeBytes,
    contentType: contentType || "application/octet-stream",
    storageMigratedAt: objectVerified ? now : null,
    storageVerifiedAt: objectVerified ? now : null,
    storageMigrationStatus: status,
    storageMigrationError: objectError ? safeErrorMessage(objectError) : null,
    objectWrite: {
      attempted: objectWriteEnabled,
      verified: objectVerified,
      failed: Boolean(objectError),
      required: objectRequired,
      provider: objectResult?.provider || (objectWriteEnabled ? config.provider : null),
    },
  };
}

export async function cleanupStoredDocumentWrite(persisted) {
  if (!persisted) return;
  if (persisted.storageKey) await deleteLocalObject(persisted.storageKey).catch(() => {});
  if (persisted.objectKey) {
    try {
      const objectProvider = createObjectStorageProvider();
      if (objectProvider) await objectProvider.deleteObject({ key: persisted.objectKey });
    } catch {
      // Best-effort cleanup only for failed pre-record writes.
    }
  }
}

export async function readDocumentObject(document = {}, config = resolveDocumentStorageConfig()) {
  const objectEnabled = config.mode === "dual" || config.mode === "object";
  if (objectEnabled && isObjectVerified(document)) {
    try {
      const objectProvider = createObjectStorageProvider(config);
      if (objectProvider) {
        const object = await objectProvider.getObjectStream({ key: document.object_key });
        if (object?.stream) {
          return {
            source: "object",
            stream: object.stream,
            contentLength: object.contentLength || object.size || document.size_bytes || null,
            contentType: object.contentType || document.content_type || document.mime_type,
          };
        }
      }
    } catch (error) {
      console.warn("Document object read failed; attempting local fallback.", {
        provider: document.storage_provider || config.provider,
        documentId: document.id || null,
        reason: safeErrorMessage(error),
      });
    }
  }

  if (document.storage_key) {
    const local = await getLocalObjectStream(document.storage_key);
    if (local?.stream) {
      return {
        source: "local",
        stream: local.stream,
        contentLength: local.contentLength || local.size || document.size_bytes || null,
        contentType: document.mime_type || document.content_type || "application/octet-stream",
      };
    }
  }

  return null;
}

export async function headDocumentLocal(document = {}) {
  if (!document.storage_key) return null;
  return headLocalObject(document.storage_key);
}

export async function readDocumentLocalBuffer(document = {}) {
  if (!document.storage_key) return null;
  return readLocalObjectBuffer(document.storage_key);
}
