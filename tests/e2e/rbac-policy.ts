export type RoutePolicy = {
  family: string;
  method: string;
  path: string;
  auth: "public" | "required";
  permission: string | null;
  tenantScope: "public-safe" | "own-organization" | "platform-global";
};

export const RBAC_TENANT_POLICY: RoutePolicy[] = [
  { family: "auth", method: "GET", path: "/api/auth/me", auth: "required", permission: null, tenantScope: "own-organization" },
  { family: "shipments", method: "GET", path: "/api/shipments", auth: "required", permission: "shipments.view_all", tenantScope: "own-organization" },
  { family: "search", method: "GET", path: "/api/search", auth: "required", permission: "entity-specific", tenantScope: "own-organization" },
  { family: "shipments", method: "PATCH", path: "/api/shipments/:id/steps/:stepId", auth: "required", permission: "shipment_steps.update", tenantScope: "own-organization" },
  { family: "shipments", method: "POST", path: "/api/shipments/:id/tasks", auth: "required", permission: "tasks.create", tenantScope: "own-organization" },
  { family: "shipments", method: "GET", path: "/api/shipments/:id/progress", auth: "required", permission: "shipments.view_all|shipments.view_assigned", tenantScope: "own-organization" },
  { family: "shipments", method: "POST", path: "/api/shipments/:id/progress/start", auth: "required", permission: "shipments.update|shipment_steps.update", tenantScope: "own-organization" },
  { family: "shipments", method: "PATCH", path: "/api/shipments/:id/progress/current", auth: "required", permission: "shipments.update|shipment_steps.update", tenantScope: "own-organization" },
  { family: "shipments", method: "POST", path: "/api/shipments/:id/progress/blockers", auth: "required", permission: "shipments.update|shipment_steps.update", tenantScope: "own-organization" },
  { family: "shipments", method: "POST", path: "/api/shipments/:id/progress/unblock", auth: "required", permission: "shipments.update|shipment_steps.update", tenantScope: "own-organization" },
  { family: "customers", method: "GET", path: "/api/customers/:id", auth: "required", permission: "customers.view", tenantScope: "own-organization" },
  { family: "customers", method: "PATCH", path: "/api/customers/:id", auth: "required", permission: "customers.update", tenantScope: "own-organization" },
  { family: "tasks", method: "GET", path: "/api/tasks/:id", auth: "required", permission: "tasks.view_own|tasks.view_all", tenantScope: "own-organization" },
  { family: "tasks", method: "PATCH", path: "/api/tasks/:id", auth: "required", permission: "tasks.view_own|tasks.view_all", tenantScope: "own-organization" },
  { family: "tasks", method: "PATCH", path: "/api/tasks/:id/assign", auth: "required", permission: "tasks.assign|task.creator", tenantScope: "own-organization" },
  { family: "tasks", method: "PATCH", path: "/api/tasks/:id/status", auth: "required", permission: "tasks.view_own|tasks.view_all|assigned", tenantScope: "own-organization" },
  { family: "tasks", method: "GET", path: "/api/tasks/:id/events", auth: "required", permission: "tasks.view_own|tasks.view_all", tenantScope: "own-organization" },
  { family: "organization", method: "GET", path: "/api/organization/members", auth: "required", permission: "tasks.create|tasks.assign|shipment_steps.update|users.manage", tenantScope: "own-organization" },
  { family: "documents", method: "GET", path: "/api/documents/:id", auth: "required", permission: "documents.view_all", tenantScope: "own-organization" },
  { family: "documents", method: "PATCH", path: "/api/documents/:id", auth: "required", permission: "documents.view_all", tenantScope: "own-organization" },
  { family: "cheques", method: "GET", path: "/api/cheques/:id", auth: "required", permission: "cheques.manage", tenantScope: "own-organization" },
  { family: "compliance", method: "GET", path: "/api/compliance-meetings/:id", auth: "required", permission: "compliance.manage|assigned", tenantScope: "own-organization" },
  { family: "quotations", method: "GET", path: "/api/quotations/:id", auth: "required", permission: "quotations.manage", tenantScope: "own-organization" },
  { family: "archive", method: "POST", path: "/api/archive/:entityType/:entityId", auth: "required", permission: "archive.view", tenantScope: "own-organization" },
  { family: "changes", method: "GET", path: "/api/changes/:id", auth: "required", permission: "changes.view", tenantScope: "own-organization" },
  { family: "chat", method: "GET", path: "/api/chat/threads/:id/messages", auth: "required", permission: "chat.use", tenantScope: "own-organization" },
  { family: "platform-admin", method: "GET", path: "/api/admin/overview", auth: "required", permission: "platform.admin", tenantScope: "platform-global" },
  { family: "platform-admin", method: "GET", path: "/api/admin/contact-requests", auth: "required", permission: "platform.admin", tenantScope: "platform-global" },
  { family: "platform-admin", method: "GET", path: "/api/admin/sms-deliveries", auth: "required", permission: "platform.admin", tenantScope: "platform-global" },
  { family: "platform-admin", method: "GET", path: "/api/admin/sms-analytics", auth: "required", permission: "platform.admin", tenantScope: "platform-global" },
  { family: "platform-admin", method: "GET", path: "/api/admin/sms-templates", auth: "required", permission: "platform.admin", tenantScope: "platform-global" },
  { family: "platform-admin", method: "PATCH", path: "/api/admin/sms-templates/:key", auth: "required", permission: "platform.admin", tenantScope: "platform-global" },
  { family: "platform-admin", method: "POST", path: "/api/admin/sms-deliveries/run-worker", auth: "required", permission: "platform.admin", tenantScope: "platform-global" },
  { family: "public-contact", method: "POST", path: "/api/contact-requests", auth: "public", permission: null, tenantScope: "public-safe" },
  { family: "public-tracking", method: "GET", path: "/api/public/track/:token", auth: "public", permission: null, tenantScope: "public-safe" },
  { family: "public-tracking", method: "POST", path: "/api/public/track/search", auth: "public", permission: null, tenantScope: "public-safe" },
];

export const NORMAL_APP_ROUTE_FAMILIES = [
  "archive",
  "changes",
  "chat",
  "cheques",
  "compliance",
  "customers",
  "documents",
  "quotations",
  "search",
  "shipments",
  "tasks",
];
