// src/transport/http.ts
import Axios from "axios";
var makeRequest = async ({
  url,
  method = "GET",
  headers = {},
  token = void 0,
  data = void 0
}) => {
  try {
    headers["X-Requested-With"] = "XMLHttpRequest";
    token && (headers["Authorization"] = token);
    const payload = {
      method,
      url,
      headers
    };
    if (data)
      payload.data = data;
    const result = await Axios(payload);
    return result.data;
  } catch (err) {
    throw err.response ? { ...err.response.data, httpStatusCode: err.response.status } : err;
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
var isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
var sleep = (ms) => new Promise((res) => setTimeout(res, ms));
var capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
var isEmpty = (val) => val === null || val === void 0 || typeof val === "object" && Object.keys(val).length === 0 || typeof val === "string" && val.trim() === "";

// src/core/uuid.ts
import { v1 as uuidV1, v4 as uuidV4, validate as UUIDValidaton } from "uuid";
var uuid = {
  toBinary: (uuid2) => {
    if (!uuid2)
      uuid2 = uuidV1();
    else if (typeof uuid2 !== "string" && Buffer.isBuffer(uuid2))
      return uuid2;
    const buf = Buffer.from(uuid2.replace(/-/g, ""), "hex");
    return Buffer.concat([
      buf.subarray(6, 8),
      buf.subarray(4, 6),
      buf.subarray(0, 4),
      buf.subarray(8, 16)
    ]);
  },
  toString: (binary) => {
    if (!binary)
      throw new Error("Kindly supply binary UUID value");
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
  get: (version) => {
    const uuid2 = {
      v1: uuidV1(),
      v4: uuidV4()
    };
    return uuid2[version || "v1"];
  },
  isValid: (uuid2) => UUIDValidaton(uuid2),
  manyToString: (data, keys = []) => {
    if (!data)
      return;
    keys.forEach((key) => {
      if (data[key])
        data[key] = uuid.toString(data[key]);
    });
    return data;
  },
  manyToBinary: (data, keys = []) => {
    if (!data)
      return;
    keys.forEach((key) => {
      if (data[key])
        data[key] = uuid.toBinary(data[key]);
    });
    return data;
  }
};

// src/transport/express/joiValidator.ts
var validate = (schema, object, option = { abortEarly: true, allowUnknown: false }) => {
  const check = schema.validate(object, option);
  if (check.error) {
    throw new ValidationError(check.error.details[0].message);
  }
  return check.value;
};
function joiValidator(constraint, isMiddleware = true) {
  if (!constraint)
    throw new ValidationError(
      "Kindly supply validation schema to joiValidator"
    );
  if (!isMiddleware) {
    return validate(constraint.schema, constraint.data, constraint.option);
  }
  return async (req, res, next) => {
    try {
      if (constraint.body) {
        req.body = validate(
          constraint.body.schema,
          req.body,
          constraint.body.options
        );
      }
      if (constraint.params)
        req.params = validate(
          constraint.params.schema,
          req.params,
          constraint.params.options
        );
      if (constraint.query)
        req.query = validate(
          constraint.query.schema,
          req.query,
          constraint.query.options
        );
      if (constraint.headers)
        req.headers = validate(
          constraint.headers.schema,
          req.headers,
          constraint.headers.options
        );
      return next();
    } catch (err) {
      next(err);
    }
  };
}

// src/adapters/redis.ts
import RedisClient from "ioredis";
var Redis = class {
  constructor(url, options = {}) {
    if (!url)
      throw new ValidationError("Redis connection URL is required");
    this.client = new RedisClient(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      ...options
    });
    this.registerListeners();
  }
  registerListeners() {
    this.client.on("connect", () => {
      console.info("\u{1F534} Redis connected");
    });
    this.client.on("ready", () => {
      console.info("\u{1F7E2} Redis ready");
    });
    this.client.on("error", (err) => {
      console.error("\u{1F534} Redis error:", err);
    });
    this.client.on("close", () => {
      console.warn("\u{1F7E0} Redis connection closed");
    });
    this.client.on("reconnecting", () => {
      console.warn("\u{1F7E1} Redis reconnecting...");
    });
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
      if (this.client.status !== "end") {
        await this.client.quit();
      }
    } catch {
      await this.client.disconnect();
    }
  }
  async keys(pattern) {
    if (!pattern || typeof pattern !== "string") {
      throw new ValidationError("Redis key pattern must be a string");
    }
    return this.client.keys(pattern);
  }
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
  async set(key, data) {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a string");
    }
    return this.client.set(key, this.serialize(data));
  }
  async setEx(key, data, duration) {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a string");
    }
    const ttl = this.parseDuration(duration);
    return this.client.setex(key, ttl, this.serialize(data));
  }
  async get(key, parse = true) {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a string");
    }
    const data = await this.client.get(key);
    return this.deserialize(data, parse);
  }
  async delete(key) {
    if (!key || typeof key !== "string") {
      throw new ValidationError("Redis key must be a string");
    }
    return Boolean(await this.client.del(key));
  }
  async deleteAll(prefix) {
    const keys = await this.keys(prefix);
    if (!keys.length)
      return 0;
    return this.client.del(...keys);
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
  async flush() {
    await this.client.flushdb();
  }
  // ───────────────────────────────
  // Auth Cache Helpers
  // ───────────────────────────────
  async getCachedUser(id, throwError = true) {
    const userToken = `${id}-token`;
    const user = await this.get(userToken);
    if (!user && throwError) {
      throw new AuthenticationError("Kindly login, user not found");
    }
    return user;
  }
  async cacheUser(user, ttl = "1 day") {
    if (!user?.id || !user?.tokenRef) {
      throw new ValidationError("Invalid user object for caching");
    }
    await Promise.all([
      this.setEx(user.tokenRef, user, ttl),
      this.setEx(`${user.id}-token`, user, ttl)
    ]);
  }
  async updateAuthData(userId, key, value, action = "ADD") {
    const user = await this.getCachedUser(userId, false);
    if (!user)
      return null;
    if (!Array.isArray(user[key]))
      return user;
    if (action === "ADD" && !user[key].includes(value)) {
      user[key].push(value);
    }
    if (action === "REMOVE") {
      user[key] = user[key].filter((v) => v !== value);
    }
    await this.cacheUser(user);
    return user;
  }
  // ───────────────────────────────
  // Helpers
  // ───────────────────────────────
  parseDuration(duration) {
    if (typeof duration === "number")
      return duration;
    const [valueStr, unit] = duration.split(" ");
    const value = Number(valueStr);
    if (Number.isNaN(value)) {
      throw new ValidationError(`Invalid duration format: ${duration}`);
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
        throw new ValidationError(`Invalid duration unit: ${unit}`);
    }
  }
};

