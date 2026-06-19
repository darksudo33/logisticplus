// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const prefix = process.env.QA_PREFIX || `QA-HEAVY-${Date.now()}`;
const ownerEmail = process.env.QA_OWNER_EMAIL || "darksudo22@gmail.com";

const counts = {
  tenants: intEnv("QA_SEED_TENANTS", 6),
  usersPerTenant: intEnv("QA_SEED_USERS_PER_TENANT", 4),
  customersPerTenant: intEnv("QA_SEED_CUSTOMERS_PER_TENANT", 160),
  shipmentsPerTenant: intEnv("QA_SEED_SHIPMENTS_PER_TENANT", 260),
  tasksPerTenant: intEnv("QA_SEED_TASKS_PER_TENANT", 520),
  documentsPerTenant: intEnv("QA_SEED_DOCUMENTS_PER_TENANT", 180),
  chequesPerTenant: intEnv("QA_SEED_CHEQUES_PER_TENANT", 160),
  meetingsPerTenant: intEnv("QA_SEED_MEETINGS_PER_TENANT", 120),
  quotesPerTenant: intEnv("QA_SEED_QUOTES_PER_TENANT", 120),
  archiveRecordsPerTenant: intEnv("QA_SEED_ARCHIVE_RECORDS_PER_TENANT", 80),
  sessionsPerTenant: intEnv("QA_SEED_SESSIONS_PER_TENANT", 12),
};

