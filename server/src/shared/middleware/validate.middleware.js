import { z } from "zod";

export { z };

function issueField(issue) {
  return issue?.path?.length ? issue.path.join(".") : undefined;
}

function validationMessage(error, fallbackMessage) {
  return fallbackMessage || error?.issues?.[0]?.message || "Request validation failed.";
}

export function sendValidationError(res, error, { code = "VALIDATION_ERROR", message } = {}) {
  const firstIssue = error?.issues?.[0];
  return res.status(400).json({
    ok: false,
    error: {
      code,
      message: validationMessage(error, message),
      ...(issueField(firstIssue) ? { field: issueField(firstIssue) } : {}),
    },
  });
}

export function parseRequestValue(res, schema, value, options = {}) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  sendValidationError(res, result.error, options);
  return null;
}