// src/adapters/sqs.ts
import AWS from "aws-sdk";
var SQS = class {
  constructor(config, logger) {
    this.logger = logger || {
      info: (msg, meta) => console.info(msg, meta),
      error: (msg, meta) => console.error(msg, meta),
      warn: (msg, meta) => console.warn(msg, meta),
      debug: (msg, meta) => console.debug(msg, meta)
    };
    this.client = new AWS.SQS({
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    });
    this.logger.info("SQS client initialized", { region: config.region });
  }
  async enqueue({ queueUrl, message }) {
    try {
      await this.client.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: typeof message === "string" ? message : JSON.stringify(message)
      }).promise();
      this.logger.info("Message enqueued", { queueUrl });
      return true;
    } catch (err) {
      this.logger.error("SQSEnqueueError", { err, queueUrl });
      throw new ServerError("Failed to enqueue SQS message", { cause: err });
    }
  }
  async dequeue(fields) {
    const {
      queueUrl,
      consumerFunction,
      dlqUrl,
      maxNumberOfMessages = 10,
      waitTimeSeconds = 20
    } = fields;
    while (true) {
      try {
        const { Messages } = await this.client.receiveMessage({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: maxNumberOfMessages,
          WaitTimeSeconds: waitTimeSeconds
        }).promise();
        if (Messages?.length) {
          for (const { Body, ReceiptHandle } of Messages) {
            if (!Body || !ReceiptHandle)
              continue;
            try {
              const message = parseJSON(Body);
              await consumerFunction(message);
            } catch (err) {
              this.logger.error("SQSConsumerError", { err, queueUrl });
              if (dlqUrl) {
                await this.enqueue({ queueUrl: dlqUrl, message: Body });
              }
            } finally {
              await this.client.deleteMessage({
                QueueUrl: queueUrl,
                ReceiptHandle
              }).promise();
            }
          }
        }
      } catch (err) {
        this.logger.error("SQSPollingError", { err, queueUrl });
      }
    }
  }
};

// src/adapters/loggers/winston.ts
import winston from "winston";
var WinstonLogger = class {
  constructor() {
    this.logger = winston.createLogger({
      transports: [new winston.transports.Console()]
    });
  }
  info(message, meta) {
    this.logger.info(message, meta);
  }
  error(message, meta) {
    this.logger.error(message, meta);
  }
  warn(message, meta) {
    this.logger.warn(message, meta);
  }
  debug(message, meta) {
    this.logger.debug(message, meta);
  }
};

// src/security/jwt.ts
import jwt from "jsonwebtoken";
var jwtService = {
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
  }
};
export {
  AppError,
  AuthenticationError,
  AuthorizationError,
  BadRequestError,
  ExistingError,
  HTTP_STATUS,
  HTTP_STATUS_CODE_ERROR,
  NoContent,
  NotFoundError,
  Redis,
  SQS,
  ServerError,
  TokenExpiredError,
  TokenInvalidError,
  ValidationError,
  WinstonLogger,
  capitalize,
  errorHandler,
  expressErrorMiddleware,
  formatDate,
  isEmpty,
  isObject,
  joiValidator,
  jwtService,
  makeRequest,
  paginate,
  parseJSON,
  sleep,
  stringifyJSON,
  uuid
};
