// @ts-nocheck
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(rootDir, "db", "migrations");
const databaseUrl =
  process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";

function checksum(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function ensureMigrationsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function migrationsTableExists(client: Client) {
  const result = await client.query("SELECT to_regclass('public.schema_migrations') AS table_name");
  return Boolean(result.rows[0]?.table_name);
}

async function loadMigrations() {
  await fs.mkdir(migrationsDir, { recursive: true });
  const names = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  return Promise.all(
    names.map(async (name) => {
      const filePath = path.join(migrationsDir, name);
      const sql = (await fs.readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
      return {
        id: name.replace(/\.sql$/, ""),
        name,
        sql,
        checksum: checksum(sql),
      };
    })
  );
}

async function appliedMigrations(client: Client) {
  if (!(await migrationsTableExists(client))) return new Map();
  const result = await client.query("SELECT id, name, checksum, applied_at FROM schema_migrations ORDER BY id");
  return new Map(result.rows.map((row) => [row.id, row]));
}

function assertAppliedChecksumsMatch(migrations, applied) {
  for (const migration of migrations) {
    const existing = applied.get(migration.id);
    if (existing && existing.checksum !== migration.checksum) {
      throw new Error(`Applied migration checksum changed: ${migration.name}`);
    }
  }
}

async function runStatus(client: Client, migrations) {
  const applied = await appliedMigrations(client);
  assertAppliedChecksumsMatch(migrations, applied);
  for (const migration of migrations) {
    const existing = applied.get(migration.id);
    const status = existing ? `applied ${existing.applied_at.toISOString?.() || existing.applied_at}` : "pending";
    console.log(`${status.padEnd(32)} ${migration.name}`);
  }
  const pending = migrations.filter((migration) => !applied.has(migration.id)).length;
  console.log(`${pending} pending migration${pending === 1 ? "" : "s"}.`);
}

async function applyMigration(client: Client, migration) {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      `INSERT INTO schema_migrations (id, name, checksum, applied_at)
       VALUES ($1, $2, $3, NOW())`,
      [migration.id, migration.name, migration.checksum]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function runUp(client: Client, migrations) {
  const applied = await appliedMigrations(client);
  assertAppliedChecksumsMatch(migrations, applied);
  const pending = migrations.filter((migration) => !applied.has(migration.id));
  for (const migration of pending) {
    console.log(`Applying ${migration.name}`);
    await applyMigration(client, migration);
  }
  console.log(pending.length ? `Applied ${pending.length} migration${pending.length === 1 ? "" : "s"}.` : "No pending migrations.");
}

async function runBaseline(client: Client, migrations) {
  const applied = await appliedMigrations(client);
  assertAppliedChecksumsMatch(migrations, applied);
  const pending = migrations.filter((migration) => !applied.has(migration.id));
  const baselinePending = pending.filter((migration) => /baseline/i.test(migration.name));
  const nonBaselinePending = pending.filter((migration) => !/baseline/i.test(migration.name));
  if (nonBaselinePending.length) {
    throw new Error(
      `Refusing to baseline non-baseline migrations: ${nonBaselinePending.map((migration) => migration.name).join(", ")}`
    );
  }
  if (!baselinePending.length) {
    console.log("No migrations to baseline.");
    return;
  }
  await client.query("BEGIN");
  try {
    for (const migration of baselinePending) {
      await client.query(
        `INSERT INTO schema_migrations (id, name, checksum, applied_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [migration.id, migration.name, migration.checksum]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
  console.log(`Baselined ${baselinePending.length} migration${baselinePending.length === 1 ? "" : "s"} without executing SQL.`);
}

async function main() {
  const command = process.argv[2] || "up";
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const migrations = await loadMigrations();
    if (command === "status") return await runStatus(client, migrations);
    await ensureMigrationsTable(client);
    if (command === "baseline") return await runBaseline(client, migrations);
    if (command === "up") return await runUp(client, migrations);
    throw new Error(`Unknown migration command: ${command}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
