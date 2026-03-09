// src/transport/http.ts
import Axios from "axios";

// src/core/async.ts
var sleep = (ms) => new Promise((res) => setTimeout(res, ms));
var retry = async (fn, options = {}) => {
  const { retries = 3, delay = 500, exponential = true, onError } = options;
  const attempt = async (remaining, currentDelay) => {
    try {
      return await fn();
    } catch (err) {
      if (remaining <= 0)
        throw err;
      onError?.(err, retries - remaining + 1);
      await sleep(currentDelay);
      const nextDelay = exponential ? currentDelay * 2 : currentDelay;
      return attempt(remaining - 1, nextDelay);
    }
  };
  return attempt(retries, delay);
};
var timeout = (promise, ms) => {
  let timer;
  const race = Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Operation timed out after ${ms}ms`)),
        ms
      );
    })
  ]);
  return race.finally(() => clearTimeout(timer));
};
var debounce = (fn, delay) => {
  let timer;
  let lastArgs;
  const debounced = (...args) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = void 0;
      fn(...args);
    }, delay);
    return void 0;
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = void 0;
    lastArgs = void 0;
  };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    timer = void 0;
    const callArgs = args.length ? args : lastArgs;
    if (callArgs)
      return fn(...callArgs);
    return void 0;
  };
  return debounced;
};
var throttle = (fn, limit, { trailing = false } = {}) => {
  let inThrottle = false;
  let trailingTimer;
  let lastArgs;
  const throttled = (...args) => {
    lastArgs = args;
    if (!inThrottle) {
      const result = fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (trailing && lastArgs) {
          fn(...lastArgs);
          lastArgs = void 0;
        }
      }, limit);
      return result;
    }
    return void 0;
  };
  throttled.cancel = () => {
    clearTimeout(trailingTimer);
    inThrottle = false;
    lastArgs = void 0;
  };
  return throttled;
};
var memoize = (fn, keyFn) => {
  const cache = /* @__PURE__ */ new Map();
  const memoized = (...args) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(key))
      return cache.get(key);
    const result = fn(...args);
    if (result instanceof Promise) {
      return result.then((val) => {
        cache.set(key, val);
        return val;
      }).catch((err) => {
        cache.delete(key);
        throw err;
      });
    }
    cache.set(key, result);
    return result;
  };
  memoized.cache = cache;
  memoized.clear = () => cache.clear();
  return memoized;
};
var once = (fn) => {
  let called = false;
  let result;
  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
};

// src/transport/http.ts
var makeRequest = async (options, _retryCount = 0) => {
  const {
    url,
    method = "GET",
    headers = {},
    token,
    data,
    params,
    timeout: timeout2 = 1e4,
    retries = 0,
    onProgress
  } = options;
  const resolvedHeaders = {
    "X-Requested-With": "XMLHttpRequest",
    ...headers,
    ...token ? { Authorization: `Bearer ${token}` } : {}
  };
  try {
    const result = await Axios({
      method,
      url,
      headers: resolvedHeaders,
      data,
      params,
      timeout: timeout2,
      ...onProgress && {
        onUploadProgress: onProgress,
        onDownloadProgress: onProgress
      }
    });
    return result.data;
  } catch (err) {
    const shouldRetry = _retryCount < retries && (!err.response || err.response.status >= 500);
    if (shouldRetry) {
      await sleep(2 ** _retryCount * 300);
      return makeRequest(options, _retryCount + 1);
    }
    const error = {
      isHttpError: true,
      message: err.response?.data?.message ?? err.message ?? "Request failed",
      httpStatusCode: err.response?.status ?? null,
      data: err.response?.data ?? null
    };
    throw error;
  }
};

// src/core/error.ts
var HTTP_STATUS = {
  OK: { code: 200, message: "OK" },
  CREATED: { code: 201, message: "Created" },
  NO_CONTENT: { code: 204, message: "No Content" },
  BAD_REQUEST: { code: 400, message: "Bad Request" },
  UNAUTHORIZED: { code: 401, message: "Unauthorized" },
  FORBIDDEN: { code: 403, message: "Forbidden" },
  NOT_FOUND: { code: 404, message: "Not Found" },
  CONFLICT: { code: 409, message: "Conflict" },
  UNPROCESSABLE_ENTITY: { code: 422, message: "Unprocessable Entity" },
  TOKEN_EXPIRED: { code: 498, message: "Token Expired" },
  TOKEN_INVALID: { code: 499, message: "Token Invalid" },
  SERVER_ERROR: { code: 500, message: "Internal Server Error" }
};
var HTTP_STATUS_CODE_ERROR = {
  400: "VALIDATION_ERROR",
  401: "AUTHENTICATION_ERROR",
  402: "PAYMENT_REQUIRED_ERROR",
  403: "AUTHORIZATION_ERROR",
  404: "NOT_FOUND",
  409: "ENTRY_EXISTS",
  422: "VALIDATION_ERROR",
  498: "TOKEN_EXPIRED",
  499: "TOKEN_INVALID",
  500: "FATAL_ERROR"
};
var AppError = class extends Error {
  constructor(status, message, errorCode, meta) {
    super(message || status.message);
    this.name = new.target.name;
    this.statusCode = status.code;
    this.statusMessage = status.message;
    this.errorCode = errorCode;
    this.meta = meta;
    Error.captureStackTrace(this, new.target);
  }
};
var ValidationError = class extends AppError {
  constructor(message, meta) {
    super(
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      message,
      "VALIDATION_ERROR",
      meta
    );
  }
};
var AuthenticationError = class extends AppError {
  constructor(message, meta) {
    super(
      HTTP_STATUS.UNAUTHORIZED,
      message,
      "AUTHENTICATION_ERROR",
      meta
    );
  }
};
var AuthorizationError = class extends AppError {
  constructor(message, meta) {
    super(HTTP_STATUS.FORBIDDEN, message, "AUTHORIZATION_ERROR", meta);
  }
};
var NotFoundError = class extends AppError {
  constructor(message, meta) {
    super(HTTP_STATUS.NOT_FOUND, message, "NOT_FOUND", meta);
  }
};
var TokenExpiredError = class extends AppError {
  constructor(message, meta) {
    super(HTTP_STATUS.TOKEN_EXPIRED, message, "TOKEN_EXPIRED", meta);
  }
};
var TokenInvalidError = class extends AppError {
  constructor(message, meta) {
    super(HTTP_STATUS.TOKEN_INVALID, message, "TOKEN_INVALID", meta);
  }
};
var BadRequestError = class extends AppError {
  constructor(message, meta) {
    super(HTTP_STATUS.BAD_REQUEST, message, "BAD_REQUEST", meta);
  }
};
var ServerError = class extends AppError {
  constructor(message, meta) {
    super(HTTP_STATUS.SERVER_ERROR, message, "SERVER_ERROR", meta);
  }
};
var ExistingError = class extends AppError {
  constructor(message, meta) {
    super(HTTP_STATUS.CONFLICT, message, "ENTRY_EXISTS", meta);
  }
};
var NoContent = class extends AppError {
  constructor(message, meta) {
    super(HTTP_STATUS.NO_CONTENT, message, "NO_CONTENT", meta);
  }
};
var errorHandler = (err, ERROR_TYPE = "FATAL_ERROR", service = "Unknown Service") => {
  const response = {
    success: false,
    message: "Something went wrong",
    error: ERROR_TYPE,
    httpStatusCode: 500,
    service
  };
  try {
    if (!err)
      return response;
    if (err instanceof AppError) {
      return {
        ...response,
        message: err.message,
        error: err.errorCode || err.name,
        httpStatusCode: err.statusCode
      };
    }
    if (err.isAxiosError) {
      return {
        ...response,
        message: err?.response?.data?.message || err.message || response.message,
        error: err?.response?.data?.error || HTTP_STATUS_CODE_ERROR[err?.response?.status] || ERROR_TYPE,
        httpStatusCode: err?.response?.status || 500
      };
    }
    if (err instanceof Error) {
      return {
        ...response,
        message: err.message,
        error: err.name
      };
    }
    if (typeof err === "string") {
      return {
        ...response,
        message: err
      };
    }
    return response;
  } catch {
    return response;
  }
};
var expressErrorMiddleware = () => (err, req, res, next) => {
  const error = errorHandler(err);
  res.status(error.httpStatusCode).json(error);
};

// src/core/utils.ts
var paginate = (totalCount, currentPage, perPage) => {
  const previousPage = currentPage - 1;
  return {
    pageCount: Math.ceil(totalCount / perPage),
    offset: currentPage > 1 ? previousPage * perPage : 0
  };
};
var formatDate = (date) => {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};
var parseJSON = (value) => {
  try {
    return JSON.parse(value);
  } catch (err) {
    return value;
  }
};
var stringifyJSON = (value) => {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return value;
  }
};

// src/core/uuid.ts
import { v1 as uuidV1, v4 as uuidV4, validate as uuidValidate } from "uuid";
var uuid = {
  /**
   * Converts a UUID string to its optimized binary representation (Buffer).
   * Reorders bytes for better index performance in databases like MySQL.
   * If no UUID is provided, generates a new v1 UUID.
   */
  toBinary: (value) => {
    if (Buffer.isBuffer(value))
      return value;
    const id = value ?? uuidV1();
    const buf = Buffer.from(id.replace(/-/g, ""), "hex");
    return Buffer.concat([
      buf.subarray(6, 8),
      buf.subarray(4, 6),
      buf.subarray(0, 4),
      buf.subarray(8, 16)
    ]);
  },
  /**
   * Converts a binary UUID Buffer back to its string representation.
   */
  toString: (binary) => {
    if (!binary)
      throw new Error("A binary UUID value is required");
    if (typeof binary === "string")
      return binary;
    return [
      binary.toString("hex", 4, 8),
      binary.toString("hex", 2, 4),
      binary.toString("hex", 0, 2),
      binary.toString("hex", 8, 10),
      binary.toString("hex", 10, 16)
    ].join("-");
  },
  /**
   * Generates a new UUID string.
   * Defaults to v4 (random). Pass "v1" for time-based UUIDs.
   *
   * @example
   * uuid.get()      // v4 UUID
   * uuid.get("v1")  // v1 UUID
   */
  get: (version = "v4") => {
    return version === "v1" ? uuidV1() : uuidV4();
  },
  /**
   * Returns true if the given string is a valid UUID.
   */
  isValid: (value) => uuidValidate(value),
  /** The nil UUID — all zeros. Useful as a default/placeholder. */
  nil: "00000000-0000-0000-0000-000000000000",
  /**
   * Converts specified keys of an object from binary UUIDs to strings.
   * Returns a shallow copy — does NOT mutate the original.
   *
   * @example
   * uuid.manyToString({ id: <Buffer>, name: "foo" }, ["id"])
   * // { id: "xxxxxxxx-...", name: "foo" }
   */
  manyToString: (data, keys = []) => {
    if (!data)
      return data;
    const result = { ...data };
    keys.forEach((key) => {
      if (result[key] != null)
        result[key] = uuid.toString(result[key]);
    });
    return result;
  },
  /**
   * Converts specified keys of an object from UUID strings to binary Buffers.
   * Returns a shallow copy — does NOT mutate the original.
   *
   * @example
   * uuid.manyToBinary({ id: "xxxxxxxx-...", name: "foo" }, ["id"])
   * // { id: <Buffer>, name: "foo" }
   */
  manyToBinary: (data, keys = []) => {
    if (!data)
      return data;
    const result = { ...data };
    keys.forEach((key) => {
      if (result[key] != null)
        result[key] = uuid.toBinary(result[key]);
    });
    return result;
  }
};

// src/core/object.ts
var flattenObject = (obj, { separator = ".", prefix = "" } = {}) => {
  if (!obj || typeof obj !== "object")
    return {};
  const res = {};
  const isPlainObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date) && !(val instanceof RegExp);
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key))
      continue;
    const newKey = prefix ? `${prefix}${separator}${key}` : key;
    if (isPlainObject(obj[key])) {
      Object.assign(res, flattenObject(obj[key], { separator, prefix: newKey }));
    } else {
      res[newKey] = obj[key];
    }
  }
  return res;
};
var unflattenObject = (obj, separator = ".") => {
  if (!obj || typeof obj !== "object")
    return {};
  const result = {};
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key))
      continue;
    const keys = key.split(separator);
    keys.reduce((acc, part, index) => {
      if (index === keys.length - 1) {
        acc[part] = obj[key];
        return acc;
      }
      acc[part] = acc[part] && typeof acc[part] === "object" ? acc[part] : {};
      return acc[part];
    }, result);
  }
  return result;
};

// src/core/string.ts
var splitWords = (str) => str.replace(/\W+/g, " ").split(/ |\B(?=[A-Z])/).map((w) => w.toLowerCase()).filter(Boolean);
var capitalize = (str) => {
  if (!str)
    return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};
var toUpperCase = (str) => str.toUpperCase();
var toLowerCase = (str) => str.toLowerCase();
var camelCase = (str) => {
  if (!str)
    return "";
  return str.trim().toLowerCase().replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : "");
};
var pascalCase = (str) => {
  if (!str)
    return "";
  return camelCase(str).replace(/^(.)/, (c) => c.toUpperCase());
};
var snakeCase = (str) => {
  if (!str)
    return "";
  return splitWords(str).join("_");
};
var kebabCase = (str) => {
  if (!str)
    return "";
  return splitWords(str).join("-");
};
var truncate = (str, length = 50, suffix = "...") => {
  if (!str)
    return "";
  if (str.length <= length)
    return str;
  return str.slice(0, length - suffix.length).trimEnd() + suffix;
};
var maskString = (str, visible = 4) => {
  if (!str)
    return "";
  const visibleCount = Math.min(visible, str.length);
  const maskedLength = str.length - visibleCount;
  return "*".repeat(maskedLength) + str.slice(maskedLength);
};
var isBlank = (str) => !str || str.trim().length === 0;
var reverse = (str) => {
  if (!str)
    return "";
  return str.split("").reverse().join("");
};
var countOccurrences = (str, substr) => {
  if (!str || !substr)
    return 0;
  return str.split(substr).length - 1;
};
var normalizeWhitespace = (str) => {
  if (!str)
    return "";
  return str.trim().replace(/\s+/g, " ");
};

// src/core/validation.ts
var isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
var isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
var isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
var isNumber = (value) => typeof value === "number" && isFinite(value);
var isJSON = (value) => {
  if (!value || typeof value !== "string")
    return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};
var isDate = (value) => value instanceof Date && !isNaN(value.getTime());
var isURL = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
var isBoolean = (value) => typeof value === "boolean";
var isString = (value) => typeof value === "string";
var isArray = (value) => Array.isArray(value);
var isInteger = (value) => typeof value === "number" && Number.isInteger(value);
var isPositive = (value) => isNumber(value) && value > 0;
var isNegative = (value) => isNumber(value) && value < 0;
var isNil = (value) => value === null || value === void 0;
var isEmpty = (val) => {
  if (isNil(val))
    return true;
  if (typeof val === "string")
    return val.trim().length === 0;
  if (Array.isArray(val))
    return val.length === 0;
  if (isObject(val))
    return Object.keys(val).length === 0;
  return false;
};

// src/transport/express/joiValidator.ts
var DEFAULT_OPTIONS = {
  abortEarly: false,
  allowUnknown: false,
  stripUnknown: true
};
var validateField = (schema, data, options = DEFAULT_OPTIONS) => {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { error, value } = schema.validate(data, mergedOptions);
  if (error) {
    const message = error.details.map((d) => d.message).join("; ");
    throw new ValidationError(message);
  }
  return value;
};
var joiMiddleware = (constraints) => {
  if (!constraints || !Object.keys(constraints).length) {
    throw new ValidationError("joiMiddleware requires at least one constraint");
  }
  return async (req, res, next) => {
    try {
      if (constraints.body) {
        req.body = validateField(
          constraints.body.schema,
          req.body,
          constraints.body.options
        );
      }
      if (constraints.params) {
        req.params = validateField(
          constraints.params.schema,
          req.params,
          constraints.params.options
        );
      }
      if (constraints.query) {
        req.query = validateField(
          constraints.query.schema,
          req.query,
          constraints.query.options
        );
      }
      if (constraints.headers) {
        req.headers = validateField(
          constraints.headers.schema,
          req.headers,
          constraints.headers.options
        );
      }
      if (constraints.files) {
        req.files = validateField(
          constraints.files.schema,
          req.files,
          constraints.files.options
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
var joiValidate = ({
  schema,
  data,
  options
}) => {
  if (!schema)
    throw new ValidationError("joiValidate requires a schema");
  return validateField(schema, data, options);
};

// src/adapters/redis.ts
import RedisClient from "ioredis";
var defaultLogger = {
  info: (msg, meta) => console.info(msg, meta),
  error: (msg, meta) => console.error(msg, meta),
  warn: (msg, meta) => console.warn(msg, meta),
  debug: (msg, meta) => console.debug(msg, meta)
};
var Redis = class {
  constructor(url, options = {}, logger) {
    if (!url)
      throw new ValidationError("Redis connection URL is required");
    this.logger = logger ?? defaultLogger;
    this.client = new RedisClient(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      ...options
    });
    this.registerListeners();
  }
  // ─── Lifecycle ────────────────────────────────────────────────────────────
  registerListeners() {
    this.client.on("connect", () => this.logger.info("Redis connected"));
    this.client.on("ready", () => this.logger.info("Redis ready"));
    this.client.on("close", () => this.logger.warn("Redis connection closed"));
    this.client.on("reconnecting", () => this.logger.warn("Redis reconnecting..."));
    this.client.on("error", (err) => this.logger.error("Redis error", { err }));
  }
  async start() {
    try {
      if (this.client.status === "ready")
        return;
      await this.client.connect();
    } catch (err) {
      throw new ServerError("Failed to connect to Redis", { cause: err });
    }
  }
  async disconnect() {
    try {
      if (this.client.status !== "end")
        await this.client.quit();
    } catch {
      await this.client.disconnect();
    }
  }
  // ─── Key Helpers ──────────────────────────────────────────────────────────
  validateKey(key) {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a non-empty string");
    }
  }
  buildKey(...parts) {
    return parts.join(":");
  }
  // ─── Serialization ────────────────────────────────────────────────────────
  serialize(data) {
    if (typeof data === "string")
      return data;
    if (typeof data === "number")
      return String(data);
    return JSON.stringify(data);
  }
  deserialize(data, parse = true) {
    if (!parse || !data)
      return data;
    return parseJSON(data);
  }
  // ─── Core Operations ─────────────────────────────────────────────────────
  async set(key, data) {
    this.validateKey(key);
    return this.client.set(key, this.serialize(data));
  }
  async setEx(key, data, duration) {
    this.validateKey(key);
    const ttl = this.parseDuration(duration);
    return this.client.setex(key, ttl, this.serialize(data));
  }
  async get(key, parse = true) {
    this.validateKey(key);
    const data = await this.client.get(key);
    return this.deserialize(data, parse);
  }
  async delete(key) {
    this.validateKey(key);
    return Boolean(await this.client.del(key));
  }
  async exists(key) {
    return Boolean(await this.client.exists(key));
  }
  async ttl(key) {
    return this.client.ttl(key);
  }
  async expire(key, duration) {
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
  async increment(key, ttl) {
    this.validateKey(key);
    const value = await this.client.incr(key);
    if (ttl && value === 1)
      await this.expire(key, ttl);
    return value;
  }
  /**
   * Atomically decrements a counter.
   */
  async decrement(key) {
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
  async hset(key, data) {
    this.validateKey(key);
    const serialized = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, this.serialize(v)])
    );
    return this.client.hset(key, serialized);
  }
  /**
   * Gets a single field from a Redis hash.
   */
  async hget(key, field) {
    this.validateKey(key);
    const data = await this.client.hget(key, field);
    return this.deserialize(data);
  }
  /**
   * Gets all fields from a Redis hash as a typed object.
   */
  async hgetAll(key) {
    this.validateKey(key);
    const data = await this.client.hgetall(key);
    if (!data || Object.keys(data).length === 0)
      return null;
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, this.deserialize(v)])
    );
  }
  /**
   * Deletes one or more fields from a Redis hash.
   */
  async hdel(key, ...fields) {
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
  async scan(pattern) {
    if (!pattern || typeof pattern !== "string") {
      throw new ValidationError("Redis scan pattern must be a string");
    }
    const keys = [];
    let cursor = "0";
    do {
      const [nextCursor, batch] = await this.client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
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
  async deleteByPattern(pattern) {
    const keys = await this.scan(pattern);
    if (!keys.length)
      return 0;
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
  async keys(pattern) {
    if (!pattern || typeof pattern !== "string") {
      throw new ValidationError("Redis key pattern must be a string");
    }
    this.logger.warn("redis.keys() uses KEYS command \u2014 use redis.scan() in production");
    return this.client.keys(pattern);
  }
  /**
   * @deprecated Use `deleteByPattern()` instead.
   */
  async deleteAll(prefix) {
    this.logger.warn("redis.deleteAll() uses KEYS \u2014 use redis.deleteByPattern() in production");
    const keys = await this.keys(prefix);
    if (!keys.length)
      return 0;
    return this.client.del(...keys);
  }
  /**
   * Flushes the current database. Intended for testing only.
   * Throws in production unless `force: true` is passed.
   */
  async flush(force = false) {
    if (process.env.NODE_ENV === "production" && !force) {
      throw new ServerError("redis.flush() is disabled in production. Pass force=true to override.");
    }
    await this.client.flushdb();
    this.logger.warn("Redis database flushed", { env: process.env.NODE_ENV });
  }
  // ─── Auth Cache Helpers ───────────────────────────────────────────────────
  authKey(id) {
    return this.buildKey("auth", id, "token");
  }
  tokenKey(ref) {
    return this.buildKey("auth", "token", ref);
  }
  async getCachedUser(id, throwError = true) {
    const user = await this.get(this.authKey(id));
    if (!user && throwError) {
      throw new AuthenticationError("Session not found, please log in again");
    }
    return user;
  }
  async cacheUser(user, ttl = "1 day") {
    if (!user?.id || !user?.tokenRef) {
      throw new ValidationError("User object must have `id` and `tokenRef` fields");
    }
    await Promise.all([
      this.setEx(this.tokenKey(user.tokenRef), user, ttl),
      this.setEx(this.authKey(user.id), user, ttl)
    ]);
  }
  /**
   * Atomically updates an array field on a cached user.
   * Operates on a fresh copy to avoid mutating the cached object before re-save.
   */
  async updateAuthData(userId, key, value, action = "ADD") {
    const user = await this.getCachedUser(userId, false);
    if (!user)
      return null;
    if (!Array.isArray(user[key]))
      return user;
    const updated = {
      ...user,
      [key]: action === "ADD" ? user[key].includes(value) ? user[key] : [...user[key], value] : user[key].filter((v) => v !== value)
    };
    await this.cacheUser(updated);
    return updated;
  }
  // ─── Duration Parser ──────────────────────────────────────────────────────
  parseDuration(duration) {
    if (typeof duration === "number")
      return duration;
    const parts = duration.trim().split(/\s+/);
    if (parts.length !== 2) {
      throw new ValidationError(`Invalid duration format: "${duration}". Expected e.g. "1 hour"`);
    }
    const [valueStr, unit] = parts;
    const value = Number(valueStr);
    if (Number.isNaN(value) || value <= 0) {
      throw new ValidationError(`Duration value must be a positive number, got: "${valueStr}"`);
    }
    switch (unit) {
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
        throw new ValidationError(`Invalid duration unit: "${unit}". Use seconds, minutes, hours, or days`);
    }
  }
};

// src/adapters/sqs.ts
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand
} from "@aws-sdk/client-sqs";
var defaultLogger2 = {
  info: (msg, meta) => console.info(msg, meta),
  error: (msg, meta) => console.error(msg, meta),
  warn: (msg, meta) => console.warn(msg, meta),
  debug: (msg, meta) => console.debug(msg, meta)
};
var SQS = class {
  constructor(config, logger) {
    this.polling = false;
    this.logger = logger ?? defaultLogger2;
    this.client = new SQSClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
    this.logger.info("SQS client initialized", { region: config.region });
  }
  // ─── Enqueue ───────────────────────────────────────────────────────────────
  /**
   * Sends a message to an SQS queue.
   * Automatically serializes objects to JSON.
   *
   * @example
   * await sqs.enqueue({ queueUrl, message: { event: "user.created", userId: 1 } });
   */
  async enqueue({
    queueUrl,
    message,
    messageGroupId,
    messageDeduplicationId,
    delaySeconds,
    attributes
  }) {
    try {
      const input = {
        QueueUrl: queueUrl,
        MessageBody: typeof message === "string" ? message : JSON.stringify(message),
        ...messageGroupId && { MessageGroupId: messageGroupId },
        ...messageDeduplicationId && { MessageDeduplicationId: messageDeduplicationId },
        ...delaySeconds !== void 0 && { DelaySeconds: delaySeconds },
        ...attributes && { MessageAttributes: attributes }
      };
      await this.client.send(new SendMessageCommand(input));
      this.logger.info("Message enqueued", { queueUrl });
      return true;
    } catch (err) {
      this.logger.error("SQSEnqueueError", { err, queueUrl });
      throw new ServerError("Failed to enqueue SQS message", { cause: err });
    }
  }
  // ─── Dequeue ───────────────────────────────────────────────────────────────
  /**
   * Starts long-polling a queue and passes each message to `consumerFunction`.
   * Runs until `stop()` is called.
   *
   * Delete behaviour:
   * - On success → always deletes
   * - On failure + DLQ → moves to DLQ, then deletes
   * - On failure + useRedrivePolicy → does NOT delete (lets SQS retry)
   * - On failure + no DLQ + no redrive → logs and deletes to avoid poison pill loop
   */
  async dequeue({
    queueUrl,
    consumerFunction,
    dlqUrl,
    maxNumberOfMessages = 10,
    waitTimeSeconds = 20,
    visibilityTimeout,
    useRedrivePolicy = false
  }) {
    this.polling = true;
    let consecutiveErrors = 0;
    this.logger.info("SQS polling started", { queueUrl });
    while (this.polling) {
      try {
        const { Messages } = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: maxNumberOfMessages,
            WaitTimeSeconds: waitTimeSeconds,
            ...visibilityTimeout && { VisibilityTimeout: visibilityTimeout }
          })
        );
        consecutiveErrors = 0;
        if (!Messages?.length)
          continue;
        await Promise.allSettled(
          Messages.map(
            ({ Body, ReceiptHandle }) => this.processMessage({
              Body,
              ReceiptHandle,
              queueUrl,
              dlqUrl,
              useRedrivePolicy,
              consumerFunction
            })
          )
        );
      } catch (err) {
        consecutiveErrors++;
        this.logger.error("SQSPollingError", { err, queueUrl, consecutiveErrors });
        const backoff = Math.min(1e3 * 2 ** consecutiveErrors, 3e4);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    this.logger.info("SQS polling stopped", { queueUrl });
  }
  /**
   * Gracefully stops the polling loop after the current batch completes.
   */
  stop() {
    this.polling = false;
    this.logger.info("SQS stop signal received");
  }
  // ─── Private ───────────────────────────────────────────────────────────────
  async processMessage({
    Body,
    ReceiptHandle,
    queueUrl,
    dlqUrl,
    useRedrivePolicy,
    consumerFunction
  }) {
    if (!Body || !ReceiptHandle)
      return;
    let shouldDelete = true;
    try {
      const message = parseJSON(Body);
      await consumerFunction(message);
    } catch (err) {
      this.logger.error("SQSConsumerError", { err, queueUrl });
      if (dlqUrl) {
        await this.enqueue({ queueUrl: dlqUrl, message: Body });
      } else if (useRedrivePolicy) {
        shouldDelete = false;
      } else {
        this.logger.warn("SQSMessageDropped \u2014 no DLQ or redrive configured", { queueUrl });
      }
    } finally {
      if (shouldDelete) {
        await this.client.send(
          new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle })
        );
      }
    }
  }
};

// src/adapters/loggers/winston.ts
import winston, { format } from "winston";
var serializeErrors = format((info) => {
  if (info.meta instanceof Error) {
    info.meta = {
      message: info.meta.message,
      stack: info.meta.stack,
      name: info.meta.name
    };
  }
  if (info instanceof Error) {
    info.stack = info.stack;
    info.message = info.message;
  }
  return info;
});
var prettyFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message, service, ...meta }) => {
    const svc = service ? `[${service}] ` : "";
    const metaStr = Object.keys(meta).length ? `
${JSON.stringify(meta, null, 2)}` : "";
    return `${timestamp} ${level}: ${svc}${message}${metaStr}`;
  })
);
var jsonFormat = format.combine(
  serializeErrors(),
  format.timestamp(),
  format.json()
);
var WinstonLogger = class {
  constructor(options = {}) {
    const {
      level = process.env.NODE_ENV === "development" ? "debug" : "info",
      service,
      file,
      pretty = process.env.NODE_ENV === "development",
      defaultMeta = {}
    } = options;
    const transports = [
      new winston.transports.Console({
        format: pretty ? prettyFormat : jsonFormat
      })
    ];
    if (file?.path) {
      transports.push(
        new winston.transports.File({
          filename: file.path,
          format: jsonFormat
        })
      );
    }
    if (file?.errorPath) {
      transports.push(
        new winston.transports.File({
          filename: file.errorPath,
          level: "error",
          format: jsonFormat
        })
      );
    }
    this.logger = winston.createLogger({
      level,
      defaultMeta: { service, ...defaultMeta },
      transports,
      // Prevent winston from exiting on uncaught exceptions in logger itself
      exitOnError: false
    });
  }
  // ─── Logger Interface ─────────────────────────────────────────────────────
  info(message, meta) {
    this.logger.info(message, { meta });
  }
  error(message, meta) {
    this.logger.error(message, { meta });
  }
  warn(message, meta) {
    this.logger.warn(message, { meta });
  }
  debug(message, meta) {
    this.logger.debug(message, { meta });
  }
  http(message, meta) {
    this.logger.http(message, { meta });
  }
  // ─── Extended API ─────────────────────────────────────────────────────────
  /**
   * Returns a child logger with additional metadata attached to every entry.
   * Useful for scoping logs to a request, service, or job.
   *
   * @example
   * const log = logger.child({ requestId: "abc-123", userId: "u-1" });
   * log.info("User fetched"); // → { requestId: "abc-123", userId: "u-1", message: "User fetched" }
   */
  child(meta) {
    const child = Object.create(this);
    child.logger = this.logger.child(meta);
    return child;
  }
  /**
   * Dynamically changes the log level at runtime.
   * Useful for temporarily enabling debug logs in production.
   *
   * @example
   * logger.setLevel("debug");
   */
  setLevel(level) {
    this.logger.level = level;
  }
  /**
   * Returns true if the given level would currently be logged.
   *
   * @example
   * if (logger.isLevelEnabled("debug")) { ... }
   */
  isLevelEnabled(level) {
    return this.logger.isLevelEnabled(level);
  }
};

// src/adapters/s3.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  NotFound
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var defaultLogger3 = {
  info: (msg, meta) => console.info(msg, meta),
  error: (msg, meta) => console.error(msg, meta),
  warn: (msg, meta) => console.warn(msg, meta),
  debug: (msg, meta) => console.debug(msg, meta)
};
var S3 = class {
  constructor(config, logger) {
    this.logger = logger ?? defaultLogger3;
    this.defaultBucket = config.defaultBucket;
    this.region = config.region;
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
    this.logger.info("S3 client initialized", { region: config.region });
  }
  // ─── Private Helpers ─────────────────────────────────────────────────────
  getBucket(bucket) {
    const target = bucket ?? this.defaultBucket;
    if (!target)
      throw new ServerError("S3 bucket not provided");
    return target;
  }
  getObjectUrl(bucket, key) {
    return `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
  async streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream)
      chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  // ─── Upload ──────────────────────────────────────────────────────────────
  /**
   * Uploads a file to S3. Returns the bucket, key, and public URL.
   *
   * @example
   * const result = await s3.upload({ key: "avatars/user-1.png", body: buffer, contentType: "image/png" });
   * result.url // "https://my-bucket.s3.us-east-1.amazonaws.com/avatars/user-1.png"
   */
  async upload({
    bucket,
    key,
    body,
    contentType,
    metadata,
    acl
  }) {
    const targetBucket = this.getBucket(bucket);
    try {
      const input = {
        Bucket: targetBucket,
        Key: key,
        Body: body,
        ...contentType && { ContentType: contentType },
        ...metadata && { Metadata: metadata },
        ...acl && { ACL: acl }
      };
      await this.client.send(new PutObjectCommand(input));
      this.logger.info("S3 upload successful", { bucket: targetBucket, key });
      return {
        bucket: targetBucket,
        key,
        url: this.getObjectUrl(targetBucket, key)
      };
    } catch (err) {
      this.logger.error("S3UploadError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to upload to S3", { cause: err });
    }
  }
  // ─── Download ─────────────────────────────────────────────────────────────
  /**
   * Downloads an S3 object and returns it as a Buffer.
   */
  async download({ bucket, key }) {
    const targetBucket = this.getBucket(bucket);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: targetBucket, Key: key })
      );
      if (!response.Body)
        throw new ServerError("Empty S3 response body");
      const buffer = await this.streamToBuffer(response.Body);
      this.logger.info("S3 download successful", { bucket: targetBucket, key });
      return buffer;
    } catch (err) {
      this.logger.error("S3DownloadError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to download from S3", { cause: err });
    }
  }
  /**
   * Returns the raw readable stream for an S3 object.
   * Prefer this over `download` for large files.
   */
  async stream({ bucket, key }) {
    const targetBucket = this.getBucket(bucket);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: targetBucket, Key: key })
      );
      if (!response.Body)
        throw new ServerError("Empty S3 response body");
      this.logger.info("S3 stream ready", { bucket: targetBucket, key });
      return response.Body;
    } catch (err) {
      this.logger.error("S3StreamError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to stream from S3", { cause: err });
    }
  }
  // ─── Delete ───────────────────────────────────────────────────────────────
  async delete({ bucket, key }) {
    const targetBucket = this.getBucket(bucket);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: targetBucket, Key: key })
      );
      this.logger.info("S3 object deleted", { bucket: targetBucket, key });
      return true;
    } catch (err) {
      this.logger.error("S3DeleteError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to delete S3 object", { cause: err });
    }
  }
  // ─── Copy ─────────────────────────────────────────────────────────────────
  /**
   * Copies an object within S3 — within the same bucket or across buckets.
   *
   * @example
   * await s3.copy({ sourceKey: "uploads/tmp.png", destinationKey: "avatars/user-1.png" });
   */
  async copy({
    sourceBucket,
    sourceKey,
    destinationBucket,
    destinationKey
  }) {
    const srcBucket = this.getBucket(sourceBucket);
    const dstBucket = this.getBucket(destinationBucket);
    try {
      await this.client.send(
        new CopyObjectCommand({
          CopySource: `${srcBucket}/${sourceKey}`,
          Bucket: dstBucket,
          Key: destinationKey
        })
      );
      this.logger.info("S3 object copied", { srcBucket, sourceKey, dstBucket, destinationKey });
      return {
        bucket: dstBucket,
        key: destinationKey,
        url: this.getObjectUrl(dstBucket, destinationKey)
      };
    } catch (err) {
      this.logger.error("S3CopyError", { err, sourceKey, destinationKey });
      throw new ServerError("Failed to copy S3 object", { cause: err });
    }
  }
  // ─── Exists ───────────────────────────────────────────────────────────────
  /**
   * Returns true if the object exists.
   * Throws on non-404 errors (permissions, network) rather than silently returning false.
   */
  async exists({ bucket, key }) {
    const targetBucket = this.getBucket(bucket);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: targetBucket, Key: key })
      );
      return true;
    } catch (err) {
      if (err instanceof NotFound || err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      this.logger.error("S3ExistsError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to check S3 object existence", { cause: err });
    }
  }
  // ─── Signed URLs ──────────────────────────────────────────────────────────
  /**
   * Generates a pre-signed URL for downloading an object (GET).
   * Default expiry: 1 hour.
   */
  async getSignedDownloadUrl({ bucket, key, expiresIn = 3600 }) {
    const targetBucket = this.getBucket(bucket);
    try {
      const url = await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: targetBucket, Key: key }),
        { expiresIn }
      );
      this.logger.info("S3 signed download URL generated", { bucket: targetBucket, key });
      return url;
    } catch (err) {
      this.logger.error("S3SignedDownloadUrlError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to generate signed download URL", { cause: err });
    }
  }
  /**
   * Generates a pre-signed URL for uploading an object directly (PUT).
   * Use this for browser → S3 direct uploads without proxying through your server.
   *
   * @example
   * const url = await s3.getSignedUploadUrl({ key: "avatars/user-1.png", contentType: "image/png" });
   * // Client does: fetch(url, { method: "PUT", body: file })
   */
  async getSignedUploadUrl({
    bucket,
    key,
    expiresIn = 3600,
    contentType
  }) {
    const targetBucket = this.getBucket(bucket);
    try {
      const url = await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: key,
          ...contentType && { ContentType: contentType }
        }),
        { expiresIn }
      );
      this.logger.info("S3 signed upload URL generated", { bucket: targetBucket, key });
      return url;
    } catch (err) {
      this.logger.error("S3SignedUploadUrlError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to generate signed upload URL", { cause: err });
    }
  }
  // ─── Bucket Preset ────────────────────────────────────────────────────────
  /**
   * Returns a scoped helper with the bucket pre-filled.
   *
   * @example
   * const avatars = s3.bucket("my-avatars-bucket");
   * await avatars.upload({ key: "user-1.png", body: buffer });
   */
  bucket(bucketName) {
    return {
      upload: (opts) => this.upload({ ...opts, bucket: bucketName }),
      download: (opts) => this.download({ ...opts, bucket: bucketName }),
      stream: (opts) => this.stream({ ...opts, bucket: bucketName }),
      delete: (opts) => this.delete({ ...opts, bucket: bucketName }),
      exists: (opts) => this.exists({ ...opts, bucket: bucketName }),
      copy: (opts) => this.copy({ ...opts, destinationBucket: bucketName }),
      getSignedDownloadUrl: (opts) => this.getSignedDownloadUrl({ ...opts, bucket: bucketName }),
      getSignedUploadUrl: (opts) => this.getSignedUploadUrl({ ...opts, bucket: bucketName })
    };
  }
};

