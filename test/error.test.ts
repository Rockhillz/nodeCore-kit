import { describe, expect, it } from "vitest";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ExistingError,
  HTTP_STATUS,
  HTTP_STATUS_CODE_ERROR,
  NotFoundError,
  ServerError,
  TooManyRequestsError,
  ValidationError,
  errorHandler,
  isAppError,
} from "../src/core/error";

describe("AppError", () => {
  it("sets native cause from meta.cause and hides it from details", () => {
    const root = new Error("db down");
    const err = new ServerError("Failed", { cause: root, table: "users" });

    expect(err.cause).toBe(root);
    expect(err.details).toEqual({ table: "users" });
    expect(err.isOperational).toBe(false);
  });

  it("marks 4xx errors as operational", () => {
    expect(new NotFoundError().isOperational).toBe(true);
  });

  it("serialises to JSON without the cause", () => {
    const json = JSON.parse(
      JSON.stringify(new ValidationError("Bad email", { field: "email", cause: new Error("x") })),
    );
    expect(json).toEqual({
      name: "ValidationError",
      message: "Bad email",
      statusCode: 422,
      errorCode: "VALIDATION_ERROR",
      details: { field: "email" },
    });
  });

  it("defaults errorCode from the status table", () => {
    expect(new AppError(HTTP_STATUS.BAD_REQUEST).errorCode).toBe("BAD_REQUEST");
  });

  it("keeps ExistingError as an alias of ConflictError", () => {
    const err = new ExistingError("exists");
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.statusCode).toBe(409);
  });

  it("each class uses the code from HTTP_STATUS_CODE_ERROR", () => {
    expect(new BadRequestError().errorCode).toBe(HTTP_STATUS_CODE_ERROR[400]);
    expect(new ServerError().errorCode).toBe(HTTP_STATUS_CODE_ERROR[500]);
    expect(new ValidationError().errorCode).toBe(HTTP_STATUS_CODE_ERROR[422]);
  });
});

describe("isAppError", () => {
  it("recognises errors from another copy of the package", () => {
    // Simulates a second copy of nodecore-kit: same brand, different class
    const foreign = Object.assign(new Error("from copy B"), { statusCode: 404 });
    Object.defineProperty(foreign, Symbol.for("nodecore-kit.AppError"), { value: true });

    expect(foreign instanceof AppError).toBe(false);
    expect(isAppError(foreign)).toBe(true);
  });

  it("rejects plain errors and non-errors", () => {
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError("x")).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe("errorHandler", () => {
  it("hides the message of unknown errors by default", () => {
    const res = errorHandler(new Error("duplicate key in table users_secret"));
    expect(res).toMatchObject({
      message: "Something went wrong",
      error: "FATAL_ERROR",
      httpStatusCode: 500,
    });
  });

  it("exposes unknown errors when asked", () => {
    const res = errorHandler(new TypeError("x is undefined"), { exposeUnknown: true });
    expect(res).toMatchObject({ message: "x is undefined", error: "TypeError" });
  });

  it("includes details for 4xx but not 5xx", () => {
    expect(errorHandler(new ValidationError("bad", { fields: ["email"] })).details).toEqual({
      fields: ["email"],
    });
    expect(errorHandler(new ServerError("boom", { host: "db-1" })).details).toBeUndefined();
  });

  it("supports the legacy positional form", () => {
    const res = errorHandler(new Error("x"), "CUSTOM_ERROR", "auth-service");
    expect(res).toMatchObject({ error: "CUSTOM_ERROR", service: "auth-service" });
  });

  it("includes service and requestId from options", () => {
    const res = errorHandler(new NotFoundError("nope"), { service: "orders", requestId: "r-1" });
    expect(res).toEqual({
      success: false,
      message: "nope",
      error: "NOT_FOUND",
      httpStatusCode: 404,
      service: "orders",
      requestId: "r-1",
    });
  });

  it("maps TooManyRequestsError to 429", () => {
    expect(errorHandler(new TooManyRequestsError("slow down", { retryAfter: 5 }))).toMatchObject({
      httpStatusCode: 429,
      error: "TOO_MANY_REQUESTS",
      details: { retryAfter: 5 },
    });
  });
});
