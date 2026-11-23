// ─── Status Table ─────────────────────────────────────────────────────────────

export const HTTP_STATUS = {
  OK: { code: 200, message: "OK" },
  CREATED: { code: 201, message: "Created" },
  NO_CONTENT: { code: 204, message: "No Content" },

  BAD_REQUEST: { code: 400, message: "Bad Request" },
  UNAUTHORIZED: { code: 401, message: "Unauthorized" },
  PAYMENT_REQUIRED: { code: 402, message: "Payment Required" },
  FORBIDDEN: { code: 403, message: "Forbidden" },
  NOT_FOUND: { code: 404, message: "Not Found" },
  CONFLICT: { code: 409, message: "Conflict" },
  UNPROCESSABLE_ENTITY: { code: 422, message: "Unprocessable Entity" },
  TOO_MANY_REQUESTS: { code: 429, message: "Too Many Requests" },

  /** @deprecated Non-standard status. Token errors now use 401 with a TOKEN_* error code. */
  TOKEN_EXPIRED: { code: 498, message: "Token Expired" },
  /** @deprecated Non-standard status (nginx uses 499 for "client closed request"). */
  TOKEN_INVALID: { code: 499, message: "Token Invalid" },

  SERVER_ERROR: { code: 500, message: "Internal Server Error" },
  BAD_GATEWAY: { code: 502, message: "Bad Gateway" },
  SERVICE_UNAVAILABLE: { code: 503, message: "Service Unavailable" },
  GATEWAY_TIMEOUT: { code: 504, message: "Gateway Timeout" },
} as const;

export type HttpStatusKey = keyof typeof HTTP_STATUS;
export type HttpStatus = (typeof HTTP_STATUS)[HttpStatusKey];

/**
 * Default machine-readable error code for each status.
 * Matches the `errorCode` each error class below uses.
 */
export const HTTP_STATUS_CODE_ERROR: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "AUTHENTICATION_ERROR",
  402: "PAYMENT_REQUIRED",
  403: "AUTHORIZATION_ERROR",
  404: "NOT_FOUND",
  409: "ENTRY_EXISTS",
  422: "VALIDATION_ERROR",
  429: "TOO_MANY_REQUESTS",
  498: "TOKEN_EXPIRED",
  499: "TOKEN_INVALID",
  500: "SERVER_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
  504: "GATEWAY_TIMEOUT",
};

// ─── Base Class ───────────────────────────────────────────────────────────────

/**
 * Marks kit errors without relying on `instanceof`, which fails when two
 * copies of the package end up in `node_modules`.
 */
const APP_ERROR_BRAND = Symbol.for("nodecore-kit.AppError");

/**
 * Base class for all application errors.
 * Extends the native Error with an HTTP status code, status message,
 * machine-readable error code, and optional metadata.
 *
 * Pass `{ cause: err }` in `meta` to keep the original error: it is also
 * set as the native `error.cause`.
 *
 * @example
 * throw new AppError(HTTP_STATUS.NOT_FOUND, "User not found", "NOT_FOUND");
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly statusMessage: string;
  public readonly errorCode?: string;
  public readonly meta?: Record<string, any>;
  public readonly cause?: unknown;
  /** true for expected errors (4xx); false for failures that need attention (5xx) */
  public readonly isOperational: boolean;

  constructor(
    status: HttpStatus | { code: number; message: string },
    message?: string | null,
    errorCode?: string,
    meta?: Record<string, any>,
  ) {
    super(message || status.message);

    this.name = new.target.name;
    this.statusCode = status.code;
    this.statusMessage = status.message;
    this.errorCode = errorCode ?? HTTP_STATUS_CODE_ERROR[status.code];
    this.meta = meta;
    this.isOperational = status.code < 500;

    if (meta?.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: meta.cause,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }

    Object.defineProperty(this, APP_ERROR_BRAND, { value: true });
    Error.captureStackTrace?.(this, new.target);
  }

  /** `meta` without `cause`: the part that is safe to send to a client */
  get details(): Record<string, any> | undefined {
    if (!this.meta) return undefined;
    const { cause: _cause, ...rest } = this.meta;
    return Object.keys(rest).length ? rest : undefined;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Checks for a kit error. Works even when several copies of nodecore-kit are
 * installed, where `instanceof AppError` would return false.
 */
export const isAppError = (err: unknown): err is AppError =>
  err instanceof AppError ||
  (typeof err === "object" && err !== null && (err as any)[APP_ERROR_BRAND] === true);

type ErrorMeta = Record<string, any>;

// ─── 4xx ──────────────────────────────────────────────────────────────────────

/**
 * 400 — request is malformed or missing required fields.
 *
 * @example
 * throw new BadRequestError("Request body is missing required fields");
 */
export class BadRequestError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.BAD_REQUEST, message, "BAD_REQUEST", meta);
  }
}

