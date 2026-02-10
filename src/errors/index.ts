export const HTTP_STATUS = {
  OK: { code: 200, message: "OK" },
  CREATED: { code: 201, message: "Created" },
  NO_CONTENT: { code: 204, message: "No Content" },
  EXISTING: { code: 206, message: "Already Existing" },
  BAD_REQUEST: { code: 400, message: "Bad Request" },
  UNAUTHORIZED: { code: 401, message: "Unauthorized" },
  FORBIDDEN: { code: 403, message: "Forbidden" },
  NOT_FOUND: { code: 404, message: "Not Found" },
  UNPROCESSABLE_ENTITY: { code: 422, message: "Unprocessable Entity" },
  TOKEN_EXPIRED: { code: 498, message: "Token Expired" },
  TOKEN_INVALID: { code: 499, message: "Token Invalid" },

  SERVER_ERROR: { code: 500, message: "Internal Server Error" },
} as const;

export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly statusMessage: string;

  constructor(status: HttpStatus, customMessage?: string | null) {
    super(customMessage || status.message);
    this.name = new.target.name;
    this.statusCode = status.code;
    this.statusMessage = status.message;
    Error.captureStackTrace(this, new.target);
  }
}

// ───────────────────────────────
// Specific error subclasses
// ───────────────────────────────

export class ValidationError extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.UNPROCESSABLE_ENTITY, message);
  }
}

export class AuthenticationError extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.UNAUTHORIZED, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.NOT_FOUND, message);
  }
}

export class TokenExpiredError extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.TOKEN_EXPIRED, message);
  }
}

export class TokenInvalidError extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.TOKEN_INVALID, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.BAD_REQUEST, message);
  }
}

export class ServerError extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.SERVER_ERROR, message);
  }
}

export class ExistingError extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.EXISTING, message);
  }
}

export class NoContent extends AppError {
  constructor(message?: string | null) {
    super(HTTP_STATUS.NO_CONTENT, message);
  }
}


export const errorHandler = (err: any = void 0, ERROR_TYPE = "FATAL_ERROR") => {
  try {
    let message: string;
    if (err && err.errors)
      message = err.errors[0]
        ? err.errors[0].message
        : err?.message || "Something went wrong.";
    else if (err && err.message) message = err.message;
    else if (typeof err == "string") message = err;
    else message = err?.message || "Something went wrong";

    const response: any = { success: false, message };
    response.error =
      err.name || HTTP_STATUS_CODE_ERROR[err.httpStatusCode] || ERROR_TYPE;
    if (err.httpStatusCode) response.httpStatusCode = err.httpStatusCode;
    response.service =
      err.service || process.env.APP_NAME || process.env.SERVICE_NAME;

    if (err.isAxiosError) {
      if (
        err?.response?.data instanceof Uint8Array ||
        err?.response?.data instanceof ArrayBuffer
      ) {
        response.message =
          JSON.parse(err?.response?.data?.toString())?.message ||
          err?.message ||
          "Something went wrong";
      } else {
        response.message =
          err?.response?.data?.message ||
          err?.message ||
          "Something went wrong";
      }

      response.httpStatusCode =
        err?.response?.data?.httpStatusCode || err?.response?.status;
      response.error =
        err?.response?.data?.error ||
        HTTP_STATUS_CODE_ERROR[response.httpStatusCode] ||
        ERROR_TYPE;
    }

    response.errorCode = err.errorCode || err?.response?.data?.errorCode;

    return response;
  } catch (err: any) {
    return {
      success: false,
      message:
        err?.message || err?.response?.data?.message || "Something went wrong",
      error: ERROR_TYPE,
      service: err?.service || process.env.APP_NAME || process.env.SERVICE_NAME,
      httpStatusCode: 500,
    };
  }
};

export const HTTP_STATUS_CODE_ERROR: any = {
  "400": "VALIDATION_ERROR",
  "401": "AUTHENTICATION_ERROR",
  "402": "PAYMENT_REQUIRED_ERROR",
  "403": "AUTHORISATION_ERROR",
  "404": "ENTRY_NOT_FOUND",
  "409": "ENTRY_EXISTS",
  "500": "FATAL_ERROR",
};