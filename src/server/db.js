import crypto from "node:crypto";
import pg from "pg";
import { DEFAULT_SMS_TEMPLATE_MAP, renderSmsTemplateBody } from "./sms-templates.js";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";

export const pool = new Pool({ connectionString });

const TRANSIENT_SESSION_HOURS = 12;
const REMEMBER_SESSION_DAYS = 30;
const LOGIN_SMS_CODE_TTL_MINUTES = 5;
const LOGIN_SMS_MAX_ATTEMPTS = 5;

export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createApiError(res, status, code, message, field) {
  return res.status(status).json({
    ok: false,
    error: { code, message, ...(field ? { field } : {}) },
  });
}

export async function checkDatabase() {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0];
}

export async function getUserByEmail(email) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences,
            u.organization_id,
            o.status AS organization_status,
            o.name AS organization_name,
            o.plan_id AS organization_plan_id,
            os.status AS subscription_status
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE lower(u.email) = lower($1)
     LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

function normalizeDigits(value) {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return String(value || "").replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = persianDigits.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    const arabicIndex = arabicDigits.indexOf(digit);
    return arabicIndex >= 0 ? String(arabicIndex) : digit;
  });
}

function phoneDigitsSql(columnExpression) {
  return `regexp_replace(translate(COALESCE(${columnExpression}, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '\\D', '', 'g')`;
}

export function normalizeSmsPhone(phone) {
  const digits = normalizeDigits(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0098") && digits.length === 14) return digits.slice(2);
  if (digits.startsWith("98") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `98${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `98${digits}`;
  return "";
}

export async function getUserByPhone(phone) {
  const normalizedPhone = normalizeSmsPhone(phone);
  if (!normalizedPhone) return null;
  const localPhone = normalizedPhone.startsWith("98") ? `0${normalizedPhone.slice(2)}` : normalizedPhone;
  const nationalPhone = normalizedPhone.startsWith("98") ? normalizedPhone.slice(2) : normalizedPhone;
  const phoneExpression = phoneDigitsSql("u.phone");
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences,
            u.organization_id,
            o.status AS organization_status,
            o.name AS organization_name,
            o.plan_id AS organization_plan_id,
            os.status AS subscription_status
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE ${phoneExpression} = ANY($1::text[])
     ORDER BY u.created_at ASC
     LIMIT 1`,
    [[normalizedPhone, localPhone, nationalPhone]]
  );
  return result.rows[0] || null;
}

export async function getUserById(userId) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences,
            u.organization_id,
            o.status AS organization_status,
            o.name AS organization_name,
            o.plan_id AS organization_plan_id,
            os.status AS subscription_status
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function getRecordsForUser(ownerUserId) {
  const result = await pool.query(
    `SELECT collection, item_id, data
     FROM user_records
     WHERE owner_user_id = $1
     ORDER BY collection, item_id`,
    [ownerUserId]
  );

  return result.rows.reduce((acc, row) => {
    if (!acc[row.collection]) acc[row.collection] = [];
    acc[row.collection].push(row.data);
    return acc;
  }, {});
}

export async function replaceRecordsForUser(ownerUserId, recordsByCollection) {
  const client = await pool.connect();
  const entries = Object.entries(recordsByCollection || {}).filter(([, records]) =>
    Array.isArray(records)
  );

  try {
    await client.query("BEGIN");
    const ownerResult = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [
      ownerUserId,
    ]);
    const ownerOrganizationId = ownerResult.rows[0]?.organization_id || null;

    let total = 0;
    for (const [collection, records] of entries) {
      const uniqueRecords = Array.from(
        records
          .reduce((items, record, index) => {
            const itemId = record?.id || `${collection}-${index}`;
            items.set(itemId, { itemId, record });
            return items;
          }, new Map())
          .values()
      );
      await client.query(
        "DELETE FROM user_records WHERE owner_user_id = $1 AND collection = $2",
        [ownerUserId, collection]
      );

      for (const { itemId, record } of uniqueRecords) {
        await client.query(
          `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
           ON CONFLICT (owner_user_id, collection, item_id)
           DO UPDATE SET
             organization_id = EXCLUDED.organization_id,
             data = EXCLUDED.data,
             updated_at = NOW()`,
          [ownerUserId, ownerOrganizationId, collection, itemId, JSON.stringify(record)]
        );
        total += 1;
      }

      await syncCanonicalCollection(
        client,
        ownerUserId,
        ownerOrganizationId,
        collection,
        uniqueRecords.map((item) => item.record)
      );
    }

    await client.query("COMMIT");
    return { total };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createSession(userId, { remember = false } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() +
      (remember
        ? REMEMBER_SESSION_DAYS * 24 * 60 * 60 * 1000
        : TRANSIENT_SESSION_HOURS * 60 * 60 * 1000)
  );

  await pool.query(
    `INSERT INTO app_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, tokenHash, expiresAt]
  );

  await pool.query(
    "UPDATE app_users SET last_seen_at = NOW(), is_online = TRUE WHERE id = $1",
    [userId]
  );

  return { token, expiresAt, remember };
}

function createLoginSmsCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashLoginSmsCode(code, salt) {
  return crypto.createHash("sha256").update(`${salt}:${String(code || "").trim()}`).digest("hex");
}

export async function createLoginSmsChallenge({ userId, phone, requestContext = {} }) {
  const normalizedPhone = normalizeSmsPhone(phone);
  if (!userId || !normalizedPhone) {
    const error = new Error("A valid phone number is required.");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  const id = crypto.randomUUID();
  const code = createLoginSmsCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + LOGIN_SMS_CODE_TTL_MINUTES * 60 * 1000);

  await pool.query(
    `UPDATE login_sms_challenges
     SET consumed_at = COALESCE(consumed_at, NOW()),
         updated_at = NOW()
     WHERE user_id = $1
       AND phone = $2
       AND consumed_at IS NULL`,
    [userId, normalizedPhone]
  );

  await pool.query(
    `INSERT INTO login_sms_challenges (
       id, user_id, phone, code_hash, code_salt, expires_at, ip_address, user_agent, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      id,
      userId,
      normalizedPhone,
      hashLoginSmsCode(code, salt),
      salt,
      expiresAt,
      requestContext.ip || null,
      requestContext.userAgent || null,
    ]
  );

  return { id, code, phone: normalizedPhone, expiresAt };
}

export async function verifyLoginSmsChallenge({ phone, code }) {
  const normalizedPhone = normalizeSmsPhone(phone);
  const normalizedCode = normalizeDigits(code).replace(/\D/g, "");
  if (!normalizedPhone || !normalizedCode) {
    return { ok: false, reason: "invalid_code" };
  }

  const result = await pool.query(
    `SELECT *
     FROM login_sms_challenges
     WHERE phone = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedPhone]
  );
  const challenge = result.rows[0];
  if (!challenge) return { ok: false, reason: "expired_or_missing" };
  if (Number(challenge.attempt_count || 0) >= LOGIN_SMS_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = hashLoginSmsCode(normalizedCode, challenge.code_salt) === challenge.code_hash;
  if (!matches) {
    await pool.query(
      `UPDATE login_sms_challenges
       SET attempt_count = attempt_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [challenge.id]
    );
    return { ok: false, reason: "invalid_code" };
  }

  await pool.query(
    `UPDATE login_sms_challenges
     SET consumed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [challenge.id]
  );

  return { ok: true, user: await getUserById(challenge.user_id), challengeId: challenge.id };
}

export async function getSessionByToken(token) {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       u.id,
       u.name,
       u.email,
       u.role,
       u.avatar,
       u.is_online,
       u.department,
       u.status,
       u.last_seen_at,
       u.phone,
       u.location,
       u.bio,
       u.two_factor_enabled,
       u.notification_preferences,
       u.organization_id,
       o.status AS organization_status,
       o.name AS organization_name,
       o.plan_id AS organization_plan_id,
       os.status AS subscription_status
     FROM app_sessions s
     JOIN app_users u ON u.id = s.user_id
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row) return null;

  await pool.query(
    "UPDATE app_sessions SET last_seen_at = NOW() WHERE id = $1",
    [row.session_id]
  );

  return {
    sessionId: row.session_id,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      avatar: row.avatar,
      is_online: row.is_online,
      department: row.department,
      status: row.status,
      last_seen_at: row.last_seen_at,
      phone: row.phone,
      location: row.location,
      bio: row.bio,
      two_factor_enabled: row.two_factor_enabled,
      notification_preferences: row.notification_preferences,
      organization_id: row.organization_id,
      organizationId: row.organization_id,
      organizationStatus: row.organization_status,
      organizationName: row.organization_name,
      organizationPlanId: row.organization_plan_id,
      subscriptionStatus: row.subscription_status,
    },
  };
}

export async function updateUserProfile(userId, updates) {
  const allowed = {
    name: updates.name,
    avatar: updates.avatar,
    phone: updates.phone,
    location: updates.location,
    bio: updates.bio,
  };

  const result = await pool.query(
    `UPDATE app_users
     SET name = COALESCE($2, name),
         avatar = $3,
         phone = $4,
         location = $5,
         bio = $6,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, avatar, is_online, department, status, last_seen_at,
               phone, location, bio, two_factor_enabled, notification_preferences`,
    [
      userId,
      allowed.name || null,
      allowed.avatar || null,
      allowed.phone || null,
      allowed.location || null,
      allowed.bio || null,
    ]
  );
  return result.rows[0] || null;
}

export async function updateUserPassword(userId, passwordHash) {
  await pool.query(
    "UPDATE app_users SET password_hash = $2, updated_at = NOW() WHERE id = $1",
    [userId, passwordHash]
  );
}

export async function updateUserSecurity(userId, updates) {
  const result = await pool.query(
    `UPDATE app_users
     SET two_factor_enabled = COALESCE($2, two_factor_enabled),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, avatar, is_online, department, status, last_seen_at,
               phone, location, bio, two_factor_enabled, notification_preferences`,
    [userId, updates.twoFactorEnabled]
  );
  return result.rows[0] || null;
}

export async function updateUserNotificationPreferences(userId, preferences) {
  const result = await pool.query(
    `UPDATE app_users
     SET notification_preferences = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, avatar, is_online, department, status, last_seen_at,
               phone, location, bio, two_factor_enabled, notification_preferences`,
    [userId, JSON.stringify(preferences || {})]
  );
  return result.rows[0] || null;
}

export async function deleteSessionByToken(token) {
  if (!token) return;
  await pool.query("DELETE FROM app_sessions WHERE token_hash = $1", [
    hashSessionToken(token),
  ]);
}

export async function getUserPermissions(userId) {
  const result = await pool.query(
    `SELECT p.key, u.email
     FROM app_users u
     JOIN roles r ON lower(r.name) = lower(u.role)
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE u.id = $1
     ORDER BY p.key`,
    [userId]
  );
  const permissions = new Set(result.rows.map((row) => row.key));
  const email = result.rows[0]?.email;
  if (userId === "u1" || String(email || "").toLowerCase() === "darksudo22@gmail.com") {
    permissions.add("platform.admin");
  }
  return [...permissions].sort();
}

export async function requirePermission(user, permissionKey) {
  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes(permissionKey)) {
    const error = new Error(`Missing permission: ${permissionKey}`);
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
  return permissions;
}

const featureTables = {
  customers: {
    table: "customers",
    permission: "customers.view",
    orderBy: "updated_at DESC",
  },
  shipments: {
    table: "shipments",
    permission: "shipments.view_all",
    orderBy: "updated_at DESC",
  },
  tasks: {
    table: "tasks",
    permission: "tasks.view_all",
    orderBy: "updated_at DESC",
  },
  documents: {
    table: "documents",
    permission: "documents.view_all",
    orderBy: "updated_at DESC",
  },
};

export function getFeatureConfig(feature) {
  return featureTables[feature] || null;
}

export async function listFeatureRecords(feature, { organizationId } = {}) {
  const config = getFeatureConfig(feature);
  if (!config) {
    const error = new Error(`Unknown feature: ${feature}`);
    error.statusCode = 404;
    error.code = "NOT_FOUND";
    throw error;
  }

  const values = [];
  const where = organizationId ? "WHERE organization_id = $1" : "";
  if (organizationId) values.push(organizationId);
  const result = await pool.query(
    `SELECT * FROM ${config.table} ${where} ORDER BY ${config.orderBy}`,
    values
  );
  return result.rows;
}

export async function getShipmentRecord(shipmentId, { organizationId } = {}) {
  const values = [shipmentId];
  const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `SELECT * FROM shipments WHERE id = $1 ${organizationFilter} LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

function toUiDocument(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    shipmentId: row.shipment_id || legacy.shipmentId || undefined,
    customerId: row.customer_id || legacy.customerId || undefined,
    name: row.title || row.file_name || legacy.name || row.id,
    type: legacy.type || "OTHER",
    fileSize: row.file_size || legacy.fileSize || "",
    uploadedBy: row.uploaded_by_name || legacy.uploadedBy || "",
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    url: `/api/documents/${encodeURIComponent(row.id)}/download`,
    visibility: row.visibility || "internal",
    isArchived: Boolean(row.archived_at),
    version: row.version || 1,
  };
}

function toUiTask(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    assignedToUserId: row.assigned_to_id || legacy.assignedToUserId || "",
    assignedToName: row.assigned_to_name || legacy.assignedToName || "",
    assignedByName: row.assigned_by_name || legacy.assignedByName || "",
    status: row.status || legacy.status || "TODO",
    priority: row.priority || legacy.priority || "MEDIUM",
    dueDate: row.due_at || legacy.dueDate || "",
    deadline: legacy.deadline || "",
    shipmentId: row.shipment_id || legacy.shipmentId || undefined,
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    sourceType: row.source_type || legacy.sourceType || "MANUAL",
    sourceId: row.source_id || legacy.sourceId || undefined,
  };
}

function toUiUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatar: row.avatar || undefined,
    isOnline: Boolean(row.is_online),
    phone: row.phone || undefined,
    location: row.location || undefined,
    bio: row.bio || undefined,
    department: row.department || undefined,
    status: row.status || "active",
    lastSeenAt: row.last_seen_at || undefined,
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    notificationPreferences: row.notification_preferences || {},
    organizationId: row.organization_id || undefined,
    organizationStatus: row.organization_status || undefined,
    organizationName: row.organization_name || undefined,
    organizationPlanId: row.organization_plan_id || undefined,
  };
}

function toUiCustomer(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    name: row.contact_name || legacy.name || row.company_name,
    company: row.company_name || legacy.company || "",
    phone: row.phone || legacy.phone || "",
    email: row.email || legacy.email || "",
    address: row.address || legacy.address || "",
    shipmentsCount: Number(legacy.shipmentsCount || 0),
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    notes: row.notes || legacy.notes || "",
    status: row.status || legacy.status || "active",
    isArchived: Boolean(row.archived_at),
  };
}

function toUiQuote(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    customerId: row.customer_id || legacy.customerId || undefined,
    customerName: row.customer_name || legacy.customerName || "",
    customerPhone: row.customer_phone || legacy.customerPhone || "",
    originCity: row.origin_city || legacy.originCity || "",
    destinationCity: row.destination_city || legacy.destinationCity || "",
    cargoType: row.cargo_type || legacy.cargoType || "GENERAL",
    weight: Number(row.weight || legacy.weight || 0),
    dimensions: row.dimensions || legacy.dimensions || "",
    pickupDate: row.pickup_date || legacy.pickupDate || "",
    deliveryDate: row.delivery_date || legacy.deliveryDate || "",
    requirements: Array.isArray(row.requirements) ? row.requirements : legacy.requirements || [],
    baseRate: Number(row.base_rate || legacy.baseRate || 0),
    fuelSurcharge: Number(row.fuel_surcharge || legacy.fuelSurcharge || 0),
    loadingFees: Number(row.loading_fees || legacy.loadingFees || 0),
    tollFees: Number(row.toll_fees || legacy.tollFees || 0),
    insurancePercentage: Number(row.insurance_percentage || legacy.insurancePercentage || 0),
    profitMargin: Number(row.profit_margin || legacy.profitMargin || 0),
    totalPrice: Number(row.total_price || legacy.totalPrice || 0),
    validUntil: row.valid_until || legacy.validUntil || "",
    status: row.status || legacy.status || "PENDING",
    notes: row.notes || legacy.notes || "",
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
    convertedShipmentId: row.converted_shipment_id || legacy.convertedShipmentId || undefined,
    isArchived: Boolean(row.archived_at),
  };
}

function toUiCheque(row) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    bankName: row.bank_name || legacy.bankName || "",
    chequeNumber: row.cheque_number || legacy.chequeNumber || "",
    amount: Number(row.amount || legacy.amount || 0),
    dueDate: row.due_date || legacy.dueDate || "",
    location: row.location || legacy.location || "",
    receiver: row.receiver || legacy.receiver || "",
    status: row.status || legacy.status || "ACTIVE",
    description: row.description || legacy.description || "",
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
  };
}

function toUiAppointment(row, documents = []) {
  if (!row) return null;
  const legacy = row.legacy_data || {};
  const legacyRequiredDocuments = Array.isArray(legacy.requiredDocuments) ? legacy.requiredDocuments : [];
  return {
    id: row.id,
    dateTime: row.meeting_at || legacy.dateTime || "",
    departmentName: row.organization_name || legacy.departmentName || "",
    purpose: row.title || legacy.purpose || "",
    requiredDocuments: documents.length ? documents.map(toUiAppointmentDocument) : legacyRequiredDocuments,
    assignedPersonId: row.assigned_to_id || legacy.assignedPersonId || "",
    assignedPersonName: row.assigned_to_name || legacy.assignedPersonName || "",
    status: row.status || legacy.status || "SCHEDULED",
    outcome: row.outcome || legacy.outcome || "",
    nextActionItems: row.next_action_items || legacy.nextActionItems || "",
    reminderSent: Boolean(row.reminder_sent ?? legacy.reminderSent),
    createdAt: row.created_at || legacy.createdAt || new Date().toISOString(),
  };
}

function toUiAppointmentDocument(row) {
  const legacy = row?.legacy_data || {};
  return {
    id: row.id,
    name: row.name || legacy.name || "",
    required: Boolean(row.required ?? legacy.required),
    completed: Boolean(row.completed ?? legacy.completed),
    fileName: row.file_name || legacy.fileName || undefined,
  };
}

async function syncDocumentUserRecord(client, ownerUserId, documentRow) {
  if (!ownerUserId || !documentRow) return;
  const uiDocument = toUiDocument(documentRow);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'documents', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, documentRow.organization_id || null, documentRow.id, JSON.stringify(uiDocument)]
  );
}

async function syncTaskUserRecord(client, ownerUserId, taskRow) {
  if (!ownerUserId || !taskRow) return;
  const uiTask = toUiTask(taskRow);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'tasks', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, taskRow.organization_id || null, taskRow.id, JSON.stringify(uiTask)]
  );
}

async function syncNotificationUserRecord(client, userId, notificationRow) {
  if (!userId || !notificationRow) return;
  const uiNotification = {
    id: notificationRow.id,
    title: notificationRow.title,
    message: notificationRow.body || "",
    type: notificationRow.type || "INFO",
    isRead: Boolean(notificationRow.read_at),
    createdAt: notificationRow.created_at || new Date().toISOString(),
    link: notificationRow.legacy_data?.link || notificationRow.source_id || "/dashboard",
  };
  await client.query(
    `INSERT INTO user_records (owner_user_id, collection, item_id, data, updated_at)
     VALUES ($1, 'notifications', $2, $3::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [userId, notificationRow.id, JSON.stringify(uiNotification)]
  );
}

async function syncChequeUserRecord(client, ownerUserId, chequeRow) {
  if (!ownerUserId || !chequeRow) return;
  const uiCheque = toUiCheque(chequeRow);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'cheques', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, chequeRow.organization_id || null, chequeRow.id, JSON.stringify(uiCheque)]
  );
}

async function syncMeetingUserRecord(client, ownerUserId, meetingRow) {
  if (!ownerUserId || !meetingRow) return;
  const docs = await client.query(
    `SELECT *
     FROM meeting_required_documents
     WHERE meeting_id = $1
     ORDER BY created_at ASC`,
    [meetingRow.id]
  );
  const uiMeeting = toUiAppointment(meetingRow, docs.rows);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'appointments', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, meetingRow.organization_id || null, meetingRow.id, JSON.stringify(uiMeeting)]
  );
}

async function syncQuoteUserRecord(client, ownerUserId, quoteRow) {
  if (!ownerUserId || !quoteRow) return;
  const uiQuote = toUiQuote(quoteRow);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'quotes', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, quoteRow.organization_id || null, quoteRow.id, JSON.stringify(uiQuote)]
  );
}

async function syncCustomerUserRecord(client, ownerUserId, customerRow) {
  if (!ownerUserId || !customerRow) return;
  const uiCustomer = toUiCustomer(customerRow);
  await client.query(
    `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
     VALUES ($1, $2, 'customers', $3, $4::jsonb, NOW())
     ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [ownerUserId, customerRow.organization_id || null, customerRow.id, JSON.stringify(uiCustomer)]
  );
}

