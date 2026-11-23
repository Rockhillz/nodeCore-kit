import type { RequestHandler, Response } from "express";
import type { Health, HealthReport } from "../../core/index.js";

const send = (res: Response, report: HealthReport): void => {
  // Probes must always see fresh results
  res.setHeader("Cache-Control", "no-store");
  res.status(report.status === "up" ? 200 : 503).json(report);
};

/**
 * Express handlers for health endpoints, built on `createHealth()`.
 *
 * - `liveness`: 200 while the process runs. Doesn't call dependencies.
 * - `readiness`: runs every check; 200 if all pass and the service is ready,
 *   503 otherwise (including during shutdown).
 *
 * @example
 * const { liveness, readiness } = healthHandlers(health);
 * app.get("/healthz", liveness);
 * app.get("/readyz", readiness);
 */
export const healthHandlers = (
  health: Health,
): { liveness: RequestHandler; readiness: RequestHandler } => ({
  liveness: (_req, res) => send(res, health.liveness()),
  readiness: async (_req, res, next) => {
    try {
      send(res, await health.readiness());
    } catch (err) {
      next(err);
    }
  },
});
