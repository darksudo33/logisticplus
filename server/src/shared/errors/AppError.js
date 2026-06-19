export class AppError extends Error {
  constructor(message, { statusCode = 500, code = "APP_ERROR", field, details, cause } = {}) {
    super(message, { cause });
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
    this.details = details;
  }
}
