import winston, { format } from "winston";
import { Logger } from "../types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = "error" | "warn" | "info" | "http" | "debug";

export interface WinstonLoggerOptions {
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

// ─── Formats ──────────────────────────────────────────────────────────────────

/**
 * Converts Error instances (at any depth) into plain objects.
 * `JSON.stringify(new Error("x"))` gives `{}` because message and stack are
 * non-enumerable, so without this every `{ err }` logged would be empty.
 */
const toSerializable = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth > 8) return "[Max depth]";
  seen.add(value);

  if (value instanceof Error) {
    const plain: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
    // Keep own enumerable fields (statusCode, errorCode, meta, …)
    for (const [k, v] of Object.entries(value)) plain[k] = toSerializable(v, depth + 1, seen);
    const cause = (value as { cause?: unknown }).cause;
    if (cause !== undefined) plain.cause = toSerializable(cause, depth + 1, seen);
    return plain;
  }

  if (Array.isArray(value)) return value.map((v) => toSerializable(v, depth + 1, seen));
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = toSerializable(v, depth + 1, seen);
  return out;
};

const serializeErrors = format((info) => {
  if (info.meta !== undefined) info.meta = toSerializable(info.meta);
  return info;
});

const prettyFormat = format.combine(
  serializeErrors(),
  format.colorize(),
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message, service, ...meta }) => {
    const svc = service ? `[${service}] ` : "";
    const metaStr = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : "";
    return `${timestamp} ${level}: ${svc}${message}${metaStr}`;
  }),
);

const jsonFormat = format.combine(
  serializeErrors(),
  format.timestamp(),
  format.json(),
);

// ─── Class ────────────────────────────────────────────────────────────────────

export class WinstonLogger implements Logger {
  private logger: winston.Logger;

  constructor(options: WinstonLoggerOptions = {}) {
    const {
      level = process.env.NODE_ENV === "development" ? "debug" : "info",
      service,
      file,
      pretty = process.env.NODE_ENV === "development",
      defaultMeta = {},
    } = options;

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: pretty ? prettyFormat : jsonFormat,
      }),
    ];

    if (file?.path) {
      transports.push(
        new winston.transports.File({
          filename: file.path,
          format: jsonFormat,
        }),
      );
    }

    if (file?.errorPath) {
      transports.push(
        new winston.transports.File({
          filename: file.errorPath,
          level: "error",
          format: jsonFormat,
        }),
      );
    }

    this.logger = winston.createLogger({
      level,
      defaultMeta: { service, ...defaultMeta },
      transports,
      // Prevent winston from exiting on uncaught exceptions in logger itself
      exitOnError: false,
    });
  }

  // ─── Logger Interface ─────────────────────────────────────────────────────

  info(message: string, meta?: unknown): void {
    this.logger.info(message, { meta });
  }

  error(message: string, meta?: unknown): void {
    this.logger.error(message, { meta });
  }

  warn(message: string, meta?: unknown): void {
    this.logger.warn(message, { meta });
  }

  debug(message: string, meta?: unknown): void {
    this.logger.debug(message, { meta });
  }

  http(message: string, meta?: unknown): void {
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
  child(meta: Record<string, unknown>): WinstonLogger {
    const child = Object.create(this) as WinstonLogger;
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
  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  /**
   * Returns true if the given level would currently be logged.
   *
   * @example
   * if (logger.isLevelEnabled("debug")) { ... }
   */
  isLevelEnabled(level: LogLevel): boolean {
    return this.logger.isLevelEnabled(level);
  }
}