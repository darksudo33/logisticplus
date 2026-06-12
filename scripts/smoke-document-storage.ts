// @ts-nocheck
import "dotenv/config";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import {
  createObjectStorageProvider,
  documentStorageConfigInfo,
  resolveDocumentStorageConfig,
  validateObjectStorageConfig,
} from "../src/server/storage/index.js";
import { sha256Hex } from "../src/server/storage/document-storage-service.js";

function safeErrorMessage(error: unknown) {
  return String(error?.message || error || "Document storage smoke failed.")
    .replace(/(access[_-]?key|secret|signature|credential|token|authorization)[^,\s]*/gi, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 300);
}

async function streamToBuffer(stream: any) {
  const chunks = [];
  for await (const chunk of stream || Readable.from([])) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function printSafeConfig(config: any) {
  const info = documentStorageConfigInfo(config);
  console.log("Document storage smoke config:");
  console.log(`  mode: ${info.mode}`);
  console.log(`  objectEnabled: ${info.objectEnabled}`);
  console.log(`  provider: ${info.provider}`);
  console.log(`  bucketConfigured: ${info.bucketConfigured}`);
  console.log(`  endpointConfigured: ${info.endpointConfigured}`);
  console.log(`  regionConfigured: ${info.regionConfigured}`);
  console.log(`  forcePathStyle: ${info.forcePathStyle}`);
  console.log(`  dualWriteRequired: ${info.dualWriteRequired}`);
}

async function main() {
  const config = resolveDocumentStorageConfig();
  printSafeConfig(config);

  if (!config.objectEnabled) {
    throw new Error("Object storage is not enabled. Set DOCUMENT_STORAGE_MODE=object or OBJECT_STORAGE_ENABLED=true.");
  }

  const errors = validateObjectStorageConfig(config);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  const provider = createObjectStorageProvider(config);
  const content = Buffer.from(`logisticplus-object-storage-smoke:${crypto.randomUUID()}`, "utf8");
  const checksum = sha256Hex(content);
  const key = `smoke/logisticplus-${crypto.randomUUID()}.txt`;
  let uploaded = false;

  try {
    await provider.putObject({
      key,
      body: content,
      contentType: "text/plain; charset=utf-8",
      metadata: {
        checksumSha256: checksum,
        purpose: "logisticplus-smoke",
      },
    });
    uploaded = true;

    const head = await provider.headObject({ key });
    if (!head) throw new Error("Smoke object head check failed.");
    if (Number(head.contentLength || head.size || 0) !== content.length) {
      throw new Error("Smoke object size verification failed.");
    }

    const object = await provider.getObjectStream({ key });
    if (!object?.stream) throw new Error("Smoke object read failed.");
    const downloaded = await streamToBuffer(object.stream);
    if (sha256Hex(downloaded) !== checksum) {
      throw new Error("Smoke object checksum verification failed.");
    }

    console.log("Document storage smoke passed.");
    console.log(`  provider: ${provider.provider}`);
    console.log(`  bytesVerified: ${downloaded.length}`);
  } finally {
    if (uploaded) {
      await provider.deleteObject({ key }).catch((error) => {
        console.warn(`Smoke object cleanup failed: ${safeErrorMessage(error)}`);
      });
    }
  }
}

main().catch((error) => {
  console.error(`Document storage smoke failed: ${safeErrorMessage(error)}`);
  process.exit(1);
});