// src/adapters/cron.ts
import cron from "node-cron";
var defaultLogger4 = {
  info: (msg, meta) => console.info(msg, meta),
  error: (msg, meta) => console.error(msg, meta),
  warn: (msg, meta) => console.warn(msg, meta),
  debug: (msg, meta) => console.debug(msg, meta)
};
var SHORTHANDS = {
  "every minute": "* * * * *",
  "every 5 minutes": "*/5 * * * *",
  "every 10 minutes": "*/10 * * * *",
  "every 15 minutes": "*/15 * * * *",
  "every 30 minutes": "*/30 * * * *",
  "every hour": "0 * * * *",
  "every 6 hours": "0 */6 * * *",
  "every 12 hours": "0 */12 * * *",
  "every day": "0 0 * * *",
  "every day at noon": "0 12 * * *",
  "every week": "0 0 * * 0",
  "every month": "0 0 1 * *"
};
var Cron = class {
  constructor(logger) {
    this.jobs = /* @__PURE__ */ new Map();
    this.logger = logger ?? defaultLogger4;
  }
  // ─── Register ─────────────────────────────────────────────────────────────
  /**
   * Registers and starts a cron job.
   *
   * @example
   * cron.register({
   *   name: "send-digest",
   *   schedule: "every day at noon",
   *   handler: async () => { await sendDigestEmails(); },
   *   timezone: "America/New_York",
   * });
   */
  register(options) {
    const { name, schedule, handler, runOnInit = false, timezone, preventOverlap = true } = options;
    if (!name)
      throw new ValidationError("Cron job name is required");
    if (!handler)
      throw new ValidationError("Cron job handler is required");
    if (this.jobs.has(name)) {
      throw new ValidationError(`Cron job "${name}" is already registered. Use replace() to update it.`);
    }
    const expression = SHORTHANDS[schedule] ?? schedule;
    if (!cron.validate(expression)) {
      throw new ValidationError(`Invalid cron expression for job "${name}": "${schedule}"`);
    }
    const status = {
      name,
      schedule: expression,
      running: true,
      lastRun: null,
      lastError: null,
      executionCount: 0,
      errorCount: 0
    };
    const record = {
      options,
      status,
      executing: false,
      task: null
      // assigned below
    };
    const task = cron.schedule(
      expression,
      () => this.execute(name),
      { timezone }
    );
    record.task = task;
    this.jobs.set(name, record);
    this.logger.info(`Cron job registered`, { name, schedule: expression, timezone });
    if (runOnInit) {
      this.execute(name);
    }
  }
  // ─── Execute ──────────────────────────────────────────────────────────────
  async execute(name) {
    const record = this.jobs.get(name);
    if (!record)
      return;
    const { preventOverlap = true, handler } = record.options;
    if (preventOverlap && record.executing) {
      this.logger.warn(`Cron job "${name}" skipped \u2014 previous execution still running`);
      return;
    }
    record.executing = true;
    record.status.lastRun = /* @__PURE__ */ new Date();
    record.status.executionCount++;
    this.logger.debug?.(`Cron job started`, { name, executionCount: record.status.executionCount });
    try {
      await handler();
      this.logger.debug?.(`Cron job completed`, { name });
    } catch (err) {
      record.status.errorCount++;
      record.status.lastError = err;
      this.logger.error(`Cron job failed`, { name, err });
    } finally {
      record.executing = false;
    }
  }
  // ─── Control ──────────────────────────────────────────────────────────────
  /**
   * Stops a running job without removing it.
   * Can be resumed with start().
   */
  stop(name) {
    const record = this.getJob(name);
    record.task.stop();
    record.status.running = false;
    this.logger.info(`Cron job stopped`, { name });
  }
  /**
   * Resumes a stopped job.
   */
  start(name) {
    const record = this.getJob(name);
    record.task.start();
    record.status.running = true;
    this.logger.info(`Cron job started`, { name });
  }
  /**
   * Stops and removes a job entirely.
   */
  remove(name) {
    const record = this.getJob(name);
    record.task.stop();
    this.jobs.delete(name);
    this.logger.info(`Cron job removed`, { name });
  }
  /**
   * Replaces an existing job with a new configuration.
   * Useful for updating schedules at runtime.
   */
  replace(options) {
    if (this.jobs.has(options.name))
      this.remove(options.name);
    this.register(options);
  }
  /**
   * Manually triggers a job outside its schedule.
   * Respects preventOverlap.
   *
   * @example
   * await cron.run("send-digest");
   */
  async run(name) {
    this.getJob(name);
    await this.execute(name);
  }
  /**
   * Stops all registered jobs. Call this on process shutdown.
   *
   * @example
   * process.on("SIGTERM", () => cron.stopAll());
   */
  stopAll() {
    for (const [name, record] of this.jobs) {
      record.task.stop();
      record.status.running = false;
    }
    this.logger.info(`All cron jobs stopped`, { count: this.jobs.size });
  }
  // ─── Introspection ────────────────────────────────────────────────────────
  /**
   * Returns the status of a single job.
   */
  status(name) {
    return { ...this.getJob(name).status };
  }
  /**
   * Returns the status of all registered jobs.
   */
  statusAll() {
    return Array.from(this.jobs.values()).map((r) => ({ ...r.status }));
  }
  /**
   * Returns true if a job with the given name is registered.
   */
  has(name) {
    return this.jobs.has(name);
  }
  // ─── Private ──────────────────────────────────────────────────────────────
  getJob(name) {
    const record = this.jobs.get(name);
    if (!record)
      throw new ServerError(`Cron job "${name}" not found`);
    return record;
  }
};

