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
};