function intEnv(name, fallback) {
  const parsed = Number(process.env[name] || fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function dbName(connectionString) {
  const name = new URL(connectionString).pathname.replace(/^\//, "");
  if (!name.toLowerCase().includes("test")) {
    throw new Error(`Refusing to seed a non-test database: ${name}`);
  }
  return name;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function id(scope, ...parts) {
  return `${prefix}-${scope}-${parts.join("-")}`;
}

function iso(offset = 0) {
  return new Date(Date.now() + offset * 86_400_000).toISOString();
}

function shamsi(index, hour = 9) {
  const day = String((index % 28) + 1).padStart(2, "0");
  const month = String((index % 12) + 1).padStart(2, "0");
  return `1405/${month}/${day} ${String(hour).padStart(2, "0")}:00`;
}

async function insertRows(client, table, columns, rows, conflict = "DO NOTHING") {
  if (!rows.length) return 0;
  const maxRows = Math.max(1, Math.floor(40000 / columns.length));
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += maxRows) {
    const chunk = rows.slice(offset, offset + maxRows);
    const values = [];
    const placeholders = chunk
      .map((row, rowIndex) => {
        const cells = columns.map((column, colIndex) => {
          values.push(row[column]);
          return `$${rowIndex * columns.length + colIndex + 1}`;
        });
        return `(${cells.join(", ")})`;
      })
      .join(", ");
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders} ON CONFLICT ${conflict}`,
      values
    );
    inserted += chunk.length;
  }
  return inserted;
}

async function cleanupPrefix(client) {
  const like = `${prefix}%`;
  const contains = `%${prefix}%`;
  for (const sql of [
    "DELETE FROM user_records WHERE item_id LIKE $1 OR data::text LIKE $2",
    "DELETE FROM app_sessions WHERE id LIKE $1 OR user_id LIKE $1",
    "DELETE FROM rate_limit_buckets WHERE key LIKE $1 OR key LIKE $2",
    "DELETE FROM notifications WHERE id LIKE $1 OR title LIKE $2 OR body LIKE $2",
    "DELETE FROM change_logs WHERE entity_id LIKE $1 OR summary LIKE $2 OR before_json::text LIKE $2 OR after_json::text LIKE $2",
    "DELETE FROM document_versions WHERE document_id LIKE $1 OR storage_key LIKE $2",
    "DELETE FROM documents WHERE id LIKE $1 OR title LIKE $2 OR file_name LIKE $2",
    "DELETE FROM meeting_required_documents WHERE id LIKE $1 OR name LIKE $2",
    "DELETE FROM archive_records WHERE id LIKE $2 OR entity_id LIKE $1 OR title LIKE $2 OR legacy_data::text LIKE $2",
    "DELETE FROM compliance_meetings WHERE id LIKE $1 OR title LIKE $2",
    "DELETE FROM cheques WHERE id LIKE $1 OR cheque_number LIKE $2 OR description LIKE $2",
    "DELETE FROM tasks WHERE id LIKE $1 OR title LIKE $2",
    "DELETE FROM shipment_status_events WHERE id LIKE $1",
    "DELETE FROM shipments WHERE id LIKE $1 OR shipment_code LIKE $2",
    "DELETE FROM quotations WHERE id LIKE $1 OR quotation_number LIKE $2 OR customer_name LIKE $2",
    "DELETE FROM customers WHERE id LIKE $1 OR company_name LIKE $2",
    "DELETE FROM organization_members WHERE organization_id LIKE $1 OR user_id LIKE $1",
    "DELETE FROM organization_subscriptions WHERE organization_id LIKE $1",
    "DELETE FROM app_sessions WHERE user_id LIKE $1",
    "DELETE FROM app_users WHERE id LIKE $1 OR email LIKE $2",
    "DELETE FROM organizations WHERE id LIKE $1 OR slug LIKE $2",
  ]) {
    await client.query(sql, sql.includes("$2") ? [like, contains] : [like]);
  }
}

function uiCustomer(row, index) {
  return {
    id: row.id,
    name: row.contact_name,
    company: row.company_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    shipmentsCount: index % 9,
    createdAt: iso(-index),
    notes: row.notes,
    status: "active",
    isArchived: false,
  };
}

function uiShipment(row, containerNumber) {
  return {
    id: row.id,
    trackingNumber: row.shipment_code,
    containerNumber,
    customerId: row.customer_id,
    customerName: row.customer_name,
    status: row.status,
    origin: row.origin,
    destination: row.destination,
    estimatedDelivery: row.estimated_delivery_at,
    freeTimeDays: 7,
    createdAt: iso(-1),
    isArchived: false,
  };
}

async function syncUserRecord(client, ownerUserId, organizationId, collection, itemId, data) {
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, organizationId, collection, itemId, JSON.stringify(data)]
  );
}

async function main() {
  const databaseName = dbName(testDatabaseUrl);
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  const passwordHash = await bcrypt.hash("QaLoadPass123!", 8);
  const summary = { prefix, databaseName, inserted: {} };

  try {
    await client.query("BEGIN");
    await cleanupPrefix(client);

    const ownerResult = await client.query(
      "SELECT id, name, organization_id FROM app_users WHERE email = $1 OR id = 'u1' ORDER BY CASE WHEN email = $1 THEN 0 ELSE 1 END LIMIT 1",
      [ownerEmail]
    );
    const owner = ownerResult.rows[0];
    if (!owner?.id || !owner?.organization_id) {
      throw new Error(`Could not find seeded owner user ${ownerEmail}. Run npm run test:e2e:setup first.`);
    }

    const tenantOrgs = Array.from({ length: counts.tenants }, (_, index) => ({
      id: id("org", index),
      name: `${prefix} Tenant ${index}`,
      slug: `${slug(prefix)}-tenant-${index}`,
      status: "active",
      owner_user_id: id("user", index, 0),
      plan_id: "enterprise",
      contact_name: `${prefix} Owner ${index}`,
      contact_email: `${slug(prefix)}-owner-${index}@qa.example`,
      contact_phone: `0912${String(index).padStart(7, "0")}`,
      legacy_data: JSON.stringify({ qaPrefix: prefix }),
    }));
    await insertRows(client, "organizations", Object.keys(tenantOrgs[0] || {}), tenantOrgs);
    summary.inserted.organizations = tenantOrgs.length;

    const tenantUsers = [];
    for (let tenant = 0; tenant < counts.tenants; tenant += 1) {
      for (let user = 0; user < counts.usersPerTenant; user += 1) {
        tenantUsers.push({
          id: id("user", tenant, user),
          organization_id: id("org", tenant),
          name: `${prefix} User ${tenant}-${user}`,
          email: `${slug(prefix)}-${tenant}-${user}@qa.example`,
          password_hash: passwordHash,
          role: user === 0 ? "CEO" : user % 2 ? "OPERATIONS" : "FINANCE",
          status: "active",
          notification_preferences: JSON.stringify({}),
          updated_at: new Date(),
        });
      }
    }
    await insertRows(client, "app_users", Object.keys(tenantUsers[0] || {}), tenantUsers);
    await insertRows(
      client,
      "organization_members",
      ["organization_id", "user_id", "role", "status"],
      tenantUsers.map((user) => ({
        organization_id: user.organization_id,
        user_id: user.id,
        role: user.role.toLowerCase(),
        status: "active",
      }))
    );
    summary.inserted.users = tenantUsers.length;

    const allOwners = [{ userId: owner.id, organizationId: owner.organization_id, name: owner.name || "Owner" }].concat(
      tenantOrgs.map((org, index) => ({ userId: id("user", index, 0), organizationId: org.id, name: `${prefix} Owner ${index}` }))
    );

    const customers = [];
    const shipments = [];
    const tasks = [];
    const documents = [];
    const cheques = [];
    const meetings = [];
    const requiredDocs = [];
    const quotes = [];
    const notifications = [];
    const documentVersions = [];
    const statusEvents = [];
    const archiveRecords = [];
    const sessions = [];
    const rateLimitBuckets = [];
    const changeLogs = [];

    for (const [tenantIndex, tenant] of allOwners.entries()) {
      for (let i = 0; i < counts.customersPerTenant; i += 1) {
        const customerId = id("customer", tenantIndex, i);
        customers.push({
          id: customerId,
          organization_id: tenant.organizationId,
          owner_user_id: tenant.userId,
          company_name: `${prefix} Customer ${tenantIndex}-${i}`,
          contact_name: `${prefix} Contact ${i}`,
          email: `${slug(prefix)}.customer.${tenantIndex}.${i}@qa.example`,
          phone: `09${String(tenantIndex).padStart(2, "0")}${String(i).padStart(8, "0")}`.slice(0, 11),
          address: `${prefix} Address ${i}`,
          notes: `${prefix} crowded customer row`,
          status: "active",
          legacy_data: JSON.stringify({ qaPrefix: prefix }),
          created_by_id: tenant.userId,
        });
      }

      for (let i = 0; i < counts.shipmentsPerTenant; i += 1) {
        const customer = customers[tenantIndex * counts.customersPerTenant + (i % Math.max(1, counts.customersPerTenant))];
        shipments.push({
          id: id("shipment", tenantIndex, i),
          organization_id: tenant.organizationId,
          owner_user_id: tenant.userId,
          shipment_code: `${prefix}-S-${tenantIndex}-${String(i).padStart(5, "0")}`,
          customer_id: customer?.id || null,
          customer_name: customer?.company_name || `${prefix} Customer`,
          status: ["LOADING", "IN_TRANSIT", "ARRIVED", "KOOTAJ_DONE", "EXITED"][i % 5],
          priority: i % 7 === 0 ? "high" : "normal",
          origin: ["Tehran", "Bandar Abbas", "Dubai", "Shanghai"][i % 4],
          destination: ["Mashhad", "Tehran", "Isfahan", "Shiraz"][i % 4],
          estimated_delivery_at: shamsi(i, 9 + (i % 8)),
          free_time_ends_at: shamsi(i + 3, 17),
          customer_access_token: i % 11 === 0 ? id("public-token", tenantIndex, i) : null,
          customer_access_token_hash: null,
          customer_access_enabled: i % 11 === 0,
          legacy_data: JSON.stringify({ qaPrefix: prefix, containerNumber: `MSKU${String(i).padStart(7, "0")}` }),
          created_by_id: tenant.userId,
        });
        statusEvents.push({
          id: id("status", tenantIndex, i),
          organization_id: tenant.organizationId,
          shipment_id: id("shipment", tenantIndex, i),
          public_label: `${prefix} Status ${i}`,
          public_description: `${prefix} public shipment update`,
          is_customer_visible: i % 3 !== 0,
          created_by_id: tenant.userId,
        });
      }

      for (let i = 0; i < counts.tasksPerTenant; i += 1) {
        const shipment = shipments[tenantIndex * counts.shipmentsPerTenant + (i % Math.max(1, counts.shipmentsPerTenant))];
        tasks.push({
          id: id("task", tenantIndex, i),
          organization_id: tenant.organizationId,
          owner_user_id: tenant.userId,
          title: `${prefix} Task ${tenantIndex}-${i}`,
          description: `${prefix} crowded operational task`,
          status: ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"][i % 4],
          priority: ["LOW", "MEDIUM", "HIGH", "URGENT"][i % 4],
          assigned_to_id: tenant.userId,
          assigned_to_name: tenant.name,
          assigned_by_id: tenant.userId,
          assigned_by_name: tenant.name,
          due_at: shamsi(i, 9 + (i % 9)),
          source_type: "MANUAL",
          shipment_id: shipment?.id || null,
          customer_id: shipment?.customer_id || null,
          legacy_data: JSON.stringify({ qaPrefix: prefix, deadline: `${String(9 + (i % 9)).padStart(2, "0")}:00` }),
          completed_at: i % 4 === 2 ? new Date() : null,
        });
      }

      for (let i = 0; i < counts.documentsPerTenant; i += 1) {
        const shipment = shipments[tenantIndex * counts.shipmentsPerTenant + (i % Math.max(1, counts.shipmentsPerTenant))];
        documents.push({
          id: id("document", tenantIndex, i),
          organization_id: tenant.organizationId,
          owner_user_id: tenant.userId,
          title: `${prefix} Document ${tenantIndex}-${i}`,
          file_name: `${slug(prefix)}-${tenantIndex}-${i}.txt`,
          mime_type: "text/plain",
          file_size: "42",
          storage_key: null,
          checksum: crypto.createHash("sha256").update(`${prefix}-${tenantIndex}-${i}`).digest("hex"),
          uploaded_by_id: tenant.userId,
          uploaded_by_name: tenant.name,
          shipment_id: shipment?.id || null,
          customer_id: shipment?.customer_id || null,
          visibility: i % 5 === 0 ? "customer_visible" : "internal",
          legacy_data: JSON.stringify({ qaPrefix: prefix }),
        });
        documentVersions.push({
          id: id("documentversion", tenantIndex, i, 1),
          document_id: id("document", tenantIndex, i),
          version: 1,
          storage_key: null,
          file_name: `${slug(prefix)}-${tenantIndex}-${i}.txt`,
          uploaded_by_id: tenant.userId,
        });
      }

      for (let i = 0; i < counts.chequesPerTenant; i += 1) {
        cheques.push({
          id: id("cheque", tenantIndex, i),
          organization_id: tenant.organizationId,
          owner_user_id: tenant.userId,
          bank_name: ["Mellat", "Melli", "Saman", "Pasargad"][i % 4],
          cheque_number: `${prefix}-CHQ-${tenantIndex}-${String(i).padStart(5, "0")}`,
          amount: 10_000_000 + i * 1000,
          due_date: shamsi(i, 10),
          location: `${prefix} Finance desk`,
          receiver: `${prefix} Receiver ${i}`,
          status: ["ACTIVE", "CLEARED", "RETURNED"][i % 3],
          description: `${prefix} crowded cheque`,
          created_by_id: tenant.userId,
          legacy_data: JSON.stringify({ qaPrefix: prefix }),
        });
      }

      for (let i = 0; i < counts.meetingsPerTenant; i += 1) {
        const meetingId = id("meeting", tenantIndex, i);
        meetings.push({
          id: meetingId,
          organization_id: tenant.organizationId,
          owner_user_id: tenant.userId,
          title: `${prefix} Compliance ${tenantIndex}-${i}`,
          organization_name: `${prefix} Department ${i % 6}`,
          meeting_at: shamsi(i, 11),
          location: `${prefix} Room ${i % 8}`,
          status: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "FOLLOW_UP_REQUIRED"][i % 4],
          assigned_to_id: tenant.userId,
          assigned_to_name: tenant.name,
          description: `${prefix} crowded meeting`,
          legacy_data: JSON.stringify({ qaPrefix: prefix }),
          created_by_id: tenant.userId,
        });
        requiredDocs.push({
          id: id("meetingdoc", tenantIndex, i),
          organization_id: tenant.organizationId,
          meeting_id: meetingId,
          name: `${prefix} Required certificate ${i}`,
          required: true,
          completed: i % 2 === 0,
          legacy_data: JSON.stringify({ qaPrefix: prefix }),
        });
      }

      for (let i = 0; i < counts.quotesPerTenant; i += 1) {
        const customer = customers[tenantIndex * counts.customersPerTenant + (i % Math.max(1, counts.customersPerTenant))];
        quotes.push({
          id: id("quote", tenantIndex, i),
          organization_id: tenant.organizationId,
          owner_user_id: tenant.userId,
          quotation_number: `${prefix}-Q-${tenantIndex}-${String(i).padStart(5, "0")}`,
          customer_id: customer?.id || null,
          customer_name: customer?.company_name || `${prefix} Customer`,
          customer_phone: customer?.phone || "",
          origin_city: "Tehran",
          destination_city: "Bandar Abbas",
          cargo_type: "GENERAL",
          weight: 100 + i,
          dimensions: "120x80x60",
          pickup_date: shamsi(i, 9),
          delivery_date: shamsi(i + 4, 9),
          requirements: JSON.stringify(["insurance", "tracking"]),
          base_rate: 20_000_000,
          fuel_surcharge: 1_000_000,
          loading_fees: 500_000,
          total_price: 21_500_000 + i,
          valid_until: shamsi(i + 14, 9),
          status: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"][i % 4],
          notes: `${prefix} crowded quote`,
          legacy_data: JSON.stringify({ qaPrefix: prefix }),
          created_by_id: tenant.userId,
        });
      }

      for (let i = 0; i < 80; i += 1) {
        notifications.push({
          id: id("notification", tenantIndex, i),
          organization_id: tenant.organizationId,
          user_id: tenant.userId,
          title: `${prefix} Notification ${i}`,
          body: `${prefix} notification body`,
          type: "INFO",
          source_type: "QA",
          source_id: id("notification-source", tenantIndex, i),
          legacy_data: JSON.stringify({ qaPrefix: prefix }),
        });
      }

      for (let i = 0; i < counts.archiveRecordsPerTenant; i += 1) {
        const kinds = [
          { entity_type: "customer", entity_id: id("customer", tenantIndex, i % Math.max(1, counts.customersPerTenant)) },
          { entity_type: "shipment", entity_id: id("shipment", tenantIndex, i % Math.max(1, counts.shipmentsPerTenant)) },
          { entity_type: "task", entity_id: id("task", tenantIndex, i % Math.max(1, counts.tasksPerTenant)) },
          { entity_type: "document", entity_id: id("document", tenantIndex, i % Math.max(1, counts.documentsPerTenant)) },
          { entity_type: "cheque", entity_id: id("cheque", tenantIndex, i % Math.max(1, counts.chequesPerTenant)) },
          { entity_type: "quotation", entity_id: id("quote", tenantIndex, i % Math.max(1, counts.quotesPerTenant)) },
          { entity_type: "compliance_meeting", entity_id: id("meeting", tenantIndex, i % Math.max(1, counts.meetingsPerTenant)) },
        ];
        const kind = kinds[i % kinds.length];
        archiveRecords.push({
          id: `${kind.entity_type}:${kind.entity_id}`,
          organization_id: tenant.organizationId,
          owner_user_id: tenant.userId,
          entity_type: kind.entity_type,
          entity_id: kind.entity_id,
          title: `${prefix} Archived ${kind.entity_type} ${tenantIndex}-${i}`,
          summary: `${prefix} archived crowded data`,
          customer_name: `${prefix} Customer ${tenantIndex}`,
          shipment_id: kind.entity_type === "shipment" ? kind.entity_id : null,
          archived_by_id: tenant.userId,
          legacy_data: JSON.stringify({ qaPrefix: prefix }),
        });
      }

      for (let i = 0; i < counts.sessionsPerTenant; i += 1) {
        sessions.push({
          id: id("session", tenantIndex, i),
          user_id: tenant.userId,
          token_hash: crypto.createHash("sha256").update(id("session-token", tenantIndex, i)).digest("hex"),
          expires_at: new Date(Date.now() + (i + 1) * 60 * 60 * 1000),
        });
        rateLimitBuckets.push({
          key: `qa:${prefix}:${tenantIndex}:${i}`,
          count: i + 1,
          reset_at: new Date(Date.now() + 15 * 60 * 1000),
        });
      }

      for (let i = 0; i < 40; i += 1) {
        changeLogs.push({
          id: id("changelog", tenantIndex, i),
          organization_id: tenant.organizationId,
          actor_user_id: tenant.userId,
          action: "qa.seed",
          entity_type: "QA",
          entity_id: id("change-entity", tenantIndex, i),
          summary: `${prefix} change log ${tenantIndex}-${i}`,
          before_json: JSON.stringify({ qaPrefix: prefix, before: i }),
          after_json: JSON.stringify({ qaPrefix: prefix, after: i }),
          ip_address: "127.0.0.1",
          user_agent: `${prefix} seed`,
        });
      }
    }

    await insertRows(client, "customers", Object.keys(customers[0] || {}), customers);
    await insertRows(client, "shipments", Object.keys(shipments[0] || {}), shipments);
    await insertRows(client, "shipment_status_events", Object.keys(statusEvents[0] || {}), statusEvents);
    await insertRows(client, "tasks", Object.keys(tasks[0] || {}), tasks);
    await insertRows(client, "documents", Object.keys(documents[0] || {}), documents);
    await insertRows(client, "document_versions", Object.keys(documentVersions[0] || {}), documentVersions);
    await insertRows(client, "cheques", Object.keys(cheques[0] || {}), cheques);
    await insertRows(client, "compliance_meetings", Object.keys(meetings[0] || {}), meetings);
    await insertRows(client, "meeting_required_documents", Object.keys(requiredDocs[0] || {}), requiredDocs);
    await insertRows(client, "quotations", Object.keys(quotes[0] || {}), quotes);
    await insertRows(client, "archive_records", Object.keys(archiveRecords[0] || {}), archiveRecords);
    await insertRows(client, "notifications", Object.keys(notifications[0] || {}), notifications);
    await insertRows(client, "app_sessions", Object.keys(sessions[0] || {}), sessions);
    await insertRows(client, "rate_limit_buckets", Object.keys(rateLimitBuckets[0] || {}), rateLimitBuckets, "(key) DO UPDATE SET count = EXCLUDED.count, reset_at = EXCLUDED.reset_at, updated_at = NOW()");
    await insertRows(client, "change_logs", Object.keys(changeLogs[0] || {}), changeLogs);

    for (const customer of customers) await syncUserRecord(client, customer.owner_user_id, customer.organization_id, "customers", customer.id, uiCustomer(customer, 0));
    for (const shipment of shipments) await syncUserRecord(client, shipment.owner_user_id, shipment.organization_id, "shipments", shipment.id, uiShipment(shipment, shipment.legacy_data ? JSON.parse(shipment.legacy_data).containerNumber : ""));
    for (const task of tasks) {
      await syncUserRecord(client, task.owner_user_id, task.organization_id, "tasks", task.id, {
        id: task.id,
        title: task.title,
        description: task.description,
        assignedToUserId: task.assigned_to_id,
        assignedToName: task.assigned_to_name,
        assignedByName: task.assigned_by_name,
        status: task.status,
        priority: task.priority,
        dueDate: task.due_at,
        deadline: JSON.parse(task.legacy_data).deadline,
        shipmentId: task.shipment_id || undefined,
        createdAt: iso(-1),
      });
    }
    for (const document of documents) {
      await syncUserRecord(client, document.owner_user_id, document.organization_id, "documents", document.id, {
        id: document.id,
        shipmentId: document.shipment_id || undefined,
        customerId: document.customer_id || undefined,
        name: document.title,
        type: "OTHER",
        fileSize: document.file_size,
        uploadedBy: document.uploaded_by_name,
        createdAt: iso(-1),
        url: `/api/documents/${encodeURIComponent(document.id)}/download`,
        visibility: document.visibility,
        isArchived: false,
        version: 1,
      });
    }
    for (const cheque of cheques) {
      await syncUserRecord(client, cheque.owner_user_id, cheque.organization_id, "cheques", cheque.id, {
        id: cheque.id,
        bankName: cheque.bank_name,
        chequeNumber: cheque.cheque_number,
        amount: Number(cheque.amount),
        dueDate: cheque.due_date,
        location: cheque.location,
        receiver: cheque.receiver,
        status: cheque.status,
        description: cheque.description,
        createdAt: iso(-1),
      });
    }
    for (const meeting of meetings) {
      await syncUserRecord(client, meeting.owner_user_id, meeting.organization_id, "appointments", meeting.id, {
        id: meeting.id,
        dateTime: meeting.meeting_at,
        departmentName: meeting.organization_name,
        purpose: meeting.title,
        requiredDocuments: [],
        assignedPersonId: meeting.assigned_to_id,
        assignedPersonName: meeting.assigned_to_name,
        status: meeting.status,
        outcome: "",
        nextActionItems: "",
        reminderSent: false,
        createdAt: iso(-1),
      });
    }
    for (const quote of quotes) {
      await syncUserRecord(client, quote.owner_user_id, quote.organization_id, "quotes", quote.id, {
        id: quote.id,
        customerId: quote.customer_id || undefined,
        customerName: quote.customer_name,
        customerPhone: quote.customer_phone,
        originCity: quote.origin_city,
        destinationCity: quote.destination_city,
        cargoType: quote.cargo_type,
        weight: Number(quote.weight),
        dimensions: quote.dimensions,
        pickupDate: quote.pickup_date,
        deliveryDate: quote.delivery_date,
        requirements: ["insurance", "tracking"],
        baseRate: Number(quote.base_rate),
        fuelSurcharge: Number(quote.fuel_surcharge),
        loadingFees: Number(quote.loading_fees),
        tollFees: 0,
        insurancePercentage: 0,
        profitMargin: 0,
        totalPrice: Number(quote.total_price),
        validUntil: quote.valid_until,
        status: quote.status,
        notes: quote.notes,
        createdAt: iso(-1),
        isArchived: false,
      });
    }

    Object.assign(summary.inserted, {
      customers: customers.length,
      shipments: shipments.length,
      shipmentStatusEvents: statusEvents.length,
      tasks: tasks.length,
      documents: documents.length,
      documentVersions: documentVersions.length,
      cheques: cheques.length,
      complianceMeetings: meetings.length,
      quotations: quotes.length,
      archiveRecords: archiveRecords.length,
      notifications: notifications.length,
      sessions: sessions.length,
      rateLimitBuckets: rateLimitBuckets.length,
      changeLogs: changeLogs.length,
      userRecords: customers.length + shipments.length + tasks.length + documents.length + cheques.length + meetings.length + quotes.length,
    });

    await client.query("COMMIT");
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Heavy QA seed failed:", error);
  process.exit(1);
});
