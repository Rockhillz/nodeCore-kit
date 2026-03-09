import { AxiosProgressEvent } from 'axios';
import { Request, Response, NextFunction } from 'express';
import { Schema, ValidationOptions } from 'joi';
import { RedisOptions } from 'ioredis';
import { MessageAttributeValue } from '@aws-sdk/client-sqs';
import { ObjectCannedACL } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import jwt, { SignOptions } from 'jsonwebtoken';

type HttpMethod = "GET" | "DELETE" | "POST" | "PATCH" | "PUT";
interface RequestOptions<TData = unknown> {
    url: string;
    method?: HttpMethod;
    headers?: Record<string, string>;
    /** Auth token — will be sent as `Bearer <token>` */
    token?: string;
    /** Request body — plain object, array, or FormData */
    data?: TData;
    /** Query string parameters */
    params?: Record<string, any>;
    /** Request timeout in milliseconds (default: 10_000) */
    timeout?: number;
    /** Number of retry attempts on network errors or 5xx responses (default: 0) */
    retries?: number;
    /** Upload/download progress callback */
    onProgress?: (event: AxiosProgressEvent) => void;
}
/**
 * Makes an HTTP request via Axios with consistent error handling,
 * optional auth, query params, timeout, and retry support.
 *
 * @example
 * const user = await makeRequest<User>({ url: "/api/user/1" });
 * const post = await makeRequest<Post>({ url: "/api/posts", method: "POST", data: { title: "Hello" } });
 */
declare const makeRequest: <TResponse = Record<string, any>, TData = unknown>(options: RequestOptions<TData>, _retryCount?: number) => Promise<TResponse>;

interface FieldConstraint {
    schema: Schema;
    options?: ValidationOptions;
}
interface JoiConstraints {
    body?: FieldConstraint;
    params?: FieldConstraint;
    query?: FieldConstraint;
    headers?: FieldConstraint;
    files?: FieldConstraint;
}
interface DirectConstraint {
    schema: Schema;
    data: unknown;
    options?: ValidationOptions;
}
/**
 * Express middleware that validates req.body, params, query, headers, and/or files.
 * Replaces each field with the sanitized, validated value from Joi.
 *
 * @example
 * router.post("/users", joiMiddleware({
 *   body:   { schema: createUserSchema },
 *   params: { schema: idParamSchema },
 * }), createUser);
 */
declare const joiMiddleware: (constraints: JoiConstraints) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Validates data directly outside of a middleware context.
 * Throws a ValidationError if invalid.
 *
 * @example
 * const value = joiValidate({ schema: createUserSchema, data: req.body });
 * const typed  = joiValidate<CreateUserDto>({ schema: createUserSchema, data: req.body });
 */
declare const joiValidate: <T = unknown>({ schema, data, options, }: DirectConstraint) => T;

declare const HTTP_STATUS: {
    readonly OK: {
        readonly code: 200;
        readonly message: "OK";
    };
    readonly CREATED: {
        readonly code: 201;
        readonly message: "Created";
    };
    readonly NO_CONTENT: {
        readonly code: 204;
        readonly message: "No Content";
    };
    readonly BAD_REQUEST: {
        readonly code: 400;
        readonly message: "Bad Request";
    };
    readonly UNAUTHORIZED: {
        readonly code: 401;
        readonly message: "Unauthorized";
    };
    readonly FORBIDDEN: {
        readonly code: 403;
        readonly message: "Forbidden";
    };
    readonly NOT_FOUND: {
        readonly code: 404;
        readonly message: "Not Found";
    };
    readonly CONFLICT: {
        readonly code: 409;
        readonly message: "Conflict";
    };
    readonly UNPROCESSABLE_ENTITY: {
        readonly code: 422;
        readonly message: "Unprocessable Entity";
    };
    readonly TOKEN_EXPIRED: {
        readonly code: 498;
        readonly message: "Token Expired";
    };
    readonly TOKEN_INVALID: {
        readonly code: 499;
        readonly message: "Token Invalid";
    };
    readonly SERVER_ERROR: {
        readonly code: 500;
        readonly message: "Internal Server Error";
    };
};
type HttpStatusKey = keyof typeof HTTP_STATUS;
type HttpStatus = (typeof HTTP_STATUS)[HttpStatusKey];
declare const HTTP_STATUS_CODE_ERROR: Record<number, string>;
declare class AppError extends Error {
    readonly statusCode: number;
    readonly statusMessage: string;
    readonly errorCode?: string;
    readonly meta?: Record<string, any>;
    constructor(status: HttpStatus, message?: string | null, errorCode?: string, meta?: Record<string, any>);
}
declare class ValidationError extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare class AuthenticationError extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare class AuthorizationError extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare class NotFoundError extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare class TokenExpiredError extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare class TokenInvalidError extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare class BadRequestError extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare class ServerError extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare class ExistingError extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare class NoContent extends AppError {
    constructor(message?: string | null, meta?: Record<string, any>);
}
declare const errorHandler: (err: any, ERROR_TYPE?: string, service?: string) => {
    message: any;
    error: any;
    httpStatusCode: any;
    success: boolean;
    service: string;
};
declare const expressErrorMiddleware: () => (err: any, req: any, res: any, next: any) => void;

