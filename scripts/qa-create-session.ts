// @ts-nocheck
import crypto from "node:crypto";
import { Client } from "pg";

const prefix = process.env.QA_PREFIX || "";
const ownerEmail = process.env.QA_OWNER_EMAIL || process.env.STAGING_OWNER_EMAIL || "darksudo22@gmail.com";
const databaseUrl = process.env.DATABASE_URL || process.env.QA_DATABASE_URL || "";
const mode = process.env.QA_MODE || "production";

function fail(message) {
  console.error(`[qa:create-session] ${message}`);
  process.exit(1);
}

if (!/^QA-[A-Za-z0-9:.-]{6,96}$/.test(prefix)) {
  fail("QA_PREFIX must start with QA- and contain only safe identifier characters.");
}

if (!databaseUrl) {
  fail("DATABASE_URL or QA_DATABASE_URL is required.");
}

if (mode === "production" && !databaseUrl.includes("postgres")) {
  fail("Production QA session creation requires a PostgreSQL DATABASE_URL.");
}

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const userResult = await client.query(
    `SELECT id
     FROM app_users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [ownerEmail]
  );
  const user = userResult.rows[0];
  if (!user?.id) {
    fail(`Owner user not found for ${ownerEmail}.`);
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await client.query(
    `INSERT INTO app_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '2 hours')`,
    [`${prefix}-session-${crypto.randomUUID()}`, user.id, tokenHash]
  );

  console.log(`QA_SESSION_TOKEN=${token}`);
} finally {
  await client.end();
}