/**
 * 401 — caller is not authenticated.
 *
 * @example
 * throw new AuthenticationError("Invalid credentials");
 */
export class AuthenticationError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.UNAUTHORIZED, message, "AUTHENTICATION_ERROR", meta);
  }
}

/**
 * 401 — token has passed its expiry time.
 * Error code `TOKEN_EXPIRED` lets clients know to refresh.
 *
 * @example
 * throw new TokenExpiredError("Session has expired, please log in again");
 */
export class TokenExpiredError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.UNAUTHORIZED, message || "Token has expired", "TOKEN_EXPIRED", meta);
  }
}

/**
 * 401 — token is malformed or its signature is invalid.
 *
 * @example
 * throw new TokenInvalidError("Token is invalid");
 */
export class TokenInvalidError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.UNAUTHORIZED, message || "Token is invalid", "TOKEN_INVALID", meta);
  }
}

/**
 * 402 — payment is required before the action can be performed.
 *
 * @example
 * throw new PaymentRequiredError("Upgrade your plan to export reports");
 */
export class PaymentRequiredError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.PAYMENT_REQUIRED, message, "PAYMENT_REQUIRED", meta);
  }
}

/**
 * 403 — caller is authenticated but not permitted to access this resource.
 *
 * @example
 * throw new AuthorizationError("You do not have permission to perform this action");
 */
export class AuthorizationError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.FORBIDDEN, message, "AUTHORIZATION_ERROR", meta);
  }
}

/**
 * 404 — requested resource does not exist.
 *
 * @example
 * throw new NotFoundError("User not found");
 */
export class NotFoundError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.NOT_FOUND, message, "NOT_FOUND", meta);
  }
}

/**
 * 409 — resource already exists or conflicts with its current state.
 *
 * @example
 * throw new ConflictError("A user with this email already exists");
 */
export class ConflictError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.CONFLICT, message, "ENTRY_EXISTS", meta);
  }
}

/** @deprecated Use `ConflictError`. Kept as an alias; will be removed in 1.0. */
export const ExistingError = ConflictError;
/** @deprecated Use `ConflictError`. */
export type ExistingError = ConflictError;

/**
 * 422 — request is well-formed but contains invalid field values.
 *
 * @example
 * throw new ValidationError("Email is invalid");
 * throw new ValidationError("Validation failed", { fields: ["email", "name"] });
 */
export class ValidationError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.UNPROCESSABLE_ENTITY, message, "VALIDATION_ERROR", meta);
  }
}

/**
 * 429 — caller is rate limited.
 * Pass `retryAfter` (seconds); `expressErrorMiddleware` sends it as a `Retry-After` header.
 *
 * @example
 * throw new TooManyRequestsError("Slow down", { retryAfter: 30 });
 */
export class TooManyRequestsError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta & { retryAfter?: number }) {
    super(HTTP_STATUS.TOO_MANY_REQUESTS, message, "TOO_MANY_REQUESTS", meta);
  }
}

// ─── 5xx ──────────────────────────────────────────────────────────────────────

/**
 * 500 — unexpected server-side failure.
 * Use `meta.cause` to attach the original error without leaking internals to the client.
 *
 * @example
 * throw new ServerError("Failed to connect to database", { cause: err });
 */
export class ServerError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.SERVER_ERROR, message, "SERVER_ERROR", meta);
  }
}

/**
 * 502 — an upstream service returned an invalid response or could not be reached.
 *
 * @example
 * throw new BadGatewayError("Payment provider unreachable", { cause: err });
 */
export class BadGatewayError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.BAD_GATEWAY, message, "BAD_GATEWAY", meta);
  }
}

/**
 * 503 — the service is temporarily unable to handle the request (maintenance, overload).
 *
 * @example
 * throw new ServiceUnavailableError("Down for maintenance", { retryAfter: 120 });
 */
export class ServiceUnavailableError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta & { retryAfter?: number }) {
    super(HTTP_STATUS.SERVICE_UNAVAILABLE, message, "SERVICE_UNAVAILABLE", meta);
  }
}

/**
 * 504 — an upstream service did not respond in time.
 *
 * @example
 * throw new GatewayTimeoutError("Inventory service timed out");
 */
export class GatewayTimeoutError extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.GATEWAY_TIMEOUT, message, "GATEWAY_TIMEOUT", meta);
  }
}

// ─── Deprecated ───────────────────────────────────────────────────────────────

/**
 * @deprecated 204 is a success status, not an error. Send the 204 response
 * directly instead of throwing. Will be removed in 1.0.
 */
export class NoContent extends AppError {
  constructor(message?: string | null, meta?: ErrorMeta) {
    super(HTTP_STATUS.NO_CONTENT, message, "NO_CONTENT", meta);
  }
}

