import RedisClient, { RedisOptions } from 'ioredis';
import jwt, { SignOptions } from 'jsonwebtoken';

declare const makeRequest: ({ url, method, headers, token, data, }: {
    url: string;
    method?: "GET" | "DELETE" | "POST" | "PATCH" | "PUT";
    headers?: Record<string, any>;
    token?: string;
    data?: Record<string, any>;
}) => Promise<Record<string, any>>;

declare function joiValidator(constraint: any, isMiddleware?: boolean): any;

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
declare const isObject: (val: any) => boolean;
declare const sleep: (ms: number) => Promise<unknown>;
declare const capitalize: (str: string) => string;
declare const isEmpty: (val: any) => boolean;

declare const uuid: {
    toBinary: (uuid?: any) => any;
    toString: (binary: any) => string;
    get: (version?: "v1" | "v4") => string;
    isValid: (uuid: string) => boolean;
    manyToString: (data: any, keys?: never[]) => any;
    manyToBinary: (data: any, keys?: never[]) => any;
};

declare class Redis {
    client: RedisClient;
    constructor(url: string, options?: RedisOptions);
    private registerListeners;
    start(): Promise<void>;
    disconnect(): Promise<void>;
    keys(pattern: string): Promise<string[]>;
    private serialize;
    private deserialize;
    set(key: string, data: any): Promise<"OK">;
    setEx(key: string, data: any, duration: number | string): Promise<"OK">;
    get<T = any>(key: string, parse?: boolean): Promise<T | null>;
    delete(key: string): Promise<boolean>;
    deleteAll(prefix: string): Promise<number>;
    exists(key: string): Promise<boolean>;
    ttl(key: string): Promise<number>;
    expire(key: string, duration: number | string): Promise<boolean>;
    flush(): Promise<void>;
    getCachedUser<T = any>(id: string, throwError?: boolean): Promise<T | null>;
    cacheUser(user: any, ttl?: number | string): Promise<void>;
    updateAuthData(userId: string, key: string, value: string, action?: "ADD" | "REMOVE"): Promise<any>;
    private parseDuration;
}

interface SQSDequeueInt {
    queueUrl: string;
    consumerFunction: (message: any) => Promise<any>;
    maxNumberOfMessages?: number;
    waitTimeSeconds?: number;
    dlqUrl?: string;
}
interface SQSEqueueInt {
    queueUrl: string;
    message: any;
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
declare class SQS {
    private client;
    private logger;
    constructor(config: SqsConfig, logger?: Logger);
    enqueue({ queueUrl, message }: SQSEqueueInt): Promise<boolean>;
    dequeue(fields: SQSDequeueInt): Promise<void>;
}

declare class WinstonLogger implements Logger {
    private logger;
    info(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    debug(message: string, meta?: unknown): void;
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
    encode({ data, secretKey, expiresIn, algorithm, }: JwtEncodeOptions): Promise<string>;
    decode<T = jwt.JwtPayload>({ token, secretKey, algorithms, }: JwtDecodeOptions): Promise<T>;
};

export { AppError, AuthenticationError, AuthorizationError, BadRequestError, ExistingError, HTTP_STATUS, HTTP_STATUS_CODE_ERROR, HttpStatus, HttpStatusKey, JwtDecodeOptions, JwtEncodeOptions, NoContent, NotFoundError, Redis, SQS, ServerError, SqsConfig, TokenExpiredError, TokenInvalidError, ValidationError, WinstonLogger, capitalize, errorHandler, expressErrorMiddleware, formatDate, isEmpty, isObject, joiValidator, jwtService, makeRequest, paginate, parseJSON, sleep, stringifyJSON, uuid };