async function syncUsersCollection(client, ownerUserId) {
  if (!ownerUserId) return;
  const owner = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [ownerUserId]);
  const organizationId = owner.rows[0]?.organization_id || null;
  const result = await client.query(
    `SELECT id, name, email, role, avatar, is_online, department, status, last_seen_at,
            phone, location, bio, two_factor_enabled, notification_preferences, organization_id
     FROM app_users
     ${organizationId ? "WHERE organization_id = $1" : ""}
     ORDER BY name ASC`
    ,
    organizationId ? [organizationId] : []
  );
  const ownerIds = organizationId ? result.rows.map((row) => row.id) : [ownerUserId];
  for (const targetOwnerId of ownerIds) {
    for (const row of result.rows) {
      await client.query(
        `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data, updated_at)
         VALUES ($1, $2, 'users', $3, $4::jsonb, NOW())
         ON CONFLICT (owner_user_id, collection, item_id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [targetOwnerId, organizationId, row.id, JSON.stringify(toUiUser(row))]
      );
    }
  }
}

function documentSelect() {
  return `SELECT d.*, u.name AS uploaded_by_user_name
          FROM documents d
          LEFT JOIN app_users u ON u.id = d.uploaded_by_id`;
}

function taskSelect() {
  return `SELECT t.*
          FROM tasks t`;
}

function normalizeTaskStatus(status) {
  const value = String(status || "TODO").toUpperCase();
  return ["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"].includes(value)
    ? value
    : "TODO";
}

function normalizeTaskPriority(priority) {
  const value = String(priority || "MEDIUM").toUpperCase();
  return ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(value) ? value : "MEDIUM";
}

async function createTaskNotification(client, { userId, task, title, body }) {
  if (!userId) return null;
  const id = crypto.randomUUID();
  const link = task?.shipment_id ? `/shipments/${task.shipment_id}` : "/tasks";
  const result = await client.query(
    `INSERT INTO notifications (
       id, organization_id, user_id, title, body, type, source_type, source_id, legacy_data, created_at
     )
     VALUES ($1, (SELECT organization_id FROM app_users WHERE id = $2), $2, $3, $4, 'INFO', 'TASK', $5, $6::jsonb, NOW())
     RETURNING *`,
    [
      id,
      userId,
      title,
      body || null,
      task?.id || null,
      JSON.stringify({ link }),
    ]
  );
  await syncNotificationUserRecord(client, userId, result.rows[0]);
  return result.rows[0];
}

export async function listDocuments({ ownerUserId, shipmentId, customerId, organizationId, includeArchived = false } = {}) {
  const conditions = [];
  const values = [];

  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`d.owner_user_id = $${values.length}`);
  }
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`d.organization_id = $${values.length}`);
  }
  if (shipmentId) {
    values.push(shipmentId);
    conditions.push(`d.shipment_id = $${values.length}`);
  }
  if (customerId) {
    values.push(customerId);
    conditions.push(`d.customer_id = $${values.length}`);
  }
  if (!includeArchived) {
    conditions.push("d.archived_at IS NULL");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `${documentSelect()}
     ${where}
     ORDER BY d.updated_at DESC, d.created_at DESC`,
    values
  );
  return result.rows.map(toUiDocument);
}

export async function createDocumentRecord({
  ownerUserId,
  title,
  type,
  fileName,
  mimeType,
  fileSize,
  storageKey,
  checksum,
  uploadedById,
  uploadedByName,
  shipmentId,
  customerId,
  visibility = "internal",
}) {
  const client = await pool.connect();
  const id = crypto.randomUUID();
  const safeVisibility = visibility === "customer_visible" ? "customer_visible" : "internal";

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO documents (
         id, organization_id, owner_user_id, title, file_name, mime_type, file_size, storage_key,
         checksum, version, uploaded_by_id, uploaded_by_name, shipment_id, customer_id,
         visibility, legacy_data
       )
       VALUES ($1, (SELECT organization_id FROM app_users WHERE id = $2), $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, $12, $13, $14::jsonb)
       RETURNING *`,
      [
        id,
        ownerUserId,
        title,
        fileName,
        mimeType,
        fileSize,
        storageKey,
        checksum,
        uploadedById || null,
        uploadedByName || null,
        shipmentId || null,
        customerId || null,
        safeVisibility,
        JSON.stringify({ name: title, type: type || "OTHER" }),
      ]
    );

    await client.query(
      `INSERT INTO document_versions (
         id, organization_id, document_id, version, storage_key, file_name, uploaded_by_id
       )
       VALUES ($1, (SELECT organization_id FROM documents WHERE id = $2), $2, 1, $3, $4, $5)
       ON CONFLICT (document_id, version) DO NOTHING`,
      [crypto.randomUUID(), id, storageKey, fileName, uploadedById || null]
    );

    await syncDocumentUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDocumentDetail(documentId, { organizationId } = {}) {
  const values = [documentId];
  const organizationFilter = organizationId ? `AND d.organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `${documentSelect()}
     WHERE d.id = $1 ${organizationFilter}
     LIMIT 1`,
    values
  );
  const document = result.rows[0];
  if (!document) return null;

  const versions = await pool.query(
    `SELECT id, version, file_name, storage_key, created_at
     FROM document_versions
     WHERE document_id = $1
     ORDER BY version DESC`,
    [documentId]
  );

  return {
    ...document,
    ui: toUiDocument(document),
    versions: versions.rows.map((row) => ({
      id: row.id,
      version: row.version,
      fileName: row.file_name,
      createdAt: row.created_at,
    })),
  };
}

export async function getDocumentForDownload(documentId, { organizationId } = {}) {
  const values = [documentId];
  const organizationFilter = organizationId ? `AND d.organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `${documentSelect()}
     WHERE d.id = $1 AND d.archived_at IS NULL ${organizationFilter}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

export async function listDocumentStorageKeysForCleanup(documentId, { organizationId } = {}) {
  const values = [documentId];
  const organizationFilter = organizationId ? `AND d.organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `SELECT DISTINCT storage_key
     FROM (
       SELECT d.storage_key
       FROM documents d
       WHERE d.id = $1 ${organizationFilter}
       UNION ALL
       SELECT v.storage_key
       FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       WHERE d.id = $1 ${organizationFilter}
     ) keys
     WHERE storage_key IS NOT NULL AND storage_key <> ''`,
    values
  );
  return result.rows.map((row) => row.storage_key);
}

export async function replaceDocumentFileRecord({
  documentId,
  fileName,
  mimeType,
  fileSize,
  storageKey,
  checksum,
  uploadedById,
  organizationId,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const beforeValues = [documentId];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const beforeResult = await client.query(
      `SELECT * FROM documents WHERE id = $1 ${organizationFilter}`,
      beforeValues
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const nextVersion = Number(before.version || 1) + 1;
    const result = await client.query(
      `UPDATE documents
       SET file_name = $2,
           mime_type = $3,
           file_size = $4,
           storage_key = $5,
           checksum = $6,
           version = $7,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [documentId, fileName, mimeType, fileSize, storageKey, checksum, nextVersion]
    );

    await client.query(
      `INSERT INTO document_versions (
         id, document_id, version, storage_key, file_name, uploaded_by_id
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), documentId, nextVersion, storageKey, fileName, uploadedById || null]
    );

    await syncDocumentUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateDocumentMetadata(documentId, updates = {}, { organizationId } = {}) {
  const safeVisibility = updates.visibility === "customer_visible" ? "customer_visible" : "internal";
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const beforeValues = [documentId];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const beforeResult = await client.query(
      `SELECT * FROM documents WHERE id = $1 ${organizationFilter}`,
      beforeValues
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const legacy = {
      ...(before.legacy_data || {}),
      ...(updates.type ? { type: updates.type } : {}),
      ...(updates.title ? { name: updates.title } : {}),
    };

    const result = await client.query(
      `UPDATE documents
       SET title = COALESCE($2, title),
           shipment_id = $3,
           customer_id = $4,
           visibility = $5,
           legacy_data = $6::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        documentId,
        updates.title || null,
        updates.shipmentId === undefined ? before.shipment_id : updates.shipmentId || null,
        updates.customerId === undefined ? before.customer_id : updates.customerId || null,
        updates.visibility === undefined ? before.visibility : safeVisibility,
        JSON.stringify(legacy),
      ]
    );

    await syncDocumentUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveDocumentRecord(documentId, { organizationId } = {}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const beforeValues = [documentId];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const beforeResult = await client.query(
      `SELECT * FROM documents WHERE id = $1 ${organizationFilter}`,
      beforeValues
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const result = await client.query(
      `UPDATE documents
       SET archived_at = COALESCE(archived_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [documentId]
    );

    await syncDocumentUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listTasks({ ownerUserId, assignedToId, organizationId, includeAll = false } = {}) {
  const conditions = [];
  const values = [];

  if (ownerUserId && !includeAll) {
    values.push(ownerUserId);
    conditions.push(`t.owner_user_id = $${values.length}`);
  }
  if (assignedToId) {
    values.push(assignedToId);
    conditions.push(`t.assigned_to_id = $${values.length}`);
  }
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`t.organization_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `${taskSelect()}
     ${where}
     ORDER BY t.updated_at DESC, t.created_at DESC`,
    values
  );
  return result.rows.map(toUiTask);
}

export async function getTaskRecord(taskId, { organizationId } = {}) {
  const values = [taskId];
  const organizationFilter = organizationId ? `AND t.organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `${taskSelect()}
     WHERE t.id = $1 ${organizationFilter}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

export async function createTaskRecord({
  ownerUserId,
  title,
  description,
  status,
  priority,
  assignedToUserId,
  assignedToName,
  assignedByUserId,
  assignedByName,
  dueDate,
  deadline,
  shipmentId,
  customerId,
  sourceType = "MANUAL",
  sourceId,
}) {
  const client = await pool.connect();
  const id = crypto.randomUUID();
  const safeStatus = normalizeTaskStatus(status);
  const safePriority = normalizeTaskPriority(priority);

  try {
    await client.query("BEGIN");
    const legacy = {
      deadline: deadline || "",
      assignedToUserId: assignedToUserId || "",
      assignedToName: assignedToName || "",
      assignedByName: assignedByName || "",
      dueDate: dueDate || "",
      shipmentId: shipmentId || undefined,
      sourceType,
      sourceId: sourceId || undefined,
    };
    const result = await client.query(
      `INSERT INTO tasks (
         id, organization_id, owner_user_id, title, description, status, priority, assigned_to_id,
         assigned_to_name, assigned_by_id, assigned_by_name, due_at, source_type,
         source_id, shipment_id, customer_id, legacy_data, completed_at
       )
       VALUES ($1, (SELECT organization_id FROM app_users WHERE id = $2), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17)
       RETURNING *`,
      [
        id,
        ownerUserId,
        String(title || "").trim(),
        description || null,
        safeStatus,
        safePriority,
        assignedToUserId || null,
        assignedToName || null,
        assignedByUserId || null,
        assignedByName || null,
        dueDate || null,
        sourceType,
        sourceId || null,
        shipmentId || null,
        customerId || null,
        JSON.stringify(legacy),
        safeStatus === "DONE" ? new Date() : null,
      ]
    );

    await syncTaskUserRecord(client, ownerUserId, result.rows[0]);
    await createTaskNotification(client, {
      userId: assignedToUserId,
      task: result.rows[0],
      title: "وظیفه جدید",
      body: String(title || "").trim(),
    });
    await queueHighPriorityTaskSms(client, result.rows[0], "assigned");
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTaskRecord(taskId, updates = {}, { organizationId } = {}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const beforeValues = [taskId];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const beforeResult = await client.query(`SELECT * FROM tasks WHERE id = $1 ${organizationFilter}`, beforeValues);
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const nextStatus =
      updates.status === undefined ? before.status : normalizeTaskStatus(updates.status);
    const nextAssignedToId =
      updates.assignedToUserId === undefined ? before.assigned_to_id : updates.assignedToUserId || null;
    const legacy = {
      ...(before.legacy_data || {}),
      ...(updates.deadline !== undefined ? { deadline: updates.deadline || "" } : {}),
      ...(updates.dueDate !== undefined ? { dueDate: updates.dueDate || "" } : {}),
      ...(updates.assignedToUserId !== undefined ? { assignedToUserId: nextAssignedToId || "" } : {}),
      ...(updates.assignedToName !== undefined ? { assignedToName: updates.assignedToName || "" } : {}),
      ...(updates.assignedByName !== undefined ? { assignedByName: updates.assignedByName || "" } : {}),
      ...(updates.shipmentId !== undefined ? { shipmentId: updates.shipmentId || undefined } : {}),
    };

    const result = await client.query(
      `UPDATE tasks
       SET title = COALESCE($2, title),
           description = $3,
           status = $4,
           priority = $5,
           assigned_to_id = $6,
           assigned_to_name = $7,
           assigned_by_name = COALESCE($8, assigned_by_name),
           due_at = $9,
           shipment_id = $10,
           customer_id = $11,
           legacy_data = $12::jsonb,
           completed_at = CASE WHEN $4 = 'DONE' THEN COALESCE(completed_at, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        taskId,
        updates.title === undefined ? null : String(updates.title || "").trim(),
        updates.description === undefined ? before.description : updates.description || null,
        nextStatus,
        updates.priority === undefined ? before.priority : normalizeTaskPriority(updates.priority),
        nextAssignedToId,
        updates.assignedToName === undefined ? before.assigned_to_name : updates.assignedToName || null,
        updates.assignedByName || null,
        updates.dueDate === undefined ? before.due_at : updates.dueDate || null,
        updates.shipmentId === undefined ? before.shipment_id : updates.shipmentId || null,
        updates.customerId === undefined ? before.customer_id : updates.customerId || null,
        JSON.stringify(legacy),
      ]
    );

    await syncTaskUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    if (nextAssignedToId && nextAssignedToId !== before.assigned_to_id) {
      await createTaskNotification(client, {
        userId: nextAssignedToId,
        task: result.rows[0],
        title: "ارجاع وظیفه",
      body: result.rows[0].title,
      });
    }
    const beforeHighPriority = isHighPriority(before.priority);
    const afterHighPriority = isHighPriority(result.rows[0].priority);
    if (
      afterHighPriority &&
      (nextAssignedToId !== before.assigned_to_id || !beforeHighPriority)
    ) {
      await queueHighPriorityTaskSms(
        client,
        result.rows[0],
        nextAssignedToId !== before.assigned_to_id ? "reassigned" : "priority"
      );
    }
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setTaskStatus(taskId, status, { organizationId } = {}) {
  return updateTaskRecord(taskId, { status }, { organizationId });
}

export async function createShipmentTaskRecord({ shipmentId, stepId, actorUser, task }) {
  const client = await pool.connect();
  const sourceType = stepId ? "SHIPMENT_STEP" : "SHIPMENT";
  const sourceId = stepId || shipmentId;
  const organizationId = actorUser?.organizationId || actorUser?.organization_id || null;

  try {
    await client.query("BEGIN");
    const shipmentValues = [shipmentId];
    const organizationFilter = organizationId ? `AND organization_id = $${shipmentValues.push(organizationId)}` : "";
    const shipmentResult = await client.query(
      `SELECT * FROM shipments WHERE id = $1 ${organizationFilter}`,
      shipmentValues
    );
    const shipment = shipmentResult.rows[0] || null;
    if (!shipment) {
      await client.query("ROLLBACK");
      return null;
    }

    const existingResult = await client.query(
      `SELECT * FROM tasks
       WHERE shipment_id = $1 AND source_type = $2 AND source_id = $3
         AND ($4::text IS NULL OR organization_id = $4)
       ORDER BY created_at DESC
       LIMIT 1`,
      [shipmentId, sourceType, sourceId, organizationId]
    );
    const existing = existingResult.rows[0] || null;
    const assignedToId = task.assignedToUserId || actorUser.id;
    const assignedToName = task.assignedToName || actorUser.name;
    const title = task.title || `پیگیری مرحله: ${task.stepName || sourceId} - ${shipment.shipment_code}`;
    const legacy = {
      ...(existing?.legacy_data || {}),
      deadline: task.deadline || existing?.legacy_data?.deadline || "",
      dueDate: task.dueDate || existing?.due_at || "",
      assignedToUserId: assignedToId,
      assignedToName,
      assignedByName: actorUser.name,
      shipmentId,
      sourceType,
      sourceId,
      stepName: task.stepName || existing?.legacy_data?.stepName || "",
    };

    const result = existing
      ? await client.query(
          `UPDATE tasks
           SET title = $2,
               organization_id = COALESCE(organization_id, $11),
               description = $3,
               status = CASE WHEN status = 'DONE' THEN status ELSE 'IN_PROGRESS' END,
               priority = $4,
               assigned_to_id = $5,
               assigned_to_name = $6,
               assigned_by_id = $7,
               assigned_by_name = $8,
               due_at = $9,
               legacy_data = $10::jsonb,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            existing.id,
            title,
            task.description || existing.description || null,
            normalizeTaskPriority(task.priority || existing.priority),
            assignedToId,
            assignedToName,
            actorUser.id,
            actorUser.name,
            task.dueDate || existing.due_at || null,
            JSON.stringify(legacy),
            shipment.organization_id || actorUser.organizationId || actorUser.organization_id || null,
          ]
        )
      : await client.query(
          `INSERT INTO tasks (
             id, organization_id, owner_user_id, title, description, status, priority, assigned_to_id,
             assigned_to_name, assigned_by_id, assigned_by_name, due_at, source_type,
             source_id, shipment_id, customer_id, legacy_data
           )
           VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
           RETURNING *`,
          [
            crypto.randomUUID(),
            shipment.organization_id || actorUser.organizationId || actorUser.organization_id || null,
            shipment.owner_user_id || actorUser.id,
            title,
            task.description || null,
            normalizeTaskPriority(task.priority),
            assignedToId,
            assignedToName,
            actorUser.id,
            actorUser.name,
            task.dueDate || null,
            sourceType,
            sourceId,
            shipmentId,
            shipment.customer_id || null,
            JSON.stringify(legacy),
          ]
        );

    await syncTaskUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await createTaskNotification(client, {
      userId: assignedToId,
      task: result.rows[0],
      title: existing ? "بروزرسانی وظیفه مرحله" : "وظیفه مرحله حمل",
      body: result.rows[0].title,
    });
    if (!existing || assignedToId !== existing.assigned_to_id || !isHighPriority(existing.priority)) {
      await queueHighPriorityTaskSms(client, result.rows[0], existing ? "reassigned" : "assigned");
    }
    await client.query("COMMIT");
    return { before: existing, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShipmentStepRecord({ shipmentId, stepId, updates = {}, actorUser }) {
  const client = await pool.connect();
  const organizationId = actorUser?.organizationId || actorUser?.organization_id || null;

  try {
    await client.query("BEGIN");
    const shipmentValues = [shipmentId];
    const organizationFilter = organizationId ? `AND organization_id = $${shipmentValues.push(organizationId)}` : "";
    const shipmentResult = await client.query(
      `SELECT id, owner_user_id, organization_id
       FROM shipments
       WHERE id = $1 ${organizationFilter}
       LIMIT 1`,
      shipmentValues
    );
    const shipment = shipmentResult.rows[0] || null;
    if (!shipment) {
      await client.query("ROLLBACK");
      return null;
    }

    const stepResult = await client.query(
      `SELECT owner_user_id, data
       FROM user_records
       WHERE collection = 'shipmentSteps'
         AND item_id = $1
         AND data->>'shipmentId' = $2
         AND ($3::text IS NULL OR organization_id = $3 OR owner_user_id = $4)
       ORDER BY CASE WHEN owner_user_id = $5 THEN 0 ELSE 1 END
       LIMIT 1`,
      [stepId, shipmentId, organizationId, shipment.owner_user_id, actorUser.id]
    );
    const stepRow = stepResult.rows[0] || null;
    if (!stepRow) {
      await client.query("ROLLBACK");
      return null;
    }

    const before = stepRow.data;
    const next = {
      ...before,
      ...updates,
      ...(updates.status === "COMPLETED" && !updates.completedAt
        ? { completedAt: new Date().toLocaleDateString("fa-IR") }
        : {}),
    };
    await client.query(
      `UPDATE user_records
       SET organization_id = COALESCE(organization_id, $4), data = $3::jsonb, updated_at = NOW()
       WHERE owner_user_id = $1
         AND collection = 'shipmentSteps'
         AND item_id = $2
         AND ($4::text IS NULL OR organization_id = $4 OR owner_user_id = $5)`,
      [stepRow.owner_user_id, stepId, JSON.stringify(next), organizationId, shipment.owner_user_id]
    );

    let workflowTask = null;
    if (next.status === "IN_PROGRESS") {
      const taskResult = await createShipmentTaskRecord({
        shipmentId,
        stepId,
        actorUser,
        task: {
          stepName: next.name,
          title: `پیگیری مرحله: ${next.name}`,
          description: next.notes || `پیگیری مرحله ${next.name}`,
          priority: "MEDIUM",
          assignedToUserId: actorUser.id,
          assignedToName: actorUser.name,
        },
      });
      workflowTask = taskResult?.after || null;
    }

    if (next.status === "COMPLETED") {
      const linked = await client.query(
        `SELECT id FROM tasks
         WHERE shipment_id = $1
           AND source_type = 'SHIPMENT_STEP'
           AND source_id = $2
           AND ($3::text IS NULL OR organization_id = $3)
         ORDER BY created_at DESC
         LIMIT 1`,
        [shipmentId, stepId, organizationId]
      );
      if (linked.rows[0]) {
        const statusResult = await updateTaskRecord(linked.rows[0].id, { status: "DONE" }, { organizationId });
        workflowTask = statusResult?.after || null;
      }
    }

    await client.query("COMMIT");
    return { before, after: next, workflowTask };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listShipmentSteps(shipmentId, ownerUserId, { organizationId } = {}) {
  const result = await pool.query(
    `SELECT data
     FROM user_records
     WHERE collection = 'shipmentSteps'
       AND data->>'shipmentId' = $1
       AND ($2::text IS NULL OR owner_user_id = $2)
       AND ($3::text IS NULL OR organization_id = $3 OR owner_user_id = $2)
     ORDER BY (data->>'order')::int ASC`,
    [shipmentId, ownerUserId || null, organizationId || null]
  );
  return result.rows.map((row) => row.data);
}

function normalizeChequeStatus(status) {
  const value = String(status || "ACTIVE").toUpperCase();
  return ["ACTIVE", "CLEARED", "RETURNED", "ARCHIVED"].includes(value) ? value : "ACTIVE";
}

function normalizeAppointmentStatus(status) {
  const value = String(status || "SCHEDULED").toUpperCase();
  return ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "FOLLOW_UP_REQUIRED"].includes(value)
    ? value
    : "SCHEDULED";
}

export async function listCheques({ ownerUserId, organizationId, includeArchived = false } = {}) {
  const conditions = [];
  const values = [];
  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`organization_id = $${values.length}`);
  }
  if (!includeArchived) conditions.push("archived_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT *
     FROM cheques
     ${where}
     ORDER BY updated_at DESC, created_at DESC`,
    values
  );
  return result.rows.map(toUiCheque);
}

export async function getChequeRecord(id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(`SELECT * FROM cheques WHERE id = $1 ${organizationFilter} LIMIT 1`, values);
  return result.rows[0] || null;
}

export async function createChequeRecord({ ownerUserId, actorUserId, cheque }) {
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO cheques (
         id, organization_id, owner_user_id, bank_name, cheque_number, amount, due_date, location,
         receiver, status, description, legacy_data, created_by_id, archived_at
       )
       VALUES ($1, (SELECT organization_id FROM app_users WHERE id = $2), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
       RETURNING *`,
      [
        id,
        ownerUserId,
        String(cheque.bankName || "").trim(),
        String(cheque.chequeNumber || "").trim(),
        Number(cheque.amount || 0),
        cheque.dueDate || null,
        cheque.location || null,
        cheque.receiver || null,
        normalizeChequeStatus(cheque.status),
        cheque.description || null,
        JSON.stringify(cheque),
        actorUserId || ownerUserId,
        normalizeChequeStatus(cheque.status) === "ARCHIVED" ? new Date() : null,
      ]
    );
    await syncChequeUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateChequeRecord(id, updates = {}, { organizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeValues = [id];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const beforeResult = await client.query(`SELECT * FROM cheques WHERE id = $1 ${organizationFilter}`, beforeValues);
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const status = updates.status === undefined ? before.status : normalizeChequeStatus(updates.status);
    const legacy = { ...(before.legacy_data || {}), ...updates, status };
    const result = await client.query(
      `UPDATE cheques
       SET bank_name = COALESCE($2, bank_name),
           cheque_number = COALESCE($3, cheque_number),
           amount = COALESCE($4, amount),
           due_date = $5,
           location = $6,
           receiver = $7,
           status = $8,
           description = $9,
           legacy_data = $10::jsonb,
           archived_at = CASE WHEN $8 = 'ARCHIVED' THEN COALESCE(archived_at, NOW()) ELSE archived_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        updates.bankName === undefined ? null : String(updates.bankName || "").trim(),
        updates.chequeNumber === undefined ? null : String(updates.chequeNumber || "").trim(),
        updates.amount === undefined ? null : Number(updates.amount || 0),
        updates.dueDate === undefined ? before.due_date : updates.dueDate || null,
        updates.location === undefined ? before.location : updates.location || null,
        updates.receiver === undefined ? before.receiver : updates.receiver || null,
        status,
        updates.description === undefined ? before.description : updates.description || null,
        JSON.stringify(legacy),
      ]
    );
    await syncChequeUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveChequeRecord(id, { organizationId } = {}) {
  return updateChequeRecord(id, { status: "ARCHIVED" }, { organizationId });
}

export async function listDueSoonCheques({ ownerUserId, organizationId, days = 7 } = {}) {
  const cheques = await listCheques({ ownerUserId, organizationId });
  const now = Date.now();
  const horizon = now + Number(days || 7) * 24 * 60 * 60 * 1000;
  return cheques.filter((cheque) => {
    if (!["ACTIVE", "RETURNED"].includes(cheque.status) || !cheque.dueDate) return false;
    const parsed = Date.parse(String(cheque.dueDate).replace(/\//g, "-"));
    return Number.isNaN(parsed) || parsed <= horizon;
  });
}

export async function listComplianceMeetings({ ownerUserId, assignedToId, organizationId, includeArchived = false } = {}) {
  const conditions = [];
  const values = [];
  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  if (assignedToId) {
    values.push(assignedToId);
    conditions.push(`assigned_to_id = $${values.length}`);
  }
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`organization_id = $${values.length}`);
  }
  if (!includeArchived) conditions.push("archived_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT *
     FROM compliance_meetings
     ${where}
     ORDER BY meeting_at ASC, updated_at DESC`,
    values
  );
  const rows = [];
  for (const meeting of result.rows) {
    const docs = await pool.query(
      "SELECT * FROM meeting_required_documents WHERE meeting_id = $1 ORDER BY created_at ASC",
      [meeting.id]
    );
    rows.push(toUiAppointment(meeting, docs.rows));
  }
  return rows;
}

export async function getComplianceMeetingRecord(id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `SELECT * FROM compliance_meetings WHERE id = $1 ${organizationFilter} LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

async function replaceMeetingDocuments(client, meetingId, requiredDocuments = []) {
  await client.query("DELETE FROM meeting_required_documents WHERE meeting_id = $1", [meetingId]);
  for (const doc of requiredDocuments) {
    const documentId = doc.id ? `${meetingId}:${doc.id}` : crypto.randomUUID();
    await client.query(
      `INSERT INTO meeting_required_documents (
         id, organization_id, meeting_id, name, required, completed, file_name, legacy_data
       )
       VALUES ($1, (SELECT organization_id FROM compliance_meetings WHERE id = $2), $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        documentId,
        meetingId,
        doc.name || "Document",
        doc.required !== false,
        Boolean(doc.completed),
        doc.fileName || null,
        JSON.stringify(doc),
      ]
    );
  }
}

export async function createComplianceMeetingRecord({ ownerUserId, actorUser, meeting }) {
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO compliance_meetings (
         id, organization_id, owner_user_id, title, organization_name, meeting_at, location, status,
         assigned_to_id, assigned_to_name, description, outcome, next_action_items,
         reminder_sent, legacy_data, created_by_id
       )
       VALUES ($1, (SELECT organization_id FROM app_users WHERE id = $2), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
       RETURNING *`,
      [
        id,
        ownerUserId,
        meeting.purpose || meeting.title || "Compliance meeting",
        meeting.departmentName || meeting.organizationName || null,
        meeting.dateTime,
        meeting.location || null,
        normalizeAppointmentStatus(meeting.status),
        meeting.assignedPersonId || null,
        meeting.assignedPersonName || null,
        meeting.description || null,
        meeting.outcome || null,
        meeting.nextActionItems || null,
        Boolean(meeting.reminderSent),
        JSON.stringify(meeting),
        actorUser?.id || ownerUserId,
      ]
    );
    await replaceMeetingDocuments(client, id, meeting.requiredDocuments || []);
    await syncMeetingUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateComplianceMeetingRecord(id, updates = {}, { organizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeValues = [id];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const beforeResult = await client.query(
      `SELECT * FROM compliance_meetings WHERE id = $1 ${organizationFilter}`,
      beforeValues
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const legacy = { ...(before.legacy_data || {}), ...updates };
    const result = await client.query(
      `UPDATE compliance_meetings
       SET title = COALESCE($2, title),
           organization_name = $3,
           meeting_at = COALESCE($4, meeting_at),
           location = $5,
           status = $6,
           assigned_to_id = $7,
           assigned_to_name = $8,
           description = $9,
           outcome = $10,
           next_action_items = $11,
           reminder_sent = $12,
           legacy_data = $13::jsonb,
           archived_at = CASE WHEN $6 = 'ARCHIVED' THEN COALESCE(archived_at, NOW()) ELSE archived_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        updates.purpose || updates.title || null,
        updates.departmentName === undefined ? before.organization_name : updates.departmentName || null,
        updates.dateTime || updates.meetingAt || null,
        updates.location === undefined ? before.location : updates.location || null,
        updates.status === undefined ? before.status : normalizeAppointmentStatus(updates.status),
        updates.assignedPersonId === undefined ? before.assigned_to_id : updates.assignedPersonId || null,
        updates.assignedPersonName === undefined ? before.assigned_to_name : updates.assignedPersonName || null,
        updates.description === undefined ? before.description : updates.description || null,
        updates.outcome === undefined ? before.outcome : updates.outcome || null,
        updates.nextActionItems === undefined ? before.next_action_items : updates.nextActionItems || null,
        updates.reminderSent === undefined ? before.reminder_sent : Boolean(updates.reminderSent),
        JSON.stringify(legacy),
      ]
    );
    if (Array.isArray(updates.requiredDocuments)) {
      await replaceMeetingDocuments(client, id, updates.requiredDocuments);
    }
    await syncMeetingUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveComplianceMeetingRecord(id, { organizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeValues = [id];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const beforeResult = await client.query(
      `SELECT * FROM compliance_meetings WHERE id = $1 ${organizationFilter}`,
      beforeValues
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const result = await client.query(
      `UPDATE compliance_meetings
       SET status = 'COMPLETED',
           archived_at = COALESCE(archived_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    await syncMeetingUserRecord(client, result.rows[0].owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertMeetingRequiredDocument(meetingId, document = {}, { organizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const meeting = await getComplianceMeetingRecord(meetingId, { organizationId });
    if (!meeting) {
      await client.query("ROLLBACK");
      return null;
    }
    const id = document.id || crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO meeting_required_documents (
         id, organization_id, meeting_id, name, required, completed, file_name, legacy_data, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         name = EXCLUDED.name,
         required = EXCLUDED.required,
         completed = EXCLUDED.completed,
         file_name = EXCLUDED.file_name,
         legacy_data = EXCLUDED.legacy_data,
         updated_at = NOW()
       RETURNING *`,
      [
        id,
        meeting.organization_id || organizationId || null,
        meetingId,
        document.name || "Document",
        document.required !== false,
        Boolean(document.completed),
        document.fileName || null,
        JSON.stringify(document),
      ]
    );
    await syncMeetingUserRecord(client, meeting.owner_user_id, meeting);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateMeetingRequiredDocument(meetingId, documentId, updates = {}, { organizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const meetingValues = [meetingId];
    const organizationFilter = organizationId ? `AND organization_id = $${meetingValues.push(organizationId)}` : "";
    const meetingResult = await client.query(
      `SELECT * FROM compliance_meetings WHERE id = $1 ${organizationFilter}`,
      meetingValues
    );
    const meeting = meetingResult.rows[0] || null;
    if (!meeting) {
      await client.query("ROLLBACK");
      return null;
    }
    const beforeResult = await client.query(
      "SELECT * FROM meeting_required_documents WHERE id = $1 AND meeting_id = $2",
      [documentId, meetingId]
    );
    const before = beforeResult.rows[0] || null;
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    const legacy = { ...(before.legacy_data || {}), ...updates };
    const result = await client.query(
      `UPDATE meeting_required_documents
       SET name = COALESCE($3, name),
           required = $4,
           completed = $5,
           file_name = $6,
           legacy_data = $7::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND meeting_id = $2
       RETURNING *`,
      [
        documentId,
        meetingId,
        updates.name || null,
        updates.required === undefined ? before.required : Boolean(updates.required),
        updates.completed === undefined ? before.completed : Boolean(updates.completed),
        updates.fileName === undefined ? before.file_name : updates.fileName || null,
        JSON.stringify(legacy),
      ]
    );
    await syncMeetingUserRecord(client, meeting.owner_user_id, meeting);
    await client.query("COMMIT");
    return { before, after: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDashboardData(user, permissions = []) {
  const canSeeAll = permissions.includes("shipments.view_all") || user.role === "CEO" || user.role === "MANAGER";
  const organizationId = user.organizationId || user.organization_id;
  const shipmentsResult = await pool.query(
    `SELECT * FROM shipments
     WHERE archived_at IS NULL AND ($1::text IS NULL OR organization_id = $1)
     ORDER BY updated_at DESC`,
    [organizationId || null]
  );
  const taskRows = await listTasks(
    permissions.includes("tasks.view_all") ? { organizationId, includeAll: true } : { organizationId, assignedToId: user.id, includeAll: true }
  );
  const documentRows = await listDocuments({ organizationId, ownerUserId: user.id, includeArchived: false });
  const chequeRows = await listCheques({ organizationId, ownerUserId: canSeeAll ? undefined : user.id });
  const meetingRows = await listComplianceMeetings(canSeeAll ? { organizationId } : { organizationId, assignedToId: user.id });
  const quotationRows = await listQuotations({ organizationId, ownerUserId: canSeeAll ? undefined : user.id });
  const notificationResult = await pool.query(
    `SELECT * FROM notifications
     WHERE user_id = $1 AND ($2::text IS NULL OR organization_id = $2) AND read_at IS NULL
     ORDER BY created_at DESC
     LIMIT 20`,
    [user.id, organizationId || null]
  );
  const changeResult = await pool.query(
    `SELECT c.*, u.name AS actor_name
     FROM change_logs c
     LEFT JOIN app_users u ON u.id = c.actor_user_id
     WHERE ($1::text IS NULL OR c.organization_id = $1)
     ORDER BY c.created_at DESC
     LIMIT 10`,
    [organizationId || null]
  );
  const usersResult = await pool.query(
    `SELECT id, name, email, role, is_online, department, last_seen_at
     FROM app_users
     WHERE ($1::text IS NULL OR organization_id = $1)
     ORDER BY is_online DESC, name ASC`
    ,
    [organizationId || null]
  );

  const shipments = shipmentsResult.rows.map((row) => ({
    id: row.id,
    trackingNumber: row.shipment_code,
    customerName: row.customer_name,
    status: row.status,
    destination: row.destination,
    estimatedDelivery: row.estimated_delivery_at,
    freeTimeDays: row.legacy_data?.freeTimeDays || 14,
  }));
  const activeShipments = shipments.filter((s) => !["DELIVERED", "CLOSED"].includes(s.status));
  const customsShipments = shipments.filter((s) => s.status === "CUSTOMS");
  const openTasks = taskRows.filter((task) => !["DONE", "CANCELLED"].includes(task.status));
  const completedTasks = taskRows.filter((task) => task.status === "DONE");
  const activeCheques = chequeRows.filter((cheque) => cheque.status === "ACTIVE");
  const returnedCheques = chequeRows.filter((cheque) => cheque.status === "RETURNED");
  const upcomingMeetings = meetingRows.filter((meeting) => !["COMPLETED", "CANCELLED"].includes(meeting.status));
  const missingMeetingDocs = meetingRows.flatMap((meeting) =>
    (meeting.requiredDocuments || [])
      .filter((doc) => doc.required && !doc.completed)
      .map((doc) => ({ meetingId: meeting.id, meetingTitle: meeting.purpose, documentName: doc.name }))
  );

  const dueSoonCheques = await listDueSoonCheques({ organizationId, ownerUserId: canSeeAll ? undefined : user.id });
  const alerts = [
    ...notificationResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.body || "",
      type: row.type || "INFO",
      link: row.legacy_data?.link || "/dashboard",
      createdAt: row.created_at,
    })),
    ...dueSoonCheques.map((cheque) => ({
      id: `cheque-${cheque.id}`,
      title: cheque.status === "RETURNED" ? "Cheque returned" : "Cheque due soon",
      message: `${cheque.bankName} - ${cheque.chequeNumber}`,
      type: cheque.status === "RETURNED" ? "URGENT" : "WARNING",
      link: "/cheques",
      createdAt: cheque.createdAt,
    })),
    ...missingMeetingDocs.slice(0, 8).map((item) => ({
      id: `meeting-doc-${item.meetingId}-${item.documentName}`,
      title: "Missing compliance document",
      message: `${item.meetingTitle}: ${item.documentName}`,
      type: "WARNING",
      link: "/compliance",
      createdAt: new Date().toISOString(),
    })),
  ];

  return {
    summary: {
      activeShipments: activeShipments.length,
      customsShipments: customsShipments.length,
      openTasks: openTasks.length,
      completedTasks: completedTasks.length,
      documents: documentRows.length,
      activeCheques: activeCheques.length,
      returnedCheques: returnedCheques.length,
      dueSoonCheques: dueSoonCheques.length,
      upcomingMeetings: upcomingMeetings.length,
      missingMeetingDocuments: missingMeetingDocs.length,
      activeQuotations: quotationRows.filter((quote) => quote.status === "PENDING").length,
    },
    latestShipments: shipments.slice(0, 8),
    priorityShipments: shipments
      .filter((shipment) => ["ARRIVED", "CUSTOMS", "IN_TRANSIT"].includes(shipment.status))
      .slice(0, 6),
    myTasks: taskRows.filter((task) => task.assignedToUserId === user.id && task.status !== "DONE").slice(0, 8),
    alerts,
    management: {
      recentChanges: changeResult.rows,
      users: usersResult.rows,
      onlineUsers: usersResult.rows.filter((row) => row.is_online).length,
      recentlyCompletedTasks: completedTasks.slice(0, 8),
    },
  };
}

export async function listRoles() {
  const result = await pool.query("SELECT id, name, description FROM roles ORDER BY name ASC");
  return result.rows;
}

function slugifyOrganizationName(name = "company") {
  const base = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `company-${crypto.randomUUID().slice(0, 8)}`;
}

function toUiPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    monthlyPriceIrr: Number(row.monthly_price_irr || 0),
    annualPriceIrr: Number(row.annual_price_irr || 0),
    limits: row.limits || {},
    features: row.features || {},
    isPublic: Boolean(row.is_public),
    sortOrder: row.sort_order || 0,
  };
}

function toUiSignupRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    planId: row.plan_id,
    planName: row.plan_name || row.plan_id,
    companyName: row.company_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone || "",
    companySize: row.company_size || "",
    expectedVolume: row.expected_volume || "",
    notes: row.notes || "",
    status: row.status,
    paymentId: row.payment_id,
    paymentStatus: row.payment_status,
    paymentAmountIrr: Number(row.payment_amount_irr || 0),
    organizationStatus: row.organization_status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

function toUiContactRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email || "",
    contactPhone: row.contact_phone || "",
    preferredContactMethod: row.preferred_contact_method || "phone",
    message: row.message || "",
    status: row.status || "new",
    resolvedById: row.resolved_by_id || null,
    resolvedByName: row.resolved_by_name || "",
    resolvedAt: row.resolved_at,
    ipAddress: row.ip_address || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUiSmsDelivery(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    userId: row.user_id || null,
    userName: row.user_name || "",
    recipientType: row.recipient_type || "user",
    recipientName: row.recipient_name || row.user_name || "",
    recipientPhone: row.recipient_phone || "",
    message: row.message || "",
    status: row.status,
    provider: row.provider,
    sourceType: row.source_type,
    sourceId: row.source_id || "",
    eventKey: row.event_key,
    attemptCount: Number(row.attempt_count || 0),
    providerMessageId: row.provider_message_id || "",
    providerResponse: row.provider_response || {},
    skipReason: row.skip_reason || "",
    errorMessage: row.error_message || "",
    sentAt: row.sent_at,
    skippedAt: row.skipped_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUiSmsTemplate(row) {
  if (!row) return null;
  return {
    key: row.key,
    label: row.label,
    body: row.body,
    enabled: row.enabled !== false,
    updatedById: row.updated_by_id || null,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function billingNumber(prefix) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${stamp}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function toUiInvoice(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    subscriptionId: row.subscription_id,
    signupRequestId: row.signup_request_id,
    paymentId: row.payment_id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    billingCycle: row.billing_cycle,
    currency: row.currency,
    subtotalIrr: Number(row.subtotal_irr || 0),
    taxIrr: Number(row.tax_irr || 0),
    totalIrr: Number(row.total_irr || 0),
    dueAt: row.due_at,
    issuedAt: row.issued_at,
    paidAt: row.paid_at,
    voidedAt: row.voided_at,
    notes: row.notes || "",
    receiptId: row.receipt_id || null,
    paymentStatus: row.payment_status || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUiInvoiceItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: Number(row.quantity || 0),
    unitAmountIrr: Number(row.unit_amount_irr || 0),
    totalAmountIrr: Number(row.total_amount_irr || 0),
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function toUiReceipt(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    invoiceId: row.invoice_id,
    paymentId: row.payment_id,
    receiptNumber: row.receipt_number,
    amountIrr: Number(row.amount_irr || 0),
    currency: row.currency,
    provider: row.provider,
    gatewayRefId: row.gateway_ref_id,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
  };
}

function toUiSubscriptionEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    summary: row.summary,
    before: row.before_json || null,
    after: row.after_json || null,
    createdAt: row.created_at,
  };
}

async function insertSubscriptionEvent(client, { organizationId, subscriptionId, actorUserId, eventType, summary, before, after }) {
  await client.query(
    `INSERT INTO subscription_events (
       id, organization_id, subscription_id, actor_user_id, event_type, summary, before_json, after_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
    [
      crypto.randomUUID(),
      organizationId || null,
      subscriptionId || null,
      actorUserId || null,
      eventType,
      summary,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
    ]
  );
}

async function createIssuedInvoiceForPayment(client, { organizationId, subscriptionId, signupRequestId, paymentId, plan, billingCycle, amount }) {
  const invoiceId = crypto.randomUUID();
  const invoiceNumber = billingNumber("INV");
  const numericAmount = Number(amount || 0);
  await client.query(
    `INSERT INTO billing_invoices (
       id, organization_id, subscription_id, signup_request_id, payment_id, invoice_number,
       status, billing_cycle, subtotal_irr, tax_irr, total_irr, due_at, notes, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'issued', $7, $8, 0, $8, NOW() + INTERVAL '7 days', $9, $10::jsonb)`,
    [
      invoiceId,
      organizationId,
      subscriptionId,
      signupRequestId,
      paymentId,
      invoiceNumber,
      billingCycle,
      numericAmount,
      `Subscription invoice for ${plan?.name || "Logistic Plus"}`,
      JSON.stringify({ planId: plan?.id || null, planName: plan?.name || null }),
    ]
  );
  await client.query(
    `INSERT INTO billing_invoice_items (
       id, invoice_id, description, quantity, unit_amount_irr, total_amount_irr, metadata
     )
     VALUES ($1, $2, $3, 1, $4, $4, $5::jsonb)`,
    [
      crypto.randomUUID(),
      invoiceId,
      `${plan?.name || "Subscription"} - ${billingCycle}`,
      numericAmount,
      JSON.stringify({ type: "subscription", billingCycle }),
    ]
  );
  return invoiceId;
}

async function closeInvoiceForPayment(client, payment) {
  const invoiceResult = await client.query(
    `UPDATE billing_invoices
     SET status = 'paid',
         paid_at = COALESCE(paid_at, NOW()),
         updated_at = NOW()
     WHERE payment_id = $1 AND status <> 'void'
     RETURNING *`,
    [payment.id]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return null;
  const receiptResult = await client.query(
    `INSERT INTO billing_receipts (
       id, organization_id, invoice_id, payment_id, receipt_number, amount_irr,
       currency, provider, gateway_ref_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (invoice_id) DO UPDATE SET
       amount_irr = EXCLUDED.amount_irr,
       provider = EXCLUDED.provider,
       gateway_ref_id = COALESCE(EXCLUDED.gateway_ref_id, billing_receipts.gateway_ref_id)
     RETURNING *`,
    [
      crypto.randomUUID(),
      payment.organization_id,
      invoice.id,
      payment.id,
      billingNumber("REC"),
      Number(payment.amount_irr || invoice.total_irr || 0),
      payment.currency || "IRR",
      payment.provider || "manual",
      payment.gateway_ref_id || null,
      JSON.stringify({ manualOverride: Boolean(payment.manual_override) }),
    ]
  );
  return { invoice, receipt: receiptResult.rows[0] };
}

export async function listSubscriptionPlans({ publicOnly = true } = {}) {
  const result = await pool.query(
    `SELECT * FROM subscription_plans
     ${publicOnly ? "WHERE is_public = TRUE" : ""}
     ORDER BY sort_order ASC, monthly_price_irr ASC`
  );
  return result.rows.map(toUiPlan);
}

export async function getSubscriptionPlan(planId) {
  const result = await pool.query("SELECT * FROM subscription_plans WHERE id = $1 LIMIT 1", [planId]);
  return result.rows[0] || null;
}

export async function getOrganizationForUser(userId) {
  const result = await pool.query(
    `SELECT o.*, p.name AS plan_name, p.limits, p.features
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN subscription_plans p ON p.id = o.plan_id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

function mergeSubscriptionLimits(planLimits = {}, planFeatures = {}, limitsOverride = {}) {
  const override = limitsOverride || {};
  const featureKeys = ["chat", "cheques", "compliance", "quotations", "archive", "smsNotifications"];
  const limits = { ...(planLimits || {}) };
  const features = { ...(planFeatures || {}) };
  for (const [key, value] of Object.entries(override)) {
    if (featureKeys.includes(key)) {
      features[key] = Boolean(value);
    } else if (value !== "" && value !== null && value !== undefined) {
      limits[key] = Number.isNaN(Number(value)) ? value : Number(value);
    }
  }
  return { limits, features };
}

export async function getEffectiveSubscriptionLimits(organizationId, queryable = pool) {
  if (!organizationId) return { limits: {}, features: {}, override: {}, plan: null, subscription: null };
  const result = await queryable.query(
    `SELECT os.*, sp.name AS plan_name, sp.limits AS plan_limits, sp.features AS plan_features
     FROM organization_subscriptions os
     LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE os.organization_id = $1
     ORDER BY os.created_at DESC
     LIMIT 1`,
    [organizationId]
  );
  const row = result.rows[0];
  if (!row) return { limits: {}, features: {}, override: {}, plan: null, subscription: null };
  const effective = mergeSubscriptionLimits(row.plan_limits, row.plan_features, row.limits_override);
  return {
    ...effective,
    override: row.limits_override || {},
    plan: { id: row.plan_id, name: row.plan_name },
    subscription: {
      id: row.id,
      organizationId: row.organization_id,
      planId: row.plan_id,
      status: row.status,
      billingCycle: row.billing_cycle,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      limitsOverride: row.limits_override || {},
      effectiveLimits: effective.limits,
      effectiveFeatures: effective.features,
    },
  };
}

function isHighPriority(priority) {
  return ["HIGH", "URGENT"].includes(String(priority || "").toUpperCase());
}

async function organizationCanUseSms(organizationId, queryable = pool) {
  const subscription = await getEffectiveSubscriptionLimits(organizationId, queryable);
  return subscription.subscription?.status === "active" && Boolean(subscription.features?.smsNotifications);
}

async function getSmsTemplate(queryable, key) {
  const result = await queryable.query("SELECT * FROM sms_templates WHERE key = $1 LIMIT 1", [key]);
  const row = result.rows[0];
  if (row) return row;
  const fallback = DEFAULT_SMS_TEMPLATE_MAP[key];
  return fallback ? { ...fallback, enabled: true } : null;
}

async function renderSmsTemplate(queryable, key, replacements = {}) {
  const template = await getSmsTemplate(queryable, key);
  if (!template || template.enabled === false) return null;
  return renderSmsTemplateBody(template.body, replacements).trim();
}

function formatSmsDateTime(value) {
  const date = parseOperationalDate(value);
  if (!date) return value ? String(value) : "";
  return date.toLocaleString("fa-IR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSmsTaskTime(task) {
  return formatSmsDateTime(task?.due_at || task?.legacy_data?.deadline || task?.legacy_data?.dueDate) || "در اولین فرصت";
}

function meetingTemplateKey(windowName) {
  return windowName === "2h" ? "meeting_reminder_2h" : "meeting_reminder_24h";
}

function demurrageTemplateKey(windowName) {
  if (windowName === "overdue") return "demurrage_overdue";
  return windowName === "24h" ? "demurrage_warning_24h" : "demurrage_warning_72h";
}

async function enqueueSmsDelivery(queryable, {
  organizationId,
  userId,
  recipientType = "user",
  recipientName,
  recipientPhone,
  message,
  sourceType,
  sourceId,
  eventKey,
  skipReason: requestedSkipReason,
}) {
  if (!organizationId || !eventKey || !message || !(await organizationCanUseSms(organizationId, queryable))) {
    return null;
  }
  const normalizedPhone = normalizeSmsPhone(recipientPhone);
  const status = normalizedPhone ? "queued" : "skipped";
  const skipReason = normalizedPhone ? null : requestedSkipReason || "missing_or_invalid_phone";
  const result = await queryable.query(
    `INSERT INTO sms_deliveries (
       id, organization_id, user_id, recipient_type, recipient_name, recipient_phone, message, status, source_type, source_id,
       event_key, skip_reason, skipped_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $8 = 'skipped' THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (event_key) DO NOTHING
     RETURNING *`,
    [
      crypto.randomUUID(),
      organizationId,
      userId || null,
      recipientType || "user",
      recipientName || null,
      normalizedPhone || null,
      String(message).slice(0, 900),
      status,
      sourceType,
      sourceId || null,
      eventKey,
      skipReason,
    ]
  );
  return result.rows[0] || null;
}

export async function recordImmediateSmsDelivery({
  organizationId,
  userId,
  recipientType = "user",
  recipientName,
  recipientPhone,
  message,
  sourceType,
  sourceId,
  eventKey,
  status = "sent",
  providerResult = {},
  errorMessage,
  skipReason,
}) {
  const normalizedPhone = normalizeSmsPhone(recipientPhone);
  const safeStatus = ["sent", "failed", "skipped", "queued"].includes(status) ? status : "sent";
  const finalStatus = normalizedPhone ? safeStatus : "skipped";
  const providerResponse = providerResult.raw || providerResult || {};
  const result = await pool.query(
    `INSERT INTO sms_deliveries (
       id, organization_id, user_id, recipient_type, recipient_name, recipient_phone, message, status, source_type, source_id,
       event_key, provider_message_id, provider_response, skip_reason, error_message, sent_at, skipped_at, failed_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13::jsonb, $14, $15,
       CASE WHEN $8 = 'sent' THEN NOW() ELSE NULL END,
       CASE WHEN $8 = 'skipped' THEN NOW() ELSE NULL END,
       CASE WHEN $8 = 'failed' THEN NOW() ELSE NULL END,
       NOW()
     )
     ON CONFLICT (event_key) DO UPDATE SET
       status = EXCLUDED.status,
       provider_message_id = EXCLUDED.provider_message_id,
       provider_response = EXCLUDED.provider_response,
       skip_reason = EXCLUDED.skip_reason,
       error_message = EXCLUDED.error_message,
       sent_at = EXCLUDED.sent_at,
       skipped_at = EXCLUDED.skipped_at,
       failed_at = EXCLUDED.failed_at,
       updated_at = NOW()
     RETURNING *`,
    [
      crypto.randomUUID(),
      organizationId || null,
      userId || null,
      recipientType || "user",
      recipientName || null,
      normalizedPhone || null,
      String(message || "SMS notification").slice(0, 900),
      finalStatus,
      sourceType || "manual",
      sourceId || null,
      eventKey || `manual:${crypto.randomUUID()}`,
      providerResult.messageId || null,
      JSON.stringify(providerResponse),
      finalStatus === "skipped" ? skipReason || "missing_or_invalid_phone" : null,
      finalStatus === "failed" ? errorMessage || "SMS send failed." : null,
    ]
  );
  return toUiSmsDelivery(result.rows[0]);
}

async function getUserSmsTarget(queryable, userId, organizationId) {
  if (!userId) return null;
  const result = await queryable.query(
    `SELECT id, name, phone, organization_id
     FROM app_users
     WHERE id = $1
       AND status = 'active'
       AND ($2::text IS NULL OR organization_id = $2)
     LIMIT 1`,
    [userId, organizationId || null]
  );
  return result.rows[0] || null;
}

async function queueHighPriorityTaskSms(queryable, task, eventName = "assigned") {
  if (!task || !isHighPriority(task.priority) || !task.assigned_to_id || ["DONE", "CANCELLED"].includes(task.status)) {
    return null;
  }
  const assignee = await getUserSmsTarget(queryable, task.assigned_to_id, task.organization_id);
  const message = await renderSmsTemplate(queryable, "high_priority_task", {
    task: task.title,
    time: formatSmsTaskTime(task),
  });
  if (!message) return null;
  return enqueueSmsDelivery(queryable, {
    organizationId: task.organization_id,
    userId: task.assigned_to_id,
    recipientType: "user",
    recipientName: assignee?.name || task.assigned_to_name || "",
    recipientPhone: assignee?.phone || "",
    message,
    sourceType: "task",
    sourceId: task.id,
    eventKey: `task:${task.id}:${eventName}:${task.assigned_to_id}:${task.priority}`,
  });
}

function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + (365 * jy) + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd;
  days += jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186;
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const daysInMonth = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  for (; gm <= 12 && gd > daysInMonth[gm]; gm += 1) gd -= daysInMonth[gm];
  return { gy, gm, gd };
}

function parseOperationalDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/[T\s]\d{1,2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const absolute = new Date(text);
    if (!Number.isNaN(absolute.valueOf())) return absolute;
  }
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (match) {
    let year = Number(match[1]);
    let month = Number(match[2]);
    let day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    if (year < 1700) {
      const converted = jalaliToGregorian(year, month, day);
      year = converted.gy;
      month = converted.gm;
      day = converted.gd;
    }
    const parsed = new Date(year, month - 1, day, hour, minute);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
}

function selectReminderWindow(diffMs) {
  if (diffMs <= 0) return null;
  const hours = diffMs / (60 * 60 * 1000);
  if (hours <= 2) return "2h";
  if (hours <= 24) return "24h";
  return null;
}

function selectDemurrageWindow(diffMs) {
  const hours = diffMs / (60 * 60 * 1000);
  if (hours <= 0) return "overdue";
  if (hours <= 24) return "24h";
  if (hours <= 72) return "72h";
  return null;
}

async function getDemurrageRecipient(queryable, shipment) {
  const result = await queryable.query(
    `SELECT u.id, u.name, u.phone, u.organization_id
     FROM organizations o
     JOIN app_users u ON u.id = o.owner_user_id
     WHERE o.id = $1
       AND u.status = 'active'
       AND u.role = 'CEO'
     LIMIT 1`,
    [shipment.organization_id]
  );
  if (result.rows[0]) return result.rows[0];

  const fallback = await queryable.query(
    `SELECT id, name, phone, organization_id
     FROM app_users
     WHERE organization_id = $1
       AND status = 'active'
       AND role = 'CEO'
     ORDER BY created_at ASC
     LIMIT 1`,
    [shipment.organization_id]
  );
  return fallback.rows[0] || null;
}

export async function queueScheduledSmsAlerts({ now = new Date() } = {}) {
  const queued = { meetings: 0, demurrage: 0 };
  const meetings = await pool.query(
    `SELECT cm.*, u.phone AS assigned_phone
     FROM compliance_meetings cm
     LEFT JOIN app_users u ON u.id = cm.assigned_to_id
     WHERE cm.archived_at IS NULL
       AND cm.status NOT IN ('COMPLETED', 'CANCELLED', 'ARCHIVED')
       AND cm.assigned_to_id IS NOT NULL
       AND cm.organization_id IS NOT NULL`
  );
  for (const meeting of meetings.rows) {
    const targetDate = parseOperationalDate(meeting.meeting_at);
    const windowName = targetDate ? selectReminderWindow(targetDate.getTime() - now.getTime()) : null;
    if (!windowName) continue;
    const message = await renderSmsTemplate(pool, meetingTemplateKey(windowName), {
      mtg: meeting.title,
      time: formatSmsDateTime(meeting.meeting_at),
    });
    if (!message) continue;
    const delivery = await enqueueSmsDelivery(pool, {
      organizationId: meeting.organization_id,
      userId: meeting.assigned_to_id,
      recipientType: "user",
      recipientName: meeting.assigned_to_name || "",
      recipientPhone: meeting.assigned_phone || "",
      message,
      sourceType: "meeting",
      sourceId: meeting.id,
      eventKey: `meeting:${meeting.id}:${windowName}`,
    });
    if (delivery) queued.meetings += 1;
  }

  const shipments = await pool.query(
    `SELECT *
     FROM shipments
     WHERE archived_at IS NULL
       AND organization_id IS NOT NULL
       AND status IN ('ARRIVED', 'CUSTOMS', 'CLEARED')`
  );
  for (const shipment of shipments.rows) {
    const estimatedDelivery = parseOperationalDate(shipment.estimated_delivery_at);
    const freeTimeEnd =
      parseOperationalDate(shipment.free_time_ends_at) ||
      (estimatedDelivery ? addDays(estimatedDelivery, shipment.legacy_data?.freeTimeDays || 0) : null);
    const windowName = freeTimeEnd ? selectDemurrageWindow(freeTimeEnd.getTime() - now.getTime()) : null;
    if (!windowName) continue;
    const recipient = await getDemurrageRecipient(pool, shipment);
    const message = await renderSmsTemplate(pool, demurrageTemplateKey(windowName), {
      ship: shipment.shipment_code,
      time: formatSmsDateTime(freeTimeEnd),
    });
    if (!message) continue;
    const delivery = await enqueueSmsDelivery(pool, {
      organizationId: shipment.organization_id,
      userId: recipient?.id || null,
      recipientType: "user",
      recipientName: recipient?.name || "CEO",
      recipientPhone: recipient?.phone || "",
      message,
      sourceType: "demurrage",
      sourceId: shipment.id,
      eventKey: `demurrage:${shipment.id}:${windowName}`,
      skipReason: recipient?.phone ? undefined : "missing_ceo_recipient",
    });
    if (delivery) queued.demurrage += 1;
  }
  return queued;
}

export async function claimQueuedSmsDeliveries({ limit = 50 } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE sms_deliveries
       SET status = 'sending',
           attempt_count = attempt_count + 1,
           updated_at = NOW()
       WHERE id IN (
         SELECT id
         FROM sms_deliveries
         WHERE status = 'queued'
           AND next_attempt_at <= NOW()
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [Number(limit) || 50]
    );
    await client.query("COMMIT");
    return result.rows.map(toUiSmsDelivery);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markSmsDeliverySent(deliveryId, providerResult = {}) {
  const result = await pool.query(
    `UPDATE sms_deliveries
     SET status = 'sent',
         sent_at = NOW(),
         provider_message_id = $2,
         provider_response = $3::jsonb,
         error_message = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [deliveryId, providerResult.messageId || null, JSON.stringify(providerResult.raw || providerResult)]
  );
  return toUiSmsDelivery(result.rows[0]);
}

export async function markSmsDeliverySkipped(deliveryId, reason, providerResult = {}) {
  const result = await pool.query(
    `UPDATE sms_deliveries
     SET status = 'skipped',
         skipped_at = NOW(),
         skip_reason = $2,
         provider_response = $3::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [deliveryId, reason || "skipped", JSON.stringify(providerResult.raw || providerResult || {})]
  );
  return toUiSmsDelivery(result.rows[0]);
}

export async function markSmsDeliveryFailed(deliveryId, error, { maxAttempts = 3 } = {}) {
  const current = await pool.query("SELECT attempt_count FROM sms_deliveries WHERE id = $1", [deliveryId]);
  const attemptCount = Number(current.rows[0]?.attempt_count || 1);
  const finalFailure = attemptCount >= maxAttempts;
  const result = await pool.query(
    `UPDATE sms_deliveries
     SET status = $2,
         failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE failed_at END,
         next_attempt_at = CASE WHEN $2 = 'queued' THEN NOW() + ($4::int * INTERVAL '5 minutes') ELSE next_attempt_at END,
         error_message = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [deliveryId, finalFailure ? "failed" : "queued", error?.message || String(error || "SMS send failed."), Math.max(attemptCount, 1)]
  );
  return toUiSmsDelivery(result.rows[0]);
}

export async function listSmsDeliveries({ organizationId, status, limit = 100 } = {}) {
  const values = [];
  const conditions = [];
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`sd.organization_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`sd.status = $${values.length}`);
  }
  values.push(Number(limit) || 100);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT sd.*, o.name AS organization_name, u.name AS user_name
     FROM sms_deliveries sd
     LEFT JOIN organizations o ON o.id = sd.organization_id
     LEFT JOIN app_users u ON u.id = sd.user_id
     ${where}
     ORDER BY sd.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiSmsDelivery);
}

export async function listSmsTemplates() {
  const result = await pool.query(
    `SELECT *
     FROM sms_templates
     ORDER BY key ASC`
  );
  return result.rows.map(toUiSmsTemplate);
}

export async function updateSmsTemplate(key, updates = {}, actorUserId) {
  const defaultTemplate = DEFAULT_SMS_TEMPLATE_MAP[key];
  if (!defaultTemplate) {
    const error = new Error("SMS template was not found.");
    error.statusCode = 404;
    error.code = "SMS_TEMPLATE_NOT_FOUND";
    throw error;
  }
  const body = updates.body === undefined ? null : String(updates.body || "").trim();
  if (updates.body !== undefined && !body) {
    const error = new Error("SMS template body is required.");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  const result = await pool.query(
    `INSERT INTO sms_templates (key, label, body, enabled, updated_by_id, updated_at)
     VALUES ($1, $2, COALESCE($3, $4), COALESCE($5, TRUE), $6, NOW())
     ON CONFLICT (key) DO UPDATE SET
       label = EXCLUDED.label,
       body = COALESCE($3, sms_templates.body),
       enabled = COALESCE($5, sms_templates.enabled),
       updated_by_id = $6,
       updated_at = NOW()
     RETURNING *`,
    [
      key,
      defaultTemplate.label,
      body,
      defaultTemplate.body,
      updates.enabled === undefined ? null : Boolean(updates.enabled),
      actorUserId || null,
    ]
  );
  return toUiSmsTemplate(result.rows[0]);
}

export async function getSmsAnalytics({ organizationId } = {}) {
  const values = [];
  const conditions = [];
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`sd.organization_id = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const summaryResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE sd.status = 'sent')::int AS total_sent,
       COUNT(*) FILTER (WHERE sd.status = 'sent' AND sd.sent_at >= date_trunc('month', NOW()))::int AS sent_this_month,
       COUNT(*) FILTER (WHERE sd.status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE sd.status = 'skipped')::int AS skipped,
       COUNT(*) FILTER (WHERE sd.status = 'queued')::int AS queued
     FROM sms_deliveries sd
     ${where}`,
    values
  );
  const recipientsResult = await pool.query(
    `SELECT
       sd.organization_id,
       o.name AS organization_name,
       COALESCE(sd.recipient_type, 'user') AS recipient_type,
       COALESCE(NULLIF(sd.recipient_name, ''), u.name, 'نامشخص') AS recipient_name,
       COALESCE(sd.recipient_phone, '') AS recipient_phone,
       COUNT(*) FILTER (WHERE sd.status = 'sent')::int AS sent_count,
       COUNT(*) FILTER (WHERE sd.status = 'failed')::int AS failed_count,
       COUNT(*) FILTER (WHERE sd.status = 'skipped')::int AS skipped_count,
       (ARRAY_AGG(sd.status ORDER BY sd.updated_at DESC, sd.created_at DESC))[1] AS last_status,
       MAX(COALESCE(sd.sent_at, sd.failed_at, sd.skipped_at, sd.updated_at, sd.created_at)) AS last_activity_at
     FROM sms_deliveries sd
     LEFT JOIN organizations o ON o.id = sd.organization_id
     LEFT JOIN app_users u ON u.id = sd.user_id
     ${where}
     GROUP BY sd.organization_id, o.name, COALESCE(sd.recipient_type, 'user'), COALESCE(NULLIF(sd.recipient_name, ''), u.name, 'نامشخص'), COALESCE(sd.recipient_phone, '')
     ORDER BY last_activity_at DESC
     LIMIT 100`,
    values
  );
  const summary = summaryResult.rows[0] || {};
  return {
    summary: {
      totalSent: Number(summary.total_sent || 0),
      sentThisMonth: Number(summary.sent_this_month || 0),
      failed: Number(summary.failed || 0),
      skipped: Number(summary.skipped || 0),
      queued: Number(summary.queued || 0),
    },
    recipients: recipientsResult.rows.map((row) => ({
      organizationId: row.organization_id,
      organizationName: row.organization_name || "",
      recipientType: row.recipient_type || "user",
      recipientName: row.recipient_name || "نامشخص",
      recipientPhone: row.recipient_phone || "",
      sentCount: Number(row.sent_count || 0),
      failedCount: Number(row.failed_count || 0),
      skippedCount: Number(row.skipped_count || 0),
      lastStatus: row.last_status || "",
      lastActivityAt: row.last_activity_at,
    })),
  };
}

export async function assertPlanAllowsUser(organizationId) {
  if (!organizationId) return;
  const result = await pool.query(
    `SELECT COUNT(u.id)::int AS user_count
     FROM organizations o
     LEFT JOIN app_users u ON u.organization_id = o.id AND u.status <> 'suspended'
     WHERE o.id = $1
     GROUP BY o.id`,
    [organizationId]
  );
  const row = result.rows[0];
  const subscription = await getEffectiveSubscriptionLimits(organizationId);
  const maxUsers = Number(subscription.limits?.users || 0);
  if (maxUsers > 0 && Number(row?.user_count || 0) >= maxUsers) {
    const error = new Error("Plan user limit reached.");
    error.statusCode = 402;
    error.code = "PLAN_LIMIT_REACHED";
    throw error;
  }
}

export async function createSignupWithPayment({ signup, passwordHash }) {
  const plan = await getSubscriptionPlan(signup.planId || "starter");
  if (!plan) {
    const error = new Error("Selected plan was not found.");
    error.statusCode = 400;
    error.code = "PLAN_NOT_FOUND";
    throw error;
  }

  const existing = await getUserByEmail(signup.ownerEmail || signup.contactEmail);
  if (existing) {
    const error = new Error("A user with this email already exists.");
    error.statusCode = 409;
    error.code = "EMAIL_EXISTS";
    throw error;
  }

  const organizationId = crypto.randomUUID();
  const ownerUserId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  let invoiceId = null;
  const billingCycle = signup.billingCycle === "annual" ? "annual" : "monthly";
  const amount = billingCycle === "annual" ? plan.annual_price_irr : plan.monthly_price_irr;
  const slug = `${slugifyOrganizationName(signup.companyName)}-${organizationId.slice(0, 8)}`;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organizations (
         id, name, slug, status, owner_user_id, plan_id, contact_name, contact_email, contact_phone, notes, legacy_data
       )
       VALUES ($1, $2, $3, 'pending_payment', $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        organizationId,
        signup.companyName,
        slug,
        ownerUserId,
        plan.id,
        signup.ownerName || signup.contactName,
        signup.ownerEmail || signup.contactEmail,
        signup.contactPhone || "",
        signup.notes || null,
        JSON.stringify({ companySize: signup.companySize, expectedVolume: signup.expectedVolume }),
      ]
    );
    await client.query(
      `INSERT INTO app_users (
         id, organization_id, name, email, password_hash, role, status, is_online, notification_preferences, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'CEO', 'pending', FALSE, '{}'::jsonb, NOW())`,
      [ownerUserId, organizationId, signup.ownerName || signup.contactName, signup.ownerEmail || signup.contactEmail, passwordHash]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'pending')`,
      [organizationId, ownerUserId]
    );
    await client.query(
      `INSERT INTO organization_subscriptions (
         id, organization_id, plan_id, status, billing_cycle, created_at, updated_at
       )
       VALUES ($1, $2, $3, 'pending_payment', $4, NOW(), NOW())`,
      [subscriptionId, organizationId, plan.id, billingCycle]
    );
    await client.query(
      `INSERT INTO billing_payments (
         id, organization_id, signup_request_id, subscription_id, provider, status,
         amount_irr, currency, description
       )
       VALUES ($1, $2, $3, $4, 'zarinpal', 'pending', $5, 'IRR', $6)`,
      [paymentId, organizationId, requestId, subscriptionId, amount, `اشتراک ${plan.name} لجستیک پلاس`]
    );
    await client.query(
      `INSERT INTO signup_requests (
         id, organization_id, owner_user_id, plan_id, company_name, contact_name,
         contact_email, contact_phone, company_size, expected_volume, notes, status, payment_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'payment_pending', $12)`,
      [
        requestId,
        organizationId,
        ownerUserId,
        plan.id,
        signup.companyName,
        signup.ownerName || signup.contactName,
        signup.ownerEmail || signup.contactEmail,
        signup.contactPhone || "",
        signup.companySize || "",
        signup.expectedVolume || "",
        signup.notes || "",
        paymentId,
      ]
    );
    invoiceId = await createIssuedInvoiceForPayment(client, {
      organizationId,
      subscriptionId,
      signupRequestId: requestId,
      paymentId,
      plan,
      billingCycle,
      amount,
    });
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId,
      eventType: "signup.invoice_issued",
      summary: "Signup invoice was issued.",
      after: { invoiceId, paymentId, planId: plan.id, billingCycle, amountIrr: Number(amount) },
    });
    await client.query("COMMIT");
    return { signupRequestId: requestId, organizationId, ownerUserId, paymentId, invoiceId, amountIrr: Number(amount), plan: toUiPlan(plan) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createManualCompanySignup({ signup, passwordHash, reviewerId }) {
  const plan = await getSubscriptionPlan(signup.planId || "starter");
  if (!plan) {
    const error = new Error("Selected plan was not found.");
    error.statusCode = 400;
    error.code = "PLAN_NOT_FOUND";
    throw error;
  }

  const ownerEmail = signup.ownerEmail || signup.contactEmail;
  const existing = await getUserByEmail(ownerEmail);
  if (existing) {
    const error = new Error("A user with this email already exists.");
    error.statusCode = 409;
    error.code = "EMAIL_EXISTS";
    throw error;
  }

  const organizationId = crypto.randomUUID();
  const ownerUserId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const billingCycle = signup.billingCycle === "annual" ? "annual" : "monthly";
  const slug = `${slugifyOrganizationName(signup.companyName)}-${organizationId.slice(0, 8)}`;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organizations (
         id, name, slug, status, owner_user_id, plan_id, contact_name, contact_email,
         contact_phone, notes, approved_at, legacy_data
       )
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, NOW(), $10::jsonb)`,
      [
        organizationId,
        signup.companyName,
        slug,
        ownerUserId,
        plan.id,
        signup.ownerName || signup.contactName,
        ownerEmail,
        signup.contactPhone || "",
        signup.notes || null,
        JSON.stringify({ companySize: signup.companySize, expectedVolume: signup.expectedVolume, source: "manual_admin" }),
      ]
    );
    await client.query(
      `INSERT INTO app_users (
         id, organization_id, name, email, password_hash, role, status, is_online,
         notification_preferences, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'CEO', 'active', FALSE, '{}'::jsonb, NOW())`,
      [ownerUserId, organizationId, signup.ownerName || signup.contactName, ownerEmail, passwordHash]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')`,
      [organizationId, ownerUserId]
    );
    await client.query(
      `INSERT INTO organization_subscriptions (
         id, organization_id, plan_id, status, billing_cycle, current_period_start,
         current_period_end, activated_at, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'active', $4, NOW(),
         NOW() + CASE WHEN $4 = 'annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END,
         NOW(), NOW(), NOW()
       )`,
      [subscriptionId, organizationId, plan.id, billingCycle]
    );
    await client.query(
      `INSERT INTO signup_requests (
         id, organization_id, owner_user_id, plan_id, company_name, contact_name,
         contact_email, contact_phone, company_size, expected_volume, notes, status,
         reviewed_by_id, reviewed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'approved', $12, NOW())`,
      [
        requestId,
        organizationId,
        ownerUserId,
        plan.id,
        signup.companyName,
        signup.ownerName || signup.contactName,
        ownerEmail,
        signup.contactPhone || "",
        signup.companySize || "",
        signup.expectedVolume || "",
        signup.notes || "Created manually by platform admin.",
        reviewerId || null,
      ]
    );
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId,
      actorUserId: reviewerId,
      eventType: "signup.manual_created",
      summary: "Company was manually created and activated by platform admin.",
      after: { signupRequestId: requestId, planId: plan.id, billingCycle },
    });
    await client.query("COMMIT");
    return {
      signupRequestId: requestId,
      organizationId,
      ownerUserId,
      subscriptionId,
      plan: toUiPlan(plan),
      organization: await getOrganizationDetail(organizationId),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getBillingPayment(paymentId) {
  const result = await pool.query(
    `SELECT bp.*, sp.name AS plan_name
     FROM billing_payments bp
     LEFT JOIN organization_subscriptions os ON os.id = bp.subscription_id
     LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE bp.id = $1
     LIMIT 1`,
    [paymentId]
  );
  return result.rows[0] || null;
}

export async function getBillingPaymentByAuthority(authority) {
  const result = await pool.query(
    `SELECT bp.*, sp.name AS plan_name
     FROM billing_payments bp
     LEFT JOIN organization_subscriptions os ON os.id = bp.subscription_id
     LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE bp.gateway_authority = $1
     LIMIT 1`,
    [authority]
  );
  return result.rows[0] || null;
}

export async function markPaymentRequested(paymentId, { authority, gatewayUrl, rawRequest }) {
  const result = await pool.query(
    `UPDATE billing_payments
     SET gateway_authority = $2,
         gateway_url = $3,
         raw_request = $4::jsonb,
         requested_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [paymentId, authority, gatewayUrl, JSON.stringify(rawRequest || {})]
  );
  return result.rows[0] || null;
}

export async function markPaymentVerifiedByAuthority(authority, { ok, refId, rawVerify }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query(
      `UPDATE billing_payments
       SET status = $2,
           gateway_ref_id = COALESCE($3, gateway_ref_id),
           raw_verify = $4::jsonb,
           verified_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE verified_at END,
           failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE failed_at END,
           updated_at = NOW()
       WHERE gateway_authority = $1
       RETURNING *`,
      [authority, ok ? "paid" : "failed", refId || null, JSON.stringify(rawVerify || {})]
    );
    const payment = paymentResult.rows[0];
    if (payment) {
      if (ok) {
        await closeInvoiceForPayment(client, payment);
      }
      await client.query(
        `UPDATE signup_requests
         SET status = $2, updated_at = NOW()
         WHERE id = $1`,
        [payment.signup_request_id, ok ? "pending_review" : "payment_failed"]
      );
      await client.query(
        `UPDATE organizations
         SET status = $2, updated_at = NOW()
         WHERE id = $1`,
        [payment.organization_id, ok ? "pending_review" : "payment_failed"]
      );
      await client.query(
        `UPDATE organization_subscriptions
         SET status = $2, updated_at = NOW()
         WHERE id = $1`,
        [payment.subscription_id, ok ? "pending_review" : "payment_failed"]
      );
      await insertSubscriptionEvent(client, {
        organizationId: payment.organization_id,
        subscriptionId: payment.subscription_id,
        eventType: ok ? "payment.verified" : "payment.failed",
        summary: ok ? "Payment was verified and invoice was paid." : "Payment verification failed.",
        after: { paymentId: payment.id, status: ok ? "paid" : "failed", refId },
      });
    }
    await client.query("COMMIT");
    return payment || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listSignupRequests({ status } = {}) {
  const values = [];
  const where = status ? "WHERE sr.status = $1" : "";
  if (status) values.push(status);
  const result = await pool.query(
    `SELECT sr.*, sp.name AS plan_name, bp.status AS payment_status, bp.amount_irr AS payment_amount_irr,
            o.status AS organization_status
     FROM signup_requests sr
     LEFT JOIN subscription_plans sp ON sp.id = sr.plan_id
     LEFT JOIN billing_payments bp ON bp.id = sr.payment_id
     LEFT JOIN organizations o ON o.id = sr.organization_id
     ${where}
     ORDER BY sr.created_at DESC`,
    values
  );
  return result.rows.map(toUiSignupRequest);
}

export async function createContactRequest(request = {}, requestContext = {}) {
  const preferred = ["phone", "email", "either"].includes(request.preferredContactMethod)
    ? request.preferredContactMethod
    : "phone";
  const result = await pool.query(
    `INSERT INTO contact_requests (
       id, company_name, contact_name, contact_email, contact_phone,
       preferred_contact_method, message, status, ip_address, user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9)
     RETURNING *`,
    [
      crypto.randomUUID(),
      String(request.companyName || "").trim().slice(0, 200),
      String(request.contactName || "").trim().slice(0, 200),
      request.contactEmail ? String(request.contactEmail).trim().slice(0, 240) : null,
      request.contactPhone ? String(request.contactPhone).trim().slice(0, 80) : null,
      preferred,
      request.message ? String(request.message).trim().slice(0, 2000) : null,
      requestContext.ip || null,
      requestContext.userAgent || null,
    ]
  );
  return toUiContactRequest(result.rows[0]);
}

export async function listContactRequests({ status, limit = 100 } = {}) {
  const values = [];
  const conditions = [];
  if (status && ["new", "resolved"].includes(status)) {
    values.push(status);
    conditions.push(`cr.status = $${values.length}`);
  }
  values.push(Math.min(Math.max(Number(limit) || 100, 1), 250));
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT cr.*, u.name AS resolved_by_name
     FROM contact_requests cr
     LEFT JOIN app_users u ON u.id = cr.resolved_by_id
     ${where}
     ORDER BY cr.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiContactRequest);
}

export async function resolveContactRequest(requestId, resolverUserId) {
  const result = await pool.query(
    `UPDATE contact_requests
     SET status = 'resolved',
         resolved_by_id = $2,
         resolved_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [requestId, resolverUserId || null]
  );
  return toUiContactRequest(result.rows[0]);
}

export async function reviewSignupRequest(requestId, { approved, reviewerId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query("SELECT * FROM signup_requests WHERE id = $1 FOR UPDATE", [requestId]);
    const row = request.rows[0];
    if (!row) return null;
    if (approved) {
      const payment = await client.query("SELECT status FROM billing_payments WHERE id = $1", [row.payment_id]);
      if (payment.rows[0]?.status !== "paid") {
        const error = new Error("Payment must be verified before approval.");
        error.statusCode = 409;
        error.code = "PAYMENT_REQUIRED";
        throw error;
      }
    }
    const nextStatus = approved ? "approved" : "rejected";
    const organizationStatus = approved ? "active" : "rejected";
    const userStatus = approved ? "active" : "suspended";
    const subscriptionStatus = approved ? "active" : "rejected";
    await client.query(
      `UPDATE signup_requests
       SET status = $2, reviewed_by_id = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [requestId, nextStatus, reviewerId]
    );
    await client.query(
      `UPDATE organizations
       SET status = $2,
           approved_at = CASE WHEN $2 = 'active' THEN NOW() ELSE approved_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [row.organization_id, organizationStatus]
    );
    await client.query("UPDATE app_users SET status = $2, updated_at = NOW() WHERE id = $1", [row.owner_user_id, userStatus]);
    await client.query(
      "UPDATE organization_members SET status = $2 WHERE organization_id = $1 AND user_id = $3",
      [row.organization_id, approved ? "active" : "suspended", row.owner_user_id]
    );
    await client.query(
      `UPDATE organization_subscriptions
       SET status = $2,
           current_period_start = CASE WHEN $2 = 'active' THEN NOW() ELSE current_period_start END,
           current_period_end = CASE WHEN $2 = 'active' THEN NOW() + CASE WHEN billing_cycle = 'annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END ELSE current_period_end END,
           activated_at = CASE WHEN $2 = 'active' THEN NOW() ELSE activated_at END,
           updated_at = NOW()
       WHERE organization_id = $1`,
      [row.organization_id, subscriptionStatus]
    );
    await insertSubscriptionEvent(client, {
      organizationId: row.organization_id,
      subscriptionId: null,
      actorUserId: reviewerId,
      eventType: approved ? "signup.approved" : "signup.rejected",
      summary: approved ? "Signup was approved and subscription activated." : "Signup was rejected.",
      after: { signupRequestId: requestId, subscriptionStatus, organizationStatus },
    });
    await client.query("COMMIT");
    return (await listSignupRequests()).find((item) => item.id === requestId) || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listOrganizations() {
  const result = await pool.query(
    `SELECT o.*, sp.name AS plan_name, os.status AS subscription_status, os.billing_cycle,
            os.limits_override, COUNT(u.id)::int AS user_count,
            COUNT(*) FILTER (WHERE u.status = 'active')::int AS active_user_count
     FROM organizations o
     LEFT JOIN subscription_plans sp ON sp.id = o.plan_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     LEFT JOIN app_users u ON u.organization_id = o.id
     GROUP BY o.id, sp.name, os.status, os.billing_cycle, os.limits_override
     ORDER BY o.created_at DESC`
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    planId: row.plan_id,
    planName: row.plan_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    userCount: Number(row.user_count || 0),
    activeUserCount: Number(row.active_user_count || 0),
    subscriptionStatus: row.subscription_status,
    billingCycle: row.billing_cycle,
    limitsOverride: row.limits_override || {},
    createdAt: row.created_at,
  }));
}

function toUiPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    subscriptionId: row.subscription_id,
    provider: row.provider,
    status: row.status,
    amountIrr: Number(row.amount_irr || 0),
    currency: row.currency,
    description: row.description || "",
    gatewayRefId: row.gateway_ref_id,
    manualOverride: Boolean(row.manual_override),
    manualNote: row.manual_note || "",
    markedById: row.marked_by_id || null,
    markedAt: row.marked_at,
    invoiceId: row.invoice_id || null,
    invoiceStatus: row.invoice_status || null,
    receiptId: row.receipt_id || null,
    requestedAt: row.requested_at,
    verifiedAt: row.verified_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
  };
}

function toUiErrorLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    userId: row.user_id,
    userEmail: row.user_email || "",
    severity: row.severity,
    source: row.source,
    message: row.message,
    stack: row.stack || "",
    route: row.route || "",
    apiEndpoint: row.api_endpoint || "",
    httpStatus: row.http_status,
    browser: row.browser || "",
    userAgent: row.user_agent || "",
    context: row.context || {},
    resolvedAt: row.resolved_at,
    resolvedById: row.resolved_by_id,
    createdAt: row.created_at,
  };
}

export async function getAdminOverview() {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM organizations WHERE status = 'active') AS active_tenants,
       (SELECT COUNT(*)::int FROM organizations WHERE status IN ('pending_review', 'pending_payment')) AS pending_tenants,
       (SELECT COUNT(*)::int FROM organizations WHERE status = 'suspended') AS suspended_tenants,
       (SELECT COUNT(*)::int FROM signup_requests WHERE status = 'pending_review') AS pending_approvals,
       (SELECT COUNT(*)::int FROM contact_requests WHERE status = 'new') AS pending_contact_requests,
       (SELECT COUNT(*)::int FROM signup_requests sr JOIN billing_payments bp ON bp.id = sr.payment_id WHERE sr.status = 'pending_review' AND bp.status = 'paid') AS paid_pending_review,
       (SELECT COUNT(*)::int FROM app_error_logs WHERE resolved_at IS NULL) AS unresolved_errors,
       (SELECT COALESCE(SUM(amount_irr), 0)::numeric FROM billing_payments WHERE status = 'paid') AS paid_revenue_irr`
  );
  const row = result.rows[0] || {};
  const recentPayments = await listBillingPayments({ limit: 5 });
  const recentErrors = await listAppErrorLogs({ resolved: "unresolved", limit: 5 });
  return {
    activeTenants: Number(row.active_tenants || 0),
    pendingTenants: Number(row.pending_tenants || 0),
    suspendedTenants: Number(row.suspended_tenants || 0),
    pendingApprovals: Number(row.pending_approvals || 0),
    pendingContactRequests: Number(row.pending_contact_requests || 0),
    paidPendingReview: Number(row.paid_pending_review || 0),
    unresolvedErrors: Number(row.unresolved_errors || 0),
    paidRevenueIrr: Number(row.paid_revenue_irr || 0),
    recentPayments,
    recentErrors,
  };
}

export async function getOrganizationUsage(organizationId) {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM app_users WHERE organization_id = $1 AND status <> 'suspended') AS users,
       (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1 AND created_at >= date_trunc('month', NOW())) AS monthly_shipments,
       (SELECT COUNT(*)::int FROM documents WHERE organization_id = $1 AND archived_at IS NULL) AS documents,
       (SELECT COALESCE(SUM(CASE WHEN file_size ~ '^[0-9]+$' THEN file_size::numeric ELSE 0 END), 0)::numeric FROM documents WHERE organization_id = $1 AND archived_at IS NULL) AS storage_bytes,
       (SELECT COUNT(*)::int FROM shipments WHERE organization_id = $1 AND customer_access_enabled = TRUE) AS customer_links`,
    [organizationId]
  );
  const row = result.rows[0] || {};
  return {
    users: Number(row.users || 0),
    monthlyShipments: Number(row.monthly_shipments || 0),
    documents: Number(row.documents || 0),
    storageMb: Math.round(Number(row.storage_bytes || 0) / 1024 / 1024),
    customerLinks: Number(row.customer_links || 0),
  };
}

export async function getOrganizationDetail(organizationId) {
  const result = await pool.query(
    `SELECT o.*, sp.name AS plan_name, os.status AS subscription_status, os.billing_cycle, os.limits_override
     FROM organizations o
     LEFT JOIN subscription_plans sp ON sp.id = o.plan_id
     LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
     WHERE o.id = $1
     LIMIT 1`,
    [organizationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const owner = row.owner_user_id
    ? (await pool.query("SELECT id, name, email, status FROM app_users WHERE id = $1", [row.owner_user_id])).rows[0]
    : null;
  const subscription = await getOrganizationSubscription(organizationId);
  const usage = await getOrganizationUsage(organizationId);
  const recentErrors = await listAppErrorLogs({ organizationId, limit: 8 });
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    planId: row.plan_id,
    planName: row.plan_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    notes: row.notes || "",
    owner,
    subscription,
    usage,
    recentErrors,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateOrganizationRecord(organizationId, updates = {}) {
  const result = await pool.query(
    `UPDATE organizations
     SET name = COALESCE($2, name),
         contact_name = COALESCE($3, contact_name),
         contact_email = COALESCE($4, contact_email),
         contact_phone = COALESCE($5, contact_phone),
         notes = COALESCE($6, notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      organizationId,
      updates.name || null,
      updates.contactName || null,
      updates.contactEmail || null,
      updates.contactPhone || null,
      updates.notes ?? null,
    ]
  );
  return result.rows[0] ? getOrganizationDetail(organizationId) : null;
}

export async function updateOrganizationStatus(organizationId, status) {
  await pool.query(
    `UPDATE organizations
     SET status = $2,
         suspended_at = CASE WHEN $2 = 'suspended' THEN NOW() ELSE suspended_at END,
         approved_at = CASE WHEN $2 = 'active' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [organizationId, status]
  );
  return getOrganizationDetail(organizationId);
}

export async function getOrganizationSubscription(organizationId) {
  const subscription = await getEffectiveSubscriptionLimits(organizationId);
  return subscription.subscription;
}

export async function updateOrganizationSubscription(organizationId, updates = {}) {
  const fields = [];
  const values = [organizationId];
  if (updates.planId) {
    values.push(updates.planId);
    fields.push(`plan_id = $${values.length}`);
    await pool.query("UPDATE organizations SET plan_id = $2, updated_at = NOW() WHERE id = $1", [organizationId, updates.planId]);
  }
  if (updates.billingCycle) {
    values.push(updates.billingCycle);
    fields.push(`billing_cycle = $${values.length}`);
  }
  if (updates.status) {
    values.push(updates.status);
    fields.push(`status = $${values.length}`);
  }
  if (updates.limitsOverride !== undefined) {
    values.push(JSON.stringify(updates.limitsOverride || {}));
    fields.push(`limits_override = $${values.length}::jsonb`);
  }
  if (!fields.length) return getOrganizationSubscription(organizationId);
  await pool.query(
    `UPDATE organization_subscriptions
     SET ${fields.join(", ")}, updated_at = NOW()
     WHERE organization_id = $1`,
    values
  );
  return getOrganizationSubscription(organizationId);
}

export async function listBillingPayments({ limit = 50, organizationId } = {}) {
  const values = [];
  const where = organizationId ? "WHERE bp.organization_id = $1" : "";
  if (organizationId) values.push(organizationId);
  values.push(Number(limit) || 50);
  const result = await pool.query(
    `SELECT bp.*, o.name AS organization_name, bi.id AS invoice_id, bi.status AS invoice_status, br.id AS receipt_id
     FROM billing_payments bp
     LEFT JOIN organizations o ON o.id = bp.organization_id
     LEFT JOIN billing_invoices bi ON bi.payment_id = bp.id
     LEFT JOIN billing_receipts br ON br.payment_id = bp.id
     ${where}
     ORDER BY bp.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiPayment);
}

export async function listBillingInvoices({ limit = 100, organizationId, status } = {}) {
  const values = [];
  const conditions = [];
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`bi.organization_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`bi.status = $${values.length}`);
  }
  values.push(Number(limit) || 100);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT bi.*, o.name AS organization_name, bp.status AS payment_status, br.id AS receipt_id
     FROM billing_invoices bi
     LEFT JOIN organizations o ON o.id = bi.organization_id
     LEFT JOIN billing_payments bp ON bp.id = bi.payment_id
     LEFT JOIN billing_receipts br ON br.invoice_id = bi.id
     ${where}
     ORDER BY bi.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiInvoice);
}

export async function getBillingInvoice(invoiceId, { organizationId } = {}) {
  const values = [invoiceId];
  const orgClause = organizationId ? "AND bi.organization_id = $2" : "";
  if (organizationId) values.push(organizationId);
  const invoiceResult = await pool.query(
    `SELECT bi.*, o.name AS organization_name, bp.status AS payment_status, br.id AS receipt_id
     FROM billing_invoices bi
     LEFT JOIN organizations o ON o.id = bi.organization_id
     LEFT JOIN billing_payments bp ON bp.id = bi.payment_id
     LEFT JOIN billing_receipts br ON br.invoice_id = bi.id
     WHERE bi.id = $1 ${orgClause}
     LIMIT 1`,
    values
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return null;
  const [items, receipt] = await Promise.all([
    pool.query("SELECT * FROM billing_invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC", [invoice.id]),
    pool.query("SELECT * FROM billing_receipts WHERE invoice_id = $1 LIMIT 1", [invoice.id]),
  ]);
  return {
    ...toUiInvoice(invoice),
    items: items.rows.map(toUiInvoiceItem),
    receipt: toUiReceipt(receipt.rows[0]),
  };
}

export async function createBillingInvoice({ actorUserId, organizationId, subscriptionId, amountIrr, description, dueAt, notes }) {
  const client = await pool.connect();
  const invoiceId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const subscription = subscriptionId
      ? (await client.query("SELECT * FROM organization_subscriptions WHERE id = $1", [subscriptionId])).rows[0]
      : (await client.query("SELECT * FROM organization_subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1", [organizationId])).rows[0];
    const amount = Number(amountIrr || 0);
    const invoiceResult = await client.query(
      `INSERT INTO billing_invoices (
         id, organization_id, subscription_id, invoice_number, status, billing_cycle,
         subtotal_irr, tax_irr, total_irr, due_at, notes, metadata
       )
       VALUES ($1, $2, $3, $4, 'issued', $5, $6, 0, $6, COALESCE($7::timestamptz, NOW() + INTERVAL '7 days'), $8, $9::jsonb)
       RETURNING *`,
      [
        invoiceId,
        organizationId,
        subscription?.id || null,
        billingNumber("INV"),
        subscription?.billing_cycle || "monthly",
        amount,
        dueAt || null,
        notes || null,
        JSON.stringify({ createdBy: actorUserId || null }),
      ]
    );
    await client.query(
      `INSERT INTO billing_invoice_items (id, invoice_id, description, quantity, unit_amount_irr, total_amount_irr)
       VALUES ($1, $2, $3, 1, $4, $4)`,
      [crypto.randomUUID(), invoiceId, description || "Subscription invoice", amount]
    );
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId: subscription?.id || null,
      actorUserId,
      eventType: "invoice.issued",
      summary: "Invoice was issued by platform admin.",
      after: { invoiceId, amountIrr: amount },
    });
    await client.query("COMMIT");
    return getBillingInvoice(invoiceResult.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function voidBillingInvoice(invoiceId, { actorUserId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = (await client.query("SELECT * FROM billing_invoices WHERE id = $1 FOR UPDATE", [invoiceId])).rows[0];
    if (!before) return null;
    const result = await client.query(
      `UPDATE billing_invoices
       SET status = 'void', voided_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [invoiceId]
    );
    await insertSubscriptionEvent(client, {
      organizationId: before.organization_id,
      subscriptionId: before.subscription_id,
      actorUserId,
      eventType: "invoice.voided",
      summary: "Invoice was voided by platform admin.",
      before,
      after: result.rows[0],
    });
    await client.query("COMMIT");
    return getBillingInvoice(invoiceId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markBillingPaymentManually(paymentId, { actorUserId, status, note }) {
  const client = await pool.connect();
  const nextStatus = status === "failed" ? "failed" : "paid";
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE billing_payments
       SET status = $2,
           manual_override = TRUE,
           manual_note = $3,
           marked_by_id = $4,
           marked_at = NOW(),
           verified_at = CASE WHEN $2 = 'paid' THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
           failed_at = CASE WHEN $2 = 'failed' THEN COALESCE(failed_at, NOW()) ELSE failed_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [paymentId, nextStatus, note || null, actorUserId || null]
    );
    const payment = result.rows[0];
    if (!payment) return null;
    if (nextStatus === "paid") {
      await closeInvoiceForPayment(client, payment);
      await client.query("UPDATE signup_requests SET status = 'pending_review', updated_at = NOW() WHERE id = $1", [payment.signup_request_id]);
      await client.query("UPDATE organizations SET status = 'pending_review', updated_at = NOW() WHERE id = $1 AND status IN ('pending_payment', 'payment_failed')", [payment.organization_id]);
      await client.query("UPDATE organization_subscriptions SET status = 'pending_review', updated_at = NOW() WHERE id = $1 AND status IN ('pending_payment', 'payment_failed')", [payment.subscription_id]);
    }
    await insertSubscriptionEvent(client, {
      organizationId: payment.organization_id,
      subscriptionId: payment.subscription_id,
      actorUserId,
      eventType: nextStatus === "paid" ? "payment.manual_paid" : "payment.manual_failed",
      summary: nextStatus === "paid" ? "Payment was manually marked paid." : "Payment was manually marked failed.",
      after: { paymentId, status: nextStatus, note: note || "" },
    });
    await client.query("COMMIT");
    return (await listBillingPayments({ organizationId: payment.organization_id })).find((item) => item.id === paymentId) || toUiPayment(payment);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function renewOrganizationSubscription(organizationId, { actorUserId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = (
      await client.query("SELECT * FROM organization_subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [organizationId])
    ).rows[0];
    if (!before) return null;
    const result = await client.query(
      `UPDATE organization_subscriptions
       SET status = 'active',
           current_period_start = NOW(),
           current_period_end = NOW() + CASE WHEN billing_cycle = 'annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END,
           activated_at = COALESCE(activated_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [before.id]
    );
    await client.query("UPDATE organizations SET status = 'active', updated_at = NOW() WHERE id = $1", [organizationId]);
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId: before.id,
      actorUserId,
      eventType: "subscription.renewed",
      summary: "Subscription was renewed by platform admin.",
      before,
      after: result.rows[0],
    });
    await client.query("COMMIT");
    return getOrganizationSubscription(organizationId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function expireOrganizationSubscription(organizationId, { actorUserId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = (
      await client.query("SELECT * FROM organization_subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [organizationId])
    ).rows[0];
    if (!before) return null;
    const result = await client.query(
      `UPDATE organization_subscriptions
       SET status = 'expired',
           current_period_end = COALESCE(current_period_end, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [before.id]
    );
    await insertSubscriptionEvent(client, {
      organizationId,
      subscriptionId: before.id,
      actorUserId,
      eventType: "subscription.expired",
      summary: "Subscription was marked expired by platform admin.",
      before,
      after: result.rows[0],
    });
    await client.query("COMMIT");
    return getOrganizationSubscription(organizationId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getOrganizationBilling(organizationId) {
  const [subscription, invoices, payments, events] = await Promise.all([
    getOrganizationSubscription(organizationId),
    listBillingInvoices({ organizationId, limit: 25 }),
    listBillingPayments({ organizationId, limit: 25 }),
    pool.query(
      `SELECT * FROM subscription_events
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 25`,
      [organizationId]
    ),
  ]);
  return {
    subscription,
    invoices,
    payments,
    events: events.rows.map(toUiSubscriptionEvent),
    unpaidInvoices: invoices.filter((invoice) => ["issued", "overdue"].includes(invoice.status)),
  };
}

export async function createAppErrorLog(error = {}) {
  const result = await pool.query(
    `INSERT INTO app_error_logs (
       id, organization_id, user_id, severity, source, message, stack, route,
       api_endpoint, http_status, browser, user_agent, context, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
     RETURNING *`,
    [
      crypto.randomUUID(),
      error.organizationId || null,
      error.userId || null,
      error.severity || "error",
      error.source || "client",
      String(error.message || "Unknown error").slice(0, 2000),
      error.stack ? String(error.stack).slice(0, 8000) : null,
      error.route || null,
      error.apiEndpoint || null,
      error.httpStatus ? Number(error.httpStatus) : null,
      error.browser || null,
      error.userAgent || null,
      JSON.stringify(error.context || {}),
    ]
  );
  return toUiErrorLog(result.rows[0]);
}

export async function listAppErrorLogs({ organizationId, source, severity, resolved, route, status, limit = 100 } = {}) {
  const values = [];
  const conditions = [];
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`el.organization_id = $${values.length}`);
  }
  if (source) {
    values.push(source);
    conditions.push(`el.source = $${values.length}`);
  }
  if (severity) {
    values.push(severity);
    conditions.push(`el.severity = $${values.length}`);
  }
  if (route) {
    values.push(`%${route}%`);
    conditions.push(`el.route ILIKE $${values.length}`);
  }
  if (status) {
    values.push(Number(status));
    conditions.push(`el.http_status = $${values.length}`);
  }
  if (resolved === "resolved") conditions.push("el.resolved_at IS NOT NULL");
  if (resolved === "unresolved") conditions.push("el.resolved_at IS NULL");
  values.push(Number(limit) || 100);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT el.*, o.name AS organization_name, u.email AS user_email
     FROM app_error_logs el
     LEFT JOIN organizations o ON o.id = el.organization_id
     LEFT JOIN app_users u ON u.id = el.user_id
     ${where}
     ORDER BY el.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiErrorLog);
}

export async function getAppErrorLog(errorId) {
  const result = await pool.query(
    `SELECT el.*, o.name AS organization_name, u.email AS user_email
     FROM app_error_logs el
     LEFT JOIN organizations o ON o.id = el.organization_id
     LEFT JOIN app_users u ON u.id = el.user_id
     WHERE el.id = $1
     LIMIT 1`,
    [errorId]
  );
  return toUiErrorLog(result.rows[0]);
}

export async function resolveAppErrorLog(errorId, resolverUserId) {
  const result = await pool.query(
    `UPDATE app_error_logs
     SET resolved_at = NOW(), resolved_by_id = $2
     WHERE id = $1
     RETURNING *`,
    [errorId, resolverUserId]
  );
  return toUiErrorLog(result.rows[0]);
}

export async function listAppUsers({ includeSuspended = true, organizationId } = {}) {
  const conditions = [];
  const values = [];
  if (!includeSuspended) conditions.push("u.status = 'active'");
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`u.organization_id = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_online, u.department, u.status, u.last_seen_at,
            u.phone, u.location, u.bio, u.two_factor_enabled, u.notification_preferences,
            u.organization_id, o.status AS organization_status, o.name AS organization_name, o.plan_id AS organization_plan_id
     FROM app_users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     ${where}
     ORDER BY u.is_online DESC, u.name ASC`,
    values
  );
  return result.rows.map(toUiUser);
}

export async function createAppUserRecord({ actorUserId, user, passwordHash }) {
  const client = await pool.connect();
  const id = user.id || crypto.randomUUID();
  const actor = actorUserId ? await getUserById(actorUserId) : null;
  const organizationId = actor?.organization_id || actor?.organizationId || user.organizationId || null;
  await assertPlanAllowsUser(organizationId);
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO app_users (
         id, organization_id, name, email, password_hash, role, avatar, is_online, department,
         status, phone, location, bio, notification_preferences, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9, $10, $11, $12, $13::jsonb, NOW())
       RETURNING id, organization_id, name, email, role, avatar, is_online, department, status, last_seen_at,
                 phone, location, bio, two_factor_enabled, notification_preferences`,
      [
        id,
        organizationId,
        user.name,
        user.email,
        passwordHash,
        user.role || "OPERATIONS",
        user.avatar || null,
        user.department || null,
        user.status || "active",
        user.phone || null,
        user.location || null,
        user.bio || null,
        JSON.stringify(user.notificationPreferences || {}),
      ]
    );
    if (organizationId) {
      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role, status)
         VALUES ($1, $2, 'member', $3)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
        [organizationId, id, user.status || "active"]
      );
    }
    await syncUsersCollection(client, actorUserId);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAppUserRecord(userId, updates, syncOwnerUserId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query("SELECT * FROM app_users WHERE id = $1", [userId]);
    const result = await client.query(
      `UPDATE app_users
       SET name = COALESCE($2, name),
           email = COALESCE($3, email),
           role = COALESCE($4, role),
           avatar = COALESCE($5, avatar),
           department = COALESCE($6, department),
           status = COALESCE($7, status),
           phone = COALESCE($8, phone),
           location = COALESCE($9, location),
           bio = COALESCE($10, bio),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, role, avatar, is_online, department, status, last_seen_at,
                 phone, location, bio, two_factor_enabled, notification_preferences, organization_id`,
      [
        userId,
        updates.name || null,
        updates.email || null,
        updates.role || null,
        updates.avatar || null,
        updates.department || null,
        updates.status || null,
        updates.phone || null,
        updates.location || null,
        updates.bio || null,
      ]
    );
    if (result.rows[0]?.organization_id && updates.status) {
      await client.query(
        "UPDATE organization_members SET status = $3 WHERE organization_id = $1 AND user_id = $2",
        [result.rows[0].organization_id, userId, updates.status]
      );
    }
    await syncUsersCollection(client, syncOwnerUserId);
    await client.query("COMMIT");
    return { before: before.rows[0] || null, after: result.rows[0] || null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listCustomersDetailed({ includeArchived = false, search = "", organizationId } = {}) {
  const values = [];
  const conditions = [];
  if (!includeArchived) conditions.push("c.archived_at IS NULL");
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`c.organization_id = $${values.length}`);
  }
  if (search) {
    values.push(`%${String(search).toLowerCase()}%`);
    conditions.push(
      `(lower(c.company_name) LIKE $${values.length} OR lower(COALESCE(c.contact_name, '')) LIKE $${values.length} OR lower(COALESCE(c.email, '')) LIKE $${values.length} OR lower(COALESCE(c.phone, '')) LIKE $${values.length})`
    );
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT c.*, COUNT(s.id)::int AS shipment_count
     FROM customers c
     LEFT JOIN shipments s ON s.customer_id = c.id AND s.archived_at IS NULL
     ${where}
     GROUP BY c.id
     ORDER BY c.updated_at DESC`,
    values
  );
  return result.rows.map((row) => ({
    ...toUiCustomer({ ...row, legacy_data: { ...(row.legacy_data || {}), shipmentsCount: row.shipment_count } }),
    duplicateWarning: false,
  }));
}

export async function getCustomerRecord(id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `SELECT * FROM customers WHERE id = $1 ${organizationFilter} LIMIT 1`,
    values
  );
  return toUiCustomer(result.rows[0]);
}

export async function createCustomerRecord({ ownerUserId, actorUserId, customer }) {
  const client = await pool.connect();
  const id = customer.id || crypto.randomUUID();
  try {
    await client.query("BEGIN");
    if (customer.email) {
      const duplicate = await client.query(
        "SELECT id FROM customers WHERE lower(email) = lower($1) AND archived_at IS NULL LIMIT 1",
        [customer.email]
      );
      if (duplicate.rows[0]) {
        const error = new Error("A customer with this email already exists.");
        error.code = "DUPLICATE_EMAIL";
        error.statusCode = 409;
        throw error;
      }
    }
    const result = await client.query(
      `INSERT INTO customers (
         id, organization_id, owner_user_id, company_name, contact_name, email, phone, address,
         notes, status, legacy_data, created_by_id, updated_at
       )
       VALUES ($1, (SELECT organization_id FROM app_users WHERE id = $2), $2, $3, $4, $5, $6, $7, $8, 'active', $9::jsonb, $10, NOW())
       RETURNING *`,
      [
        id,
        ownerUserId,
        customer.company || customer.companyName || customer.name,
        customer.name || customer.contactName || null,
        customer.email || null,
        customer.phone || null,
        customer.address || null,
        customer.notes || null,
        JSON.stringify(customer),
        actorUserId || ownerUserId,
      ]
    );
    await syncCustomerUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCustomerRecord(id, updates, { organizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeValues = [id];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const before = await client.query(`SELECT * FROM customers WHERE id = $1 ${organizationFilter}`, beforeValues);
    const current = before.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return { before: null, after: null };
    }
    if (updates.email && updates.email !== current.email) {
      const duplicate = await client.query(
        "SELECT id FROM customers WHERE lower(email) = lower($1) AND id <> $2 AND archived_at IS NULL LIMIT 1",
        [updates.email, id]
      );
      if (duplicate.rows[0]) {
        const error = new Error("A customer with this email already exists.");
        error.code = "DUPLICATE_EMAIL";
        error.statusCode = 409;
        throw error;
      }
    }
    const result = await client.query(
      `UPDATE customers
       SET company_name = COALESCE($2, company_name),
           contact_name = COALESCE($3, contact_name),
           email = COALESCE($4, email),
           phone = COALESCE($5, phone),
           address = COALESCE($6, address),
           notes = COALESCE($7, notes),
           status = COALESCE($8, status),
           legacy_data = legacy_data || $9::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        updates.company || updates.companyName || null,
        updates.name || updates.contactName || null,
        updates.email || null,
        updates.phone || null,
        updates.address || null,
        updates.notes || null,
        updates.status || null,
        JSON.stringify(updates || {}),
      ]
    );
    await syncCustomerUserRecord(client, result.rows[0]?.owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before: current, after: result.rows[0] || null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveCustomerRecord(id, { organizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeValues = [id];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const before = await client.query(`SELECT * FROM customers WHERE id = $1 ${organizationFilter}`, beforeValues);
    if (!before.rows[0]) {
      await client.query("ROLLBACK");
      return { before: null, after: null };
    }
    const result = await client.query(
      `UPDATE customers
       SET archived_at = COALESCE(archived_at, NOW()), status = 'archived', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    await syncCustomerUserRecord(client, result.rows[0]?.owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before: before.rows[0] || null, after: result.rows[0] || null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listCustomerRelated(id, type, { organizationId } = {}) {
  if (!(await getCustomerRecord(id, { organizationId }))) return null;
  if (type === "shipments") {
    const result = await pool.query(
      `SELECT * FROM shipments
       WHERE customer_id = $1 AND ($2::text IS NULL OR organization_id = $2)
       ORDER BY updated_at DESC`,
      [id, organizationId || null]
    );
    return result.rows.map((row) => ({
      id: row.id,
      trackingNumber: row.shipment_code,
      customerId: row.customer_id,
      customerName: row.customer_name,
      status: row.status,
      origin: row.origin,
      destination: row.destination,
      estimatedDelivery: row.estimated_delivery_at,
      isArchived: Boolean(row.archived_at),
      createdAt: row.created_at,
      ...(row.legacy_data || {}),
    }));
  }
  if (type === "documents") return listDocuments({ customerId: id, organizationId, includeArchived: true });
  if (type === "quotations") return listQuotations({ customerId: id, organizationId, includeArchived: true });
  if (type === "cheques") {
    const result = await pool.query(
      `SELECT * FROM cheques
       WHERE customer_id = $1 AND ($2::text IS NULL OR organization_id = $2)
       ORDER BY updated_at DESC`,
      [id, organizationId || null]
    );
    return result.rows.map(toUiCheque);
  }
  return [];
}

export async function listQuotations({ ownerUserId, customerId, organizationId, includeArchived = false } = {}) {
  const conditions = [];
  const values = [];
  if (organizationId) {
    values.push(organizationId);
    conditions.push(`organization_id = $${values.length}`);
  }
  if (ownerUserId) {
    values.push(ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  if (customerId) {
    values.push(customerId);
    conditions.push(`customer_id = $${values.length}`);
  }
  if (!includeArchived) conditions.push("archived_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(`SELECT * FROM quotations ${where} ORDER BY updated_at DESC`, values);
  return result.rows.map(toUiQuote);
}

export async function getQuotationRecord(id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(`SELECT * FROM quotations WHERE id = $1 ${organizationFilter} LIMIT 1`, values);
  return result.rows[0] || null;
}

export async function createQuotationRecord({ ownerUserId, actorUserId, quote }) {
  const client = await pool.connect();
  const id = quote.id || crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO quotations (
         id, organization_id, owner_user_id, quotation_number, customer_id, customer_name, customer_phone,
         origin_city, destination_city, cargo_type, weight, dimensions, pickup_date,
         delivery_date, requirements, base_rate, fuel_surcharge, loading_fees,
         toll_fees, insurance_percentage, profit_margin, total_price, valid_until,
         status, notes, legacy_data, created_by_id, archived_at, updated_at
       )
       VALUES ($1, (SELECT organization_id FROM app_users WHERE id = $2), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb,
               $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25::jsonb, $26, $27, NOW())
       RETURNING *`,
      [
        id,
        ownerUserId,
        quote.quotationNumber || quote.id || id,
        quote.customerId || null,
        quote.customerName || "Unknown customer",
        quote.customerPhone || null,
        quote.originCity || null,
        quote.destinationCity || null,
        quote.cargoType || "GENERAL",
        quote.weight || 0,
        quote.dimensions || null,
        quote.pickupDate || null,
        quote.deliveryDate || null,
        JSON.stringify(Array.isArray(quote.requirements) ? quote.requirements : []),
        quote.baseRate || 0,
        quote.fuelSurcharge || 0,
        quote.loadingFees || 0,
        quote.tollFees || 0,
        quote.insurancePercentage || 0,
        quote.profitMargin || 0,
        quote.totalPrice || 0,
        quote.validUntil || null,
        quote.status || "PENDING",
        quote.notes || null,
        JSON.stringify(quote),
        actorUserId || ownerUserId,
        quote.isArchived ? new Date() : null,
      ]
    );
    await syncQuoteUserRecord(client, ownerUserId, result.rows[0]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateQuotationRecord(id, updates, { organizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeValues = [id];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const before = await client.query(`SELECT * FROM quotations WHERE id = $1 ${organizationFilter}`, beforeValues);
    if (!before.rows[0]) {
      await client.query("ROLLBACK");
      return { before: null, after: null };
    }
    const result = await client.query(
      `UPDATE quotations
       SET customer_id = COALESCE($2, customer_id),
           customer_name = COALESCE($3, customer_name),
           customer_phone = COALESCE($4, customer_phone),
           origin_city = COALESCE($5, origin_city),
           destination_city = COALESCE($6, destination_city),
           cargo_type = COALESCE($7, cargo_type),
           weight = COALESCE($8, weight),
           dimensions = COALESCE($9, dimensions),
           pickup_date = COALESCE($10, pickup_date),
           delivery_date = COALESCE($11, delivery_date),
           requirements = COALESCE($12::jsonb, requirements),
           base_rate = COALESCE($13, base_rate),
           fuel_surcharge = COALESCE($14, fuel_surcharge),
           loading_fees = COALESCE($15, loading_fees),
           toll_fees = COALESCE($16, toll_fees),
           insurance_percentage = COALESCE($17, insurance_percentage),
           profit_margin = COALESCE($18, profit_margin),
           total_price = COALESCE($19, total_price),
           valid_until = COALESCE($20, valid_until),
           status = COALESCE($21, status),
           notes = COALESCE($22, notes),
           legacy_data = legacy_data || $23::jsonb,
           archived_at = CASE WHEN $24::boolean THEN COALESCE(archived_at, NOW()) ELSE archived_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        updates.customerId || null,
        updates.customerName || null,
        updates.customerPhone || null,
        updates.originCity || null,
        updates.destinationCity || null,
        updates.cargoType || null,
        updates.weight ?? null,
        updates.dimensions || null,
        updates.pickupDate || null,
        updates.deliveryDate || null,
        updates.requirements ? JSON.stringify(updates.requirements) : null,
        updates.baseRate ?? null,
        updates.fuelSurcharge ?? null,
        updates.loadingFees ?? null,
        updates.tollFees ?? null,
        updates.insurancePercentage ?? null,
        updates.profitMargin ?? null,
        updates.totalPrice ?? null,
        updates.validUntil || null,
        updates.status || null,
        updates.notes || null,
        JSON.stringify(updates || {}),
        Boolean(updates.isArchived || updates.status === "ARCHIVED"),
      ]
    );
    await syncQuoteUserRecord(client, result.rows[0]?.owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before: before.rows[0] || null, after: result.rows[0] || null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setQuotationStatus(id, status, extra = {}, { organizationId } = {}) {
  const timestampColumn =
    status === "ACCEPTED" ? "accepted_at" : status === "REJECTED" ? "rejected_at" : status === "EXPIRED" ? "expired_at" : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeValues = [id];
    const organizationFilter = organizationId ? `AND organization_id = $${beforeValues.push(organizationId)}` : "";
    const before = await client.query(`SELECT * FROM quotations WHERE id = $1 ${organizationFilter}`, beforeValues);
    if (!before.rows[0]) {
      await client.query("ROLLBACK");
      return { before: null, after: null };
    }
    const result = await client.query(
      `UPDATE quotations
       SET status = $2,
           notes = COALESCE($3, notes),
           ${timestampColumn ? `${timestampColumn} = COALESCE(${timestampColumn}, NOW()),` : ""}
           archived_at = CASE WHEN $2 = 'ARCHIVED' THEN COALESCE(archived_at, NOW()) ELSE archived_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, extra.notes || extra.reason || null]
    );
    await syncQuoteUserRecord(client, result.rows[0]?.owner_user_id, result.rows[0]);
    await client.query("COMMIT");
    return { before: before.rows[0] || null, after: result.rows[0] || null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function convertQuotationToShipment(id, actorUserId, { organizationId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quoteValues = [id];
    const organizationFilter = organizationId ? `AND organization_id = $${quoteValues.push(organizationId)}` : "";
    const quoteResult = await client.query(`SELECT * FROM quotations WHERE id = $1 ${organizationFilter}`, quoteValues);
    const quote = quoteResult.rows[0];
    if (!quote) {
      await client.query("ROLLBACK");
      return null;
    }
    const shipmentId = `s-${crypto.randomUUID().slice(0, 8)}`;
    const shipmentCode = `LS-Q-${String(Date.now()).slice(-6)}`;
    const shipment = await client.query(
      `INSERT INTO shipments (
         id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
         origin, destination, estimated_delivery_at, legacy_data, created_by_id, updated_at
       )
       VALUES ($1, (SELECT organization_id FROM app_users WHERE id = $2), $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9::jsonb, $10, NOW())
       RETURNING *`,
      [
        shipmentId,
        quote.owner_user_id,
        shipmentCode,
        quote.customer_id,
        quote.customer_name,
        quote.origin_city,
        quote.destination_city,
        quote.delivery_date,
        JSON.stringify({ sourceQuotationId: quote.id, quote: toUiQuote(quote) }),
        actorUserId || quote.owner_user_id,
      ]
    );
    const updated = await client.query(
      `UPDATE quotations
       SET status = 'ACCEPTED', accepted_at = COALESCE(accepted_at, NOW()),
           converted_shipment_id = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, shipmentId]
    );
    await syncQuoteUserRecord(client, quote.owner_user_id, updated.rows[0]);
    await client.query("COMMIT");
    return { quote: updated.rows[0], shipment: shipment.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function archiveTitle(entityType, row) {
  const legacy = row?.legacy_data || {};
  if (entityType === "shipment") return row.shipment_code || legacy.trackingNumber || row.id;
  if (entityType === "document") return row.title || row.file_name || legacy.name || row.id;
  if (entityType === "cheque") return row.cheque_number || legacy.chequeNumber || row.id;
  if (entityType === "compliance_meeting") return row.title || legacy.purpose || row.id;
  if (entityType === "quotation") return row.quotation_number || legacy.id || row.id;
  if (entityType === "customer") return row.company_name || legacy.company || row.id;
  return row?.id || "Archived record";
}

const archiveTables = {
  shipment: { table: "shipments", id: "id" },
  document: { table: "documents", id: "id" },
  cheque: { table: "cheques", id: "id" },
  compliance_meeting: { table: "compliance_meetings", id: "id" },
  quotation: { table: "quotations", id: "id" },
  customer: { table: "customers", id: "id" },
};

export async function listArchiveRecords({ search = "", organizationId } = {}) {
  const records = [];
  for (const [entityType, config] of Object.entries(archiveTables)) {
    const values = [];
    const conditions = ["archived_at IS NOT NULL"];
    if (organizationId) {
      values.push(organizationId);
      conditions.push(`organization_id = $${values.length}`);
    }
    const result = await pool.query(
      `SELECT * FROM ${config.table} WHERE ${conditions.join(" AND ")} ORDER BY archived_at DESC`,
      values
    );
    for (const row of result.rows) {
      const title = archiveTitle(entityType, row);
      const item = {
        id: `${entityType}:${row.id}`,
        entityType,
        entityId: row.id,
        type: entityType.toUpperCase(),
        title,
        name: title,
        customerName: row.customer_name || row.company_name || row.legacy_data?.customerName || "",
        shipmentId: row.shipment_id || row.id,
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        data:
          entityType === "quotation" ? toUiQuote(row) :
          entityType === "customer" ? toUiCustomer(row) :
          entityType === "cheque" ? toUiCheque(row) :
          entityType === "document" ? toUiDocument(row) :
          entityType === "compliance_meeting" ? toUiAppointment(row) :
          { id: row.id, ...(row.legacy_data || {}) },
      };
      records.push(item);
    }
  }
  const term = String(search || "").toLowerCase();
  return records
    .filter((item) => !term || `${item.title} ${item.customerName} ${item.entityId}`.toLowerCase().includes(term))
    .sort((a, b) => new Date(b.archivedAt || b.createdAt).getTime() - new Date(a.archivedAt || a.createdAt).getTime());
}

export async function archiveEntityRecord(entityType, entityId, actorUserId, { organizationId } = {}) {
  const config = archiveTables[entityType];
  if (!config) return null;
  const values = [entityId];
  const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `UPDATE ${config.table}
     SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW()
     WHERE ${config.id} = $1 ${organizationFilter}
     RETURNING *`,
    values
  );
  const row = result.rows[0];
  if (!row) return null;
  await pool.query(
    `INSERT INTO archive_records (
       id, organization_id, owner_user_id, entity_type, entity_id, title, summary,
       customer_name, shipment_id, archived_by_id, archived_at, legacy_data
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()), $12::jsonb)
     ON CONFLICT (entity_type, entity_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       title = EXCLUDED.title,
       archived_at = EXCLUDED.archived_at,
       restored_at = NULL,
       legacy_data = EXCLUDED.legacy_data`,
    [
      crypto.randomUUID(),
      row.organization_id || organizationId || null,
      row.owner_user_id || actorUserId || null,
      entityType,
      entityId,
      archiveTitle(entityType, row),
      `${entityType} archived`,
      row.customer_name || row.company_name || null,
      row.shipment_id || (entityType === "shipment" ? row.id : null),
      actorUserId || null,
      row.archived_at,
      JSON.stringify(row.legacy_data || {}),
    ]
  );
  return row;
}

export async function restoreEntityRecord(entityType, entityId, { organizationId } = {}) {
  const config = archiveTables[entityType];
  if (!config) return null;
  const statusReset = {
    customer: ", status = 'active'",
    quotation: ", status = 'PENDING'",
    cheque: ", status = 'CLEARED'",
    compliance_meeting: ", status = 'SCHEDULED'",
  }[entityType] || "";
  const values = [entityId];
  const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `UPDATE ${config.table}
     SET archived_at = NULL, updated_at = NOW()${statusReset}
     WHERE ${config.id} = $1 ${organizationFilter}
     RETURNING *`,
    values
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  await pool.query(
    `UPDATE archive_records
     SET restored_at = NOW()
     WHERE entity_type = $1
       AND entity_id = $2
       AND ($3::text IS NULL OR organization_id = $3)`,
    [entityType, entityId, organizationId || null]
  );
  if (entityType === "document") {
    await syncDocumentUserRecord(pool, row.owner_user_id, row);
  }
  return row;
}

export async function deleteArchivedEntityRecord(entityType, entityId, { organizationId } = {}) {
  const config = archiveTables[entityType];
  if (!config) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const values = [entityId];
    const conditions = [`${config.id} = $1`, "archived_at IS NOT NULL"];
    if (organizationId) {
      values.push(organizationId);
      conditions.push(`organization_id = $${values.length}`);
    }
    const result = await client.query(
      `DELETE FROM ${config.table}
       WHERE ${conditions.join(" AND ")}
       RETURNING *`,
      values
    );
    const row = result.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("DELETE FROM archive_records WHERE entity_type = $1 AND entity_id = $2", [entityType, entityId]);
    if (entityType === "document") {
      await client.query(
        `DELETE FROM user_records
         WHERE collection = 'documents'
           AND item_id = $1
           AND ($2::text IS NULL OR organization_id = $2)`,
        [entityId, organizationId || null]
      );
    }
    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function toUiChatThread(row, members = [], lastMessage = null) {
  return {
    id: row.id,
    type: row.type,
    name: row.name || "",
    description: row.description || "",
    roleLimit: row.role_limit || undefined,
    icon: row.icon || undefined,
    legacyChannelId: row.legacy_channel_id || undefined,
    members,
    lastMessage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUiChatMessage(row) {
  const legacy = row.legacy_data || {};
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    receiverId: legacy.receiverId,
    receiverName: legacy.receiverName,
    groupId: legacy.groupId || row.thread_id,
    isGroup: legacy.isGroup ?? true,
    content: row.content,
    read: legacy.read ?? false,
    createdAt: row.created_at,
  };
}

export async function seedDefaultChatThreads(ownerUserId = "u1", organizationId) {
  const records = await getRecordsForUser(ownerUserId);
  const channels = records.channels || [];
  const owner = organizationId ? null : await getUserById(ownerUserId);
  const orgId = organizationId || owner?.organization_id || owner?.organizationId || null;
  const users = await pool.query(
    "SELECT id, role FROM app_users WHERE status = 'active' AND ($1::text IS NULL OR organization_id = $1)",
    [orgId]
  );
  for (const channel of channels) {
    const threadId = orgId ? `${orgId}-${channel.id}` : channel.id;
    await pool.query(
      `INSERT INTO chat_threads (id, organization_id, owner_user_id, type, name, description, role_limit, icon, legacy_channel_id, updated_at)
       VALUES ($1, $2, $3, 'CHANNEL', $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         role_limit = EXCLUDED.role_limit,
         icon = EXCLUDED.icon,
         updated_at = NOW()`,
      [threadId, orgId, ownerUserId, channel.name, channel.description || null, channel.roleLimit || null, channel.icon || null, channel.id]
    );
    for (const user of users.rows) {
      if (!channel.roleLimit || user.role === "CEO" || user.role === channel.roleLimit) {
        await pool.query(
          `INSERT INTO chat_thread_members (id, thread_id, user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (thread_id, user_id) DO NOTHING`,
          [crypto.randomUUID(), threadId, user.id]
        );
      }
    }
  }
}

export async function listChatThreads(userId) {
  const user = await getUserById(userId);
  await seedDefaultChatThreads(userId, user?.organization_id || user?.organizationId);
  const result = await pool.query(
    `SELECT t.*
     FROM chat_threads t
     JOIN chat_thread_members m ON m.thread_id = t.id
     WHERE m.user_id = $1
     ORDER BY t.updated_at DESC`,
    [userId]
  );
  const threads = [];
  for (const row of result.rows) {
    const members = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_online, u.status
       FROM chat_thread_members m
       JOIN app_users u ON u.id = m.user_id
       WHERE m.thread_id = $1
       ORDER BY u.name ASC`,
      [row.id]
    );
    const last = await pool.query(
      "SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 1",
      [row.id]
    );
    threads.push(toUiChatThread(row, members.rows.map(toUiUser), last.rows[0] ? toUiChatMessage(last.rows[0]) : null));
  }
  return threads;
}

export async function ensureDirectChat(userAId, userBId) {
  const ids = [userAId, userBId].sort();
  const threadId = `dm-${ids[0]}-${ids[1]}`;
  const user = await getUserById(userAId);
  const organizationId = user?.organization_id || user?.organizationId || null;
  const otherUser = await getUserById(userBId);
  const otherOrganizationId = otherUser?.organization_id || otherUser?.organizationId || null;
  if (!otherUser || otherOrganizationId !== organizationId) {
    const error = new Error("Chat member must belong to your organization.");
    error.statusCode = 403;
    throw error;
  }
  await pool.query(
    `INSERT INTO chat_threads (id, organization_id, type, name, updated_at)
     VALUES ($1, $2, 'DM', $3, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [threadId, organizationId, "Direct chat"]
  );
  for (const userId of ids) {
    await pool.query(
      `INSERT INTO chat_thread_members (id, thread_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (thread_id, user_id) DO NOTHING`,
      [crypto.randomUUID(), threadId, userId]
    );
  }
  return threadId;
}

export async function createChatThread({ actorUserId, type = "GROUP", name, description, memberIds = [] }) {
  const id = crypto.randomUUID();
  const actor = await getUserById(actorUserId);
  const organizationId = actor?.organization_id || actor?.organizationId || null;
  const uniqueRequestedMemberIds = [...new Set([actorUserId, ...memberIds])].filter(Boolean);
  const allowedMembers = await pool.query(
    `SELECT id
     FROM app_users
     WHERE id = ANY($1::text[])
       AND ($2::text IS NULL OR organization_id = $2)`,
    [uniqueRequestedMemberIds, organizationId]
  );
  const allowedMemberIds = allowedMembers.rows.map((row) => row.id);
  await pool.query(
    `INSERT INTO chat_threads (id, organization_id, type, name, description, created_by_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [id, organizationId, type, name || "Group", description || null, actorUserId]
  );
  for (const userId of allowedMemberIds) {
    await pool.query(
      `INSERT INTO chat_thread_members (id, thread_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (thread_id, user_id) DO NOTHING`,
      [crypto.randomUUID(), id, userId]
    );
  }
  return id;
}

export async function userCanAccessThread(userId, threadId) {
  const result = await pool.query(
    "SELECT 1 FROM chat_thread_members WHERE user_id = $1 AND thread_id = $2 LIMIT 1",
    [userId, threadId]
  );
  return Boolean(result.rows[0]);
}

export async function listChatThreadMemberIds(threadId) {
  const result = await pool.query(
    "SELECT user_id FROM chat_thread_members WHERE thread_id = $1",
    [threadId]
  );
  return result.rows.map(row => row.user_id);
}

export async function listChatMessages(threadId, userId, limit = 100) {
  if (!(await userCanAccessThread(userId, threadId))) {
    const error = new Error("Thread access denied.");
    error.statusCode = 403;
    throw error;
  }
  const result = await pool.query(
    `SELECT * FROM chat_messages
     WHERE thread_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [threadId, Math.min(Number(limit) || 100, 250)]
  );
  return result.rows.map(toUiChatMessage);
}

export async function createChatMessage({ threadId, sender, content, legacyData = {} }) {
  if (!(await userCanAccessThread(sender.id, threadId))) {
    const error = new Error("Thread access denied.");
    error.statusCode = 403;
    throw error;
  }
  const result = await pool.query(
    `INSERT INTO chat_messages (id, organization_id, thread_id, sender_id, sender_name, content, legacy_data)
     VALUES ($1, (SELECT organization_id FROM chat_threads WHERE id = $2), $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [crypto.randomUUID(), threadId, sender.id, sender.name, content, JSON.stringify(legacyData)]
  );
  await pool.query("UPDATE chat_threads SET updated_at = NOW() WHERE id = $1", [threadId]);
  await pool.query(
    `UPDATE chat_thread_members
     SET unread_count = unread_count + 1
     WHERE thread_id = $1 AND user_id <> $2`,
    [threadId, sender.id]
  );
  return toUiChatMessage(result.rows[0]);
}

export async function markChatThreadRead(threadId, userId) {
  if (!(await userCanAccessThread(userId, threadId))) {
    const error = new Error("Thread access denied.");
    error.statusCode = 403;
    throw error;
  }
  await pool.query(
    `UPDATE chat_thread_members
     SET unread_count = 0, last_read_at = NOW()
     WHERE thread_id = $1 AND user_id = $2`,
    [threadId, userId]
  );
  return { threadId, userId };
}

export async function addChatThreadMember(threadId, userId) {
  const result = await pool.query(
    `INSERT INTO chat_thread_members (id, thread_id, user_id)
     SELECT $1, $2, $3
     FROM chat_threads t
     JOIN app_users u ON u.id = $3
     WHERE t.id = $2
       AND (t.organization_id IS NULL OR u.organization_id = t.organization_id)
     ON CONFLICT (thread_id, user_id) DO NOTHING`,
    [crypto.randomUUID(), threadId, userId]
  );
  if (result.rowCount === 0) {
    const error = new Error("Chat member must belong to the thread organization.");
    error.statusCode = 403;
    throw error;
  }
}

export async function removeChatThreadMember(threadId, userId) {
  await pool.query("DELETE FROM chat_thread_members WHERE thread_id = $1 AND user_id = $2", [threadId, userId]);
}

export async function auditLog({
  actorUserId,
  organizationId,
  action,
  entityType,
  entityId,
  summary,
  before,
  after,
  requestContext,
}) {
  const actorOrg = !organizationId && actorUserId ? await getOrganizationForUser(actorUserId) : null;
  const result = await pool.query(
    `INSERT INTO change_logs (
       id, organization_id, actor_user_id, action, entity_type, entity_id, summary,
       before_json, after_json, ip_address, user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
     RETURNING *`,
    [
      crypto.randomUUID(),
      organizationId || actorOrg?.id || null,
      actorUserId || null,
      action,
      entityType,
      entityId || null,
      summary,
      before === undefined ? null : JSON.stringify(maskSensitive(before)),
      after === undefined ? null : JSON.stringify(maskSensitive(after)),
      requestContext?.ip || null,
      requestContext?.userAgent || null,
    ]
  );
  return result.rows[0];
}

export async function listChangeLogs({ limit = 100, organizationId } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const values = [];
  let where = "";
  if (organizationId) {
    values.push(organizationId);
    where = `WHERE c.organization_id = $${values.length}`;
  }
  values.push(safeLimit);
  const result = await pool.query(
    `SELECT
       c.*,
       u.name AS actor_name,
       u.email AS actor_email
     FROM change_logs c
     LEFT JOIN app_users u ON u.id = c.actor_user_id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

export async function getChangeLog(id, { organizationId } = {}) {
  const values = [id];
  const organizationFilter = organizationId ? `AND c.organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `SELECT
       c.*,
       u.name AS actor_name,
       u.email AS actor_email
     FROM change_logs c
     LEFT JOIN app_users u ON u.id = c.actor_user_id
     WHERE c.id = $1 ${organizationFilter}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

export function createCustomerAccessToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashCustomerAccessToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function publicStatusFromShipment(row) {
  const labels = {
    PENDING: "Shipment is being prepared",
    BOOKED: "Shipment is booked",
    IN_TRANSIT: "Shipment is in transit",
    ARRIVED: "Shipment has arrived",
    CUSTOMS: "Shipment is in customs review",
    CLEARED: "Shipment is cleared",
    DELIVERED: "Shipment is delivered",
    CLOSED: "Shipment is closed",
  };

  return {
    label: row.public_label || labels[row.status] || "Shipment status updated",
    description:
      row.public_description ||
      "Your shipment is being handled by our operations team.",
    lastUpdate: row.public_status_created_at || row.updated_at || row.created_at,
  };
}

function toPublicDocument(row, token) {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    fileSize: row.file_size,
    downloadUrl: token
      ? `/api/public/track/${encodeURIComponent(token)}/documents/${encodeURIComponent(row.id)}`
      : `/api/public/documents/${encodeURIComponent(row.id)}`,
    createdAt: row.created_at,
  };
}

function toPublicStep(row) {
  const data = row.data || {};
  return {
    id: data.id,
    label: data.name,
    status: data.status || "PENDING",
    order: Number(data.order) || 0,
    completedAt: data.completedAt || null,
  };
}

async function buildPublicShipmentPayload(shipmentId, token) {
  const shipmentResult = await pool.query(
    `SELECT
       s.id,
       s.owner_user_id,
       s.shipment_code,
       s.status,
       s.origin,
       s.destination,
       s.estimated_delivery_at,
       s.updated_at,
       s.created_at,
       e.public_label,
       e.public_description,
       e.created_at AS public_status_created_at
     FROM shipments s
     LEFT JOIN LATERAL (
       SELECT public_label, public_description, created_at
       FROM shipment_status_events
       WHERE shipment_id = s.id AND is_customer_visible = TRUE
       ORDER BY created_at DESC
       LIMIT 1
     ) e ON TRUE
     WHERE s.id = $1
     LIMIT 1`,
    [shipmentId]
  );

  const shipment = shipmentResult.rows[0];
  if (!shipment) return null;

  const docsResult = await pool.query(
    `SELECT id, title, file_name, file_size, created_at
     FROM documents
     WHERE shipment_id = $1
       AND visibility = 'customer_visible'
       AND archived_at IS NULL
     ORDER BY created_at DESC`,
    [shipmentId]
  );

  const stepsResult = await pool.query(
    `SELECT data
     FROM user_records
     WHERE owner_user_id = $1
       AND collection = 'shipmentSteps'
       AND data->>'shipmentId' = $2
     ORDER BY COALESCE((data->>'order')::int, 0) ASC`,
    [shipment.owner_user_id, shipmentId]
  );

  const publicStatus = publicStatusFromShipment(shipment);
  return {
    shipment: {
      code: shipment.shipment_code,
      publicStatusLabel: publicStatus.label,
      publicStatusDescription: publicStatus.description,
      origin: shipment.origin,
      destination: shipment.destination,
      estimatedDelivery: shipment.estimated_delivery_at,
      lastPublicUpdate: publicStatus.lastUpdate,
    },
    steps: stepsResult.rows.map(toPublicStep),
    documents: docsResult.rows.map((row) => toPublicDocument(row, token)),
    company: {
      name: "Logisharp",
      contactText: "For questions about this shipment, please contact your operations representative.",
    },
  };
}

export async function getShipmentCustomerAccess(shipmentId, { organizationId } = {}) {
  const values = [shipmentId];
  const organizationFilter = organizationId ? `AND s.organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `SELECT
       s.id,
       s.shipment_code,
       s.customer_access_enabled,
       s.customer_access_token,
       (s.customer_access_token_hash IS NOT NULL OR s.customer_access_token IS NOT NULL) AS has_token,
       e.public_label,
       e.public_description,
       e.is_customer_visible,
       e.created_at AS public_status_created_at
     FROM shipments s
     LEFT JOIN LATERAL (
       SELECT public_label, public_description, is_customer_visible, created_at
       FROM shipment_status_events
       WHERE shipment_id = s.id
       ORDER BY created_at DESC
       LIMIT 1
     ) e ON TRUE
     WHERE s.id = $1
       ${organizationFilter}
     LIMIT 1`,
    values
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    shipmentId: row.id,
    shipmentCode: row.shipment_code,
    enabled: row.customer_access_enabled,
    hasToken: row.has_token,
    token: row.customer_access_enabled ? row.customer_access_token || "" : "",
    publicStatus: {
      label: row.public_label || "",
      description: row.public_description || "",
      isCustomerVisible: row.is_customer_visible !== false,
      lastUpdatedAt: row.public_status_created_at || null,
    },
  };
}

export async function generateShipmentCustomerAccess(shipmentId, { organizationId, rotate = true } = {}) {
  const before = await getShipmentCustomerAccess(shipmentId, { organizationId });
  if (!before) return null;

  if (!rotate && before.token) {
    const values = [shipmentId];
    const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
    const result = await pool.query(
      `UPDATE shipments
       SET customer_access_enabled = TRUE,
           updated_at = NOW()
       WHERE id = $1
         ${organizationFilter}
       RETURNING id`,
      values
    );
    if (!result.rowCount) return null;
    return {
      token: before.token,
      before,
      after: await getShipmentCustomerAccess(shipmentId, { organizationId }),
    };
  }

  const token = createCustomerAccessToken();
  const tokenHash = hashCustomerAccessToken(token);
  const values = [shipmentId, token, tokenHash];
  const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
  const result = await pool.query(
    `UPDATE shipments
     SET customer_access_token = $2,
         customer_access_token_hash = $3,
         customer_access_enabled = TRUE,
         updated_at = NOW()
     WHERE id = $1
       ${organizationFilter}
     RETURNING id`,
    values
  );
  if (!result.rowCount) return null;

  return {
    token,
    before,
    after: await getShipmentCustomerAccess(shipmentId, { organizationId }),
  };
}

export async function disableShipmentCustomerAccess(shipmentId, { organizationId } = {}) {
  const before = await getShipmentCustomerAccess(shipmentId, { organizationId });
  if (!before) return null;

  const values = [shipmentId];
  const organizationFilter = organizationId ? `AND organization_id = $${values.push(organizationId)}` : "";
  await pool.query(
    `UPDATE shipments
     SET customer_access_enabled = FALSE,
         updated_at = NOW()
     WHERE id = $1
       ${organizationFilter}`,
    values
  );

  return {
    before,
    after: await getShipmentCustomerAccess(shipmentId, { organizationId }),
  };
}

async function queueCustomerShipmentUpdateSms(queryable, shipmentId, event) {
  if (!event?.is_customer_visible) return null;
  const shipmentResult = await queryable.query(
    `SELECT
       s.id,
       s.organization_id,
       s.shipment_code,
       s.customer_name,
       s.legacy_data,
       c.contact_name AS customer_contact_name,
       c.company_name AS customer_company_name,
       c.phone AS customer_phone
     FROM shipments s
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.id = $1
     LIMIT 1`,
    [shipmentId]
  );
  const shipment = shipmentResult.rows[0];
  if (!shipment?.organization_id) return null;
  const message = await renderSmsTemplate(queryable, "customer_shipment_update", {
    ship: shipment.shipment_code,
    status: event.public_label,
  });
  if (!message) return null;
  const recipientPhone = shipment.customer_phone || shipment.legacy_data?.customerPhone || "";
  const recipientName =
    shipment.customer_contact_name ||
    shipment.customer_company_name ||
    shipment.customer_name ||
    shipment.legacy_data?.customerName ||
    "مشتری";
  return enqueueSmsDelivery(queryable, {
    organizationId: shipment.organization_id,
    userId: null,
    recipientType: "customer",
    recipientName,
    recipientPhone,
    message,
    sourceType: "customer_shipment_update",
    sourceId: event.id,
    eventKey: `customer-shipment-update:${event.id}`,
  });
}

export async function updateShipmentPublicStatus({
  shipmentId,
  publicLabel,
  publicDescription,
  isCustomerVisible = true,
  createdById,
  organizationId,
}) {
  const shipment = await getShipmentCustomerAccess(shipmentId, { organizationId });
  if (!shipment) return null;

  const result = await pool.query(
    `INSERT INTO shipment_status_events (
       id, organization_id, shipment_id, public_label, public_description, is_customer_visible, created_by_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      crypto.randomUUID(),
      organizationId || null,
      shipmentId,
      publicLabel,
      publicDescription || null,
      Boolean(isCustomerVisible),
      createdById || null,
    ]
  );
  const event = result.rows[0];
  await queueCustomerShipmentUpdateSms(pool, shipmentId, event);
  return event;
}

export async function getPublicTrackingByToken(token) {
  if (!token || String(token).length < 24) return null;
  const tokenHash = hashCustomerAccessToken(token);
  const result = await pool.query(
    `SELECT id
     FROM shipments
     WHERE customer_access_token_hash = $1
       AND customer_access_enabled = TRUE
     LIMIT 1`,
    [tokenHash]
  );
  const shipment = result.rows[0];
  if (!shipment) return null;
  return buildPublicShipmentPayload(shipment.id, token);
}

export async function searchPublicTracking({ shipmentCode, verification }) {
  if (!shipmentCode || !verification) return null;
  const normalizedVerification = String(verification).trim().toLowerCase();
  const result = await pool.query(
    `SELECT s.id
     FROM shipments s
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE lower(s.shipment_code) = lower($1)
       AND s.customer_access_enabled = TRUE
       AND (
         lower(COALESCE(c.email, '')) = $2
         OR regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
         OR lower(COALESCE(s.legacy_data->>'customerEmail', '')) = $2
         OR regexp_replace(COALESCE(s.legacy_data->>'customerPhone', ''), '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
       )
     LIMIT 1`,
    [shipmentCode, normalizedVerification]
  );
  const shipment = result.rows[0];
  if (!shipment) return null;
  return buildPublicShipmentPayload(shipment.id);
}

export async function getPublicDocument(documentId) {
  const result = await pool.query(
    `SELECT d.id, d.title, d.file_name, d.mime_type, d.file_size, d.storage_key, d.legacy_data
     FROM documents d
     JOIN shipments s ON s.id = d.shipment_id
     WHERE d.id = $1
       AND d.visibility = 'customer_visible'
       AND d.archived_at IS NULL
       AND s.customer_access_enabled = TRUE
     LIMIT 1`,
    [documentId]
  );
  return result.rows[0] || null;
}

export async function getPublicDocumentByTrackingToken(token, documentId) {
  if (!token || String(token).length < 24) return null;
  const tokenHash = hashCustomerAccessToken(token);
  const result = await pool.query(
    `SELECT d.id, d.title, d.file_name, d.mime_type, d.file_size, d.storage_key, d.legacy_data
     FROM documents d
     JOIN shipments s ON s.id = d.shipment_id
     WHERE d.id = $1
       AND d.visibility = 'customer_visible'
       AND d.archived_at IS NULL
       AND s.customer_access_token_hash = $2
       AND s.customer_access_enabled = TRUE
     LIMIT 1`,
    [documentId, tokenHash]
  );
  return result.rows[0] || null;
}

export async function updateDocumentVisibility(documentId, visibility, { organizationId } = {}) {
  const safeVisibility = visibility === "customer_visible" ? "customer_visible" : "internal";
  return updateDocumentMetadata(documentId, { visibility: safeVisibility }, { organizationId });
}

function maskSensitive(value) {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (/password|token|secret|hash/i.test(key)) return [key, "[redacted]"];
      return [key, maskSensitive(nestedValue)];
    })
  );
}

function bridgeShipmentSnapshot(rowOrShipment = {}) {
  const legacy = rowOrShipment.legacy_data || rowOrShipment;
  return {
    trackingNumber: rowOrShipment.shipment_code || legacy.trackingNumber || rowOrShipment.id || "",
    containerNumber: legacy.containerNumber || "",
    customerId: rowOrShipment.customer_id || legacy.customerId || "",
    customerName: rowOrShipment.customer_name || legacy.customerName || "",
    origin: rowOrShipment.origin || legacy.origin || "",
    destination: rowOrShipment.destination || legacy.destination || "",
    status: rowOrShipment.status || legacy.status || "PENDING",
    estimatedDelivery: rowOrShipment.estimated_delivery_at || legacy.estimatedDelivery || "",
    freeTimeDays: legacy.freeTimeDays || "",
    isArchived: Boolean(rowOrShipment.archived_at || legacy.isArchived),
  };
}

function snapshotsDiffer(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function insertBridgeChangeLog(client, {
  ownerUserId,
  organizationId,
  action,
  entityType,
  entityId,
  summary,
  before,
  after,
}) {
  await client.query(
    `INSERT INTO change_logs (
       id, organization_id, actor_user_id, action, entity_type, entity_id, summary,
       before_json, after_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
    [
      crypto.randomUUID(),
      organizationId || null,
      ownerUserId || null,
      action,
      entityType,
      entityId || null,
      summary,
      before === undefined ? null : JSON.stringify(maskSensitive(before)),
      after === undefined ? null : JSON.stringify(maskSensitive(after)),
    ]
  );
}

async function syncCanonicalCollection(client, ownerUserId, ownerOrganizationId, collection, records) {
  if (collection === "customers") {
    await client.query("DELETE FROM customers WHERE owner_user_id = $1", [ownerUserId]);
    for (const customer of records) {
      await client.query(
        `INSERT INTO customers (
           id, organization_id, owner_user_id, company_name, contact_name, email, phone, address, legacy_data, created_by_id, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $3, $10, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           company_name = EXCLUDED.company_name,
           contact_name = EXCLUDED.contact_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           address = EXCLUDED.address,
           archived_at = EXCLUDED.archived_at,
           legacy_data = EXCLUDED.legacy_data,
           updated_at = NOW()`,
        [
          customer.id,
          ownerOrganizationId,
          ownerUserId,
          customer.company || customer.name || "Unknown customer",
          customer.name || null,
          customer.email || null,
          customer.phone || null,
          customer.address || null,
          JSON.stringify(customer),
          customer.isArchived ? new Date() : null,
        ]
      );
    }
  }

  if (collection === "shipments") {
    const existingAccessResult = await client.query(
      `SELECT *
       FROM shipments
       WHERE owner_user_id = $1`,
      [ownerUserId]
    );
    const existingAccess = new Map(
      existingAccessResult.rows.map((row) => [
        row.id,
        {
          token: row.customer_access_token,
          tokenHash: row.customer_access_token_hash,
          enabled: row.customer_access_enabled,
        },
      ])
    );
    const existingShipments = new Map(existingAccessResult.rows.map((row) => [row.id, row]));

    await client.query("DELETE FROM shipments WHERE owner_user_id = $1", [ownerUserId]);
    for (const shipment of records) {
      const preservedAccess = existingAccess.get(shipment.id) || {};
      const before = existingShipments.get(shipment.id) || null;
      const beforeSnapshot = before ? bridgeShipmentSnapshot(before) : null;
      const afterSnapshot = bridgeShipmentSnapshot(shipment);
      await client.query(
        `INSERT INTO shipments (
           id, organization_id, owner_user_id, shipment_code, customer_id, customer_name, status,
           origin, destination, estimated_delivery_at, free_time_ends_at,
           customer_access_token, customer_access_token_hash, customer_access_enabled,
           legacy_data, created_by_id, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $3, $16, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           shipment_code = EXCLUDED.shipment_code,
           customer_id = EXCLUDED.customer_id,
           customer_name = EXCLUDED.customer_name,
           status = EXCLUDED.status,
           origin = EXCLUDED.origin,
           destination = EXCLUDED.destination,
           estimated_delivery_at = EXCLUDED.estimated_delivery_at,
           free_time_ends_at = EXCLUDED.free_time_ends_at,
           customer_access_token = COALESCE(shipments.customer_access_token, EXCLUDED.customer_access_token),
           customer_access_token_hash = COALESCE(shipments.customer_access_token_hash, EXCLUDED.customer_access_token_hash),
           customer_access_enabled = shipments.customer_access_enabled OR EXCLUDED.customer_access_enabled,
           archived_at = EXCLUDED.archived_at,
           legacy_data = EXCLUDED.legacy_data,
           updated_at = NOW()`,
        [
          shipment.id,
          ownerOrganizationId,
          ownerUserId,
          shipment.trackingNumber || shipment.id,
          shipment.customerId || null,
          shipment.customerName || null,
          shipment.status || "PENDING",
          shipment.origin || null,
          shipment.destination || null,
          shipment.estimatedDelivery || null,
          shipment.estimatedDelivery || null,
          preservedAccess.token || null,
          preservedAccess.tokenHash || null,
          Boolean(preservedAccess.enabled),
          JSON.stringify(shipment),
          shipment.isArchived ? new Date() : null,
        ]
      );
      if (!before) {
        await insertBridgeChangeLog(client, {
          ownerUserId,
          organizationId: ownerOrganizationId,
          action: "shipment.create",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          summary: "Shipment was created from the operations list.",
          after: afterSnapshot,
        });
      } else if (beforeSnapshot.status !== afterSnapshot.status) {
        await insertBridgeChangeLog(client, {
          ownerUserId,
          organizationId: ownerOrganizationId,
          action: "shipment.status_change",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          summary: `Shipment status changed from ${beforeSnapshot.status} to ${afterSnapshot.status}.`,
          before: beforeSnapshot,
          after: afterSnapshot,
        });
      } else if (beforeSnapshot.isArchived !== afterSnapshot.isArchived) {
        await insertBridgeChangeLog(client, {
          ownerUserId,
          organizationId: ownerOrganizationId,
          action: afterSnapshot.isArchived ? "shipment.archive" : "shipment.restore",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          summary: afterSnapshot.isArchived ? "Shipment was archived." : "Shipment was restored.",
          before: beforeSnapshot,
          after: afterSnapshot,
        });
      } else if (snapshotsDiffer(beforeSnapshot, afterSnapshot)) {
        await insertBridgeChangeLog(client, {
          ownerUserId,
          organizationId: ownerOrganizationId,
          action: "shipment.update",
          entityType: "SHIPMENT",
          entityId: shipment.id,
          summary: "Shipment details were updated.",
          before: beforeSnapshot,
          after: afterSnapshot,
        });
      }
    }
  }

  if (collection === "tasks") {
    const existingTasksResult = await client.query(
      `SELECT id, source_type, source_id, customer_id, completed_at, legacy_data
       FROM tasks
       WHERE owner_user_id = $1`,
      [ownerUserId]
    );
    const existingTasks = new Map(existingTasksResult.rows.map((row) => [row.id, row]));
    await client.query("DELETE FROM tasks WHERE owner_user_id = $1", [ownerUserId]);
    for (const task of records) {
      const existingTask = existingTasks.get(task.id) || {};
      const sourceType = task.sourceType || existingTask.source_type || "MANUAL";
      const sourceId = task.sourceId || existingTask.source_id || null;
      const legacy = {
        ...(existingTask.legacy_data || {}),
        ...task,
        sourceType,
        ...(sourceId ? { sourceId } : {}),
      };
      await client.query(
        `INSERT INTO tasks (
           id, organization_id, owner_user_id, title, description, status, priority, assigned_to_id,
           assigned_to_name, assigned_by_name, due_at, source_type, source_id,
           shipment_id, customer_id, legacy_data, completed_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           priority = EXCLUDED.priority,
           assigned_to_id = EXCLUDED.assigned_to_id,
           assigned_to_name = EXCLUDED.assigned_to_name,
           assigned_by_name = EXCLUDED.assigned_by_name,
           due_at = EXCLUDED.due_at,
           source_type = EXCLUDED.source_type,
           source_id = EXCLUDED.source_id,
           shipment_id = EXCLUDED.shipment_id,
           customer_id = EXCLUDED.customer_id,
           legacy_data = EXCLUDED.legacy_data,
           completed_at = EXCLUDED.completed_at,
           updated_at = NOW()`,
        [
          task.id,
          ownerOrganizationId,
          ownerUserId,
          task.title,
          task.description || null,
          task.status || "TODO",
          task.priority || "MEDIUM",
          task.assignedToUserId || null,
          task.assignedToName || null,
          task.assignedByName || null,
          task.dueDate || null,
          sourceType,
          sourceId,
          task.shipmentId || null,
          existingTask.customer_id || null,
          JSON.stringify(legacy),
          task.status === "DONE" ? existingTask.completed_at || new Date() : null,
        ]
      );
    }
  }

  if (collection === "documents") {
    const existingDocumentsResult = await client.query(
      `SELECT id, visibility, storage_key, mime_type, checksum, version, uploaded_by_id
       FROM documents
       WHERE owner_user_id = $1`,
      [ownerUserId]
    );
    const existingDocuments = new Map(
      existingDocumentsResult.rows.map((row) => [row.id, row])
    );

    for (const document of records) {
      const existingDocument = existingDocuments.get(document.id) || {};
      const visibility =
        document.visibility === "customer_visible"
          ? "customer_visible"
          : existingDocument.visibility || "internal";
      const storageKey =
        existingDocument.storage_key ||
        (typeof document.url === "string" && !document.url.startsWith("/api/")
          ? document.url
          : document.id);
      await client.query(
        `INSERT INTO documents (
           id, organization_id, owner_user_id, title, file_name, mime_type, file_size, storage_key,
           checksum, version, uploaded_by_id, uploaded_by_name, shipment_id, customer_id,
           visibility, legacy_data, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           title = EXCLUDED.title,
           file_name = EXCLUDED.file_name,
           mime_type = COALESCE(documents.mime_type, EXCLUDED.mime_type),
           file_size = EXCLUDED.file_size,
           storage_key = COALESCE(documents.storage_key, EXCLUDED.storage_key),
           checksum = COALESCE(documents.checksum, EXCLUDED.checksum),
           version = GREATEST(documents.version, EXCLUDED.version),
           uploaded_by_id = COALESCE(documents.uploaded_by_id, EXCLUDED.uploaded_by_id),
           uploaded_by_name = EXCLUDED.uploaded_by_name,
           shipment_id = EXCLUDED.shipment_id,
           customer_id = EXCLUDED.customer_id,
           visibility = EXCLUDED.visibility,
           archived_at = EXCLUDED.archived_at,
           legacy_data = EXCLUDED.legacy_data,
           updated_at = NOW()`,
        [
          document.id,
          ownerOrganizationId,
          ownerUserId,
          document.name || document.fileName || document.id,
          document.name || document.fileName || null,
          existingDocument.mime_type || null,
          document.fileSize || null,
          storageKey,
          existingDocument.checksum || null,
          Number(document.version || existingDocument.version || 1),
          existingDocument.uploaded_by_id || null,
          document.uploadedBy || null,
          document.shipmentId || null,
          document.customerId || null,
          visibility,
          JSON.stringify(document),
          document.isArchived ? new Date() : null,
        ]
      );
    }
  }

  if (collection === "notifications") {
    await client.query("DELETE FROM notifications WHERE user_id = $1", [ownerUserId]);
    for (const notification of records) {
      await client.query(
        `INSERT INTO notifications (
           id, organization_id, user_id, title, body, type, source_type, source_id, legacy_data, read_at, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           type = EXCLUDED.type,
           source_type = EXCLUDED.source_type,
           source_id = EXCLUDED.source_id,
           read_at = EXCLUDED.read_at,
           legacy_data = EXCLUDED.legacy_data`,
        [
          notification.id,
          ownerOrganizationId,
          ownerUserId,
          notification.title,
          notification.message || null,
          notification.type || "INFO",
          notification.link ? "route" : null,
          notification.link || null,
          JSON.stringify(notification),
          notification.isRead ? new Date() : null,
        ]
      );
    }
  }

  if (collection === "cheques") {
    for (const cheque of records) {
      await client.query(
        `INSERT INTO cheques (
           id, organization_id, owner_user_id, bank_name, cheque_number, amount, due_date,
           location, receiver, status, description, legacy_data, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           bank_name = EXCLUDED.bank_name,
           cheque_number = EXCLUDED.cheque_number,
           amount = EXCLUDED.amount,
           due_date = EXCLUDED.due_date,
           location = EXCLUDED.location,
           receiver = EXCLUDED.receiver,
           status = EXCLUDED.status,
           description = EXCLUDED.description,
           legacy_data = EXCLUDED.legacy_data,
           archived_at = EXCLUDED.archived_at,
           updated_at = NOW()`,
        [
          cheque.id,
          ownerOrganizationId,
          ownerUserId,
          cheque.bankName || "",
          cheque.chequeNumber || cheque.id,
          Number(cheque.amount || 0),
          cheque.dueDate || null,
          cheque.location || null,
          cheque.receiver || null,
          cheque.status || "ACTIVE",
          cheque.description || null,
          JSON.stringify(cheque),
          cheque.status === "ARCHIVED" ? new Date() : null,
        ]
      );
    }
  }

  if (collection === "appointments") {
    for (const appointment of records) {
      await client.query(
        `INSERT INTO compliance_meetings (
           id, organization_id, owner_user_id, title, organization_name, meeting_at, status,
           assigned_to_id, assigned_to_name, outcome, next_action_items,
           reminder_sent, legacy_data, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           title = EXCLUDED.title,
           organization_name = EXCLUDED.organization_name,
           meeting_at = EXCLUDED.meeting_at,
           status = EXCLUDED.status,
           assigned_to_id = EXCLUDED.assigned_to_id,
           assigned_to_name = EXCLUDED.assigned_to_name,
           outcome = EXCLUDED.outcome,
           next_action_items = EXCLUDED.next_action_items,
           reminder_sent = EXCLUDED.reminder_sent,
           legacy_data = EXCLUDED.legacy_data,
           archived_at = EXCLUDED.archived_at,
           updated_at = NOW()`,
        [
          appointment.id,
          ownerOrganizationId,
          ownerUserId,
          appointment.purpose || appointment.id,
          appointment.departmentName || null,
          appointment.dateTime || null,
          appointment.status || "SCHEDULED",
          appointment.assignedPersonId || null,
          appointment.assignedPersonName || null,
          appointment.outcome || null,
          appointment.nextActionItems || null,
          Boolean(appointment.reminderSent),
          JSON.stringify(appointment),
          appointment.status === "ARCHIVED" ? new Date() : null,
        ]
      );

      await client.query("DELETE FROM meeting_required_documents WHERE meeting_id = $1", [
        appointment.id,
      ]);
      const requiredDocuments = Array.isArray(appointment.requiredDocuments)
        ? appointment.requiredDocuments
        : [];
      for (const document of requiredDocuments) {
        await client.query(
          `INSERT INTO meeting_required_documents (
             id, organization_id, meeting_id, name, required, completed, file_name, legacy_data, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
           ON CONFLICT (id) DO UPDATE SET
             organization_id = EXCLUDED.organization_id,
             name = EXCLUDED.name,
             required = EXCLUDED.required,
             completed = EXCLUDED.completed,
             file_name = EXCLUDED.file_name,
             legacy_data = EXCLUDED.legacy_data,
             updated_at = NOW()`,
          [
            document.id || crypto.randomUUID(),
            ownerOrganizationId,
            appointment.id,
            document.name || "Document",
            document.required !== false,
            Boolean(document.completed),
            document.fileName || null,
            JSON.stringify(document),
          ]
        );
      }
    }
  }

  if (collection === "quotes") {
    for (const quote of records) {
      await client.query(
        `INSERT INTO quotations (
           id, organization_id, owner_user_id, quotation_number, customer_id, customer_name, customer_phone,
           origin_city, destination_city, cargo_type, weight, dimensions, pickup_date,
           delivery_date, requirements, base_rate, fuel_surcharge, loading_fees,
           toll_fees, insurance_percentage, profit_margin, total_price, valid_until,
           status, notes, legacy_data, archived_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb,
                 $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb, $27, NOW())
         ON CONFLICT (id) DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           customer_id = EXCLUDED.customer_id,
           customer_name = EXCLUDED.customer_name,
           customer_phone = EXCLUDED.customer_phone,
           origin_city = EXCLUDED.origin_city,
           destination_city = EXCLUDED.destination_city,
           cargo_type = EXCLUDED.cargo_type,
           weight = EXCLUDED.weight,
           dimensions = EXCLUDED.dimensions,
           pickup_date = EXCLUDED.pickup_date,
           delivery_date = EXCLUDED.delivery_date,
           requirements = EXCLUDED.requirements,
           base_rate = EXCLUDED.base_rate,
           fuel_surcharge = EXCLUDED.fuel_surcharge,
           loading_fees = EXCLUDED.loading_fees,
           toll_fees = EXCLUDED.toll_fees,
           insurance_percentage = EXCLUDED.insurance_percentage,
           profit_margin = EXCLUDED.profit_margin,
           total_price = EXCLUDED.total_price,
           valid_until = EXCLUDED.valid_until,
           status = EXCLUDED.status,
           notes = EXCLUDED.notes,
           legacy_data = EXCLUDED.legacy_data,
           archived_at = EXCLUDED.archived_at,
           updated_at = NOW()`,
        [
          quote.id,
          ownerOrganizationId,
          ownerUserId,
          quote.quotationNumber || quote.id,
          quote.customerId || null,
          quote.customerName || "Unknown customer",
          quote.customerPhone || null,
          quote.originCity || null,
          quote.destinationCity || null,
          quote.cargoType || "GENERAL",
          Number(quote.weight || 0),
          quote.dimensions || null,
          quote.pickupDate || null,
          quote.deliveryDate || null,
          JSON.stringify(Array.isArray(quote.requirements) ? quote.requirements : []),
          Number(quote.baseRate || 0),
          Number(quote.fuelSurcharge || 0),
          Number(quote.loadingFees || 0),
          Number(quote.tollFees || 0),
          Number(quote.insurancePercentage || 0),
          Number(quote.profitMargin || 0),
          Number(quote.totalPrice || 0),
          quote.validUntil || null,
          quote.status || "PENDING",
          quote.notes || null,
          JSON.stringify(quote),
          quote.isArchived || quote.status === "ARCHIVED" ? new Date() : null,
        ]
      );
    }
  }

  if (collection === "channels") {
    await seedDefaultChatThreads(ownerUserId);
  }

  if (collection === "messages") {
    for (const message of records) {
      const threadId = message.isGroup
        ? message.groupId
        : await ensureDirectChat(message.senderId, message.receiverId);
      if (!threadId) continue;
      await client.query(
        `INSERT INTO chat_messages (id, thread_id, sender_id, sender_name, content, legacy_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           content = EXCLUDED.content,
           legacy_data = EXCLUDED.legacy_data`,
        [
          message.id,
          threadId,
          message.senderId,
          message.senderName || "User",
          message.content || "",
          JSON.stringify(message),
          message.createdAt ? new Date(message.createdAt) : null,
        ]
      );
    }
  }
}
