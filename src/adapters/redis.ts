import RedisClient, { RedisOptions } from "ioredis";

import {
  AuthenticationError,
  ValidationError,
  ServerError,
  parseJSON,
} from "../core/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type DurationUnit =
  | "seconds" | "second"
  | "minutes" | "minute"
  | "hours"   | "hour"
  | "days"    | "day";

interface Logger {
  info: (msg: string, meta?: any) => void;
  error: (msg: string, meta?: any) => void;
  warn: (msg: string, meta?: any) => void;
  debug: (msg: string, meta?: any) => void;
}

const defaultLogger: Logger = {
  info:  (msg, meta?) => console.info(msg, meta),
  error: (msg, meta?) => console.error(msg, meta),
  warn:  (msg, meta?) => console.warn(msg, meta),
  debug: (msg, meta?) => console.debug(msg, meta),
};

// ─── Class ────────────────────────────────────────────────────────────────────

export class Redis {
  private client: RedisClient;
  private logger: Logger;

  constructor(url: string, options: RedisOptions = {}, logger?: Logger) {
    if (!url) throw new ValidationError("Redis connection URL is required");

    this.logger = logger ?? defaultLogger;
    this.client = new RedisClient(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      ...options,
    });

    this.registerListeners();
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  private registerListeners(): void {
    this.client.on("connect",     () => this.logger.info("Redis connected"));
    this.client.on("ready",       () => this.logger.info("Redis ready"));
    this.client.on("close",       () => this.logger.warn("Redis connection closed"));
    this.client.on("reconnecting",() => this.logger.warn("Redis reconnecting..."));
    this.client.on("error",   (err) => this.logger.error("Redis error", { err }));
  }

