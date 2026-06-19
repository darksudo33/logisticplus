import {
  dailyStatusAuditSnapshot,
  getDailyStatusBoardRow,
  getDailyStatusBoardRows,
  updateDailyStatusRow,
} from "./daily-status.repository.js";

export function createDailyStatusService(pool) {
  return {
    list: (params) => getDailyStatusBoardRows(pool, params),
    get: (params) => getDailyStatusBoardRow(pool, params),
    update: (params) => updateDailyStatusRow(pool, params),
    auditSnapshot: dailyStatusAuditSnapshot,
  };
}
