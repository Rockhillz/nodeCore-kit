import bcrypt from "bcrypt";
import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HashOptions {
  /** bcrypt salt rounds (default: 12) */
  rounds?: number;
}

export interface HmacOptions {
  /** HMAC algorithm (default: "sha256") */
  algorithm?: "sha256" | "sha512" | "sha1";
  /** Output encoding (default: "hex") */
  encoding?: "hex" | "base64";
}

export interface TokenOptions {
  /** Byte length of the random token (default: 32) */
  bytes?: number;
  /** Output encoding (default: "hex") */
  encoding?: "hex" | "base64url" | "base64";
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const hashService = {
  // ─── bcrypt ───────────────────────────────────────────────────────────────

  /**
   * Hashes a plain text value using bcrypt.
   * Use for passwords — bcrypt is intentionally slow and salted.
   *
   * @example
   * const hashed = await hashService.hash("myPassword123");
   */
  async hash(plain: string, { rounds = 12 }: HashOptions = {}): Promise<string> {
    if (!plain) throw new Error("Value to hash is required");
    return bcrypt.hash(plain, rounds);
  },

  /**
   * Compares a plain text value against a bcrypt hash.
   *
   * @example
   * const match = await hashService.compare("myPassword123", storedHash);
   * if (!match) throw new AuthenticationError("Invalid credentials");
   */
  async compare(plain: string, hashed: string): Promise<boolean> {
    if (!plain || !hashed) return false;
    return bcrypt.compare(plain, hashed);
  },

  /**
   * Returns true if the string looks like a bcrypt hash.
   * Useful for detecting already-hashed values before double-hashing.
   *
   * @example
   * hashService.isBcryptHash("$2b$12$...") // true
   */
  isBcryptHash(value: string): boolean {
    return /^\$2[abxy]\$\d{2}\$/.test(value);
  },

  // ─── HMAC ─────────────────────────────────────────────────────────────────

  /**
   * Creates an HMAC signature for a value using a secret key.
   * Use for signing data (webhooks, tokens, URLs) — NOT for passwords.
   *
   * @example
   * const sig = hashService.hmac("payload body", process.env.WEBHOOK_SECRET);
   */
  hmac(
    value: string,
    secret: string,
    { algorithm = "sha256", encoding = "hex" }: HmacOptions = {},
  ): string {
    if (!value) throw new Error("Value is required for HMAC");
    if (!secret) throw new Error("Secret key is required for HMAC");
    return crypto.createHmac(algorithm, secret).update(value).digest(encoding);
  },

  /**
   * Verifies an HMAC signature using a timing-safe comparison.
   * Always use this instead of `===` to prevent timing attacks.
   *
   * @example
   * const valid = hashService.verifyHmac(payload, secret, incomingSignature);
   * if (!valid) throw new Error("Invalid webhook signature");
   */
  verifyHmac(value: string, secret: string, signature: string, options?: HmacOptions): boolean {
    try {
      const expected = this.hmac(value, secret, options);
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  },

  // ─── SHA ──────────────────────────────────────────────────────────────────

  /**
   * Creates a one-way SHA hash of a value (no secret).
   * Use for content fingerprinting, cache keys, or deduplication.
   * NOT suitable for passwords.
   *
   * @example
   * const fingerprint = hashService.sha256("file contents here");
   */
  sha256(value: string, encoding: "hex" | "base64" = "hex"): string {
    if (!value) throw new Error("Value is required for sha256");
    return crypto.createHash("sha256").update(value).digest(encoding);
  },

  sha512(value: string, encoding: "hex" | "base64" = "hex"): string {
    if (!value) throw new Error("Value is required for sha512");
    return crypto.createHash("sha512").update(value).digest(encoding);
  },

  // ─── Random Tokens ────────────────────────────────────────────────────────

  /**
   * Generates a cryptographically secure random token.
   * Use for password reset tokens, email verification, API keys, etc.
   *
   * @example
   * const token = hashService.generateToken();            // 64-char hex string
   * const token = hashService.generateToken({ bytes: 16, encoding: "base64url" });
   */
  generateToken({ bytes = 32, encoding = "hex" }: TokenOptions = {}): string {
    return crypto.randomBytes(bytes).toString(encoding);
  },

  /**
   * Generates a token and returns both the raw value (to send to user)
   * and its SHA-256 hash (to store in the database).
   *
   * @example
   * const { token, hashed } = hashService.generateHashedToken();
   * await db.user.update({ resetToken: hashed, resetTokenExpiry: ... });
   * await email.send({ to: user.email, token }); // send raw token to user
   */
  generateHashedToken(options?: TokenOptions): { token: string; hashed: string } {
    const token = this.generateToken(options);
    const hashed = this.sha256(token);
    return { token, hashed };
  },
};