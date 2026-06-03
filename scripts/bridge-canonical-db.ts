// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pricingPlans } from "../src/lib/pricing.ts";
import { DEFAULT_SHIPMENT_FORM_TEMPLATE_DEFINITIONS } from "../src/shared/shipment-form-fields.js";
import { DEFAULT_SMS_TEMPLATES } from "../src/server/sms-templates.js";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const ownerUserId = process.env.SEED_USER_ID || "u1";
const defaultOrganizationId = process.env.SEED_ORGANIZATION_ID || "org-logisticplus-default";
const databaseUrl =
  process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";

const permissionKeys = [
  "dashboard.view",
  "shipments.view_all",
  "shipments.view_assigned",
  "shipments.create",
  "shipments.update",
  "shipments.archive",
  "shipment_forms.manage",
  "shipment_steps.update",
  "customers.view",
  "customers.create",
  "customers.update",
  "tasks.create",
  "tasks.assign",
  "tasks.view_all",
  "tasks.view_own",
  "documents.upload",
  "documents.view_all",
  "documents.view_related",
  "documents.archive",
  "changes.view",
  "chat.use",
  "chat.manage_groups",
  "chat.media.view",
  "chat.media.delete",
  "users.manage",
  "users.promote",
  "cheques.manage",
  "compliance.manage",
  "quotations.manage",
  "archive.view",
  "customer_access.manage",
];
const platformPermissionKeys = ["platform.admin"];

const companyOperationalPermissions = [
  "archive.view",
  "changes.view",
  "chat.use",
  "compliance.manage",
  "customer_access.manage",
  "customers.create",
  "customers.update",
  "customers.view",
  "documents.archive",
  "documents.upload",
  "documents.view_all",
  "documents.view_related",
  "quotations.manage",
  "shipment_steps.update",
  "shipments.archive",
  "shipments.create",
  "shipments.update",
  "shipments.view_all",
  "shipments.view_assigned",
  "tasks.assign",
  "tasks.create",
  "tasks.view_all",
  "tasks.view_own",
];

const rolePermissions = {
  CEO: permissionKeys,
  MANAGER: permissionKeys.filter((key) => !["users.promote", "chat.media.view", "chat.media.delete"].includes(key)),
  OPERATIONS: ["dashboard.view", ...companyOperationalPermissions],
  CUSTOMER_SERVICE: ["dashboard.view", ...companyOperationalPermissions],
  FINANCE: ["dashboard.view", "cheques.manage", ...companyOperationalPermissions],
  QUOTATION_MANAGER: ["dashboard.view", ...companyOperationalPermissions],
  COMPLIANCE_STAFF: ["dashboard.view", ...companyOperationalPermissions],
  EMPLOYEE: ["dashboard.view", ...companyOperationalPermissions],
  CUSTOMER_VIEWER: [],
};

const roleDescriptions = {
  CEO: "Full system access",
  MANAGER: "Operational management access",
  OPERATIONS: "Shipment operations access",
  CUSTOMER_SERVICE: "Customer service access",
  FINANCE: "Finance and cheque access",
  QUOTATION_MANAGER: "Quotation management access",
  COMPLIANCE_STAFF: "Compliance meeting access",
  EMPLOYEE: "Assigned work access",
  CUSTOMER_VIEWER: "External customer-safe access",
};

function roleId(role: string) {
  return `role-${role.toLowerCase().replace(/_/g, "-")}`;
}

function permissionId(permission: string) {
  return `perm-${permission.replace(/[^a-z0-9]+/gi, "-")}`;
}

function asJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function isLegacyDemoNotification(notification: any) {
  return ["n1", "n2", "n3", "n4"].includes(String(notification?.id || ""));
}

const defaultPlans = pricingPlans.map((plan, index) => ({
  id: plan.id,
  name: plan.name,
  description: plan.audience,
  monthly: plan.monthlyPriceIrr,
  annual: plan.annualPriceIrr,
  limits: {
    users: plan.limits.users,
    monthlyShipments: plan.limits.monthlyShipments,
    storageMb: plan.limits.storageMb,
  },
  features: plan.backendFeatures,
  sort: index + 1,
}));

