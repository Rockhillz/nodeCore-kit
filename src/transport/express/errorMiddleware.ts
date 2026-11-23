import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import {
  errorHandler,
  isAppError,
  defaultLogger,
  type ErrorHandlerOptions,
  type Logger,
} from "../../core/index.js";

export interface ExpressErrorMiddlewareOptions
  extends Omit<ErrorHandlerOptions, "requestId"> {
  /** Where failures are logged (default: warnings and errors to the console) */
  logger?: Logger;
  /** Request header to read a request ID from (default: "x-request-id") */
  requestIdHeader?: string;
}

/**
 * Express error-handling middleware built on top of `errorHandler`.
 * Add it after all routes.
 *
 * - 5xx errors are logged at `error` level, 4xx at `debug`
 * - `Retry-After` is set when the error has `meta.retryAfter`
 * - The request ID header, if present, is echoed in the response body
 * - If headers were already sent, it hands off to Express's default handler
 *
 * @example
 * app.use(expressErrorMiddleware({ service: "orders", logger }));
 */
export const expressErrorMiddleware = (
  options: ExpressErrorMiddlewareOptions = {},
): ErrorRequestHandler => {
  const { logger = defaultLogger, requestIdHeader = "x-request-id", ...handlerOptions } = options;

  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) return next(err);

    const headerValue = req.headers?.[requestIdHeader.toLowerCase()];
    const requestId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    const response = errorHandler(err, { ...handlerOptions, requestId });

    const logMeta = { err, method: req.method, path: req.originalUrl ?? req.url, requestId };
    if (response.httpStatusCode >= 500) {
      logger.error("Request failed", logMeta);
    } else {
      logger.debug?.("Request rejected", logMeta);
    }

    const retryAfter = isAppError(err) ? err.meta?.retryAfter : undefined;
    if (typeof retryAfter === "number") res.setHeader("Retry-After", String(retryAfter));

    res.status(response.httpStatusCode).json(response);
  };
};
