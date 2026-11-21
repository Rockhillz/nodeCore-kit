import { describe, expect, it } from "vitest";
import * as kit from "../src/index";

// Everything the README tells users to import must actually be exported
const README_EXPORTS = [
  "uuid",
  "hashService",
  "jwtService",
  "encrypt",
  "decrypt",
  "joiMiddleware",
  "joiValidate",
  "makeRequest",
  "extractBearerToken",
  "retry",
  "debounce",
  "SQS",
  "S3",
  "Redis",
  "Cron",
  "Mailer",
  "SmtpProvider",
  "ResendProvider",
  "SendGridProvider",
  "WinstonLogger",
  "ValidationError",
  "AuthenticationError",
  "NotFoundError",
  "ServerError",
  "HttpError",
  "errorHandler",
  // added in 0.7
  "createHttpClient",
  "expressErrorMiddleware",
  "isAppError",
  "ConflictError",
  "ExistingError",
  "TooManyRequestsError",
  "ServiceUnavailableError",
  "BadGatewayError",
  "GatewayTimeoutError",
  "PaymentRequiredError",
  "consoleLogger",
  "noopLogger",
  "defaultLogger",
  // health & shutdown
  "createHealth",
  "gracefulShutdown",
  "closeHttpServer",
  "healthHandlers",
];

describe("public exports", () => {
  it.each(README_EXPORTS)("exports %s", (name) => {
    expect(kit).toHaveProperty(name);
  });
});
