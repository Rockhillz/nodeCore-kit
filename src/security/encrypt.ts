import crypto from "crypto";
import { ValidationError, ServerError } from "../core/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EncryptionAlgorithm = "aes-256-gcm" | "aes-256-cbc" | "aes-128-gcm";

export interface EncryptOptions {
  secret: string;
  algorithm?: EncryptionAlgorithm;
}

interface EncryptedPayload {
  alg: EncryptionAlgorithm;
  data: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IV_LENGTH: Record<EncryptionAlgorithm, number> = {
  "aes-256-gcm": 12,
  "aes-128-gcm": 12,
  "aes-256-cbc": 16,
};

const KEY_LENGTH: Record<EncryptionAlgorithm, number> = {
  "aes-256-gcm": 32,
  "aes-128-gcm": 16,
  "aes-256-cbc": 32,
};

const TAG_LENGTH = 16;
const DEFAULT_ALGORITHM: EncryptionAlgorithm = "aes-256-gcm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const deriveKey = (secret: string, algorithm: EncryptionAlgorithm): Buffer => {
  return crypto
    .createHash("sha256")
    .update(secret)
    .digest()
    .subarray(0, KEY_LENGTH[algorithm]);
};

const isGCM = (algorithm: EncryptionAlgorithm): boolean =>
  algorithm.includes("gcm");

// ─── Encrypt ─────────────────────────────────────────────────────────────────

/**
 * Encrypts a string or object. Defaults to AES-256-GCM.
 * available algorithms: "aes-256-gcm", "aes-128-gcm", "aes-256-cbc"
 *
 * @example
 * encrypt({ id: 1 }, { secret: process.env.ENCRYPTION_KEY });
 * encrypt("hello",   { secret: process.env.ENCRYPTION_KEY, algorithm: "aes-256-cbc" });
 */
export const encrypt = (
  data: string | Record<string, any>,
  { secret, algorithm = DEFAULT_ALGORITHM }: EncryptOptions,
): string => {
  if (!secret) throw new ValidationError("Encryption key is required");
  if (data === undefined || data === null)
    throw new ValidationError("Data to encrypt is required");

  try {
    const key = deriveKey(secret, algorithm);
    const iv = crypto.randomBytes(IV_LENGTH[algorithm]);

    // Bundle algorithm + data into the payload before encrypting
    // This hides the algorithm inside the ciphertext
    const payload: EncryptedPayload = {
      alg: algorithm,
      data: typeof data === "string" ? data : JSON.stringify(data),
    };

    // Encrypt
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);

    if (isGCM(algorithm)) {
      const authTag = (cipher as crypto.CipherGCM).getAuthTag();
      return Buffer.concat([iv, authTag, encrypted]).toString("base64");
    }

    return Buffer.concat([iv, encrypted]).toString("base64");
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ServerError("Encryption failed", { cause: err });
  }
};

// ─── Decrypt ─────────────────────────────────────────────────────────────────

/**
 * Decrypts a string produced by `encrypt()`.
 * Algorithm is inferred automatically from inside the decrypted payload.
 * Automatically parses JSON if the original data was an object.
 *
 * @example
 * const data = decrypt(token, { secret: process.env.ENCRYPTION_KEY });
 * // { id: 1 }
 */
export const decrypt = <T = any>(
  encrypted: string,
  { secret }: Omit<EncryptOptions, "algorithm">,
): T => {
  if (!secret) throw new ValidationError("Encryption key is required");
  if (!encrypted) throw new ValidationError("Encrypted data is required");

  try {
    // We don't know the algorithm yet — try default first to extract the payload
    // Strategy: attempt GCM first (most common), fall back to CBC
    const buffer = Buffer.from(encrypted, "base64");

    let decryptedPayload: EncryptedPayload | null = null;

    // Try each algorithm until one works
    for (const algorithm of Object.keys(IV_LENGTH) as EncryptionAlgorithm[]) {
      try {
        const key = deriveKey(secret, algorithm);
        const ivLen = IV_LENGTH[algorithm];
        const iv = buffer.subarray(0, ivLen);

        let decrypted: string;

        if (isGCM(algorithm)) {
          const authTag = buffer.subarray(ivLen, ivLen + TAG_LENGTH);
          const ciphertext = buffer.subarray(ivLen + TAG_LENGTH);
          // Decrypt
          const decipher = crypto.createDecipheriv(algorithm, key, iv);

          if (isGCM(algorithm)) {
            (decipher as crypto.DecipherGCM).setAuthTag(authTag);
          }

          decrypted =
            decipher.update(ciphertext, undefined, "utf8") +
            decipher.final("utf8");
        } else {
          const ciphertext = buffer.subarray(ivLen);
          const decipher = crypto.createDecipheriv(algorithm, key, iv);
          decrypted =
            decipher.update(ciphertext, undefined, "utf8") +
            decipher.final("utf8");
        }

        const parsed = JSON.parse(decrypted) as EncryptedPayload;

        // Confirm this is our payload shape and the algorithm matches
        if (parsed?.alg && parsed?.data && parsed.alg === algorithm) {
          decryptedPayload = parsed;
          break;
        }
      } catch {
        // This algorithm didn't work — try the next one
        continue;
      }
    }

    if (!decryptedPayload) {
      throw new ValidationError(
        "Decryption failed — invalid key or corrupted data",
      );
    }

    // Try to parse data as JSON (was an object), fall back to raw string
    try {
      return JSON.parse(decryptedPayload.data) as T;
    } catch {
      return decryptedPayload.data as T;
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ServerError("Decryption failed — invalid key or corrupted data", {
      cause: err,
    });
  }
};
