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

const serializeErrors = format((info) => {
  // Ensure Error objects in meta have their stack trace preserved
  if (info.meta instanceof Error) {
    info.meta = {
      message: info.meta.message,
      stack: info.meta.stack,
      name: info.meta.name,
    };
  }

  if (info instanceof Error) {
    info.stack = info.stack;
    info.message = info.message;
  }

  return info;
});

const prettyFormat = format.combine(
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