async function seedSaasFoundation(client: Client) {
  for (const plan of defaultPlans) {
    await client.query(
      `INSERT INTO subscription_plans (
         id, name, description, monthly_price_irr, annual_price_irr, limits, features, sort_order, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         monthly_price_irr = EXCLUDED.monthly_price_irr,
         annual_price_irr = EXCLUDED.annual_price_irr,
         limits = EXCLUDED.limits,
         features = EXCLUDED.features,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [plan.id, plan.name, plan.description, plan.monthly, plan.annual, asJson(plan.limits), asJson(plan.features), plan.sort]
    );
  }

  await client.query(
    `INSERT INTO organizations (
       id, name, slug, status, owner_user_id, plan_id, contact_name, contact_email, contact_phone, approved_at, updated_at
     )
     VALUES ($1, 'Logistic Plus', 'logistic-plus', 'active', $2, 'enterprise', 'احمدرضا علمداری', 'darksudo22@gmail.com', NULL, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       status = 'active',
       owner_user_id = COALESCE(organizations.owner_user_id, EXCLUDED.owner_user_id),
       plan_id = COALESCE(organizations.plan_id, EXCLUDED.plan_id),
       approved_at = COALESCE(organizations.approved_at, NOW()),
       updated_at = NOW()`,
    [defaultOrganizationId, ownerUserId]
  );

  await client.query(
    `INSERT INTO organization_subscriptions (
       id, organization_id, plan_id, status, billing_cycle, current_period_start, current_period_end, activated_at, updated_at
     )
     VALUES ($1, $2, 'enterprise', 'active', 'annual', NOW(), NOW() + INTERVAL '1 year', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       status = 'active',
       plan_id = EXCLUDED.plan_id,
       activated_at = COALESCE(organization_subscriptions.activated_at, NOW()),
       updated_at = NOW()`,
    [`sub-${defaultOrganizationId}`, defaultOrganizationId]
  );

  for (const template of DEFAULT_SMS_TEMPLATES) {
    await client.query(
      `INSERT INTO sms_templates (key, label, body, enabled, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (key) DO UPDATE SET
         label = EXCLUDED.label,
         updated_at = sms_templates.updated_at`,
      [template.key, template.label, template.body]
    );
  }
}

async function attachExistingDataToDefaultOrganization(client: Client) {
  await client.query("UPDATE app_users SET organization_id = $1 WHERE organization_id IS NULL", [defaultOrganizationId]);
  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role, status)
     SELECT $1, id, CASE WHEN id = $2 THEN 'owner' ELSE 'member' END, 'active'
     FROM app_users
     ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'active'`,
    [defaultOrganizationId, ownerUserId]
  );

  for (const table of [
    "user_records",
    "customers",
    "shipments",
    "shipment_status_events",
    "tasks",
    "cheques",
    "compliance_meetings",
    "meeting_required_documents",
    "quotations",
    "archive_records",
    "chat_threads",
    "chat_messages",
    "documents",
    "document_versions",
    "notifications",
    "change_logs",
    "billing_invoices",
    "billing_receipts",
    "subscription_events",
  ]) {
    await client.query(`UPDATE ${table} SET organization_id = $1 WHERE organization_id IS NULL`, [defaultOrganizationId]);
  }
}

async function getCollection(client: Client, collection: string) {
  const result = await client.query(
    `SELECT data FROM user_records
     WHERE owner_user_id = $1 AND collection = $2
     ORDER BY item_id`,
    [ownerUserId, collection]
  );
  return result.rows.map((row) => row.data);
}

async function seedRolesAndPermissions(client: Client) {
  for (const key of [...permissionKeys, ...platformPermissionKeys]) {
    await client.query(
      `INSERT INTO permissions (id, key, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key, description = EXCLUDED.description`,
      [permissionId(key), key, key]
    );
  }

  for (const [role, permissions] of Object.entries(rolePermissions)) {
    await client.query(
      `INSERT INTO roles (id, name, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         updated_at = NOW()`,
      [roleId(role), role, roleDescriptions[role] || role]
    );

    await client.query("DELETE FROM role_permissions WHERE role_id = $1", [
      roleId(role),
    ]);

    for (const permission of permissions) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [roleId(role), permissionId(permission)]
      );
    }
  }

  await client.query(
    `INSERT INTO user_permissions (user_id, permission_id, reason)
     SELECT $1, id, 'Bridge owner explicit platform admin grant'
     FROM permissions
     WHERE key = 'platform.admin'
     ON CONFLICT (user_id, permission_id) DO NOTHING`,
    [ownerUserId]
  );
}

function shipmentTemplateId(typeCode: string) {
  return `shipment-form-template-${typeCode.toLowerCase().replace(/_/g, "-")}`;
}

function shipmentTemplateSectionId(typeCode: string, sectionKey: string) {
  return `${shipmentTemplateId(typeCode)}-section-${sectionKey}`;
}

function shipmentTemplateFieldId(typeCode: string, fieldKey: string) {
  return `${shipmentTemplateId(typeCode)}-field-${fieldKey}`;
}

async function seedShipmentFormTemplates(client: Client) {
  for (const template of DEFAULT_SHIPMENT_FORM_TEMPLATE_DEFINITIONS) {
    const templateId = shipmentTemplateId(template.shipmentTypeCode);
    await client.query(
      `INSERT INTO shipment_form_templates (
         id, organization_id, code, shipment_type_code, title_fa, description,
         is_system, is_active, version, created_at, updated_at
       )
       VALUES ($1, NULL, $2, $3, $4, $5, TRUE, TRUE, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         shipment_type_code = EXCLUDED.shipment_type_code,
         title_fa = EXCLUDED.title_fa,
         description = EXCLUDED.description,
         is_system = TRUE,
         is_active = TRUE,
         archived_at = NULL,
         updated_at = NOW()`,
      [
        templateId,
        template.code,
        template.shipmentTypeCode,
        template.titleFa,
        template.description || "",
      ]
    );

    for (const section of template.sections) {
      const sectionId = shipmentTemplateSectionId(template.shipmentTypeCode, section.sectionKey);
      await client.query(
        `INSERT INTO shipment_form_template_sections (
           id, template_id, section_key, title_fa, description, sort_order,
           is_collapsed_by_default, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (template_id, section_key) DO UPDATE SET
           title_fa = EXCLUDED.title_fa,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order,
           is_collapsed_by_default = EXCLUDED.is_collapsed_by_default,
           updated_at = NOW()`,
        [
          sectionId,
          templateId,
          section.sectionKey,
          section.titleFa,
          section.description || "",
          section.sortOrder || 0,
          Boolean(section.isCollapsedByDefault),
        ]
      );

      for (const field of section.fields) {
        await client.query(
          `INSERT INTO shipment_form_template_fields (
             id, template_id, section_id, field_key, field_source, field_type, label_fa,
             helper_text, placeholder, sort_order, is_visible, is_required, is_important,
             show_in_shipment_detail, show_in_daily_status, show_in_create_form,
             validation_json, options_json, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, NOW(), NOW())
           ON CONFLICT (template_id, field_key) DO UPDATE SET
             section_id = EXCLUDED.section_id,
             field_source = EXCLUDED.field_source,
             field_type = EXCLUDED.field_type,
             label_fa = EXCLUDED.label_fa,
             helper_text = EXCLUDED.helper_text,
             placeholder = EXCLUDED.placeholder,
             sort_order = EXCLUDED.sort_order,
             is_visible = EXCLUDED.is_visible,
             is_required = EXCLUDED.is_required,
             is_important = EXCLUDED.is_important,
             show_in_shipment_detail = EXCLUDED.show_in_shipment_detail,
             show_in_daily_status = EXCLUDED.show_in_daily_status,
             show_in_create_form = EXCLUDED.show_in_create_form,
             validation_json = EXCLUDED.validation_json,
             options_json = EXCLUDED.options_json,
             archived_at = NULL,
             updated_at = NOW()`,
          [
            shipmentTemplateFieldId(template.shipmentTypeCode, field.fieldKey),
            templateId,
            sectionId,
            field.fieldKey,
            field.fieldSource,
            field.fieldType,
            field.labelFa,
            field.helperText || "",
            field.placeholder || "",
            field.sortOrder || 0,
            field.isVisible !== false,
            Boolean(field.isRequired),
            Boolean(field.isImportant),
            field.showInShipmentDetail !== false,
            field.showInDailyStatus !== false,
            Boolean(field.showInCreateForm),
            JSON.stringify(field.validationJson || {}),
            JSON.stringify(field.optionsJson || []),
          ]
        );
      }
    }
  }
}

async function bridgeUsers(client: Client, users: any[]) {
  const tempPasswordHash = await bcrypt.hash(crypto.randomUUID(), 12);

  for (const user of users) {
    await client.query(
      `INSERT INTO app_users (
         id, name, email, password_hash, role, avatar, is_online, department, phone, status, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         avatar = EXCLUDED.avatar,
         is_online = EXCLUDED.is_online,
         department = COALESCE(EXCLUDED.department, app_users.department),
         phone = COALESCE(EXCLUDED.phone, app_users.phone),
         status = COALESCE(app_users.status, 'active'),
         updated_at = NOW()`,
      [
        user.id,
        user.name,
        user.email,
        tempPasswordHash,
        user.role || "EMPLOYEE",
        user.avatar || null,
        Boolean(user.isOnline),
        user.department || null,
        user.phone || null,
      ]
    );
  }
}

async function bridgeCustomers(client: Client, customers: any[]) {
  for (const customer of customers) {
    await client.query(
      `INSERT INTO customers (
         id, owner_user_id, company_name, contact_name, email, phone, address, legacy_data, created_by_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET
         company_name = EXCLUDED.company_name,
         contact_name = EXCLUDED.contact_name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address,
         legacy_data = EXCLUDED.legacy_data,
         updated_at = NOW()`,
      [
        customer.id,
        ownerUserId,
        customer.company || customer.name || "Unknown customer",
        customer.name || null,
        customer.email || null,
        customer.phone || null,
        customer.address || null,
        asJson(customer),
      ]
    );
  }
}

async function bridgeShipments(client: Client, shipments: any[]) {
  for (const shipment of shipments) {
    await client.query(
      `INSERT INTO shipments (
         id, owner_user_id, shipment_code, customer_id, customer_name, status,
         origin, destination, estimated_delivery_at, free_time_ends_at,
         legacy_data, created_by_id, archived_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $2, $12, NOW())
       ON CONFLICT (id) DO UPDATE SET
         shipment_code = EXCLUDED.shipment_code,
         customer_id = EXCLUDED.customer_id,
         customer_name = EXCLUDED.customer_name,
         status = EXCLUDED.status,
         origin = EXCLUDED.origin,
         destination = EXCLUDED.destination,
         estimated_delivery_at = EXCLUDED.estimated_delivery_at,
         free_time_ends_at = EXCLUDED.free_time_ends_at,
         archived_at = EXCLUDED.archived_at,
         legacy_data = EXCLUDED.legacy_data,
         updated_at = NOW()`,
      [
        shipment.id,
        ownerUserId,
        shipment.trackingNumber || shipment.id,
        shipment.customerId || null,
        shipment.customerName || null,
        shipment.status || "PENDING",
        shipment.origin || null,
        shipment.destination || null,
        shipment.estimatedDelivery || null,
        shipment.estimatedDelivery || null,
        asJson(shipment),
        shipment.isArchived ? new Date() : null,
      ]
    );
  }
}

async function bridgeTasks(client: Client, tasks: any[]) {
  for (const task of tasks) {
    await client.query(
      `INSERT INTO tasks (
         id, owner_user_id, title, description, status, priority, assigned_to_id,
         assigned_to_name, assigned_by_name, due_at, shipment_id, legacy_data, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         status = EXCLUDED.status,
         priority = EXCLUDED.priority,
         assigned_to_id = EXCLUDED.assigned_to_id,
         assigned_to_name = EXCLUDED.assigned_to_name,
         assigned_by_name = EXCLUDED.assigned_by_name,
         due_at = EXCLUDED.due_at,
         shipment_id = EXCLUDED.shipment_id,
         legacy_data = EXCLUDED.legacy_data,
         updated_at = NOW()`,
      [
        task.id,
        ownerUserId,
        task.title,
        task.description || null,
        task.status || "TODO",
        task.priority || "MEDIUM",
        task.assignedToUserId || null,
        task.assignedToName || null,
        task.assignedByName || null,
        task.dueDate || null,
        task.shipmentId || null,
        asJson(task),
      ]
    );
  }
}

async function bridgeDocuments(client: Client, documents: any[]) {
  for (const document of documents) {
    await client.query(
      `INSERT INTO documents (
         id, owner_user_id, title, file_name, file_size, storage_key,
         uploaded_by_name, shipment_id, visibility, legacy_data, archived_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'internal', $9::jsonb, $10, NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         file_name = EXCLUDED.file_name,
         file_size = EXCLUDED.file_size,
         storage_key = EXCLUDED.storage_key,
         uploaded_by_name = EXCLUDED.uploaded_by_name,
         shipment_id = EXCLUDED.shipment_id,
         archived_at = EXCLUDED.archived_at,
         legacy_data = EXCLUDED.legacy_data,
         updated_at = NOW()`,
      [
        document.id,
        ownerUserId,
        document.name || document.fileName || document.id,
        document.name || document.fileName || null,
        document.fileSize || null,
        document.url || document.id,
        document.uploadedBy || null,
        document.shipmentId || null,
        asJson(document),
        document.isArchived ? new Date() : null,
      ]
    );
  }
}

async function bridgeNotifications(client: Client, notifications: any[]) {
  for (const notification of notifications) {
    if (isLegacyDemoNotification(notification)) continue;
    await client.query(
      `INSERT INTO notifications (
         id, user_id, title, body, type, source_type, source_id, legacy_data, read_at, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         type = EXCLUDED.type,
         source_type = EXCLUDED.source_type,
         source_id = EXCLUDED.source_id,
         read_at = EXCLUDED.read_at,
         legacy_data = EXCLUDED.legacy_data`,
      [
        notification.id,
        ownerUserId,
        notification.title,
        notification.message || null,
        notification.type || "INFO",
        notification.link ? "route" : null,
        notification.link || null,
        asJson(notification),
        notification.isRead ? new Date() : null,
      ]
    );
  }
}

async function bridgeCheques(client: Client, cheques: any[]) {
  for (const cheque of cheques) {
    await client.query(
      `INSERT INTO cheques (
         id, owner_user_id, bank_name, cheque_number, amount, due_date,
         location, receiver, status, description, legacy_data, archived_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, NOW())
       ON CONFLICT (id) DO UPDATE SET
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
        ownerUserId,
        cheque.bankName || "",
        cheque.chequeNumber || cheque.id,
        Number(cheque.amount || 0),
        cheque.dueDate || null,
        cheque.location || null,
        cheque.receiver || null,
        cheque.status || "ACTIVE",
        cheque.description || null,
        asJson(cheque),
        cheque.status === "ARCHIVED" ? new Date() : null,
      ]
    );
  }
}

async function bridgeComplianceMeetings(client: Client, appointments: any[]) {
  for (const appointment of appointments) {
    await client.query(
      `INSERT INTO compliance_meetings (
         id, owner_user_id, title, organization_name, meeting_at, status,
         assigned_to_id, assigned_to_name, outcome, next_action_items,
         reminder_sent, legacy_data, archived_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, NOW())
       ON CONFLICT (id) DO UPDATE SET
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
        asJson(appointment),
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
           id, meeting_id, name, required, completed, file_name, legacy_data, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           required = EXCLUDED.required,
           completed = EXCLUDED.completed,
           file_name = EXCLUDED.file_name,
           legacy_data = EXCLUDED.legacy_data,
           updated_at = NOW()`,
        [
          document.id || crypto.randomUUID(),
          appointment.id,
          document.name || "Document",
          document.required !== false,
          Boolean(document.completed),
          document.fileName || null,
          asJson(document),
        ]
      );
    }
  }
}

async function bridgeQuotations(client: Client, quotes: any[]) {
  for (const quote of quotes) {
    await client.query(
      `INSERT INTO quotations (
         id, owner_user_id, quotation_number, customer_id, customer_name, customer_phone,
         origin_city, destination_city, cargo_type, weight, dimensions, pickup_date,
         delivery_date, requirements, base_rate, fuel_surcharge, loading_fees,
         toll_fees, insurance_percentage, profit_margin, total_price, valid_until,
         status, notes, legacy_data, archived_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb,
               $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25::jsonb, $26, NOW())
       ON CONFLICT (id) DO UPDATE SET
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
        asJson(Array.isArray(quote.requirements) ? quote.requirements : []),
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
        asJson(quote),
        quote.isArchived || quote.status === "ARCHIVED" ? new Date() : null,
      ]
    );
  }
}

async function bridgeChat(client: Client, channels: any[], messages: any[]) {
  // Live chat is now a canonical, tenant-scoped feature. Do not import legacy
  // channels/messages into chat tables; that can resurrect demo-era data.
  void client;
  void channels;
  void messages;
}

async function bridgeActivityLogs(client: Client, logs: any[]) {
  for (const log of logs) {
    await client.query(
      `INSERT INTO change_logs (
         id, actor_user_id, action, entity_type, entity_id, summary, after_json, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8::timestamptz, NOW()))
       ON CONFLICT (id) DO UPDATE SET
         action = EXCLUDED.action,
         entity_type = EXCLUDED.entity_type,
         entity_id = EXCLUDED.entity_id,
         summary = EXCLUDED.summary,
         after_json = EXCLUDED.after_json`,
      [
        `legacy-${log.id}`,
        ownerUserId,
        log.action || "legacy.activity",
        log.entityType || "legacy",
        log.entityId || null,
        log.details || log.action || "Legacy activity imported.",
        asJson(log),
        parseLegacyDate(log.createdAt),
      ]
    );
  }
}

function parseLegacyDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

async function bridge() {
  const schema = await fs.readFile(path.join(rootDir, "db", "schema.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(schema);
    await seedSaasFoundation(client);
    await seedRolesAndPermissions(client);
    await seedShipmentFormTemplates(client);

    const users = await getCollection(client, "users");
    const customers = await getCollection(client, "customers");
    const shipments = await getCollection(client, "shipments");
    const tasks = await getCollection(client, "tasks");
    const documents = await getCollection(client, "documents");
    const notifications = await getCollection(client, "notifications");
    const cheques = await getCollection(client, "cheques");
    const appointments = await getCollection(client, "appointments");
    const quotes = await getCollection(client, "quotes");
    const channels = await getCollection(client, "channels");
    const messages = await getCollection(client, "messages");
    const activityLogs = await getCollection(client, "activityLogs");

    await bridgeUsers(client, users);
    await bridgeCustomers(client, customers);
    await bridgeShipments(client, shipments);
    await bridgeTasks(client, tasks);
    await bridgeDocuments(client, documents);
    await bridgeNotifications(client, notifications);
    await bridgeCheques(client, cheques);
    await bridgeComplianceMeetings(client, appointments);
    await bridgeQuotations(client, quotes);
    await bridgeChat(client, channels, messages);
    await bridgeActivityLogs(client, activityLogs);
    await attachExistingDataToDefaultOrganization(client);

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          status: "ok",
          bridged: {
            users: users.length,
            customers: customers.length,
            shipments: shipments.length,
            tasks: tasks.length,
        documents: documents.length,
        notifications: notifications.length,
        cheques: cheques.length,
        appointments: appointments.length,
        quotes: quotes.length,
        channels: channels.length,
        messages: messages.length,
        activityLogs: activityLogs.length,
          },
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

bridge().catch((error) => {
  console.error("Canonical bridge failed:", error);
  process.exit(1);
});