  async start(): Promise<void> {
    try {
      if (this.client.status === "ready") return;
      await this.client.connect();
    } catch (err) {
      throw new ServerError("Failed to connect to Redis", { cause: err });
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client.status !== "end") await this.client.quit();
    } catch {
      await this.client.disconnect();
    }
  }

  // ─── Key Helpers ──────────────────────────────────────────────────────────

  private validateKey(key: string): void {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a non-empty string");
    }
  }

  private buildKey(...parts: string[]): string {
    return parts.join(":");
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  private serialize(data: any): string {
    if (typeof data === "string") return data;
    if (typeof data === "number") return String(data);
    return JSON.stringify(data);
  }

  private deserialize<T>(data: string | null, parse = true): T | null {
    if (!parse || !data) return data as any;
    return parseJSON(data) as T;
  }

  // ─── Core Operations ─────────────────────────────────────────────────────

  async set(key: string, data: any): Promise<"OK"> {
    this.validateKey(key);
    return this.client.set(key, this.serialize(data));
  }

  async setEx(key: string, data: any, duration: number | string): Promise<"OK"> {
    this.validateKey(key);
    const ttl = this.parseDuration(duration);
    return this.client.setex(key, ttl, this.serialize(data));
  }

  async get<T = any>(key: string, parse = true): Promise<T | null> {
    this.validateKey(key);
    const data = await this.client.get(key);
    return this.deserialize<T>(data, parse);
  }

  async delete(key: string): Promise<boolean> {
    this.validateKey(key);
    return Boolean(await this.client.del(key));
  }

  async exists(key: string): Promise<boolean> {
    return Boolean(await this.client.exists(key));
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async expire(key: string, duration: number | string): Promise<boolean> {
    const ttl = this.parseDuration(duration);
    return Boolean(await this.client.expire(key, ttl));
  }

  // ─── Increment / Decrement ────────────────────────────────────────────────

  /**
   * Atomically increments a counter. Creates it at 1 if it doesn't exist.
   * Optionally sets a TTL on first creation.
   *
   * @example
   * await redis.increment("rate:user:123");            // 1, 2, 3...
   * await redis.increment("rate:user:123", "1 hour");  // resets TTL each time
   */
  async increment(key: string, ttl?: number | string): Promise<number> {
    this.validateKey(key);
    const value = await this.client.incr(key);
    if (ttl && value === 1) await this.expire(key, ttl);
    return value;
  }

  /**
   * Atomically decrements a counter.
   */
  async decrement(key: string): Promise<number> {
    this.validateKey(key);
    return this.client.decr(key);
  }

  // ─── Hash Operations ──────────────────────────────────────────────────────

  /**
   * Sets one or more fields on a Redis hash.
   *
   * @example
   * await redis.hset("user:1", { name: "Alice", role: "admin" });
   */
  async hset(key: string, data: Record<string, any>): Promise<number> {
    this.validateKey(key);
    const serialized = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, this.serialize(v)])
    );
    return this.client.hset(key, serialized);
  }

  /**
   * Gets a single field from a Redis hash.
   */
  async hget<T = any>(key: string, field: string): Promise<T | null> {
    this.validateKey(key);
    const data = await this.client.hget(key, field);
    return this.deserialize<T>(data);
  }

  /**
   * Gets all fields from a Redis hash as a typed object.
   */
  async hgetAll<T extends Record<string, any> = Record<string, any>>(
    key: string
  ): Promise<T | null> {
    this.validateKey(key);
    const data = await this.client.hgetall(key);
    if (!data || Object.keys(data).length === 0) return null;
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, this.deserialize(v)])
    ) as T;
  }

  /**
   * Deletes one or more fields from a Redis hash.
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    this.validateKey(key);
    return this.client.hdel(key, ...fields);
  }

  // ─── Scan-based Key Operations ────────────────────────────────────────────

  /**
   * Safely scans for keys matching a pattern using SCAN (non-blocking).
   * Prefer this over KEYS in production — KEYS blocks the event loop.
   *
   * @example
   * await redis.scan("user:*")    // ["user:1", "user:2", ...]
   */
  async scan(pattern: string): Promise<string[]> {
    if (!pattern || typeof pattern !== "string") {
      throw new ValidationError("Redis scan pattern must be a string");
    }

    const keys: string[] = [];
    let cursor = "0";

    do {
      const [nextCursor, batch] = await this.client.scan(
        cursor,
        "MATCH", pattern,
        "COUNT", 100,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== "0");

    return keys;
  }

  /**
   * Deletes all keys matching a pattern using SCAN + batched DEL.
   * Safe for large keyspaces.
   *
   * @example
   * await redis.deleteByPattern("session:*")  // clears all sessions
   */
  async deleteByPattern(pattern: string): Promise<number> {
    const keys = await this.scan(pattern);
    if (!keys.length) return 0;

    // Batch deletes to avoid overloading Redis with huge DEL commands
    const batchSize = 100;
    let deleted = 0;

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      deleted += await this.client.del(...batch);
    }

    return deleted;
  }

  /**
   * @deprecated Use `scan()` instead — KEYS blocks the Redis event loop.
   */
  async keys(pattern: string): Promise<string[]> {
    if (!pattern || typeof pattern !== "string") {
      throw new ValidationError("Redis key pattern must be a string");
    }
    this.logger.warn("redis.keys() uses KEYS command — use redis.scan() in production");
    return this.client.keys(pattern);
  }

  /**
   * @deprecated Use `deleteByPattern()` instead.
   */
  async deleteAll(prefix: string): Promise<number> {
    this.logger.warn("redis.deleteAll() uses KEYS — use redis.deleteByPattern() in production");
    const keys = await this.keys(prefix);
    if (!keys.length) return 0;
    return this.client.del(...keys);
  }

  /**
   * Flushes the current database. Intended for testing only.
   * Throws in production unless `force: true` is passed.
   */
  async flush(force = false): Promise<void> {
    if (process.env.NODE_ENV === "production" && !force) {
      throw new ServerError("redis.flush() is disabled in production. Pass force=true to override.");
    }
    await this.client.flushdb();
    this.logger.warn("Redis database flushed", { env: process.env.NODE_ENV });
  }

  // ─── Auth Cache Helpers ───────────────────────────────────────────────────

  private authKey(id: string):    string { return this.buildKey("auth", id, "token"); }
  private tokenKey(ref: string):  string { return this.buildKey("auth", "token", ref); }

  async getCachedUser<T = any>(id: string, throwError = true): Promise<T | null> {
    const user = await this.get<T>(this.authKey(id));

    if (!user && throwError) {
      throw new AuthenticationError("Session not found, please log in again");
    }

    return user;
  }

  async cacheUser(user: any, ttl: number | string = "1 day"): Promise<void> {
    if (!user?.id || !user?.tokenRef) {
      throw new ValidationError("User object must have `id` and `tokenRef` fields");
    }

    await Promise.all([
      this.setEx(this.tokenKey(user.tokenRef), user, ttl),
      this.setEx(this.authKey(user.id), user, ttl),
    ]);
  }

  /**
   * Atomically updates an array field on a cached user.
   * Operates on a fresh copy to avoid mutating the cached object before re-save.
   */
  async updateAuthData(
    userId: string,
    key: string,
    value: string,
    action: "ADD" | "REMOVE" = "ADD",
  ): Promise<any> {
    const user = await this.getCachedUser(userId, false);
    if (!user) return null;
    if (!Array.isArray(user[key])) return user;

    // Work on a copy — don't mutate the cached reference before re-save succeeds
    const updated = {
      ...user,
      [key]:
        action === "ADD"
          ? user[key].includes(value) ? user[key] : [...user[key], value]
          : user[key].filter((v: string) => v !== value),
    };

    await this.cacheUser(updated);
    return updated;
  }

  // ─── Duration Parser ──────────────────────────────────────────────────────

  private parseDuration(duration: number | string): number {
    if (typeof duration === "number") return duration;

    const parts = duration.trim().split(/\s+/);
    if (parts.length !== 2) {
      throw new ValidationError(`Invalid duration format: "${duration}". Expected e.g. "1 hour"`);
    }

    const [valueStr, unit] = parts;
    const value = Number(valueStr);

    if (Number.isNaN(value) || value <= 0) {
      throw new ValidationError(`Duration value must be a positive number, got: "${valueStr}"`);
    }

    switch (unit as DurationUnit) {
      case "days":    case "day":    return value * 86400;
      case "hours":   case "hour":   return value * 3600;
      case "minutes": case "minute": return value * 60;
      case "seconds": case "second": return value;
      default:
        throw new ValidationError(`Invalid duration unit: "${unit}". Use seconds, minutes, hours, or days`);
    }
  }
}