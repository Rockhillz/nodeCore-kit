import RedisClient, { RedisOptions } from "ioredis";

import {
  AuthenticationError,
  ValidationError,
  ServerError,
  parseJSON,
} from "../core/index.js";

type DurationUnit = "seconds" | "second" | "minutes" | "minute" | "hours" | "hour" | "days" | "day";

export class Redis {
  public client: RedisClient;

  constructor(url: string, options: RedisOptions = {}) {
    if (!url) throw new ValidationError("Redis connection URL is required");

    this.client = new RedisClient(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      ...options,
    });

    this.registerListeners();
  }

  private registerListeners() {
    this.client.on("connect", () => {
      console.info("🔴 Redis connected");
    });

    this.client.on("ready", () => {
      console.info("🟢 Redis ready");
    });

    this.client.on("error", (err) => {
      console.error("🔴 Redis error:", err);
    });

    this.client.on("close", () => {
      console.warn("🟠 Redis connection closed");
    });

    this.client.on("reconnecting", () => {
      console.warn("🟡 Redis reconnecting...");
    });
  }

  async start(): Promise<void> {
    try {
      if (this.client.status === "ready") return;
      await this.client.connect();
    } catch (err: any) {
      throw new ServerError("Failed to connect to Redis", { cause: err });
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client.status !== "end") {
        await this.client.quit();
      }
    } catch {
      await this.client.disconnect();
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!pattern || typeof pattern !== "string") {
      throw new ValidationError("Redis key pattern must be a string");
    }

    return this.client.keys(pattern);
  }

  private serialize(data: any): string {
    if (typeof data === "string") return data;
    if (typeof data === "number") return String(data);
    return JSON.stringify(data);
  }

  private deserialize(data: string | null, parse = true): any {
    if (!parse || !data) return data;
    return parseJSON(data);
  }

  async set(key: string, data: any): Promise<"OK"> {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a string");
    }

    return this.client.set(key, this.serialize(data));
  }

  async setEx(
    key: string,
    data: any,
    duration: number | string
  ): Promise<"OK"> {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a string");
    }

    const ttl = this.parseDuration(duration);

    return this.client.setex(key, ttl, this.serialize(data));
  }

  async get<T = any>(key: string, parse = true): Promise<T | null> {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a string");
    }

    const data = await this.client.get(key);
    return this.deserialize(data, parse);
  }

  async delete(key: string): Promise<boolean> {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a string");
    }

    return Boolean(await this.client.del(key));
  }

  async deleteAll(prefix: string): Promise<number> {
    const keys = await this.keys(prefix);
    if (!keys.length) return 0;

    return this.client.del(...keys);
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

  async flush(): Promise<void> {
    await this.client.flushdb();
  }

  // ───────────────────────────────
  // Auth Cache Helpers
  // ───────────────────────────────

  async getCachedUser<T = any>(id: string, throwError = true): Promise<T | null> {
    const userToken = `${id}-token`;
    const user = await this.get<T>(userToken);

    if (!user && throwError) {
      throw new AuthenticationError("Kindly login, user not found");
    }

    return user;
  }

  async cacheUser(user: any, ttl: number | string = "1 day"): Promise<void> {
    if (!user?.id || !user?.tokenRef) {
      throw new ValidationError("Invalid user object for caching");
    }

    await Promise.all([
      this.setEx(user.tokenRef, user, ttl),
      this.setEx(`${user.id}-token`, user, ttl),
    ]);
  }

  async updateAuthData(
    userId: string,
    key: string,
    value: string,
    action: "ADD" | "REMOVE" = "ADD"
  ): Promise<any> {
    const user = await this.getCachedUser(userId, false);

    if (!user) return null;

    if (!Array.isArray(user[key])) return user;

    if (action === "ADD" && !user[key].includes(value)) {
      user[key].push(value);
    }

    if (action === "REMOVE") {
      user[key] = user[key].filter((v: string) => v !== value);
    }

    await this.cacheUser(user);

    return user;
  }

  // ───────────────────────────────
  // Helpers
  // ───────────────────────────────

  private parseDuration(duration: number | string): number {
    if (typeof duration === "number") return duration;

    const [valueStr, unit] = duration.split(" ");
    const value = Number(valueStr);

    if (Number.isNaN(value)) {
      throw new ValidationError(`Invalid duration format: ${duration}`);
    }

    switch (unit as DurationUnit) {
      case "days":
      case "day":
        return value * 86400;

      case "hours":
      case "hour":
        return value * 3600;

      case "minutes":
      case "minute":
        return value * 60;

      case "seconds":
      case "second":
        return value;

      default:
        throw new ValidationError(`Invalid duration unit: ${unit}`);
    }
  }
}