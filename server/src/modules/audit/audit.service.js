import {
  auditLog,
  listAuditLogs,
} from "./audit.repository.js";

export function createAuditService() {
  return {
    log: auditLog,
    list: listAuditLogs,
  };
}