declare const paginate: (totalCount: number, currentPage: number, perPage: number) => {
    pageCount: number;
    offset: number;
};
declare const formatDate: (date: Date) => string;
declare const parseJSON: (value: any) => any;
declare const stringifyJSON: (value: any) => any;

type UUIDVersion = "v1" | "v4";
type UUIDBinary = Buffer;
type UUIDBuffer = Buffer;
declare const uuid: {
    /**
     * Converts a UUID string to its optimized binary representation (Buffer).
     * Reorders bytes for better index performance in databases like MySQL.
     * If no UUID is provided, generates a new v1 UUID.
     */
    toBinary: (value?: string | UUIDBuffer) => UUIDBinary;
    /**
     * Converts a binary UUID Buffer back to its string representation.
     */
    toString: (binary: UUIDBinary | string) => string;
    /**
     * Generates a new UUID string.
     * Defaults to v4 (random). Pass "v1" for time-based UUIDs.
     *
     * @example
     * uuid.get()      // v4 UUID
     * uuid.get("v1")  // v1 UUID
     */
    get: (version?: UUIDVersion) => string;
    /**
     * Returns true if the given string is a valid UUID.
     */
    isValid: (value: string) => boolean;
    /** The nil UUID — all zeros. Useful as a default/placeholder. */
    nil: "00000000-0000-0000-0000-000000000000";
    /**
     * Converts specified keys of an object from binary UUIDs to strings.
     * Returns a shallow copy — does NOT mutate the original.
     *
     * @example
     * uuid.manyToString({ id: <Buffer>, name: "foo" }, ["id"])
     * // { id: "xxxxxxxx-...", name: "foo" }
     */
    manyToString: <T extends Record<string, any>>(data: T, keys?: string[]) => T;
    /**
     * Converts specified keys of an object from UUID strings to binary Buffers.
     * Returns a shallow copy — does NOT mutate the original.
     *
     * @example
     * uuid.manyToBinary({ id: "xxxxxxxx-...", name: "foo" }, ["id"])
     * // { id: <Buffer>, name: "foo" }
     */
    manyToBinary: <T extends Record<string, any>>(data: T, keys?: string[]) => T;
};

/**
 * Pauses execution for the given number of milliseconds.
 *
 * @example
 * await sleep(1000); // waits 1 second
 */
declare const sleep: (ms: number) => Promise<void>;
interface RetryOptions {
    /** Number of retry attempts (default: 3) */
    retries?: number;
    /** Base delay in ms (default: 500) */
    delay?: number;
    /** Use exponential backoff — doubles delay each attempt (default: true) */
    exponential?: boolean;
    /** Called on each failed attempt before retrying */
    onError?: (err: unknown, attempt: number) => void;
}
/**
 * Retries an async function on failure with optional exponential backoff.
 *
 * @example
 * const data = await retry(() => fetchUser(id), { retries: 3, exponential: true });
 */
declare const retry: <T>(fn: () => Promise<T>, options?: RetryOptions) => Promise<T>;
/**
 * Rejects if the given promise doesn't resolve within `ms` milliseconds.
 * Cleans up the internal timer whether the promise resolves or rejects.
 *
 * @example
 * const data = await timeout(fetchUser(id), 5000);
 */
