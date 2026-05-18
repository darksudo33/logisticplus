// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "date-fns-jalali";
import {
  defaultSteps,
  mockActivityLogs,
  mockAppointments,
  mockChannels,
  mockCheques,
  mockCustomers,
  mockDemurrage,
  mockDocuments,
  mockMessages,
  mockNotifications,
  mockQuotes,
  mockShipments,
  mockTasks,
  mockUsers,
} from "../src/lib/mockData.ts";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const ownerUser = {
  id: "u1",
  name: "احمدرضا علمداری",
  email: "darksudo22@gmail.com",
  role: "CEO",
  isOnline: true,
  phone: "09365683694",
};

const seedPassword = process.env.SEED_USER_PASSWORD || "57603314";
const databaseUrl =
  process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";
const adminUrl =
  process.env.POSTGRES_ADMIN_URL || "postgres://postgres@localhost:5432/postgres";

function getDatabaseName(url: string) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, "");
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
  return name;
}

async function ensureDatabase() {
  const databaseName = getDatabaseName(databaseUrl);
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName]
    );

    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${databaseName}`);
      console.log(`Created database ${databaseName}`);
    }
  } finally {
    await admin.end();
  }
}

function buildShipmentSteps() {
  return mockShipments.flatMap((shipment) =>
    defaultSteps.map((name, order) => ({
      id: `step-${shipment.id}-${order}`,
      shipmentId: shipment.id,
      name,
      order,
      status: order < 3 ? "COMPLETED" : order === 3 ? "IN_PROGRESS" : "PENDING",
      completedAt: order < 3 ? shipment.createdAt : undefined,
    }))
  );
}

function withOwnerUser(users: any[]) {
  return users.map((user) =>
    user.id === ownerUser.id
      ? { ...user, ...ownerUser, isOnline: true }
      : user
  );
}

function buildCollections() {
  const today = new Date();

  return {
    users: withOwnerUser(mockUsers),
    customers: mockCustomers,
    shipments: mockShipments,
    shipmentSteps: buildShipmentSteps(),
    defaultSteps: defaultSteps.map((name, order) => ({
      id: `default-step-${order}`,
      name,
      order,
    })),
    tasks: mockTasks,
    messages: mockMessages,
    activityLogs: mockActivityLogs,
    demurrageRecords: mockDemurrage,
    documents: mockDocuments,
    channels: mockChannels,
    notifications: mockNotifications,
    appointments: mockAppointments,
    cheques: mockCheques,
    quotes: mockQuotes,
    deletedItems: [],
    metadata: [
      {
        id: "seed-info",
        seededAt: new Date().toISOString(),
        jalaliSeedDate: format(today, "yyyy/MM/dd HH:mm"),
        source: "src/lib/mockData.ts",
      },
    ],
  };
}

async function seed() {
  await ensureDatabase();

  const schema = await fs.readFile(path.join(rootDir, "db", "schema.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(schema);

    const passwordHash = await bcrypt.hash(seedPassword, 12);
    await client.query(
      `INSERT INTO app_users (id, name, email, password_hash, role, is_online, phone, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_online = EXCLUDED.is_online,
         phone = EXCLUDED.phone,
         updated_at = NOW()`,
      [
        ownerUser.id,
        ownerUser.name,
        ownerUser.email,
        passwordHash,
        ownerUser.role,
        ownerUser.isOnline,
        ownerUser.phone,
      ]
    );

    await client.query("DELETE FROM user_records WHERE owner_user_id = $1", [
      ownerUser.id,
    ]);

    const collections = buildCollections();
    let totalRecords = 0;

    for (const [collection, records] of Object.entries(collections)) {
      for (const [index, record] of records.entries()) {
        const itemId = record.id || `${collection}-${index}`;
        await client.query(
          `INSERT INTO user_records (owner_user_id, collection, item_id, data, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, NOW())
           ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
             data = EXCLUDED.data,
             updated_at = NOW()`,
          [ownerUser.id, collection, itemId, JSON.stringify(record)]
        );
        totalRecords += 1;
      }
    }

    await client.query("COMMIT");
    console.log(`Seeded ${totalRecords} records for ${ownerUser.email}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error("Database seed failed:", error);
  process.exit(1);
});
