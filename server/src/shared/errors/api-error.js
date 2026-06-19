export function createApiError(res, status, code, message, field) {
  return res.status(status).json({
    ok: false,
    error: { code, message, ...(field ? { field } : {}) },
  });
}
