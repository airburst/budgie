// Error body and codes: SPEC section 2.4.

export type ErrorCode =
  | "bad_request"
  | "bad_code"
  | "bad_token"
  | "revoked"
  | "not_found"
  | "format_too_old"
  | "data_reset"
  | "body_too_large"
  | "too_many_envelopes"
  | "rate_limited"
  | "server_error"
  | "daily_limit";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  bad_code: 400,
  bad_token: 401,
  revoked: 401,
  not_found: 404,
  format_too_old: 409,
  data_reset: 409,
  body_too_large: 413,
  too_many_envelopes: 413,
  rate_limited: 429,
  server_error: 500,
  daily_limit: 503,
};

const MESSAGE: Record<ErrorCode, string> = {
  bad_request: "The request is not valid.",
  bad_code: "The code is not valid.",
  bad_token: "Missing or unknown device token.",
  revoked: "This device has been revoked.",
  not_found: "Not found.",
  format_too_old: "This app is too old to sync. Update it.",
  data_reset: "Cloud data was deleted. Start or Join again.",
  body_too_large: "Request body is too large.",
  too_many_envelopes: "Too many envelopes in one push.",
  rate_limited: "Too many requests. Try again later.",
  server_error: "Unexpected server error.",
  daily_limit: "Daily database limit reached. Try again later.",
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly extra: { retryAfter?: number; [k: string]: unknown } = {},
  ) {
    super(MESSAGE[code]);
  }
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function errorResponse(error: ApiError): Response {
  const { retryAfter, ...rest } = error.extra;
  const body: Record<string, unknown> = {
    error: error.code,
    message: error.message,
    ...rest,
  };
  const headers: Record<string, string> = {};
  if (retryAfter !== undefined) {
    body.retryAfter = retryAfter;
    headers["retry-after"] = String(retryAfter);
  }
  return jsonResponse(body, STATUS[error.code], headers);
}
