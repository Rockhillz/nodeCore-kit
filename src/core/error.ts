export const HTTP_STATUS = {
  OK: { code: 200, message: "OK" },
  CREATED: { code: 201, message: "Created" },
  NO_CONTENT: { code: 204, message: "No Content" },

  BAD_REQUEST: { code: 400, message: "Bad Request" },
  UNAUTHORIZED: { code: 401, message: "Unauthorized" },
  FORBIDDEN: { code: 403, message: "Forbidden" },
  NOT_FOUND: { code: 404, message: "Not Found" },
  CONFLICT: { code: 409, message: "Conflict" },
  UNPROCESSABLE_ENTITY: { code: 422, message: "Unprocessable Entity" },

  TOKEN_EXPIRED: { code: 498, message: "Token Expired" },
  TOKEN_INVALID: { code: 499, message: "Token Invalid" },

  SERVER_ERROR: { code: 500, message: "Internal Server Error" },
} as const;

export type HttpStatusKey = keyof typeof HTTP_STATUS;
export type HttpStatus = (typeof HTTP_STATUS)[HttpStatusKey];

export const HTTP_STATUS_CODE_ERROR: Record<number, string> = {
  400: "VALIDATION_ERROR",
  401: "AUTHENTICATION_ERROR",
  402: "PAYMENT_REQUIRED_ERROR",
  403: "AUTHORIZATION_ERROR",
  404: "NOT_FOUND",
  409: "ENTRY_EXISTS",
  422: "VALIDATION_ERROR",
  498: "TOKEN_EXPIRED",
  499: "TOKEN_INVALID",
  500: "FATAL_ERROR",
};

/**
 * Base class for all application errors.
 * Extends the native Error with an HTTP status code, status message,
 * optional machine-readable error code, and optional metadata.
 *
 * @example
 * throw new AppError(HTTP_STATUS.NOT_FOUND, "User not found", "NOT_FOUND");
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly statusMessage: string;
  public readonly errorCode?: string;
  public readonly meta?: Record<string, any>;

  constructor(
    status: HttpStatus,
    message?: string | null,
    errorCode?: string,
    meta?: Record<string, any>
  ) {
    super(message || status.message);

    this.name = new.target.name;
    this.statusCode = status.code;
    this.statusMessage = status.message;
    this.errorCode = errorCode;
    this.meta = meta;

    Error.captureStackTrace(this, new.target);
  }
}

// ─── Error Subclasses ─────────────────────────────────────────────────────────

/**
 * 422 — request is well-formed but contains invalid field values.
 *
 * @example
 * throw new ValidationError("Email is invalid");
 * throw new ValidationError("Validation failed", { fields: ["email", "name"] });
 */
export class ValidationError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.UNPROCESSABLE_ENTITY, message, "VALIDATION_ERROR", meta);
  }
}

/**
 * 401 — caller is not authenticated.
 *
 * @example
 * throw new AuthenticationError("Invalid credentials");
 */
export class AuthenticationError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.UNAUTHORIZED, message, "AUTHENTICATION_ERROR", meta);
  }
}

/**
 * 403 — caller is authenticated but not permitted to access this resource.
 *
 * @example
 * throw new AuthorizationError("You do not have permission to perform this action");
 */
export class AuthorizationError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
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
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.NOT_FOUND, message, "NOT_FOUND", meta);
  }
}

/**
 * 498 — token has passed its expiry time.
 *
 * @example
 * throw new TokenExpiredError("Session has expired, please log in again");
 */
export class TokenExpiredError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.TOKEN_EXPIRED, message, "TOKEN_EXPIRED", meta);
  }
}

/**
 * 499 — token is malformed or its signature is invalid.
 *
 * @example
 * throw new TokenInvalidError("Token is invalid");
 */
export class TokenInvalidError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.TOKEN_INVALID, message, "TOKEN_INVALID", meta);
  }
}

/**
 * 400 — request is malformed or missing required fields.
 *
 * @example
 * throw new BadRequestError("Request body is missing required fields");
 */
export class BadRequestError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.BAD_REQUEST, message, "BAD_REQUEST", meta);
  }
}

/**
 * 500 — unexpected server-side failure.
 * Use `meta` to attach the original cause without leaking internals to the client.
 *
 * @example
 * throw new ServerError("Failed to connect to database", { cause: err });
 */
export class ServerError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.SERVER_ERROR, message, "SERVER_ERROR", meta);
  }
}

/**
 * 409 — resource already exists.
 *
 * @example
 * throw new ExistingError("A user with this email already exists");
 */
export class ExistingError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.CONFLICT, message, "ENTRY_EXISTS", meta);
  }
}

/**
 * 204 — operation succeeded but there is no content to return.
 *
 * @example
 * throw new NoContent();
 */
export class NoContent extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.NO_CONTENT, message, "NO_CONTENT", meta);
  }
}

// ─── Error Handler ────────────────────────────────────────────────────────────

/**
 * Framework-agnostic error normalizer.
 * Converts any thrown value into a consistent response shape.
 * Handles AppError, Axios errors, native Error, and plain strings.
 *
 * @example
 * const response = errorHandler(err, "FATAL_ERROR", "auth-service");
 * res.status(response.httpStatusCode).json(response);
 */
export const errorHandler = (err: any, ERROR_TYPE = "FATAL_ERROR", service = "Unknown Service") => {
  const response = {
    success: false,
    message: "Something went wrong",
    error: ERROR_TYPE,
    httpStatusCode: 500,
    service,
  };

  try {
    if (!err) return response;

    if (err instanceof AppError) {
      return {
        ...response,
        message: err.message,
        error: err.errorCode || err.name,
        httpStatusCode: err.statusCode,
      };
    }

    if (err.isAxiosError) {
      return {
        ...response,
        message: err?.response?.data?.message || err.message || response.message,
        error:
          err?.response?.data?.error ||
          HTTP_STATUS_CODE_ERROR[err?.response?.status] ||
          ERROR_TYPE,
        httpStatusCode: err?.response?.status || 500,
      };
    }

    if (err instanceof Error) {
      return {
        ...response,
        message: err.message,
        error: err.name,
      };
    }

    if (typeof err === "string") {
      return {
        ...response,
        message: err,
      };
    }

    return response;
  } catch {
    return response;
  }
};

// ─── Express Middleware ───────────────────────────────────────────────────────

/**
 * Optional Express error-handling middleware built on top of `errorHandler`.
 * Drop at the end of your middleware chain to catch all unhandled errors.
 *
 * @example
 * app.use(expressErrorMiddleware());
 */
export const expressErrorMiddleware =
  () =>
  (err: any, req: any, res: any, next: any) => {
    const error = errorHandler(err);
    res.status(error.httpStatusCode).json(error);
  };