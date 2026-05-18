import { createApiError, pool } from "./db.js";

const memoryBuckets = new Map();
const VALID_STORES = new Set(["memory", "postgres"]);

export function resolveRateLimitStore() {
  const configured = String(process.env.RATE_LIMIT_STORE || "").trim().toLowerCase();
  if (configured) {
    if (!VALID_STORES.has(configured)) {
      throw new Error(`Invalid RATE_LIMIT_STORE value: ${process.env.RATE_LIMIT_STORE}`);
    }
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "postgres" : "memory";
}

function currentStore() {
  return resolveRateLimitStore();
}

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export function rateLimitKey(req, scope, discriminator = "") {
  return `${scope}:${clientIp(req)}:${String(discriminator || "").toLowerCase()}`;
}

function retryAfterSeconds(resetAt) {
  const resetTime = resetAt instanceof Date ? resetAt.getTime() : new Date(resetAt).getTime();
  return Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
}

function memoryBucket(key, windowMs) {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + windowMs };
    memoryBuckets.set(key, fresh);
    return fresh;
  }
  return existing;
}

async function postgresBucket(key, windowMs) {
  const result = await pool.query(
    `INSERT INTO rate_limit_buckets (key, count, reset_at, updated_at)
     VALUES ($1, 0, NOW() + ($2::int * INTERVAL '1 millisecond'), NOW())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE
         WHEN rate_limit_buckets.reset_at <= NOW() THEN 0
         ELSE rate_limit_buckets.count
       END,
       reset_at = CASE
         WHEN rate_limit_buckets.reset_at <= NOW() THEN NOW() + ($2::int * INTERVAL '1 millisecond')
         ELSE rate_limit_buckets.reset_at
       END,
       updated_at = NOW()
     RETURNING count, reset_at`,
    [key, windowMs]
  );
  return result.rows[0];
}

export async function ensureRateLimitStore() {
  if (currentStore() !== "postgres") return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS rate_limit_buckets (
       key TEXT PRIMARY KEY,
       count INT NOT NULL DEFAULT 0,
       reset_at TIMESTAMPTZ NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS rate_limit_buckets_reset_at_idx
     ON rate_limit_buckets (reset_at)`
  );
}

export async function isRateLimited(key, { limit, windowMs }) {
  if (currentStore() === "memory") {
    const bucket = memoryBucket(key, windowMs);
    return bucket.count >= limit;
  }
  const bucket = await postgresBucket(key, windowMs);
  return Number(bucket.count || 0) >= limit;
}

export async function recordRateLimitHit(key, { windowMs }) {
  if (currentStore() === "memory") {
    const bucket = memoryBucket(key, windowMs);
    bucket.count += 1;
    return;
  }
  await pool.query(
    `INSERT INTO rate_limit_buckets (key, count, reset_at, updated_at)
     VALUES ($1, 1, NOW() + ($2::int * INTERVAL '1 millisecond'), NOW())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE
         WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
         ELSE rate_limit_buckets.count + 1
       END,
       reset_at = CASE
         WHEN rate_limit_buckets.reset_at <= NOW() THEN NOW() + ($2::int * INTERVAL '1 millisecond')
         ELSE rate_limit_buckets.reset_at
       END,
       updated_at = NOW()`,
    [key, windowMs]
  );
}

export async function clearRateLimit(key) {
  if (currentStore() === "memory") {
    memoryBuckets.delete(key);
    return;
  }
  await pool.query("DELETE FROM rate_limit_buckets WHERE key = $1", [key]);
}

async function consumeMemoryRateLimit(key, { limit, windowMs }) {
  const bucket = memoryBucket(key, windowMs);
  if (bucket.count >= limit) {
    return { limited: true, retryAfter: retryAfterSeconds(new Date(bucket.resetAt)) };
  }
  bucket.count += 1;
  return { limited: false, retryAfter: retryAfterSeconds(new Date(bucket.resetAt)) };
}

async function consumePostgresRateLimit(key, { limit, windowMs }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO rate_limit_buckets (key, count, reset_at, updated_at)
       VALUES ($1, 0, NOW() + ($2::int * INTERVAL '1 millisecond'), NOW())
       ON CONFLICT (key) DO NOTHING`,
      [key, windowMs]
    );

    const result = await client.query(
      `SELECT count, reset_at
       FROM rate_limit_buckets
       WHERE key = $1
       FOR UPDATE`,
      [key]
    );
    const now = Date.now();
    let count = Number(result.rows[0]?.count || 0);
    let resetAt = result.rows[0]?.reset_at ? new Date(result.rows[0].reset_at) : new Date(now + windowMs);

    if (resetAt.getTime() <= now) {
      count = 0;
      resetAt = new Date(now + windowMs);
    }

    if (count >= limit) {
      await client.query("COMMIT");
      return { limited: true, retryAfter: retryAfterSeconds(resetAt) };
    }

    await client.query(
      `UPDATE rate_limit_buckets
       SET count = $2, reset_at = $3, updated_at = NOW()
       WHERE key = $1`,
      [key, count + 1, resetAt]
    );
    await client.query("COMMIT");
    return { limited: false, retryAfter: retryAfterSeconds(resetAt) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeRateLimit(req, res, scope, { limit, windowMs, discriminator = "" }) {
  const key = rateLimitKey(req, scope, discriminator);
  const result = currentStore() === "memory"
    ? await consumeMemoryRateLimit(key, { limit, windowMs })
    : await consumePostgresRateLimit(key, { limit, windowMs });

  if (result.limited) {
    res.setHeader("Retry-After", String(result.retryAfter));
    createApiError(res, 429, "RATE_LIMITED", "Too many requests. Please try again later.");
    return false;
  }
  return true;
}
