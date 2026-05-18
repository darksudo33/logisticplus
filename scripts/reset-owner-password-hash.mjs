#!/usr/bin/env node
import pg from "pg";

const { Client } = pg;

const ownerEmail = process.env.RESET_OWNER_EMAIL || "darksudo22@gmail.com";
const encodedHash = process.argv[2] || "";

function decodeHash(value) {
  if (!value) throw new Error("A base64-encoded password hash argument is required.");
  const hash = Buffer.from(value, "base64").toString("utf8");
  if (!hash.startsWith("$2")) throw new Error("Refusing to store a non-bcrypt password hash.");
  return hash;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const passwordHash = decodeHash(encodedHash);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      "UPDATE app_users SET password_hash = $1, updated_at = NOW() WHERE lower(email) = lower($2) RETURNING id, email",
      [passwordHash, ownerEmail]
    );
    if (result.rowCount !== 1) throw new Error(`Owner user was not found: ${ownerEmail}`);
    console.log(JSON.stringify({ updated: result.rows[0].email }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
