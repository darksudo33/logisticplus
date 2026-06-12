import path from "node:path";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const VALID_MODES = new Set(["local", "dual", "object"]);

function boolEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function clean(value) {
  return String(value || "").trim();
}

function safePublicConfig(config) {
  return {
    mode: config.mode,
    objectEnabled: config.objectEnabled,
    provider: config.provider,
    bucketConfigured: Boolean(config.bucket),
    regionConfigured: Boolean(config.region),
    endpointConfigured: Boolean(config.endpoint),
    forcePathStyle: config.forcePathStyle,
    dualWriteRequired: config.dualWriteRequired,
  };
}

export function resolveDocumentStorageConfig(env = process.env) {
  const requestedMode = clean(env.DOCUMENT_STORAGE_MODE || (boolEnv(env.OBJECT_STORAGE_ENABLED) ? "dual" : "local")).toLowerCase();
  const mode = VALID_MODES.has(requestedMode) ? requestedMode : "local";
  const objectEnabled = mode !== "local" || boolEnv(env.OBJECT_STORAGE_ENABLED);
  const provider = clean(env.OBJECT_STORAGE_PROVIDER || "s3").toLowerCase();
  const bucket = clean(env.S3_DOCUMENT_BUCKET);
  const region = clean(env.S3_REGION || "us-east-1");
  const endpoint = clean(env.S3_ENDPOINT);
  const accessKeyId = clean(env.S3_ACCESS_KEY_ID);
  const secretAccessKey = clean(env.S3_SECRET_ACCESS_KEY);
  const forcePathStyle = boolEnv(env.S3_FORCE_PATH_STYLE, Boolean(endpoint));
  const dualWriteRequired = boolEnv(env.DOCUMENT_STORAGE_DUAL_WRITE_REQUIRED, false) || mode === "object";
  const mockRoot = path.resolve(env.OBJECT_STORAGE_MOCK_DIR || path.join(process.cwd(), "storage", "object-documents"));

  return {
    mode,
    objectEnabled,
    provider,
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    dualWriteRequired,
    mockRoot,
  };
}

export function validateObjectStorageConfig(config = resolveDocumentStorageConfig()) {
  if (!config.objectEnabled) return [];

  const errors = [];
  if (!["s3", "local-mock"].includes(config.provider)) {
    errors.push("OBJECT_STORAGE_PROVIDER must be s3 or local-mock when object storage is enabled.");
  }
  if (config.provider === "s3") {
    if (!config.bucket) errors.push("S3_DOCUMENT_BUCKET is required when object storage is enabled.");
    if (!config.region) errors.push("S3_REGION is required when object storage is enabled.");
    if (!config.accessKeyId) errors.push("S3_ACCESS_KEY_ID is required when object storage is enabled.");
    if (!config.secretAccessKey) errors.push("S3_SECRET_ACCESS_KEY is required when object storage is enabled.");
  }
  return errors;
}

export function documentStorageConfigInfo(config = resolveDocumentStorageConfig()) {
  return safePublicConfig(config);
}
