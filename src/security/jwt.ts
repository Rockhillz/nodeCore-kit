import jwt, { JwtPayload, SignOptions, VerifyOptions } from "jsonwebtoken";
import { ValidationError } from "../core";

export interface JwtEncodeOptions {
  data: string | object | Buffer;
  secretKey: string;
  expiresIn?: string | number;
  algorithm?: SignOptions["algorithm"];
}

export interface JwtDecodeOptions {
  token: string;
  secretKey: string;
  algorithms?: string[];
}

export const jwtService = {
   /**
   * Signs a payload and returns a JWT string.
   *
   * @example
   * const token = await jwtService.encode({ data: { userId: 1 }, secretKey: "secret" });
   */
  async encode({
    data,
    secretKey,
    expiresIn = "24h",
    algorithm = "HS256",
  }: JwtEncodeOptions): Promise<string> {
    if (!secretKey) {
      throw new ValidationError("Secret key is required for JWT encoding");
    }

    const options: SignOptions = {
      expiresIn: expiresIn as any,
      algorithm,
    };

    return new Promise<string>((resolve, reject) => {
      jwt.sign(data, secretKey, options, (err, token) => {
        if (err || !token) return reject(err);
        resolve(token);
      });
    });
  },


    /**
   * Verifies and decodes a JWT string.
   * Throws a typed `JwtError` on expiry, invalid signature, or not-yet-valid tokens.
   *
   * @example
   * const payload = await jwtService.decode<{ userId: number }>({ token, secretKey: "secret" });
   */
  async decode<T = JwtPayload>({
    token,
    secretKey,
    algorithms,
  }: JwtDecodeOptions): Promise<T> {
    if (!secretKey) {
      throw new ValidationError("Secret key is required for JWT verification");
    }

    if (!token) {
      throw new ValidationError("JWT token is required");
    }

    const options: VerifyOptions = {};
    if (algorithms) {
      options.algorithms = algorithms as any;
    }

    return new Promise<T>((resolve, reject) => {
      jwt.verify(token, secretKey, options, (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded as T);
      });
    });
  },

    /**
   * Returns the expiry date of a token without verifying it.
   * Returns null if the token has no expiry or cannot be decoded.
   *
   * @example
   * jwtService.getExpiry(token) // Date | null
   */
  getExpiry(token: string): Date | null {
    const decoded = jwt.decode(token) as JwtPayload | null;
    if (!decoded?.exp) return null;
    return new Date(decoded.exp * 1000);
  },

   /**
   * Returns true if the token is expired, without verifying the signature.
   * Useful for checking whether to refresh a token before making a request.
   *
   * @example
   * if (jwtService.isExpired(token)) { ... }
   */
  isExpired(token: string): boolean {
    const expiry = this.getExpiry(token);
    if (!expiry) return false;
    return expiry < new Date();
  },

};