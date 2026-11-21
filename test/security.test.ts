import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { jwtService } from "../src/security/jwt";
import { encrypt, decrypt, EncryptionAlgorithm } from "../src/security/encrypt";
import {
  errorHandler,
  TokenExpiredError,
  TokenInvalidError,
  ValidationError,
} from "../src/core/error";

const secretKey = "test-secret";

describe("jwtService", () => {
  it("round-trips a payload", async () => {
    const token = await jwtService.encode({ data: { userId: 1 }, secretKey });
    const payload = await jwtService.decode<{ userId: number }>({ token, secretKey });
    expect(payload.userId).toBe(1);
  });

  it("throws TokenExpiredError for an expired token", async () => {
    const token = jwt.sign({ userId: 1, exp: Math.floor(Date.now() / 1000) - 10 }, secretKey);
    const err = await jwtService.decode({ token, secretKey }).catch((e) => e);

    expect(err).toBeInstanceOf(TokenExpiredError);
    expect(errorHandler(err).httpStatusCode).toBe(498);
  });

  it("throws TokenInvalidError for a malformed token", async () => {
    const err = await jwtService.decode({ token: "abc.def.ghi", secretKey }).catch((e) => e);

    expect(err).toBeInstanceOf(TokenInvalidError);
    expect(errorHandler(err).httpStatusCode).toBe(499);
  });

  it("throws TokenInvalidError for a wrong secret", async () => {
    const token = await jwtService.encode({ data: { userId: 1 }, secretKey });
    const err = await jwtService.decode({ token, secretKey: "other" }).catch((e) => e);
    expect(err).toBeInstanceOf(TokenInvalidError);
  });
});

describe("encrypt / decrypt", () => {
  const opts = { secret: "s3cret" };
  const algorithms: EncryptionAlgorithm[] = ["aes-256-gcm", "aes-128-gcm", "aes-256-cbc"];

  it.each(algorithms)("round-trips an object with %s", (algorithm) => {
    const data = { a: 1, nested: { b: [1, 2] } };
    expect(decrypt(encrypt(data, { ...opts, algorithm }), opts)).toEqual(data);
  });

  it("round-trips an empty string", () => {
    expect(decrypt(encrypt("", opts), opts)).toBe("");
  });

  it("keeps numeric-looking strings as strings", () => {
    expect(decrypt(encrypt("123", opts), opts)).toBe("123");
    expect(decrypt(encrypt("true", opts), opts)).toBe("true");
  });

  it("still decrypts legacy payloads without a type flag", () => {
    // Build a pre-0.6.1 payload by hand: { alg, data } with no `t`
    const key = crypto.createHash("sha256").update(opts.secret).digest().subarray(0, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const body = JSON.stringify({ alg: "aes-256-gcm", data: JSON.stringify({ old: true }) });
    const enc = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
    const legacy = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");

    expect(decrypt(legacy, opts)).toEqual({ old: true });
  });

  it("fails with ValidationError for a wrong key", () => {
    const encrypted = encrypt("hello", opts);
    expect(() => decrypt(encrypted, { secret: "wrong" })).toThrow(ValidationError);
  });
});
