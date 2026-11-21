import { timeout as withTimeout, sleep } from "./async.js";
import { defaultLogger, type Logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShutdownStep {
  /** Shown in logs */
  name: string;
  /** Stops or closes something. May be async. */
  stop: () => unknown | Promise<unknown>;
  /** Time limit for this step in ms (default: whatever is left of the total timeout) */
  timeout?: number;
}

export interface GracefulShutdownOptions {
  /**
   * Run one after another, in this order. Usual order: stop taking traffic
   * (HTTP server), stop consumers (SQS, cron), then close connections (Redis, DB).
   */
  steps: ShutdownStep[];
  /** Total time limit in ms. When reached, the process exits with code 1 (default: 30000). */
  timeout?: number;
  /** Signals that start shutdown (default: SIGTERM, SIGINT). Pass [] to only trigger it manually. */
  signals?: NodeJS.Signals[];
  /**
   * Marked not-ready as soon as shutdown starts, so load balancers stop
   * sending traffic. Pass the object from `createHealth()`.
   */
  health?: { setReady(ready: boolean): void };
  /**
   * Wait this long (ms) after marking not-ready, before running steps, so
   * load balancers notice the failing readiness check (default: 0).
   * Kubernetes setups typically use 5000–10000.
   */
  drainDelay?: number;
  /**
   * Exit the process when done: code 0 if every step succeeded, 1 otherwise
   * (default: true). Pass false to keep the process alive, or a function to
   * handle the exit yourself.
   */
  exit?: boolean | ((code: number) => void);
  logger?: Logger;
}

export interface GracefulShutdown {
  /** Starts shutdown (same as receiving a signal). Resolves true if every step succeeded. */
  shutdown(reason?: string): Promise<boolean>;
  /** true once shutdown has started */
  readonly isShuttingDown: boolean;
  /** Removes the signal listeners */
  dispose(): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Stops a service cleanly on SIGTERM/SIGINT, as sent by Docker, Kubernetes,
 * ECS, systemd or Ctrl+C.
 *
 * 1. Marks the service not-ready (`health`), then waits `drainDelay`
 * 2. Runs each step in order. A failing step is logged and the next one still runs.
 * 3. Exits with code 0, or 1 if a step failed or the total `timeout` was hit
 *
 * A second signal while shutting down exits immediately with code 1.
 *
 * @example
 * gracefulShutdown({
 *   health,
 *   drainDelay: 5000,
 *   logger,
 *   steps: [
 *     { name: "http",  stop: () => closeHttpServer(server) },
 *     { name: "sqs",   stop: () => sqs.stop() },
 *     { name: "cron",  stop: () => cron.stopAll() },
 *     { name: "redis", stop: () => redis.disconnect() },
 *   ],
 * });
 */
export const gracefulShutdown = (options: GracefulShutdownOptions): GracefulShutdown => {
  const {
    steps,
    timeout = 30_000,
    signals = ["SIGTERM", "SIGINT"],
    health,
    drainDelay = 0,
    exit = true,
    logger = defaultLogger,
  } = options;

  const exitWith = (code: number): void => {
    if (exit === false) return;
    if (typeof exit === "function") exit(code);
    else process.exit(code);
  };

  let shuttingDown = false;
  let running: Promise<boolean> | undefined;

  const runSteps = async (deadline: number): Promise<boolean> => {
    let ok = true;
    for (const step of steps) {
      const remaining = Math.max(0, deadline - Date.now());
      const limit = Math.min(step.timeout ?? remaining, remaining);
      const started = Date.now();
      try {
        await withTimeout(Promise.resolve().then(step.stop), limit);
        logger.info("Shutdown step completed", { step: step.name, ms: Date.now() - started });
      } catch (err) {
        ok = false;
        logger.error("Shutdown step failed", { step: step.name, err });
      }
    }
    return ok;
  };

  const shutdown = (reason = "manual"): Promise<boolean> => {
    if (running) return running;
    shuttingDown = true;

    running = (async () => {
      const deadline = Date.now() + timeout;
      logger.warn("Shutting down", { reason, steps: steps.map((s) => s.name), timeoutMs: timeout });
      health?.setReady(false);

      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<false>((resolve) => {
        timer = setTimeout(() => {
          logger.error("Shutdown timed out, forcing exit", { timeoutMs: timeout });
          resolve(false);
        }, timeout);
        timer.unref?.();
      });

      const work = (async () => {
        if (drainDelay > 0) await sleep(Math.min(drainDelay, timeout));
        return runSteps(deadline);
      })();

      const ok = await Promise.race([work, timedOut]);
      clearTimeout(timer);

      logger.info("Shutdown finished", { ok });
      exitWith(ok ? 0 : 1);
      return ok;
    })();

    return running;
  };

  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      logger.warn("Second signal received, exiting immediately", { signal });
      exitWith(1);
      return;
    }
    void shutdown(signal);
  };

  for (const signal of signals) process.on(signal, onSignal);

  return {
    shutdown,
    get isShuttingDown() {
      return shuttingDown;
    },
    dispose: () => {
      for (const signal of signals) process.off(signal, onSignal);
    },
  };
};
