import { Request } from "express";
import { ValidationError } from "../../core";

export function extractBearerToken(req: Request): string {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new ValidationError("Authorization header missing");
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new ValidationError("Invalid authorization format. Use Bearer <token>");
  }

  return token;
}