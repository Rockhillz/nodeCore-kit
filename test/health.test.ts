import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHealth } from "../src/core/health";
import { healthHandlers } from "../src/transport/express/health";

describe("createHealth", () => {
  it("reports up when every check passes, with details from objects", async () => {
    const health = createHealth({
      checks: {
        fn: async () => {},
        withDetails: async () => ({ backlog: 3 }),
        adapter: { healthCheck: async () => ({ connection: "ready" }) },
      },
    });

    const report = await health.readiness();
    expect(report.status).toBe("up");
    expect(report.ready).toBe(true);
    expect(report.checks.fn.status).toBe("up");
    expect(report.checks.withDetails.details).toEqual({ backlog: 3 });
    expect(report.checks.adapter.details).toEqual({ connection: "ready" });
    expect(typeof report.checks.fn.latencyMs).toBe("number");
  });

  it("reports down when one check fails, and hides the message by default", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const health = createHealth({
      logger,
      checks: {
        ok: async () => {},
        db: async () => {
          throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
        },
      },
    });

    const report = await health.readiness();
    expect(report.status).toBe("down");
    expect(report.checks.ok.status).toBe("up");
    expect(report.checks.db).toEqual({ status: "down", latencyMs: expect.any(Number) });
    expect(logger.warn).toHaveBeenCalledWith(
      "Health check failed",
      expect.objectContaining({ check: "db" }),
    );
  });

  it("includes error messages when asked", async () => {
    const health = createHealth({
      includeErrors: true,
      checks: { db: () => Promise.reject(new Error("down")) },
    });
    expect((await health.readiness()).checks.db.error).toBe("down");
  });

  it("treats a slow check as down", async () => {
    const health = createHealth({
      timeout: 30,
      includeErrors: true,
      checks: { slow: () => new Promise((r) => setTimeout(r, 200)) },
    });
    const report = await health.readiness();
    expect(report.checks.slow.status).toBe("down");
    expect(report.checks.slow.error).toContain("timed out");
  });

  it("catches checks that throw synchronously", async () => {
    const health = createHealth({
      checks: {
        bad: () => {
          throw new Error("sync");
        },
      },
    });
    expect((await health.readiness()).status).toBe("down");
  });

  it("is down while not ready, even if checks pass", async () => {
    const health = createHealth({ ready: false, checks: { ok: async () => {} } });
    expect((await health.readiness()).status).toBe("down");
    health.setReady(true);
    expect((await health.readiness()).status).toBe("up");
  });

  it("liveness never runs checks", () => {
    const check = vi.fn(async () => {});
    const health = createHealth({ checks: { db: check } });
    expect(health.liveness().status).toBe("up");
    expect(check).not.toHaveBeenCalled();
  });

  it("addCheck adds checks later", async () => {
    const health = createHealth();
    health.addCheck("late", async () => ({ ok: true }));
    expect((await health.readiness()).checks.late.details).toEqual({ ok: true });
  });
});

describe("healthHandlers (Express)", () => {
  let base: string;
  let close: () => void;
  let dbUp = true;
  const health = createHealth({
    checks: {
      db: async () => {
        if (!dbUp) throw new Error("down");
      },
    },
  });

  beforeAll(async () => {
    const app = express();
    const { liveness, readiness } = healthHandlers(health);
    app.get("/healthz", liveness);
    app.get("/readyz", readiness);
    const server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });

  afterAll(() => close());

  it("returns 200 when ready and 503 when a check fails", async () => {
    dbUp = true;
    const ok = await fetch(`${base}/readyz`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");

    dbUp = false;
    const down = await fetch(`${base}/readyz`);
    expect(down.status).toBe(503);
    expect((await down.json()).checks.db.status).toBe("down");
  });

  it("liveness stays 200 while a dependency is down", async () => {
    dbUp = false;
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });

  it("readiness is 503 once marked not ready (shutdown)", async () => {
    dbUp = true;
    health.setReady(false);
    expect((await fetch(`${base}/readyz`)).status).toBe(503);
    health.setReady(true);
  });
});
