const documentStorageResponseKeys = new Set([
  "storage_key",
  "storage_provider",
  "object_key",
  "storage_bucket",
  "storage_region",
  "local_path",
  "checksum",
  "checksum_sha256",
  "size_bytes",
  "content_type",
  "storage_migrated_at",
  "storage_verified_at",
  "storage_migration_status",
  "storage_migration_error",
]);

export function sanitizeDocumentForApi(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return document;
  const sanitized = {};
  for (const [key, value] of Object.entries(document)) {
    if (documentStorageResponseKeys.has(key)) continue;
    sanitized[key] = value;
  }
  if (Array.isArray(document.versions)) {
    sanitized.versions = document.versions.map(sanitizeDocumentForApi);
  }
  return sanitized;
}

export function documentStorageAuditMetadata(persisted) {
  return {
    storageMode: persisted?.objectWrite?.attempted ? "object-capable" : "local",
    migrationStatus: persisted?.storageMigrationStatus || "local",
    objectWrite: {
      attempted: Boolean(persisted?.objectWrite?.attempted),
      verified: Boolean(persisted?.objectWrite?.verified),
      failed: Boolean(persisted?.objectWrite?.failed),
      required: Boolean(persisted?.objectWrite?.required),
      provider: persisted?.objectWrite?.provider || null,
    },
  };
}