// ─── HttpError ────────────────────────────────────────────────────────────────

/**
 * Thrown by `makeRequest` and `createHttpClient` when an upstream HTTP call fails.
 * Carries the upstream status code and the parsed response body.
 * Network failures use 502 and timeouts use 504.
 *
 * @example
 * try { await makeRequest({ url }); }
 * catch (err) { if (err instanceof HttpError) console.log(err.statusCode, err.body); }
 */
export class HttpError extends AppError {
  /** Parsed upstream response body (JSON object, or raw text) */
  public readonly body?: unknown;
  /** Request URL without its query string */
  public readonly url?: string;
  public readonly method?: string;
  /** Upstream response headers, when there was a response */
  public readonly headers?: Record<string, string>;

  constructor({
    statusCode,
    statusText,
    message,
    errorCode,
    body,
    url,
    method,
    headers,
    meta,
  }: {
    statusCode: number;
    statusText?: string;
    message?: string;
    errorCode?: string;
    body?: unknown;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    meta?: ErrorMeta;
  }) {
    super(
      { code: statusCode, message: statusText || "HTTP Error" },
      message,
      errorCode || HTTP_STATUS_CODE_ERROR[statusCode] || "HTTP_ERROR",
      meta,
    );
    this.body = body;
    this.url = url;
    this.method = method;
    this.headers = headers;
  }

  /** Alias kept for backwards compatibility with the old thrown object shape */
  get httpStatusCode(): number {
    return this.statusCode;
  }
}

// ─── Error Handler ────────────────────────────────────────────────────────────

export interface ErrorHandlerOptions {
  /** Service name included in the response (default: "Unknown Service") */
  service?: string;
  /** Error code used for errors that are not AppErrors (default: "FATAL_ERROR") */
  fallbackCode?: string;
  /**
   * Send the real message of unknown errors to the client (default: false).
   * Unknown errors can contain SQL, file paths or secrets, so only enable
   * this in development.
   */
  exposeUnknown?: boolean;
  /** Request or correlation ID to include in the response */
  requestId?: string;
}

export interface ErrorResponse {
  success: false;
  message: string;
  error: string;
  httpStatusCode: number;
  service: string;
  details?: Record<string, any>;
  requestId?: string;
}

const GENERIC_MESSAGE = "Something went wrong";

/**
 * Framework-agnostic error normalizer.
 * Converts any thrown value into a consistent response shape.
 *
 * - AppError: its message, code and status. For 4xx errors, `meta` (minus
 *   `cause`) is returned as `details`.
 * - Axios errors: upstream status and message.
 * - Anything else: a generic 500. The real message is hidden unless
 *   `exposeUnknown` is set, because it may leak internals.
 *
 * @example
 * const response = errorHandler(err, { service: "auth-service" });
 * res.status(response.httpStatusCode).json(response);
 *
 * // Legacy positional form still works
 * errorHandler(err, "FATAL_ERROR", "auth-service");
 */
export function errorHandler(err: unknown, options?: ErrorHandlerOptions): ErrorResponse;
export function errorHandler(err: unknown, errorType?: string, service?: string): ErrorResponse;
export function errorHandler(
  err: unknown,
  optionsOrType?: ErrorHandlerOptions | string,
  legacyService?: string,
): ErrorResponse {
  const options: ErrorHandlerOptions =
    typeof optionsOrType === "string"
      ? { fallbackCode: optionsOrType, service: legacyService }
      : { ...optionsOrType };

  const {
    service = "Unknown Service",
    fallbackCode = "FATAL_ERROR",
    exposeUnknown = false,
    requestId,
  } = options;

  const response: ErrorResponse = {
    success: false,
    message: GENERIC_MESSAGE,
    error: fallbackCode,
    httpStatusCode: 500,
    service,
    ...(requestId && { requestId }),
  };

  try {
    if (!err) return response;

    if (isAppError(err)) {
      const details = err.isOperational ? err.details : undefined;
      return {
        ...response,
        message: err.message,
        error: err.errorCode || err.name,
        httpStatusCode: err.statusCode,
        ...(details && { details }),
      };
    }

    const anyErr = err as any;
    if (anyErr.isAxiosError) {
      const status = anyErr.response?.status;
      return {
        ...response,
        message: anyErr.response?.data?.message || anyErr.message || GENERIC_MESSAGE,
        error: anyErr.response?.data?.error || HTTP_STATUS_CODE_ERROR[status] || fallbackCode,
        httpStatusCode: status || 500,
      };
    }

    if (exposeUnknown) {
      if (err instanceof Error) return { ...response, message: err.message, error: err.name };
      if (typeof err === "string") return { ...response, message: err };
    }

    return response;
  } catch {
    return response;
  }
}
