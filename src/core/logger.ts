/**
 * Minimal logger contract used across nodecore-kit.
 * `console`, `WinstonLogger`, pino, or any object with these methods works.
 */
export interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  debug?(message: string, meta?: unknown): void;
}

const noop = (): void => {};

const toConsole =
  (method: "info" | "warn" | "error" | "debug") =>
  (message: string, meta?: unknown): void => {
    if (meta === undefined) console[method](message);
    else console[method](message, meta);
  };

/** Discards everything. */
export const noopLogger: Logger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
};

/** Writes every level to the console. */
export const consoleLogger: Logger = {
  info: toConsole("info"),
  warn: toConsole("warn"),
  error: toConsole("error"),
  debug: toConsole("debug"),
};

/**
 * Used by adapters when no logger is passed.
 * Warnings and errors go to the console; info and debug are silent,
 * so a library never floods your output with routine messages.
 */
export const defaultLogger: Logger = {
  info: noop,
  debug: noop,
  warn: toConsole("warn"),
  error: toConsole("error"),
};
