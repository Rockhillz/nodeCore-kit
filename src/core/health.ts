import { timeout as withTimeout } from "./async.js";
import { noopLogger, type Logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A dependency check. Resolve (optionally with details) when healthy, throw
 * when not. Adapters such as `Redis` expose one as `healthCheck()`.
 */
export type HealthCheckFn = () => Promise<unknown> | unknown;
export type HealthCheck = HealthCheckFn | { healthCheck(): Promise<unknown> | unknown };

export type HealthStatus = "up" | "down";

export interface HealthCheckResult {
  status: HealthStatus;
  latencyMs: number;
  /** Error message. Only included when `includeErrors` is true. */
  error?: string;
  /** Whatever the check resolved with, if it was an object */
  details?: Record<string, unknown>;
}

export interface HealthReport {
  status: HealthStatus;
  /** false while starting up (`setReady(false)`) or shutting down */
  ready: boolean;
  checks: Record<string, HealthCheckResult>;
  uptimeSeconds: number;
  timestamp: string;
}

export interface HealthOptions {
  /** Named dependency checks run by `readiness()` */
  checks?: Record<string, HealthCheck>;
  /** Per-check timeout in ms (default: 3000) */
  timeout?: number;
  /**
   * Include failure messages in the report (default: false). Messages can
   * contain host names or other internals, so enable this only when the
   * endpoint isn't public. Failures are always logged.
   */
  includeErrors?: boolean;
  /** Start as ready (default: true). Pass false and call `setReady(true)` after startup work. */
  ready?: boolean;
  /** Where failed checks are logged (default: silent) */
  logger?: Logger;
}

export interface Health {
  /**
   * Liveness: is the process running? Never calls dependencies, so a database
   * outage doesn't make an orchestrator restart healthy processes.
   */
  liveness(): HealthReport;
  /** Readiness: runs every check. `status` is "up" only if all checks pass and the service is ready. */
  readiness(): Promise<HealthReport>;
  /** Marks the service ready or not ready (e.g. during startup or shutdown) */
  setReady(ready: boolean): void;
  isReady(): boolean;
  /** Adds or replaces a named check */
  addCheck(name: string, check: HealthCheck): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

const toFn = (check: HealthCheck): HealthCheckFn =>
  typeof check === "function" ? check : () => check.healthCheck();

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Builds liveness and readiness reports from dependency checks.
 * Framework-agnostic: wire it to HTTP with `healthHandlers()` (Express) or
 * your own route.
 *
 * @example
 * const health = createHealth({
 *   checks: {
 *     redis,                                   // anything with healthCheck()
 *     orders: () => sqs.healthCheck(QUEUE_URL),
 *     db: () => prisma.$queryRaw`SELECT 1`,
 *   },
 * });
 *
 * const report = await health.readiness();
 * // { status: "up", ready: true, checks: { redis: { status: "up", latencyMs: 2 }, … } }
 */
export const createHealth = (options: HealthOptions = {}): Health => {
  const { timeout = 3000, includeErrors = false, logger = noopLogger } = options;
  const checks = new Map<string, HealthCheck>(Object.entries(options.checks ?? {}));
  let ready = options.ready ?? true;

  const base = () => ({
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });

  const runCheck = async (name: string, check: HealthCheck): Promise<HealthCheckResult> => {
    const started = performance.now();
    try {
      const value = await withTimeout(Promise.resolve().then(toFn(check)), timeout);
      return {
        status: "up",
        latencyMs: Math.round(performance.now() - started),
        ...(isPlainObject(value) && { details: value }),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("Health check failed", { check: name, err });
      return {
        status: "down",
        latencyMs: Math.round(performance.now() - started),
        ...(includeErrors && { error: message }),
      };
    }
  };

  return {
    liveness: () => ({ status: "up", ready, checks: {}, ...base() }),

    readiness: async () => {
      const entries = await Promise.all(
        [...checks].map(async ([name, check]) => [name, await runCheck(name, check)] as const),
      );
      const results = Object.fromEntries(entries);
      const allUp = entries.every(([, r]) => r.status === "up");
      return { status: allUp && ready ? "up" : "down", ready, checks: results, ...base() };
    },

    setReady: (value) => {
      ready = value;
    },
    isReady: () => ready,
    addCheck: (name, check) => {
      checks.set(name, check);
    },
  };
};
