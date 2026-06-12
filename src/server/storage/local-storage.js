import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const DOCUMENT_STORAGE_DIR =
  process.env.DOCUMENT_STORAGE_DIR || path.join(process.cwd(), "storage", "documents");
const DOCUMENT_STORAGE_ROOT = path.resolve(DOCUMENT_STORAGE_DIR);

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function isPathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function documentLocalStorageInfo() {
  return {
    directory: DOCUMENT_STORAGE_DIR,
    root: DOCUMENT_STORAGE_ROOT,
  };
}

export async function ensureLocalStorageRoot() {
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

export function resolveLocalStoragePath(storageKey) {
  if (!storageKey || path.isAbsolute(storageKey) || path.basename(storageKey) !== storageKey) {
    return null;
  }
  const filePath = path.resolve(DOCUMENT_STORAGE_ROOT, storageKey);
  if (!isPathInside(DOCUMENT_STORAGE_ROOT, filePath)) return null;
  return filePath;
}

export async function putLocalObject({ key, body }) {
  await ensureLocalStorageRoot();
  const destination = resolveLocalStoragePath(key);
  if (!destination) {
    const error = new Error("Stored file path is invalid.");
    error.code = "INVALID_STORAGE_PATH";
    error.statusCode = 400;
    throw error;
  }
  await fs.writeFile(destination, body, { flag: "wx" });
  return { key, path: destination };
}

export async function headLocalObject(key) {
  const filePath = resolveLocalStoragePath(key);
  if (!filePath) return null;
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return null;
  return {
    key,
    path: filePath,
    size: stat.size,
    contentLength: stat.size,
    lastModified: stat.mtime,
  };
}

export async function getLocalObjectStream(key) {
  const head = await headLocalObject(key);
  if (!head) return null;
  return {
    ...head,
    stream: createReadStream(head.path),
  };
}

export async function deleteLocalObject(key) {
  const filePath = resolveLocalStoragePath(key);
  if (!filePath) return { deleted: false, reason: "invalid_key" };
  try {
    await fs.unlink(filePath);
    return { deleted: true };
  } catch (error) {
    if (error?.code === "ENOENT") return { deleted: false, reason: "missing" };
    throw error;
  }
}

export async function readLocalObjectBuffer(key) {
  const filePath = resolveLocalStoragePath(key);
  if (!filePath) return null;
  return fs.readFile(filePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
}
