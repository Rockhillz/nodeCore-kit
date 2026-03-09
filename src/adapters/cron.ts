import cron, { ScheduledTask } from "node-cron";
import { Logger } from "./types.js";
import { ValidationError, ServerError } from "../core/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CronJobOptions {
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

export interface CronJobStatus {
  name: string;
  schedule: string;
  running: boolean;
  lastRun: Date | null;
  lastError: Error | null;
  executionCount: number;
  errorCount: number;
}

// ─── Default Logger ───────────────────────────────────────────────────────────

const defaultLogger: Logger = {
  info:  (msg, meta?) => console.info(msg, meta),
  error: (msg, meta?) => console.error(msg, meta),
  warn:  (msg, meta?) => console.warn(msg, meta),
  debug: (msg, meta?) => console.debug(msg, meta),
};

// ─── Internal Job Record ──────────────────────────────────────────────────────

interface JobRecord {
  options: CronJobOptions;
  task: ScheduledTask;
  status: CronJobStatus;
  executing: boolean;
}

// ─── Shorthands ───────────────────────────────────────────────────────────────

const SHORTHANDS: Record<string, string> = {
  "every minute":        "* * * * *",
  "every 5 minutes":     "*/5 * * * *",
  "every 10 minutes":    "*/10 * * * *",
  "every 15 minutes":    "*/15 * * * *",
  "every 30 minutes":    "*/30 * * * *",
  "every hour":          "0 * * * *",
  "every 6 hours":       "0 */6 * * *",
  "every 12 hours":      "0 */12 * * *",
  "every day":           "0 0 * * *",
  "every day at noon":   "0 12 * * *",
  "every week":          "0 0 * * 0",
  "every month":         "0 0 1 * *",
};

// ─── Class ────────────────────────────────────────────────────────────────────

export class Cron {
  private jobs = new Map<string, JobRecord>();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? defaultLogger;
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
  register(options: CronJobOptions): void {
    const { name, schedule, handler, runOnInit = false, timezone, preventOverlap = true } = options;

    if (!name) throw new ValidationError("Cron job name is required");
    if (!handler) throw new ValidationError("Cron job handler is required");

    if (this.jobs.has(name)) {
      throw new ValidationError(`Cron job "${name}" is already registered. Use replace() to update it.`);
    }

    const expression = SHORTHANDS[schedule] ?? schedule;

    if (!cron.validate(expression)) {
      throw new ValidationError(`Invalid cron expression for job "${name}": "${schedule}"`);
    }

    const status: CronJobStatus = {
      name,
      schedule: expression,
      running: true,
      lastRun: null,
      lastError: null,
      executionCount: 0,
      errorCount: 0,
    };

    const record: JobRecord = {
      options,
      status,
      executing: false,
      task: null as any, // assigned below
    };

    const task = cron.schedule(
      expression,
      () => this.execute(name),
      { timezone },
    );

    record.task = task;
    this.jobs.set(name, record);

    this.logger.info(`Cron job registered`, { name, schedule: expression, timezone });

    if (runOnInit) {
      this.execute(name);
    }
  }

  // ─── Execute ──────────────────────────────────────────────────────────────

  private async execute(name: string): Promise<void> {
    const record = this.jobs.get(name);
    if (!record) return;

    const { preventOverlap = true, handler } = record.options;

    if (preventOverlap && record.executing) {
      this.logger.warn(`Cron job "${name}" skipped — previous execution still running`);
      return;
    }

    record.executing = true;
    record.status.lastRun = new Date();
    record.status.executionCount++;

    this.logger.debug?.(`Cron job started`, { name, executionCount: record.status.executionCount });

    try {
      await handler();
      this.logger.debug?.(`Cron job completed`, { name });
    } catch (err) {
      record.status.errorCount++;
      record.status.lastError = err as Error;
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
  stop(name: string): void {
    const record = this.getJob(name);
    record.task.stop();
    record.status.running = false;
    this.logger.info(`Cron job stopped`, { name });
  }

  /**
   * Resumes a stopped job.
   */
  start(name: string): void {
    const record = this.getJob(name);
    record.task.start();
    record.status.running = true;
    this.logger.info(`Cron job started`, { name });
  }

  /**
   * Stops and removes a job entirely.
   */
  remove(name: string): void {
    const record = this.getJob(name);
    record.task.stop();
    this.jobs.delete(name);
    this.logger.info(`Cron job removed`, { name });
  }

  /**
   * Replaces an existing job with a new configuration.
   * Useful for updating schedules at runtime.
   */
  replace(options: CronJobOptions): void {
    if (this.jobs.has(options.name)) this.remove(options.name);
    this.register(options);
  }

  /**
   * Manually triggers a job outside its schedule.
   * Respects preventOverlap.
   *
   * @example
   * await cron.run("send-digest");
   */
  async run(name: string): Promise<void> {
    this.getJob(name);
    await this.execute(name);
  }

  /**
   * Stops all registered jobs. Call this on process shutdown.
   *
   * @example
   * process.on("SIGTERM", () => cron.stopAll());
   */
  stopAll(): void {
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
  status(name: string): CronJobStatus {
    return { ...this.getJob(name).status };
  }

  /**
   * Returns the status of all registered jobs.
   */
  statusAll(): CronJobStatus[] {
    return Array.from(this.jobs.values()).map((r) => ({ ...r.status }));
  }

  /**
   * Returns true if a job with the given name is registered.
   */
  has(name: string): boolean {
    return this.jobs.has(name);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private getJob(name: string): JobRecord {
    const record = this.jobs.get(name);
    if (!record) throw new ServerError(`Cron job "${name}" not found`);
    return record;
  }
}