declare const timeout: <T>(promise: Promise<T>, ms: number) => Promise<T>;
interface DebouncedFn<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    /** Cancels any pending invocation */
    cancel: () => void;
    /** Immediately invokes the pending call if one exists */
    flush: (...args: Parameters<T>) => ReturnType<T> | undefined;
}
/**
 * Returns a debounced version of `fn` that delays invocation until
 * `delay`ms have passed since the last call.
 *
 * @example
 * const onSearch = debounce((query: string) => search(query), 300);
 * onSearch.cancel(); // cancel pending call
 * onSearch.flush();  // invoke immediately
 */
declare const debounce: <T extends (...args: any[]) => any>(fn: T, delay: number) => DebouncedFn<T>;
interface ThrottledFn<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    /** Cancels any pending trailing call */
    cancel: () => void;
}
/**
 * Returns a throttled version of `fn` that invokes at most once per `limit`ms.
 * Executes on the leading edge and optionally on the trailing edge.
 *
 * @example
 * const onScroll = throttle(() => updatePosition(), 100);
 */
declare const throttle: <T extends (...args: any[]) => any>(fn: T, limit: number, { trailing }?: {
    trailing?: boolean;
}) => ThrottledFn<T>;
/**
 * Caches the result of `fn` based on its arguments.
 * The cache key is built by JSON-serializing the arguments.
 *
 * @example
 * const getUser = memoize((id: number) => fetchUser(id));
 * await getUser(1); // fetches
 * await getUser(1); // returns cached result
 */
declare const memoize: <T extends (...args: any[]) => any>(fn: T, keyFn?: (...args: Parameters<T>) => string) => T & {
    cache: Map<string, ReturnType<T>>;
    clear: () => void;
};
/**
 * Returns a version of `fn` that executes exactly once.
 * All subsequent calls return the result of the first call.
 *
 * @example
 * const init = once(() => setupDatabase());
 * await init(); // runs
 * await init(); // returns cached result, does not run again
 */
declare const once: <T extends (...args: any[]) => any>(fn: T) => ((...args: Parameters<T>) => ReturnType<T>);

/**
 * Flattens a nested object into a single-level object with dot-notation keys.
 *
 * @example
 * flattenObject({ a: { b: { c: 1 } } })         // { "a.b.c": 1 }
 * flattenObject({ a: { b: 1 } }, { separator: "_" }) // { "a_b": 1 }
 */
declare const flattenObject: (obj: Record<string, any>, { separator, prefix }?: {
    separator?: string;
    prefix?: string;
}) => Record<string, any>;
/**
 * Restores a flattened dot-notation object back to its nested form.
 *
 * @example
 * unflattenObject({ "a.b.c": 1 })   // { a: { b: { c: 1 } } }
 */
declare const unflattenObject: (obj: Record<string, any>, separator?: string) => Record<string, any>;

/**
 * String utility functions
 */
declare const splitWords: (str: string) => string[];
declare const capitalize: (str: string) => string;
declare const toUpperCase: (str: string) => string;
declare const toLowerCase: (str: string) => string;
declare const camelCase: (str: string) => string;
declare const pascalCase: (str: string) => string;
declare const snakeCase: (str: string) => string;
declare const kebabCase: (str: string) => string;
/**
 * Truncates a string to `length` characters, appending `suffix` if trimmed.
 * The suffix length is included in the total, so the result never exceeds `length`.
 *
 * @example
 * truncate("Hello, world!", 8)         // "Hello..."
 * truncate("Hello, world!", 8, " →")   // "Hello →"
 */
declare const truncate: (str: string, length?: number, suffix?: string) => string;
/**
 * Masks all but the last `visible` characters of a string.
 * Useful for displaying sensitive values like credit cards or tokens.
 *
 * @example
 * maskString("4111111111111234")       // "************1234"
 * maskString("mysecrettoken", 6)       // "*******secret"  ← last 6 visible
 */
declare const maskString: (str: string, visible?: number) => string;
/**
 * Returns true if the string contains only whitespace or is empty.
 */
declare const isBlank: (str: string) => boolean;
/**
 * Reverses a string.
 */
declare const reverse: (str: string) => string;
/**
 * Counts occurrences of `substr` within `str`.
 */
declare const countOccurrences: (str: string, substr: string) => number;
/**
 * Removes all extra whitespace — trims the string and collapses
 * internal sequences of whitespace down to a single space.
 *
 * @example
 * normalizeWhitespace("  hello   world  ")  // "hello world"
 */
