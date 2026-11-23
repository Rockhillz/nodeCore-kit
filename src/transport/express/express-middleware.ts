import type { Request } from "express";
import { AuthenticationError } from "../../core/index.js";

/**
 * Reads the token from an `Authorization: Bearer <token>` header.
 * The scheme is matched case-insensitively, as HTTP requires.
 *
 * @throws AuthenticationError (401) when the header is missing or malformed
 *
 * @example
 * const token = extractBearerToken(req);
 * const payload = await jwtService.verify({ token, secretKey });
 */
export function extractBearerToken(req: Request): string {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AuthenticationError("Authorization header missing");
  }

  const [scheme, token, ...rest] = authHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length) {
    throw new AuthenticationError("Invalid authorization format. Use Bearer <token>");
  }

  return token;
}
