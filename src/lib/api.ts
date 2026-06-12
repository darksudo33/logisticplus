export type ApiErrorPayload = {
  code?: string;
  message?: string;
  field?: string;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  field?: string;

  constructor(message: string, { status, code, field }: { status: number; code?: string; field?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: ApiErrorPayload;
};

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

export async function apiRequest<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body as BodyInit | undefined;

  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body,
  });
  const payload = await parseResponse(response).catch(() => null);

  if (!response.ok || (payload && typeof payload === "object" && payload.ok === false)) {
    const envelope = payload as ApiEnvelope<T> | null;
    const error = envelope?.error || {};
    throw new ApiError(error.message || response.statusText || "Request failed.", {
      status: response.status,
      code: error.code,
      field: error.field,
    });
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }

  return payload as T;
}

export const apiGet = <T>(url: string) => apiRequest<T>(url);
export const apiPost = <T>(url: string, body?: unknown, options: ApiRequestOptions = {}) =>
  apiRequest<T>(url, { ...options, method: "POST", body });
export const apiPatch = <T>(url: string, body?: unknown, options: ApiRequestOptions = {}) =>
  apiRequest<T>(url, { ...options, method: "PATCH", body });
export const apiDelete = <T>(url: string, options: ApiRequestOptions = {}) =>
  apiRequest<T>(url, { ...options, method: "DELETE" });
