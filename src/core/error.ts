import { string } from "joi";

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

// ───────────────────────────────
// Specific error subclasses
// ───────────────────────────────

export class ValidationError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      message,
      "VALIDATION_ERROR",
      meta
    );
  }
}

export class AuthenticationError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(
      HTTP_STATUS.UNAUTHORIZED,
      message,
      "AUTHENTICATION_ERROR",
      meta
    );
  }
}

export class AuthorizationError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.FORBIDDEN, message, "AUTHORIZATION_ERROR", meta);
  }
}

export class NotFoundError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.NOT_FOUND, message, "NOT_FOUND", meta);
  }
}

export class TokenExpiredError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.TOKEN_EXPIRED, message, "TOKEN_EXPIRED", meta);
  }
}

export class TokenInvalidError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.TOKEN_INVALID, message, "TOKEN_INVALID", meta);
  }
}

export class BadRequestError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.BAD_REQUEST, message, "BAD_REQUEST", meta);
  }
}

export class ServerError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.SERVER_ERROR, message, "SERVER_ERROR", meta);
  }
}

export class ExistingError extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.CONFLICT, message, "ENTRY_EXISTS", meta);
  }
}

export class NoContent extends AppError {
  constructor(message?: string | null, meta?: Record<string, any>) {
    super(HTTP_STATUS.NO_CONTENT, message, "NO_CONTENT", meta);
  }
}

// ───────────────────────────────
// Error Handler (Framework Agnostic)
// ───────────────────────────────

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

    // Custom App Errors
    if (err instanceof AppError) {
      return {
        ...response,
        message: err.message,
        error: err.errorCode || err.name,
        httpStatusCode: err.statusCode,
      };
    }

    // Axios Errors
    if (err.isAxiosError) {
      return {
        ...response,
        message:
          err?.response?.data?.message || err.message || response.message,
        error:
          err?.response?.data?.error ||
          HTTP_STATUS_CODE_ERROR[err?.response?.status] ||
          ERROR_TYPE,
        httpStatusCode: err?.response?.status || 500,
      };
    }

    // Native Errors
    if (err instanceof Error) {
      return {
        ...response,
        message: err.message,
        error: err.name,
      };
    }

    // String Errors
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

// ───────────────────────────────
// Express Middleware (Optional Helper)
// ───────────────────────────────

export const expressErrorMiddleware =
  () =>
  (err: any, req: any, res: any, next: any) => {
    const error = errorHandler(err);
    res.status(error.httpStatusCode).json(error);
  };