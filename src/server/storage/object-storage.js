import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { isPathInside } from "./local-storage.js";
import { resolveDocumentStorageConfig, validateObjectStorageConfig } from "./storage-config.js";

function safeObjectError(error) {
  const safe = new Error(error?.message || "Object storage operation failed.");
  safe.code = error?.name || error?.Code || error?.code || "OBJECT_STORAGE_ERROR";
  safe.statusCode = error?.$metadata?.httpStatusCode || error?.statusCode;
  return safe;
}

function nodeReadable(body) {
  if (!body) return null;
  if (typeof body.pipe === "function") return body;
  if (typeof body.transformToWebStream === "function") {
    return Readable.fromWeb(body.transformToWebStream());
  }
  return Readable.from(body);
}

class LocalMockObjectStorageProvider {
  constructor(config) {
    this.provider = "local-mock";
    this.bucket = config.bucket || "mock-document-bucket";
    this.region = config.region || "local";
    this.root = config.mockRoot;
  }

  resolvePath(key) {
    if (!key || path.isAbsolute(key)) return null;
    const filePath = path.resolve(this.root, key);
    if (!isPathInside(this.root, filePath)) return null;
    return filePath;
  }

  async putObject({ key, body, contentType, metadata = {} }) {
    const filePath = this.resolvePath(key);
    if (!filePath) throw new Error("Invalid object key.");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body, { flag: "w" });
    await fs.writeFile(`${filePath}.metadata.json`, JSON.stringify({ contentType, metadata }), { flag: "w" });
    return { provider: this.provider, bucket: this.bucket, region: this.region, key };
  }

  async headObject({ key }) {
    const filePath = this.resolvePath(key);
    if (!filePath) return null;
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) return null;
    let metadata = {};
    try {
      metadata = JSON.parse(await fs.readFile(`${filePath}.metadata.json`, "utf8"));
    } catch {
      metadata = {};
    }
    return {
      provider: this.provider,
      bucket: this.bucket,
      region: this.region,
      key,
      contentLength: stat.size,
      size: stat.size,
      contentType: metadata.contentType || "application/octet-stream",
      metadata: metadata.metadata || {},
      lastModified: stat.mtime,
    };
  }

  async getObjectStream({ key }) {
    const head = await this.headObject({ key });
    if (!head) return null;
    const filePath = this.resolvePath(key);
    return { ...head, stream: createReadStream(filePath) };
  }

  async deleteObject({ key }) {
    const filePath = this.resolvePath(key);
    if (!filePath) return { deleted: false, reason: "invalid_key" };
    await fs.unlink(filePath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    await fs.unlink(`${filePath}.metadata.json`).catch(() => {});
    return { deleted: true };
  }
}

class S3ObjectStorageProvider {
  constructor(config) {
    this.provider = "s3";
    this.bucket = config.bucket;
    this.region = config.region;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject({ key, body, contentType, metadata = {} }) {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType || "application/octet-stream",
        Metadata: metadata,
      }));
      return { provider: this.provider, bucket: this.bucket, region: this.region, key };
    } catch (error) {
      throw safeObjectError(error);
    }
  }

  async headObject({ key }) {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        provider: this.provider,
        bucket: this.bucket,
        region: this.region,
        key,
        contentLength: Number(result.ContentLength || 0),
        size: Number(result.ContentLength || 0),
        contentType: result.ContentType || "application/octet-stream",
        metadata: result.Metadata || {},
        lastModified: result.LastModified || null,
      };
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return null;
      throw safeObjectError(error);
    }
  }

  async getObjectStream({ key }) {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        provider: this.provider,
        bucket: this.bucket,
        region: this.region,
        key,
        contentLength: Number(result.ContentLength || 0),
        size: Number(result.ContentLength || 0),
        contentType: result.ContentType || "application/octet-stream",
        metadata: result.Metadata || {},
        stream: nodeReadable(result.Body),
      };
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NoSuchKey") return null;
      throw safeObjectError(error);
    }
  }

  async deleteObject({ key }) {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return { deleted: true };
    } catch (error) {
      throw safeObjectError(error);
    }
  }
}

export function createObjectStorageProvider(config = resolveDocumentStorageConfig()) {
  const errors = validateObjectStorageConfig(config);
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.code = "OBJECT_STORAGE_CONFIG_INVALID";
    throw error;
  }
  if (!config.objectEnabled) return null;
  if (config.provider === "local-mock") return new LocalMockObjectStorageProvider(config);
  return new S3ObjectStorageProvider(config);
}