declare const normalizeWhitespace: (str: string) => string;

/**
 * Returns true for plain objects (not arrays, dates, null, etc.)
 */
declare const isObject: (val: any) => boolean;
/**
 * Validates an email address format.
 */
declare const isEmail: (value: string) => boolean;
/**
 * Validates a UUID v1–v5 string.
 */
declare const isUUID: (value: string) => boolean;
/**
 * Returns true for finite numbers (excludes NaN and Infinity).
 */
declare const isNumber: (value: any) => boolean;
/**
 * Returns true if the string is valid parseable JSON.
 */
declare const isJSON: (value: string) => boolean;
/**
 * Returns true for valid Date instances.
 */
declare const isDate: (value: any) => boolean;
/**
 * Returns true for valid http/https URLs only.
 * Rejects data:, javascript:, and other URI schemes.
 */
declare const isURL: (value: string) => boolean;
/**
 * Returns true only for actual booleans (not truthy/falsy values).
 */
declare const isBoolean: (value: any) => boolean;
/**
 * Returns true for strings.
 */
declare const isString: (value: any) => boolean;
/**
 * Returns true for arrays.
 */
declare const isArray: (value: any) => boolean;
/**
 * Returns true for integers (excludes floats, NaN, Infinity).
 */
declare const isInteger: (value: any) => boolean;
/**
 * Returns true for positive numbers (excludes zero).
 */
declare const isPositive: (value: any) => boolean;
/**
 * Returns true for negative numbers (excludes zero).
 */
declare const isNegative: (value: any) => boolean;
/**
 * Returns true if value is null or undefined.
 */
declare const isNil: (value: any) => boolean;
/**
 * Returns true if the value is "empty":
 * - null / undefined
 * - empty string or whitespace-only string
 * - empty array
 * - empty plain object
 */
declare const isEmpty: (val: any) => boolean;

interface Logger$1 {
    info: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
    warn: (msg: string, meta?: any) => void;
    debug: (msg: string, meta?: any) => void;
}
declare class Redis {
    private client;
    private logger;
    constructor(url: string, options?: RedisOptions, logger?: Logger$1);
    private registerListeners;
    start(): Promise<void>;
    disconnect(): Promise<void>;
    private validateKey;
    private buildKey;
    private serialize;
    private deserialize;
    set(key: string, data: any): Promise<"OK">;
    setEx(key: string, data: any, duration: number | string): Promise<"OK">;
    get<T = any>(key: string, parse?: boolean): Promise<T | null>;
    delete(key: string): Promise<boolean>;
    exists(key: string): Promise<boolean>;
    ttl(key: string): Promise<number>;
    expire(key: string, duration: number | string): Promise<boolean>;
    /**
     * Atomically increments a counter. Creates it at 1 if it doesn't exist.
     * Optionally sets a TTL on first creation.
     *
     * @example
     * await redis.increment("rate:user:123");            // 1, 2, 3...
     * await redis.increment("rate:user:123", "1 hour");  // resets TTL each time
     */
    increment(key: string, ttl?: number | string): Promise<number>;
    /**
     * Atomically decrements a counter.
     */
    decrement(key: string): Promise<number>;
    /**
     * Sets one or more fields on a Redis hash.
     *
     * @example
     * await redis.hset("user:1", { name: "Alice", role: "admin" });
     */
    hset(key: string, data: Record<string, any>): Promise<number>;
    /**
     * Gets a single field from a Redis hash.
     */
    hget<T = any>(key: string, field: string): Promise<T | null>;
    /**
     * Gets all fields from a Redis hash as a typed object.
     */
    hgetAll<T extends Record<string, any> = Record<string, any>>(key: string): Promise<T | null>;
    /**
     * Deletes one or more fields from a Redis hash.
     */
    hdel(key: string, ...fields: string[]): Promise<number>;
    /**
     * Safely scans for keys matching a pattern using SCAN (non-blocking).
     * Prefer this over KEYS in production — KEYS blocks the event loop.
     *
     * @example
     * await redis.scan("user:*")    // ["user:1", "user:2", ...]
     */
    scan(pattern: string): Promise<string[]>;
    /**
     * Deletes all keys matching a pattern using SCAN + batched DEL.
     * Safe for large keyspaces.
     *
     * @example
     * await redis.deleteByPattern("session:*")  // clears all sessions
     */
    deleteByPattern(pattern: string): Promise<number>;
    /**
     * @deprecated Use `scan()` instead — KEYS blocks the Redis event loop.
     */
    keys(pattern: string): Promise<string[]>;
    /**
     * @deprecated Use `deleteByPattern()` instead.
     */
    deleteAll(prefix: string): Promise<number>;
    /**
     * Flushes the current database. Intended for testing only.
     * Throws in production unless `force: true` is passed.
     */
    flush(force?: boolean): Promise<void>;
    private authKey;
    private tokenKey;
    getCachedUser<T = any>(id: string, throwError?: boolean): Promise<T | null>;
    cacheUser(user: any, ttl?: number | string): Promise<void>;
    /**
     * Atomically updates an array field on a cached user.
     * Operates on a fresh copy to avoid mutating the cached object before re-save.
     */
    updateAuthData(userId: string, key: string, value: string, action?: "ADD" | "REMOVE"): Promise<any>;
    private parseDuration;
}