// src/security/jwt.ts
import jwt from "jsonwebtoken";
var jwtService = {
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
    algorithm = "HS256"
  }) {
    if (!secretKey) {
      throw new ValidationError("Secret key is required for JWT encoding");
    }
    const options = {
      expiresIn,
      algorithm
    };
    return new Promise((resolve, reject) => {
      jwt.sign(data, secretKey, options, (err, token) => {
        if (err || !token)
          return reject(err);
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
  async decode({
    token,
    secretKey,
    algorithms
  }) {
    if (!secretKey) {
      throw new ValidationError("Secret key is required for JWT verification");
    }
    if (!token) {
      throw new ValidationError("JWT token is required");
    }
    const options = {};
    if (algorithms) {
      options.algorithms = algorithms;
    }
    return new Promise((resolve, reject) => {
      jwt.verify(token, secretKey, options, (err, decoded) => {
        if (err)
          return reject(err);
        resolve(decoded);
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
  getExpiry(token) {
    const decoded = jwt.decode(token);
    if (!decoded?.exp)
      return null;
    return new Date(decoded.exp * 1e3);
  },
  /**
  * Returns true if the token is expired, without verifying the signature.
  * Useful for checking whether to refresh a token before making a request.
  *
  * @example
  * if (jwtService.isExpired(token)) { ... }
  */
  isExpired(token) {
    const expiry = this.getExpiry(token);
    if (!expiry)
      return false;
    return expiry < /* @__PURE__ */ new Date();
  }
};

// src/security/hash.ts
import bcrypt from "bcrypt";
import crypto from "crypto";
var hashService = {
  // ─── bcrypt ───────────────────────────────────────────────────────────────
  /**
   * Hashes a plain text value using bcrypt.
   * Use for passwords — bcrypt is intentionally slow and salted.
   *
   * @example
   * const hashed = await hashService.hash("myPassword123");
   */
  async hash(plain, { rounds = 12 } = {}) {
    if (!plain)
      throw new Error("Value to hash is required");
    return bcrypt.hash(plain, rounds);
  },
  /**
   * Compares a plain text value against a bcrypt hash.
   *
   * @example
   * const match = await hashService.compare("myPassword123", storedHash);
   * if (!match) throw new AuthenticationError("Invalid credentials");
   */
  async compare(plain, hashed) {
    if (!plain || !hashed)
      return false;
    return bcrypt.compare(plain, hashed);
  },
  /**
   * Returns true if the string looks like a bcrypt hash.
   * Useful for detecting already-hashed values before double-hashing.
   *
   * @example
   * hashService.isBcryptHash("$2b$12$...") // true
   */
  isBcryptHash(value) {
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
  hmac(value, secret, { algorithm = "sha256", encoding = "hex" } = {}) {
    if (!value)
      throw new Error("Value is required for HMAC");
    if (!secret)
      throw new Error("Secret key is required for HMAC");
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
  verifyHmac(value, secret, signature, options) {
    try {
      const expected = this.hmac(value, secret, options);
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature)
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
  sha256(value, encoding = "hex") {
    if (!value)
      throw new Error("Value is required for sha256");
    return crypto.createHash("sha256").update(value).digest(encoding);
  },
  sha512(value, encoding = "hex") {
    if (!value)
      throw new Error("Value is required for sha512");
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
  generateToken({ bytes = 32, encoding = "hex" } = {}) {
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
  generateHashedToken(options) {
    const token = this.generateToken(options);
    const hashed = this.sha256(token);
    return { token, hashed };
  }
};
export {
  AppError,
  AuthenticationError,
  AuthorizationError,
  BadRequestError,
  Cron,
  ExistingError,
  HTTP_STATUS,
  HTTP_STATUS_CODE_ERROR,
  NoContent,
  NotFoundError,
  Redis,
  S3,
  SQS,
  ServerError,
  TokenExpiredError,
  TokenInvalidError,
  ValidationError,
  WinstonLogger,
  camelCase,
  capitalize,
  countOccurrences,
  debounce,
  errorHandler,
  expressErrorMiddleware,
  flattenObject,
  formatDate,
  hashService,
  isArray,
  isBlank,
  isBoolean,
  isDate,
  isEmail,
  isEmpty,
  isInteger,
  isJSON,
  isNegative,
  isNil,
  isNumber,
  isObject,
  isPositive,
  isString,
  isURL,
  isUUID,
  joiMiddleware,
  joiValidate,
  jwtService,
  kebabCase,
  makeRequest,
  maskString,
  memoize,
  normalizeWhitespace,
  once,
  paginate,
  parseJSON,
  pascalCase,
  retry,
  reverse,
  sleep,
  snakeCase,
  splitWords,
  stringifyJSON,
  throttle,
  timeout,
  toLowerCase,
  toUpperCase,
  truncate,
  unflattenObject,
  uuid
};