interface Logger {
    info(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    debug?(message: string, meta?: unknown): void;
}

interface SqsConfig {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
}
interface SQSEnqueueOptions {
    queueUrl: string;
    message: string | object;
    /** Required for FIFO queues */
    messageGroupId?: string;
    /** Required for FIFO queues with content-based deduplication disabled */
    messageDeduplicationId?: string;
    /** Delay message delivery (0–900 seconds) */
    delaySeconds?: number;
    /** Arbitrary metadata attached to the message */
    attributes?: Record<string, MessageAttributeValue>;
}
interface SQSDequeueOptions {
    queueUrl: string;
    consumerFunction: (message: any) => Promise<void>;
    dlqUrl?: string;
    maxNumberOfMessages?: number;
    waitTimeSeconds?: number;
    /**
     * Extend visibility timeout during processing (seconds).
     * Set this close to your expected max processing time.
     */
    visibilityTimeout?: number;
    /**
     * If true, failed messages are left in the queue for SQS to retry
     * via the queue's own redrive policy instead of immediately going to DLQ.
     */
    useRedrivePolicy?: boolean;
}
declare class SQS {
    private client;
    private logger;
    private polling;
    constructor(config: SqsConfig, logger?: Logger);
    /**
     * Sends a message to an SQS queue.
     * Automatically serializes objects to JSON.
     *
     * @example
     * await sqs.enqueue({ queueUrl, message: { event: "user.created", userId: 1 } });
     */
    enqueue({ queueUrl, message, messageGroupId, messageDeduplicationId, delaySeconds, attributes, }: SQSEnqueueOptions): Promise<boolean>;
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
    dequeue({ queueUrl, consumerFunction, dlqUrl, maxNumberOfMessages, waitTimeSeconds, visibilityTimeout, useRedrivePolicy, }: SQSDequeueOptions): Promise<void>;
    /**
     * Gracefully stops the polling loop after the current batch completes.
     */
    stop(): void;
    private processMessage;
}

type LogLevel = "error" | "warn" | "info" | "http" | "debug";
interface WinstonLoggerOptions {
    /** Minimum log level to output (default: "info", or "debug" in development) */
    level?: LogLevel;
    /** Service name attached to every log entry */
    service?: string;
    /** If true, write logs to a file in addition to the console */
    file?: {
        path: string;
        /** Separate file for errors only (recommended) */
        errorPath?: string;
    };
    /** If true, output plain text instead of JSON (default: true in development) */
    pretty?: boolean;
    /** Static metadata attached to every log entry */
    defaultMeta?: Record<string, unknown>;
}
declare class WinstonLogger implements Logger {
    private logger;
    constructor(options?: WinstonLoggerOptions);
    info(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    debug(message: string, meta?: unknown): void;
    http(message: string, meta?: unknown): void;
    /**
     * Returns a child logger with additional metadata attached to every entry.
     * Useful for scoping logs to a request, service, or job.
     *
     * @example
     * const log = logger.child({ requestId: "abc-123", userId: "u-1" });
     * log.info("User fetched"); // → { requestId: "abc-123", userId: "u-1", message: "User fetched" }
     */
    child(meta: Record<string, unknown>): WinstonLogger;
    /**
     * Dynamically changes the log level at runtime.
     * Useful for temporarily enabling debug logs in production.
     *
     * @example
     * logger.setLevel("debug");
     */
    setLevel(level: LogLevel): void;
    /**
     * Returns true if the given level would currently be logged.
     *
     * @example
     * if (logger.isLevelEnabled("debug")) { ... }
     */
    isLevelEnabled(level: LogLevel): boolean;
}

interface S3Config {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    defaultBucket?: string;
}
interface S3UploadOptions {
    bucket?: string;
    key: string;
    body: Buffer | Uint8Array | string | Readable;
    contentType?: string;
    metadata?: Record<string, string>;
    /** Canned ACL e.g. "private" | "public-read" */
    acl?: ObjectCannedACL;
}
interface S3UploadResult {
    bucket: string;
    key: string;
    url: string;
}
interface S3ObjectOptions {
    bucket?: string;
    key: string;
}
interface S3CopyOptions {
    sourceBucket?: string;
    sourceKey: string;
    destinationBucket?: string;
    destinationKey: string;
}
interface S3SignedUrlOptions {
    bucket?: string;
    key: string;
    expiresIn?: number;
}
declare class S3 {
    private client;
    private logger;
    private defaultBucket?;
    private region;
    constructor(config: S3Config, logger?: Logger);
    private getBucket;
    private getObjectUrl;
    private streamToBuffer;
    /**
     * Uploads a file to S3. Returns the bucket, key, and public URL.
     *
     * @example
     * const result = await s3.upload({ key: "avatars/user-1.png", body: buffer, contentType: "image/png" });
     * result.url // "https://my-bucket.s3.us-east-1.amazonaws.com/avatars/user-1.png"
     */
    upload({ bucket, key, body, contentType, metadata, acl, }: S3UploadOptions): Promise<S3UploadResult>;
    /**
     * Downloads an S3 object and returns it as a Buffer.
     */
    download({ bucket, key }: S3ObjectOptions): Promise<Buffer>;
    /**
     * Returns the raw readable stream for an S3 object.
     * Prefer this over `download` for large files.
     */
    stream({ bucket, key }: S3ObjectOptions): Promise<Readable>;
    delete({ bucket, key }: S3ObjectOptions): Promise<boolean>;
    /**
     * Copies an object within S3 — within the same bucket or across buckets.
     *
     * @example
     * await s3.copy({ sourceKey: "uploads/tmp.png", destinationKey: "avatars/user-1.png" });
     */
    copy({ sourceBucket, sourceKey, destinationBucket, destinationKey, }: S3CopyOptions): Promise<S3UploadResult>;
    /**
     * Returns true if the object exists.
     * Throws on non-404 errors (permissions, network) rather than silently returning false.
     */
    exists({ bucket, key }: S3ObjectOptions): Promise<boolean>;
    /**
     * Generates a pre-signed URL for downloading an object (GET).
     * Default expiry: 1 hour.
     */
    getSignedDownloadUrl({ bucket, key, expiresIn }: S3SignedUrlOptions): Promise<string>;
    /**
     * Generates a pre-signed URL for uploading an object directly (PUT).
     * Use this for browser → S3 direct uploads without proxying through your server.
     *
     * @example
     * const url = await s3.getSignedUploadUrl({ key: "avatars/user-1.png", contentType: "image/png" });
     * // Client does: fetch(url, { method: "PUT", body: file })
     */
    getSignedUploadUrl({ bucket, key, expiresIn, contentType, }: S3SignedUrlOptions & {
        contentType?: string;
    }): Promise<string>;
    /**
     * Returns a scoped helper with the bucket pre-filled.
     *
     * @example
     * const avatars = s3.bucket("my-avatars-bucket");
     * await avatars.upload({ key: "user-1.png", body: buffer });
     */
    bucket(bucketName: string): {
        upload: (opts: Omit<S3UploadOptions, "bucket">) => Promise<S3UploadResult>;
        download: (opts: Omit<S3ObjectOptions, "bucket">) => Promise<Buffer<ArrayBufferLike>>;
        stream: (opts: Omit<S3ObjectOptions, "bucket">) => Promise<Readable>;
        delete: (opts: Omit<S3ObjectOptions, "bucket">) => Promise<boolean>;
        exists: (opts: Omit<S3ObjectOptions, "bucket">) => Promise<boolean>;
        copy: (opts: Omit<S3CopyOptions, "destinationBucket">) => Promise<S3UploadResult>;
        getSignedDownloadUrl: (opts: Omit<S3SignedUrlOptions, "bucket">) => Promise<string>;
        getSignedUploadUrl: (opts: Omit<S3SignedUrlOptions & {
            contentType?: string;
        }, "bucket">) => Promise<string>;
    };
}

interface CronJobOptions {
    /** Cron expression e.g. "0 * * * *" or human shorthand */
    schedule: string;
    /** Human-readable name for logging and lookup */
    name: string;
    /** The function to execute on each tick */
    handler: () => Promise<void> | void;
    /** If true, runs the handler immediately on registration (default: false) */
    runOnInit?: boolean;
    /** Timezone e.g. "America/New_York" (default: system timezone) */
    timezone?: string;
    /** If true, prevents overlapping executions — waits for current run to finish (default: true) */
    preventOverlap?: boolean;
}
interface CronJobStatus {
    name: string;
    schedule: string;
    running: boolean;
    lastRun: Date | null;
    lastError: Error | null;
    executionCount: number;
    errorCount: number;
}
declare class Cron {
    private jobs;
    private logger;
    constructor(logger?: Logger);
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
    register(options: CronJobOptions): void;
    private execute;
    /**
     * Stops a running job without removing it.
     * Can be resumed with start().
     */
    stop(name: string): void;
    /**
     * Resumes a stopped job.
     */
    start(name: string): void;
    /**
     * Stops and removes a job entirely.
     */
    remove(name: string): void;
    /**
     * Replaces an existing job with a new configuration.
     * Useful for updating schedules at runtime.
     */
    replace(options: CronJobOptions): void;
    /**
     * Manually triggers a job outside its schedule.
     * Respects preventOverlap.
     *
     * @example
     * await cron.run("send-digest");
     */
    run(name: string): Promise<void>;
    /**
     * Stops all registered jobs. Call this on process shutdown.
     *
     * @example
     * process.on("SIGTERM", () => cron.stopAll());
     */
    stopAll(): void;
    /**
     * Returns the status of a single job.
     */
    status(name: string): CronJobStatus;
    /**
     * Returns the status of all registered jobs.
     */
    statusAll(): CronJobStatus[];
    /**
     * Returns true if a job with the given name is registered.
     */
    has(name: string): boolean;
    private getJob;
}

interface JwtEncodeOptions {
    data: string | object | Buffer;
    secretKey: string;
    expiresIn?: string | number;
    algorithm?: SignOptions["algorithm"];
}
interface JwtDecodeOptions {
    token: string;
    secretKey: string;
    algorithms?: string[];
}
declare const jwtService: {
    /**
    * Signs a payload and returns a JWT string.
    *
    * @example
    * const token = await jwtService.encode({ data: { userId: 1 }, secretKey: "secret" });
    */
    encode({ data, secretKey, expiresIn, algorithm, }: JwtEncodeOptions): Promise<string>;
    /**
   * Verifies and decodes a JWT string.
   * Throws a typed `JwtError` on expiry, invalid signature, or not-yet-valid tokens.
   *
   * @example
   * const payload = await jwtService.decode<{ userId: number }>({ token, secretKey: "secret" });
   */
    decode<T = jwt.JwtPayload>({ token, secretKey, algorithms, }: JwtDecodeOptions): Promise<T>;
    /**
   * Returns the expiry date of a token without verifying it.
   * Returns null if the token has no expiry or cannot be decoded.
   *
   * @example
   * jwtService.getExpiry(token) // Date | null
   */
    getExpiry(token: string): Date | null;
    /**
    * Returns true if the token is expired, without verifying the signature.
    * Useful for checking whether to refresh a token before making a request.
    *
    * @example
    * if (jwtService.isExpired(token)) { ... }
    */
    isExpired(token: string): boolean;
};

interface HashOptions {
    /** bcrypt salt rounds (default: 12) */
    rounds?: number;
}
interface HmacOptions {
    /** HMAC algorithm (default: "sha256") */
    algorithm?: "sha256" | "sha512" | "sha1";
    /** Output encoding (default: "hex") */
    encoding?: "hex" | "base64";
}
interface TokenOptions {
    /** Byte length of the random token (default: 32) */
    bytes?: number;
    /** Output encoding (default: "hex") */
    encoding?: "hex" | "base64url" | "base64";
}
declare const hashService: {
    /**
     * Hashes a plain text value using bcrypt.
     * Use for passwords — bcrypt is intentionally slow and salted.
     *
     * @example
     * const hashed = await hashService.hash("myPassword123");
     */
    hash(plain: string, { rounds }?: HashOptions): Promise<string>;
    /**
     * Compares a plain text value against a bcrypt hash.
     *
     * @example
     * const match = await hashService.compare("myPassword123", storedHash);
     * if (!match) throw new AuthenticationError("Invalid credentials");
     */
    compare(plain: string, hashed: string): Promise<boolean>;
    /**
     * Returns true if the string looks like a bcrypt hash.
     * Useful for detecting already-hashed values before double-hashing.
     *
     * @example
     * hashService.isBcryptHash("$2b$12$...") // true
     */
    isBcryptHash(value: string): boolean;
    /**
     * Creates an HMAC signature for a value using a secret key.
     * Use for signing data (webhooks, tokens, URLs) — NOT for passwords.
     *
     * @example
     * const sig = hashService.hmac("payload body", process.env.WEBHOOK_SECRET);
     */
    hmac(value: string, secret: string, { algorithm, encoding }?: HmacOptions): string;
    /**
     * Verifies an HMAC signature using a timing-safe comparison.
     * Always use this instead of `===` to prevent timing attacks.
     *
     * @example
     * const valid = hashService.verifyHmac(payload, secret, incomingSignature);
     * if (!valid) throw new Error("Invalid webhook signature");
     */
    verifyHmac(value: string, secret: string, signature: string, options?: HmacOptions): boolean;
    /**
     * Creates a one-way SHA hash of a value (no secret).
     * Use for content fingerprinting, cache keys, or deduplication.
     * NOT suitable for passwords.
     *
     * @example
     * const fingerprint = hashService.sha256("file contents here");
     */
    sha256(value: string, encoding?: "hex" | "base64"): string;
    sha512(value: string, encoding?: "hex" | "base64"): string;
    /**
     * Generates a cryptographically secure random token.
     * Use for password reset tokens, email verification, API keys, etc.
     *
     * @example
     * const token = hashService.generateToken();            // 64-char hex string
     * const token = hashService.generateToken({ bytes: 16, encoding: "base64url" });
     */
    generateToken({ bytes, encoding }?: TokenOptions): string;
    /**
     * Generates a token and returns both the raw value (to send to user)
     * and its SHA-256 hash (to store in the database).
     *
     * @example
     * const { token, hashed } = hashService.generateHashedToken();
     * await db.user.update({ resetToken: hashed, resetTokenExpiry: ... });
     * await email.send({ to: user.email, token }); // send raw token to user
     */
    generateHashedToken(options?: TokenOptions): {
        token: string;
        hashed: string;
    };
};

export { AppError, AuthenticationError, AuthorizationError, BadRequestError, Cron, CronJobOptions, CronJobStatus, DebouncedFn, DirectConstraint, ExistingError, FieldConstraint, HTTP_STATUS, HTTP_STATUS_CODE_ERROR, HashOptions, HmacOptions, HttpStatus, HttpStatusKey, JoiConstraints, JwtDecodeOptions, JwtEncodeOptions, LogLevel, NoContent, NotFoundError, Redis, RetryOptions, S3, S3Config, S3CopyOptions, S3ObjectOptions, S3SignedUrlOptions, S3UploadOptions, S3UploadResult, SQS, SQSDequeueOptions, SQSEnqueueOptions, ServerError, SqsConfig, ThrottledFn, TokenExpiredError, TokenInvalidError, TokenOptions, ValidationError, WinstonLogger, WinstonLoggerOptions, camelCase, capitalize, countOccurrences, debounce, errorHandler, expressErrorMiddleware, flattenObject, formatDate, hashService, isArray, isBlank, isBoolean, isDate, isEmail, isEmpty, isInteger, isJSON, isNegative, isNil, isNumber, isObject, isPositive, isString, isURL, isUUID, joiMiddleware, joiValidate, jwtService, kebabCase, makeRequest, maskString, memoize, normalizeWhitespace, once, paginate, parseJSON, pascalCase, retry, reverse, sleep, snakeCase, splitWords, stringifyJSON, throttle, timeout, toLowerCase, toUpperCase, truncate, unflattenObject, uuid };
